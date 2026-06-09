import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { createProposalImpl, type ProposalPayload } from '../src/tools/proposal'
import { mitHistoryImpl } from '../src/tools/views'
import { commitPreviewed, type TestDb, withFreshDb } from './_fixtures'

/**
 * mit_history derives the per-note MIT timeline from the commit log alone — no
 * schema, no extra state. The live note.mit_for is a single cell (reassigning or
 * clearing erases the prior value), but every write survives in a committed
 * proposal's payload. These tests prove the reconstruction: assigned → moved →
 * cleared, in commit order, with the right classification.
 */
async function capture(content: string): Promise<string> {
  const { raw_id } = await captureImpl({ content, source_kind: 'manual' })
  return raw_id
}

describe('mitHistoryImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  /** Commit a task with no MIT and return its real note id. */
  async function seedTask(title: string): Promise<string> {
    const raw = await capture(`seed ${title}`)
    const payload: ProposalPayload = {
      raw_ids: [raw],
      narrative_blocks: [{ temp_id: 'n1', content: `create ${title}`, raw_ids: [raw] }],
      note_creates: [{ temp_id: 't1', type_slug: 'task', title, state: 'ACTIVE', descriptive_blocks: [] }],
      note_updates: [],
      edges: [],
      about: [],
      affects: []
    }
    const proposal = await createProposalImpl({ raw_ids: [raw], payload })
    const res = await commitPreviewed({ proposal_id: proposal.id })
    const id = res.notes_created[0]
    if (!id) throw new Error('no note created')
    return id
  }

  /** Commit a single mit_for write (a date, or null to clear) on an existing note. */
  async function writeMit(noteId: string, mit_for: string | null): Promise<void> {
    const raw = await capture(`mit ${mit_for}`)
    const payload: ProposalPayload = {
      raw_ids: [raw],
      narrative_blocks: [{ temp_id: 'n1', content: `mit write ${mit_for}`, raw_ids: [raw] }],
      note_creates: [],
      note_updates: [{ id: noteId, mit_for, descriptive_blocks_append: [] }],
      edges: [],
      about: [],
      affects: []
    } as unknown as ProposalPayload
    const proposal = await createProposalImpl({ raw_ids: [raw], payload })
    await commitPreviewed({ proposal_id: proposal.id })
  }

  test('reconstructs assigned → moved → cleared in commit order', async () => {
    const noteId = await seedTask('Ship the changefeed')
    await writeMit(noteId, '2026-06-10')
    await writeMit(noteId, '2026-06-11')
    await writeMit(noteId, null)

    const r = await mitHistoryImpl(noteId)
    expect(r.note_count).toBe(1)
    expect(r.event_count).toBe(3)
    const tl = r.timeline[0]
    expect(tl?.note_id).toBe(noteId)
    expect(tl?.current_mit_for).toBeNull() // live cell ends cleared
    expect(tl?.history.map(h => h.action)).toEqual(['assigned', 'moved', 'cleared'])
    expect(tl?.history.map(h => h.mit_for)).toEqual(['2026-06-10', '2026-06-11', null])
    expect(tl?.history.every(h => h.source === 'update')).toBe(true)
  })

  test('a note born with a MIT records an assigned create event', async () => {
    const raw = await capture('born with a MIT')
    const payload: ProposalPayload = {
      raw_ids: [raw],
      narrative_blocks: [{ temp_id: 'n1', content: 'born planned', raw_ids: [raw] }],
      note_creates: [
        {
          temp_id: 't1',
          type_slug: 'task',
          title: 'Born planned',
          state: 'ACTIVE',
          mit_for: '2026-06-09',
          descriptive_blocks: []
        }
      ],
      note_updates: [],
      edges: [],
      about: [],
      affects: []
    } as unknown as ProposalPayload
    const proposal = await createProposalImpl({ raw_ids: [raw], payload })
    const res = await commitPreviewed({ proposal_id: proposal.id })
    const noteId = res.notes_created[0] as string

    const r = await mitHistoryImpl(noteId)
    expect(r.event_count).toBe(1)
    expect(r.timeline[0]?.history[0]).toMatchObject({ action: 'assigned', mit_for: '2026-06-09', source: 'create' })
  })

  test('ignores updates that never touched mit_for, and notes that never held one', async () => {
    const planned = await seedTask('Planned task')
    await writeMit(planned, '2026-06-10')

    // A second task that only ever changed state — never a MIT.
    const neverMit = await seedTask('Never a MIT')
    const raw = await capture('state-only update')
    const payload: ProposalPayload = {
      raw_ids: [raw],
      narrative_blocks: [{ temp_id: 'n1', content: 'state only', raw_ids: [raw] }],
      note_creates: [],
      note_updates: [{ id: neverMit, state: 'WAITING', descriptive_blocks_append: [] }],
      edges: [],
      about: [],
      affects: []
    } as unknown as ProposalPayload
    const proposal = await createProposalImpl({ raw_ids: [raw], payload })
    await commitPreviewed({ proposal_id: proposal.id })

    const all = await mitHistoryImpl()
    expect(all.timeline.some(t => t.note_id === planned)).toBe(true)
    expect(all.timeline.some(t => t.note_id === neverMit)).toBe(false)

    const scoped = await mitHistoryImpl(neverMit)
    expect(scoped.note_count).toBe(0)
    expect(scoped.event_count).toBe(0)
  })
})
