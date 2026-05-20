import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NoteNotFoundError } from '../src/errors'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { updateNoteStateImpl } from '../src/tools/update-note-state'
import { type TestDb, withFreshDb } from './_fixtures'

async function makeNote(): Promise<string> {
  const { raw_id } = await captureImpl({ content: 'x', source_kind: 'manual' })
  const r = await commitClarifyImpl({
    raw_id,
    decomposition: {
      notes: [
        {
          title: 't',
          type_slug: 'task',
          state: 'CLARIFIED',
          blocks: [{ content: '# t' }],
          transformation: 'extracted',
          internal_refs: []
        }
      ],
      external_refs: []
    }
  })
  const id = r.notes_created[0]
  if (!id) throw new Error('expected a note to be created')
  return id
}

describe('updateNoteStateImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('moves a note from CLARIFIED to ACTIVE and returns both states', async () => {
    const note_id = await makeNote()
    const result = await updateNoteStateImpl({ note_id, state: 'ACTIVE' })
    expect(result.previous_state).toBe('CLARIFIED')
    expect(result.new_state).toBe('ACTIVE')

    const [rows] = await ctx.db.query<[{ state: string }[]]>('SELECT state FROM note')
    expect(rows[0]?.state).toBe('ACTIVE')
  })

  test('NoteNotFoundError for unknown id', async () => {
    await expect(updateNoteStateImpl({ note_id: 'note:nope', state: 'ACTIVE' })).rejects.toBeInstanceOf(
      NoteNotFoundError
    )
  })

  test('records an agent_event with the previous and new state', async () => {
    const note_id = await makeNote()
    await updateNoteStateImpl({ note_id, state: 'WAITING', reason: 'blocked by Ana' })
    const [events] = await ctx.db.query<[{ kind: string; payload: Record<string, unknown> }[]]>(
      'SELECT kind, payload FROM agent_event WHERE kind = "worker_yielded"'
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toMatchObject({
      action: 'state_transition',
      previous_state: 'CLARIFIED',
      new_state: 'WAITING',
      reason: 'blocked by Ana'
    })
  })
})
