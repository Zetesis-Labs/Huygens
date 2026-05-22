import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { NoteTypeSlug } from '../src/domain'
import { findRelatedImpl } from '../src/tools/find-related'
import { indexBlockImpl } from '../src/tools/index-block'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

async function seed(ctx: TestDb, title: string, body: string, type_slug: NoteTypeSlug = 'idea'): Promise<string> {
  const r = await insertNote(ctx.db, { title, type_slug, blocks: [body] })
  await indexBlockImpl({ block_ids: r.block_ids })
  return r.note_id
}

describe('findRelatedImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('empty corpus → empty list', async () => {
    const hits = await findRelatedImpl({ query: 'anything', k: 5, threshold: 0.3 })
    expect(hits).toEqual([])
  })

  test('ignores narrative blocks without parent notes', async () => {
    const [blocks] = await ctx.db.query<[{ id: { toString(): string } }[]]>(
      "CREATE block CONTENT { block_kind: 'narrative', content: 'Standalone narrative about functors.' } RETURN AFTER"
    )
    const blockId = blocks[0]?.id
    if (!blockId) throw new Error('expected narrative block')
    await indexBlockImpl({ block_ids: [String(blockId)] })

    const hits = await findRelatedImpl({ query: 'functors', k: 5, threshold: 0.0 })
    expect(hits).toEqual([])
  })

  test('finds an existing note for a related query', async () => {
    const id = await seed(
      ctx,
      'Applicative functors',
      'Structure that lets you apply wrapped functions to wrapped values. Generalizes the builder pattern.'
    )
    await seed(
      ctx,
      'Recipe for paella',
      'Saffron, bomba rice, sofrito, broth. The trick is not stirring once the rice is in.'
    )

    const hits = await findRelatedImpl({ query: 'applicative functor patterns', k: 5, threshold: 0.3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.note_id).toBe(id)
    expect(hits[0]?.score).toBeGreaterThan(0.45)
  })

  test('threshold filter excludes loose matches', async () => {
    await seed(ctx, 'Recipe for paella', 'Saffron, bomba rice, sofrito, broth.')
    const hits = await findRelatedImpl({
      query: 'distributed consensus algorithms',
      k: 5,
      threshold: 0.6
    })
    expect(hits).toEqual([])
  })

  test('dedupes by parent note even when multiple blocks match', async () => {
    const r = await insertNote(ctx.db, {
      title: 'Category theory notes',
      type_slug: 'idea',
      blocks: [
        'A monad is a monoid in the category of endofunctors.',
        'Functors preserve structure. Applicative functors compose monoidal effects.',
        'Natural transformations connect functors.'
      ]
    })
    await indexBlockImpl({ block_ids: r.block_ids })

    const hits = await findRelatedImpl({ query: 'functors and monads', k: 5, threshold: 0.3 })
    const noteIds = hits.map(h => h.note_id)
    expect(new Set(noteIds).size).toBe(noteIds.length)
    expect(noteIds[0]).toBe(r.note_id)
  })

  test('respects the k cap', async () => {
    for (let i = 0; i < 6; i++) {
      await seed(ctx, `Note about category theory ${i}`, `Category theory chunk number ${i} discussing functors.`)
    }
    const hits = await findRelatedImpl({ query: 'category theory', k: 3, threshold: 0.3 })
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})
