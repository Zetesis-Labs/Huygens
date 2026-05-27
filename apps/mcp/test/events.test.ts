import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { RecordId } from 'surrealdb'
import { captureImpl } from '../src/tools/capture'
import { commitProposalImpl, createProposalImpl, type ProposalPayload } from '../src/tools/proposal'
import { setRawStatusImpl } from '../src/tools/set-raw-status'
import { updateNoteStateImpl } from '../src/tools/update-note-state'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

type EventRow = {
  kind: string
  actor: string
  session_id: string
  subject?: RecordId | null
  payload?: Record<string, unknown> | null
}

async function events(ctx: TestDb, kind?: string): Promise<EventRow[]> {
  const q = kind ? 'SELECT * FROM agent_event WHERE kind = $kind' : 'SELECT * FROM agent_event'
  const [rows] = await ctx.db.query<[EventRow[]]>(q, { kind })
  return rows ?? []
}

function payload(rawIds: string[]): ProposalPayload {
  return {
    raw_ids: rawIds,
    narrative_blocks: [{ temp_id: 'narrative1', content: 'Aprobamos algo.', raw_ids: rawIds }],
    note_creates: [{ temp_id: 'task1', type_slug: 'task', title: 'Call Ana', state: 'ACTIVE', descriptive_blocks: [] }],
    note_updates: [],
    edges: [],
    about: [{ block_temp_id: 'narrative1', note_ref: 'task1' }],
    affects: []
  }
}

describe('agent_event — emission and persistence', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test("capture emits 'raw_received' with actor conversational and the raw as subject", async () => {
    const { raw_id } = await captureImpl({ content: 'hola mundo', source_kind: 'chat' })

    const evs = await events(ctx, 'raw_received')
    expect(evs).toHaveLength(1)
    const [ev] = evs
    expect(ev?.kind).toBe('raw_received')
    expect(ev?.actor).toBe('conversational')
    expect(String(ev?.subject)).toBe(raw_id)
    expect((ev?.session_id.length ?? 0) > 0).toBe(true)
    expect(ev?.payload).toMatchObject({ source_kind: 'chat', content_length: 'hola mundo'.length })
  })

  test("set_raw_status emits 'raw_status_changed' with the ids and new status in the payload", async () => {
    const { raw_id } = await captureImpl({ content: 'algo', source_kind: 'manual' })
    await setRawStatusImpl({ raw_ids: [raw_id], status: 'ignored' })

    const evs = await events(ctx, 'raw_status_changed')
    expect(evs).toHaveLength(1)
    const [ev] = evs
    expect(ev?.actor).toBe('conversational')
    expect(ev?.payload).toMatchObject({ raw_ids: [raw_id], status: 'ignored' })
  })

  test("update_note_state emits 'note_state_changed' with the note as subject and the transition", async () => {
    const { note_id } = await insertNote(ctx.db, { title: 'Tarea', type_slug: 'task', state: 'ACTIVE' })
    await updateNoteStateImpl({ note_id, state: 'DONE', reason: 'terminada' })

    const evs = await events(ctx, 'note_state_changed')
    expect(evs).toHaveLength(1)
    const [ev] = evs
    expect(ev?.actor).toBe('conversational')
    expect(String(ev?.subject)).toBe(note_id)
    expect(ev?.payload).toMatchObject({
      action: 'state_transition',
      previous_state: 'ACTIVE',
      new_state: 'DONE',
      reason: 'terminada'
    })
  })

  test("commit_proposal emits 'proposal_committed' with actor user and the proposal as subject", async () => {
    const { raw_id } = await captureImpl({ content: 'fuente', source_kind: 'chat' })
    const created = await createProposalImpl({ raw_ids: [raw_id], payload: payload([raw_id]) })
    await commitProposalImpl({ proposal_id: created.id })

    const evs = await events(ctx, 'proposal_committed')
    expect(evs).toHaveLength(1)
    const [ev] = evs
    expect(ev?.kind).toBe('proposal_committed')
    expect(ev?.actor).toBe('user') // commit is an explicit user approval
    expect(String(ev?.subject)).toBe(created.id)
    expect((ev?.payload?.raw_ids as string[]).map(String)).toEqual([raw_id])
  })

  test('a full capture → commit flow accumulates one event per mutating step', async () => {
    const { raw_id } = await captureImpl({ content: 'flujo', source_kind: 'chat' })
    const created = await createProposalImpl({ raw_ids: [raw_id], payload: payload([raw_id]) })
    await commitProposalImpl({ proposal_id: created.id })

    const all = await events(ctx)
    const kinds = all.map(e => e.kind).sort()
    // capture → raw_received; create_proposal → proposal_created; commit → proposal_committed
    expect(kinds).toContain('raw_received')
    expect(kinds).toContain('proposal_committed')
    // every persisted event carries the mandatory schemafull fields
    for (const e of all) {
      expect(typeof e.kind).toBe('string')
      expect(typeof e.actor).toBe('string')
      expect(typeof e.session_id).toBe('string')
      expect(e.session_id.length).toBeGreaterThan(0)
    }
  })
})
