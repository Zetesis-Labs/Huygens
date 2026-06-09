import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setEmbedderOverride } from '../src/embeddings'
import { indexBlockImpl } from '../src/tools/index-block'
import { vectorSearchImpl } from '../src/tools/vector-search'
import { fakeEmbedder } from './_embedder'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// Hermetic, via the bag-of-words fake embedder: "similar" == lexical overlap.

async function seed(ctx: TestDb, title: string, body: string, state?: string): Promise<void> {
  const r = await insertNote(ctx.db, {
    title,
    type_slug: 'idea',
    state,
    blocks: [body]
  })
  await indexBlockImpl({ block_ids: r.block_ids })
}

describe('vectorSearchImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('ranks the lexically-nearest block first', async () => {
    await seed(ctx, 'Functors', 'Applicative functor pattern wraps values.')
    await seed(ctx, 'Paella', 'Saffron bomba rice sofrito broth.')

    const hits = await vectorSearchImpl({
      query: 'applicative functor pattern',
      k: 5,
      ef: 40
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.content).toContain('functor')
    expect(hits[0]?.score).toBeGreaterThan(0.45)
  })

  test('threshold filters loose matches out', async () => {
    await seed(ctx, 'Paella', 'Saffron bomba rice sofrito broth.')
    const hits = await vectorSearchImpl({
      query: 'distributed consensus algorithm',
      k: 5,
      ef: 40,
      threshold: 0.5
    })
    expect(hits).toEqual([])
  })

  test('state_in filters by parent note state', async () => {
    await seed(ctx, 'Active note', 'Functor pattern note.', 'ACTIVE')
    await seed(ctx, 'Archived note', 'Functor pattern note.', 'ARCHIVED')

    const hits = await vectorSearchImpl({
      query: 'functor pattern',
      k: 5,
      ef: 40,
      state_in: ['ACTIVE']
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(h => h.note_state === 'ACTIVE')).toBe(true)
  })

  test('hides ARCHIVED notes by default when no state_in is given', async () => {
    await seed(ctx, 'Active note', 'Functor pattern note.', 'ACTIVE')
    await seed(ctx, 'Archived note', 'Functor pattern note.', 'ARCHIVED')

    const hits = await vectorSearchImpl({ query: 'functor pattern', k: 5, ef: 40 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(h => h.note_state !== 'ARCHIVED')).toBe(true)
  })
})
