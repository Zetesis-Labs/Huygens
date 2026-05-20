import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { InternalRefOutOfBoundsError, RawAlreadyProcessedError, RawNotFoundError } from '../src/errors'
import { captureImpl } from '../src/tools/capture'
import { type CommitClarifyInput, commitClarifyImpl } from '../src/tools/commit-clarify'
import { type TestDb, withFreshDb } from './_fixtures'

const simpleNote = (title: string) => ({
  title,
  type_slug: 'task' as const,
  state: 'CLARIFIED' as const,
  blocks: [{ content: `# ${title}` }],
  transformation: 'extracted' as const,
  internal_refs: []
})

const decomposition = (titles: string[]): CommitClarifyInput['decomposition'] => ({
  notes: titles.map(simpleNote),
  external_refs: []
})

describe('commitClarifyImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('creates notes, blocks, derived_from edges and marks raw processed', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    const result = await commitClarifyImpl({
      raw_id,
      decomposition: decomposition(['Task A', 'Task B'])
    })

    expect(result.raw_id).toBe(raw_id)
    expect(result.notes_created).toHaveLength(2)
    expect(result.blocks_created).toHaveLength(2)
    expect(result.edges_created).toBe(2) // 2 derived_from edges, no internal refs
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)

    const [notes] = await ctx.db.query<[{ title: string; state: string }[]]>(
      'SELECT title, state FROM note ORDER BY title'
    )
    expect(notes.map(n => n.title)).toEqual(['Task A', 'Task B'])

    const [rawAfter] = await ctx.db.query<[{ processed_at: Date | null }[]]>('SELECT processed_at FROM raw_capture')
    expect(rawAfter[0]?.processed_at).not.toBeNull()
  })

  test('throws RawNotFoundError for unknown raw_id', async () => {
    await expect(
      commitClarifyImpl({
        raw_id: 'raw_capture:nope',
        decomposition: decomposition(['x'])
      })
    ).rejects.toBeInstanceOf(RawNotFoundError)
  })

  test('throws RawAlreadyProcessedError on second commit', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    await commitClarifyImpl({ raw_id, decomposition: decomposition(['Once']) })

    try {
      await commitClarifyImpl({ raw_id, decomposition: decomposition(['Twice']) })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RawAlreadyProcessedError)
      if (err instanceof RawAlreadyProcessedError) {
        expect(err.code).toBe('RAW_ALREADY_PROCESSED')
        expect(err.details).toEqual({ raw_id })
      }
    }
  })

  test('internal_refs out of bounds throws InternalRefOutOfBoundsError', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    await expect(
      commitClarifyImpl({
        raw_id,
        decomposition: {
          notes: [
            {
              ...simpleNote('A'),
              internal_refs: [{ kind: 'mentions', to_note_index: 99 }]
            }
          ],
          external_refs: []
        }
      })
    ).rejects.toBeInstanceOf(InternalRefOutOfBoundsError)
  })

  test('internal_refs create edges between newly created notes', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    const result = await commitClarifyImpl({
      raw_id,
      decomposition: {
        notes: [{ ...simpleNote('A'), internal_refs: [{ kind: 'mentions', to_note_index: 1 }] }, simpleNote('B')],
        external_refs: []
      }
    })

    // 2 derived_from + 1 internal mentions edge
    expect(result.edges_created).toBe(3)
    const [edges] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM mentions GROUP ALL')
    expect(edges[0]?.count).toBe(1)
  })

  test('mit_for is persisted as a datetime on the note', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    const mit = '2026-05-21T00:00:00.000Z'
    await commitClarifyImpl({
      raw_id,
      decomposition: {
        notes: [{ ...simpleNote('Dentist'), mit_for: mit }],
        external_refs: []
      }
    })

    const [notes] = await ctx.db.query<[{ mit_for: unknown }[]]>('SELECT mit_for FROM note')
    const persisted = notes[0]?.mit_for
    expect(persisted).toBeDefined()
    // Surreal returns datetime fields as either Date instances or its custom
    // datetime wrapper depending on driver version; both stringify to ISO.
    expect(new Date(String(persisted)).getTime()).toBe(new Date(mit).getTime())
  })

  test('emits commit_attempted + commit_succeeded events', async () => {
    const { raw_id } = await captureImpl({ content: 'X', source_kind: 'manual' })
    const { session_id } = await commitClarifyImpl({
      raw_id,
      decomposition: decomposition(['A'])
    })

    const [events] = await ctx.db.query<[{ kind: string; created_at: Date }[]]>(
      'SELECT kind, created_at FROM agent_event WHERE session_id = $sid ORDER BY created_at',
      { sid: session_id }
    )
    expect(events.map(e => e.kind)).toContain('commit_attempted')
    expect(events.map(e => e.kind)).toContain('commit_succeeded')
  })

  test('emits commit_failed when commit raises', async () => {
    await expect(
      commitClarifyImpl({
        raw_id: 'raw_capture:nope',
        decomposition: decomposition(['A'])
      })
    ).rejects.toBeInstanceOf(RawNotFoundError)

    const [events] = await ctx.db.query<[{ kind: string }[]]>(
      'SELECT kind FROM agent_event WHERE kind = "commit_failed"'
    )
    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})
