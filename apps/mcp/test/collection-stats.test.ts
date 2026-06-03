import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setEmbedderOverride } from '../src/embeddings'
import { collectionStatsImpl } from '../src/tools/collection-stats'
import { indexBlockImpl } from '../src/tools/index-block'
import { fakeEmbedder } from './_embedder'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// DB-backed. Verifies the aggregation, with focus on the embedding-coverage
// signal (embedded vs unembedded blocks).

describe('collectionStatsImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('an empty graph reports zeros, not undefined', async () => {
    const s = await collectionStatsImpl()
    expect(s.notes.total).toBe(0)
    expect(s.blocks).toEqual({ total: 0, embedded: 0, unembedded: 0, by_kind: {} })
    expect(s.edges.about).toBe(0)
  })

  test('counts notes by state and blocks by embedding coverage', async () => {
    const a = await insertNote(ctx.db, { title: 'A', type_slug: 'idea', state: 'ACTIVE', blocks: ['one'] })
    await insertNote(ctx.db, { title: 'B', type_slug: 'idea', state: 'ARCHIVED', blocks: ['two', 'three'] })
    // Embed only the first note's block — the other two stay unembedded.
    await indexBlockImpl({ block_ids: a.block_ids })

    const s = await collectionStatsImpl()

    expect(s.notes.total).toBe(2)
    expect(s.notes.by_state).toEqual({ ACTIVE: 1, ARCHIVED: 1 })
    expect(s.blocks.total).toBe(3)
    expect(s.blocks.embedded).toBe(1)
    expect(s.blocks.unembedded).toBe(2)
    expect(s.blocks.by_kind).toEqual({ descriptive: 3 })
  })

  test('counts edges per type', async () => {
    const n1 = await insertNote(ctx.db, { title: 'Parent', type_slug: 'project', blocks: ['p'] })
    const n2 = await insertNote(ctx.db, { title: 'Child', type_slug: 'task', blocks: ['c'] })
    await ctx.db.query(`RELATE ${n2.note_id}->part_of->${n1.note_id}`)

    const s = await collectionStatsImpl()
    expect(s.edges.part_of).toBe(1)
    expect(s.edges.about).toBe(0)
  })

  test('counts raw_captures by status', async () => {
    await ctx.db.query("CREATE raw_capture SET content='x', source_kind='manual', status='pending'")
    await ctx.db.query("CREATE raw_capture SET content='y', source_kind='manual', status='processed'")
    await ctx.db.query("CREATE raw_capture SET content='z', source_kind='manual', status='pending'")

    const s = await collectionStatsImpl()
    expect(s.raw_captures.total).toBe(3)
    expect(s.raw_captures.by_status).toEqual({ pending: 2, processed: 1 })
  })
})
