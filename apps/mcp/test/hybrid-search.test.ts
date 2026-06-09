import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setEmbedderOverride } from '../src/embeddings'
import { hybridSearchImpl } from '../src/tools/hybrid-search'
import { indexBlockImpl } from '../src/tools/index-block'
import { lexicalSearchImpl } from '../src/tools/lexical-search'
import { fakeEmbedder } from './_embedder'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// DB-backed. The dense leg uses the hermetic bag-of-words fake embedder; the
// lexical leg uses the real SurrealDB BM25 index defined in schema.surql.

async function seed(ctx: TestDb, title: string, body: string, state?: string): Promise<void> {
  const r = await insertNote(ctx.db, { title, type_slug: 'idea', state, blocks: [body] })
  await indexBlockImpl({ block_ids: r.block_ids })
}

describe('lexicalSearchImpl (BM25 full-text)', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('matches an exact literal term and ignores unrelated blocks', async () => {
    await seed(ctx, 'Stripe billing', 'Configurar el webhook de Stripe para cobros.')
    await seed(ctx, 'Paella', 'Saffron bomba rice sofrito broth.')

    const hits = await lexicalSearchImpl({ query: 'Stripe', k: 5 })
    expect(hits.length).toBe(1)
    expect(hits[0]?.content).toContain('Stripe')
    // Score is BM25: a term in N/2 of the corpus has IDF log(1)=0, so on a
    // tiny corpus the score can legitimately be 0. The match itself (the row
    // being returned) is the contract, not the score sign.
    expect(Number.isFinite(hits[0]?.score)).toBe(true)
  })

  test('is case- and accent-insensitive (analyzer: lowercase + ascii)', async () => {
    await seed(ctx, 'Reunión', 'Acta de la reunión con dirección.')
    const hits = await lexicalSearchImpl({ query: 'REUNION', k: 5 })
    expect(hits.length).toBe(1)
    expect(hits[0]?.content).toContain('reunión')
  })

  test('respects the parent-note state filter', async () => {
    await seed(ctx, 'Active', 'Functor pattern note.', 'ACTIVE')
    await seed(ctx, 'Archived', 'Functor pattern note.', 'ARCHIVED')
    const hits = await lexicalSearchImpl({ query: 'functor', k: 5, state_in: ['ACTIVE'] })
    expect(hits.length).toBe(1)
    expect(hits[0]?.note_state).toBe('ACTIVE')
  })

  test('OR-tokenises a multi-word query — a partial match still surfaces', async () => {
    await seed(ctx, 'Stripe billing', 'Configurar el webhook de Stripe para cobros.')
    // 'zzznoexiste' matches nothing. Under the old `@1@` AND semantics the whole
    // query needed every token in one block, so this returned zero rows and the
    // BM25 leg died. Under OR the 'Stripe' token alone still surfaces the block.
    const hits = await lexicalSearchImpl({ query: 'Stripe zzznoexiste', k: 5 })
    expect(hits.length).toBe(1)
    expect(hits[0]?.content).toContain('Stripe')
  })

  test('hides ARCHIVED notes by default when no state_in is given', async () => {
    await seed(ctx, 'Active', 'Functor pattern note.', 'ACTIVE')
    await seed(ctx, 'Archived', 'Functor pattern note.', 'ARCHIVED')
    const hits = await lexicalSearchImpl({ query: 'functor', k: 5 })
    expect(hits.length).toBe(1)
    expect(hits[0]?.note_state).toBe('ACTIVE')
  })
})

describe('hybridSearchImpl (RRF fusion)', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('returns fused hits, each carrying at least one leg rank', async () => {
    await seed(ctx, 'Functors', 'Applicative functor pattern wraps values.')
    await seed(ctx, 'Paella', 'Saffron bomba rice sofrito broth.')

    const hits = await hybridSearchImpl({ query: 'applicative functor pattern', k: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.content).toContain('functor')
    for (const h of hits) {
      expect(h.dense_rank != null || h.lexical_rank != null).toBe(true)
      expect(h.score).toBeGreaterThan(0)
    }
  })

  test('a block found by both legs outranks a single-leg block', async () => {
    await seed(ctx, 'Functors', 'Applicative functor pattern wraps values.')
    await seed(ctx, 'Functor laws', 'Identity and composition laws for functors.')

    const hits = await hybridSearchImpl({ query: 'functor pattern', k: 5 })
    const top = hits[0]
    expect(top?.dense_rank).not.toBeNull()
    expect(top?.lexical_rank).not.toBeNull()
  })

  test('respects the parent-note state filter on both legs', async () => {
    await seed(ctx, 'Active', 'Functor pattern note.', 'ACTIVE')
    await seed(ctx, 'Archived', 'Functor pattern note.', 'ARCHIVED')
    const hits = await hybridSearchImpl({ query: 'functor pattern', k: 5, state_in: ['ACTIVE'] })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(h => h.note_state === 'ACTIVE')).toBe(true)
  })

  test('caps the result set at k', async () => {
    for (let i = 0; i < 6; i++) await seed(ctx, `Note ${i}`, `Shared topic token alpha ${i}.`)
    const hits = await hybridSearchImpl({ query: 'shared topic token alpha', k: 3 })
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})
