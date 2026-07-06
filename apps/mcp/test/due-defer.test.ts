import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { createProposalImpl, getProposalChangesImpl, type ProposalPayload } from '../src/tools/proposal'
import { commitPreviewed, type TestDb, withFreshDb } from './_fixtures'

/**
 * Coverage for the temporal axes due_at / defer_until: write + UTC-midnight
 * normalization (incl. a TZ-laden datetime), impossible-date rejection, clearing
 * with null, get_proposal_changes surfacing them on created notes, and the active
 * radar excluding deferred (dormant) tasks.
 */
async function capture(content: string): Promise<string> {
  const { raw_id } = await captureImpl({ content, source_kind: 'manual' })
  return raw_id
}

function taskPayload(rawIds: string[], note: Record<string, unknown>): ProposalPayload {
  return {
    raw_ids: rawIds,
    narrative_blocks: [{ temp_id: 'n1', content: 'temporal test', raw_ids: rawIds }],
    note_creates: [{ temp_id: 't1', type_slug: 'task', title: 'Temporal task', state: 'ACTIVE', ...note }],
    note_updates: [],
    edges: [],
    about: [],
    affects: []
  } as unknown as ProposalPayload
}

describe('due_at / defer_until', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  /** Create a single task carrying the given temporal fields, commit, and return
   * the committed note's stored due_at/defer_until (as the driver returns them). */
  async function commitTaskAndRead(note: Record<string, unknown>): Promise<{ due_at: unknown; defer_until: unknown }> {
    const raw = await capture('a task with temporal fields')
    const proposal = await createProposalImpl({ raw_ids: [raw], payload: taskPayload([raw], note) })
    await commitPreviewed({ proposal_id: proposal.id })
    const [rows] = await ctx.db.query<[Array<{ due_at: unknown; defer_until: unknown }>]>(
      "SELECT due_at, defer_until FROM note WHERE type.slug = 'task' AND title = 'Temporal task'"
    )
    return rows[0]
  }

  test('a date-only due_at is stored at UTC midnight', async () => {
    const note = await commitTaskAndRead({ due_at: '2026-06-10' })
    expect(new Date(note.due_at as string).toISOString()).toBe('2026-06-10T00:00:00.000Z')
  })

  test('a TZ-laden defer_until normalizes to UTC midnight of the written day', async () => {
    const note = await commitTaskAndRead({ defer_until: '2026-06-12T09:00:00+02:00' })
    expect(new Date(note.defer_until as string).toISOString()).toBe('2026-06-12T00:00:00.000Z')
  })

  test('an impossible calendar date is rejected', async () => {
    const raw = await capture('bad date')
    await expect(
      createProposalImpl({ raw_ids: [raw], payload: taskPayload([raw], { due_at: '2026-02-31' }) })
    ).rejects.toThrow()
  })

  test('get_proposal_changes surfaces due_at/defer_until on created notes', async () => {
    const raw = await capture('task with deadline and defer')
    const proposal = await createProposalImpl({
      raw_ids: [raw],
      payload: taskPayload([raw], { due_at: '2026-06-10', defer_until: '2026-06-12' })
    })
    await commitPreviewed({ proposal_id: proposal.id })
    const changes = await getProposalChangesImpl({ proposal_id: proposal.id })
    const created = changes?.changes.notes_created[0]
    expect(created?.due_at).toBe('2026-06-10')
    expect(created?.defer_until).toBe('2026-06-12')
  })

  test('clearing due_at / defer_until with null sets them to NONE', async () => {
    const raw = await capture('task to clear')
    const proposal = await createProposalImpl({
      raw_ids: [raw],
      payload: taskPayload([raw], { due_at: '2026-06-10', defer_until: '2026-06-12' })
    })
    await commitPreviewed({ proposal_id: proposal.id })
    const [created] = await ctx.db.query<[Array<{ id: string }>]>(
      "SELECT meta::id(id) AS id FROM note WHERE title = 'Temporal task'"
    )
    const noteId = `note:${created[0].id}`

    const raw2 = await capture('clear the temporal fields')
    const clear = await createProposalImpl({
      raw_ids: [raw2],
      payload: {
        raw_ids: [raw2],
        narrative_blocks: [{ temp_id: 'n2', content: 'clear', raw_ids: [raw2] }],
        note_creates: [],
        note_updates: [{ id: noteId, due_at: null, defer_until: null }],
        edges: [],
        about: [],
        affects: []
      } as unknown as ProposalPayload
    })
    await commitPreviewed({ proposal_id: clear.id })
    const [rows] = await ctx.db.query<[Array<{ due_at: unknown; defer_until: unknown }>]>(
      'SELECT due_at, defer_until FROM note WHERE title = $t',
      { t: 'Temporal task' }
    )
    // SET NONE leaves the field absent → the driver returns null/undefined.
    expect(rows[0].due_at ?? null).toBeNull()
    expect(rows[0].defer_until ?? null).toBeNull()
  })

  test('the active radar excludes deferred (dormant) tasks', async () => {
    const dormantRaw = await capture('dormant task')
    const dormant = await createProposalImpl({
      raw_ids: [dormantRaw],
      payload: {
        raw_ids: [dormantRaw],
        narrative_blocks: [{ temp_id: 'nd', content: 'dormant', raw_ids: [dormantRaw] }],
        note_creates: [
          { temp_id: 'td', type_slug: 'task', title: 'Dormant', state: 'ACTIVE', defer_until: '2099-01-01' }
        ],
        note_updates: [],
        edges: [],
        about: [],
        affects: []
      } as unknown as ProposalPayload
    })
    await commitPreviewed({ proposal_id: dormant.id })

    const liveRaw = await capture('live task')
    const live = await createProposalImpl({
      raw_ids: [liveRaw],
      payload: {
        raw_ids: [liveRaw],
        narrative_blocks: [{ temp_id: 'nl', content: 'live', raw_ids: [liveRaw] }],
        note_creates: [{ temp_id: 'tl', type_slug: 'task', title: 'Live', state: 'ACTIVE' }],
        note_updates: [],
        edges: [],
        about: [],
        affects: []
      } as unknown as ProposalPayload
    })
    await commitPreviewed({ proposal_id: live.id })

    const [radar] = await ctx.db.query<[Array<{ title: string }>]>(
      `SELECT title FROM note
       WHERE type.slug = 'task' AND state IN ['ACTIVE','WAITING']
         AND (defer_until IS NONE OR defer_until <= time::now())`
    )
    const titles = (radar ?? []).map(r => r.title)
    expect(titles).toContain('Live')
    expect(titles).not.toContain('Dormant')
  })
})
