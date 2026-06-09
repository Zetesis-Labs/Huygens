import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
import { captureImpl } from '../src/tools/capture'
import { createProposalImpl, type ProposalPayload } from '../src/tools/proposal'
import { retractImpl } from '../src/tools/retract'
import { commitPreviewed, insertNote, type TestDb, withFreshDb } from './_fixtures'

/**
 * Regression net for the ritual gate (assertRitualCommitAllowed) — the rule
 * the doctrine advertises as "enforced en código": a ritual informe (kind=day
 * jornada / kind=week review) (1) requires the user's explicit approval
 * (`approved: true`) and (2) is unique per Madrid day / ISO week, counting
 * only LIVE ritual blocks so the documented correction flow (retract the
 * wrong ritual, re-commit) works. Plain process commits (no kind) must stay
 * untouched by the gate, and the legacy split kinds (plan_day/review_day/…)
 * must be rejected at create_proposal.
 */
function payloadWith(rawIds: string[], block: ProposalPayload['narrative_blocks'][number]): ProposalPayload {
  return {
    raw_ids: rawIds,
    narrative_blocks: [block],
    note_creates: [],
    note_updates: [],
    edges: [],
    about: [],
    affects: []
  }
}

async function captureRaw(content: string): Promise<string> {
  const raw = await captureImpl({ content, source_kind: 'manual' })
  return raw.raw_id
}

/** Capture a raw and persist a draft ritual proposal over it. */
async function draftRitual(kind: 'day' | 'week', content: string): Promise<string> {
  const rawId = await captureRaw(`raw para ${content}`)
  const created = await createProposalImpl({
    raw_ids: [rawId],
    payload: payloadWith([rawId], { temp_id: 'ritual1', content, raw_ids: [rawId], kind })
  })
  return created.id
}

/** Capture a raw and persist a draft plain informe (no kind) over it. */
async function draftPlain(content: string): Promise<string> {
  const rawId = await captureRaw(`raw para ${content}`)
  const created = await createProposalImpl({
    raw_ids: [rawId],
    payload: payloadWith([rawId], { temp_id: 'informe1', content, raw_ids: [rawId] })
  })
  return created.id
}

describe('ritual commits — approval + one-per-period gate', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('a ritual commit without approved: true is rejected, and stays committable after the OK', async () => {
    const proposalId = await draftRitual('day', 'Jornada: asiento lo de ayer y oriento hoy.')

    await expect(commitPreviewed({ proposal_id: proposalId })).rejects.toThrow('explicit approval')
    await expect(commitPreviewed({ proposal_id: proposalId, approved: false })).rejects.toThrow('explicit approval')

    // The gate must not consume the draft: with the user's OK it commits.
    const result = await commitPreviewed({ proposal_id: proposalId, approved: true })
    expect(result.narrative_blocks_created.length).toBe(1)
  })

  test('a second jornada the same Madrid day is rejected', async () => {
    const first = await draftRitual('day', 'Jornada.')
    await commitPreviewed({ proposal_id: first, approved: true })

    const second = await draftRitual('day', 'Otra jornada del mismo día.')
    await expect(commitPreviewed({ proposal_id: second, approved: true })).rejects.toThrow('already exists for today')
  })

  test('a second weekly review the same ISO week is rejected', async () => {
    const first = await draftRitual('week', 'Revisión de la semana.')
    await commitPreviewed({ proposal_id: first, approved: true })

    const second = await draftRitual('week', 'Otra revisión de la misma semana.')
    await expect(commitPreviewed({ proposal_id: second, approved: true })).rejects.toThrow(
      'already exists for this week'
    )
  })

  test('day and week rituals can coexist in the same period (different kinds)', async () => {
    const day = await draftRitual('day', 'Jornada.')
    await commitPreviewed({ proposal_id: day, approved: true })

    const week = await draftRitual('week', 'Revisión semanal.')
    const result = await commitPreviewed({ proposal_id: week, approved: true })
    expect(result.narrative_blocks_created.length).toBe(1)
  })

  test('correction flow: retract the ritual block, then a re-commit of the same kind is allowed', async () => {
    const wrong = await draftRitual('day', 'Jornada equivocada.')
    const committed = await commitPreviewed({ proposal_id: wrong, approved: true })
    const ritualBlockId = committed.narrative_blocks_created[0] as string

    // Sanity: while the wrong jornada is live, a corrected one is still rejected.
    const corrected = await draftRitual('day', 'Jornada corregida.')
    await expect(commitPreviewed({ proposal_id: corrected, approved: true })).rejects.toThrow(
      'already exists for today'
    )

    // The documented correction: retract the previous ritual block first…
    const retracted = await retractImpl({ ids: [ritualBlockId], dry_run: false })
    expect(retracted.blocks).toContain(ritualBlockId)

    // …then the re-commit of the same kind passes (uniqueness counts live blocks only).
    const result = await commitPreviewed({ proposal_id: corrected, approved: true })
    expect(result.narrative_blocks_created.length).toBe(1)
  })

  test('a plain informe (no kind) needs no approval and ignores the per-period gate', async () => {
    // Even with a committed jornada today, plain process commits are untouched.
    const day = await draftRitual('day', 'Jornada.')
    await commitPreviewed({ proposal_id: day, approved: true })

    const plainA = await draftPlain('Informe de proceso normal a.')
    const plainB = await draftPlain('Informe de proceso normal b.')
    const a = await commitPreviewed({ proposal_id: plainA }) // no approved at all
    const b = await commitPreviewed({ proposal_id: plainB }) // several per day: fine
    expect(a.narrative_blocks_created.length).toBe(1)
    expect(b.narrative_blocks_created.length).toBe(1)
  })

  test('legacy split kinds (plan_day/review_day) are rejected at create_proposal', async () => {
    const rawId = await captureRaw('raw legacy')
    for (const kind of ['plan_day', 'review_day', 'plan_week', 'review_week']) {
      await expect(
        createProposalImpl({
          raw_ids: [rawId],
          payload: payloadWith([rawId], {
            temp_id: 'ritual1',
            content: 'Informe con kind legacy.',
            raw_ids: [rawId],
            // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
            kind: kind as any
          })
        })
      ).rejects.toThrow()
    }
  })

  test('a jornada commit stamps last_reviewed_at on the notes it disposes', async () => {
    const { note_id } = await insertNote(ctx.db, { title: 'Tarea dispuesta', type_slug: 'task', state: 'ACTIVE' })
    const rawId = await captureRaw('jornada con disposición')
    const created = await createProposalImpl({
      raw_ids: [rawId],
      payload: {
        raw_ids: [rawId],
        narrative_blocks: [{ temp_id: 'ritual1', content: 'Jornada.', raw_ids: [rawId], kind: 'day' }],
        note_creates: [],
        note_updates: [{ id: note_id, state: 'DONE' }],
        edges: [],
        about: [],
        affects: []
      }
    })
    await commitPreviewed({ proposal_id: created.id, approved: true })
    const [rows] = await ctx.db.query<[Array<{ last_reviewed_at: unknown }>]>(
      'SELECT last_reviewed_at FROM note WHERE id = $id',
      { id: new StringRecordId(note_id) }
    )
    expect(rows[0]?.last_reviewed_at).toBeTruthy()
  })
})
