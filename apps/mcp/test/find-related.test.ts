import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { NoteTypeSlug } from '../src/domain'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { findRelatedImpl } from '../src/tools/find-related'
import { indexBlockImpl } from '../src/tools/index-block'
import { type TestDb, withFreshDb } from './_fixtures'

async function seed(title: string, body: string, type_slug: NoteTypeSlug = 'note'): Promise<string> {
  const { raw_id } = await captureImpl({ content: title, source_kind: 'manual' })
  const r = await commitClarifyImpl({
    raw_id,
    decomposition: {
      notes: [
        {
          title,
          type_slug,
          state: 'CLARIFIED',
          blocks: [{ content: body }],
          transformation: 'extracted',
          internal_refs: []
        }
      ],
      external_refs: []
    }
  })
  const id = r.notes_created[0]
  if (!id) throw new Error('expected a note to be created')
  await indexBlockImpl({ block_ids: r.blocks_created })
  return id
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

  test('finds an existing note for a related query', async () => {
    const id = await seed(
      'Applicative functors',
      'Structure that lets you apply wrapped functions to wrapped values. Generalizes the builder pattern.'
    )
    await seed(
      'Recipe for paella',
      'Saffron, bomba rice, sofrito, broth. The trick is not stirring once the rice is in.'
    )

    const hits = await findRelatedImpl({ query: 'applicative functor patterns', k: 5, threshold: 0.3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.note_id).toBe(id)
    expect(hits[0]?.score).toBeGreaterThan(0.45)
  })

  test('threshold filter excludes loose matches', async () => {
    await seed('Recipe for paella', 'Saffron, bomba rice, sofrito, broth.')
    const hits = await findRelatedImpl({
      query: 'distributed consensus algorithms',
      k: 5,
      threshold: 0.6
    })
    expect(hits).toEqual([])
  })

  test('dedupes by parent note even when multiple blocks match', async () => {
    const { raw_id } = await captureImpl({ content: 'multi-block', source_kind: 'manual' })
    const r = await commitClarifyImpl({
      raw_id,
      decomposition: {
        notes: [
          {
            title: 'Category theory notes',
            type_slug: 'note',
            state: 'CLARIFIED',
            blocks: [
              { content: 'A monad is a monoid in the category of endofunctors.' },
              { content: 'Functors preserve structure. Applicative functors compose monoidal effects.' },
              { content: 'Natural transformations connect functors.' }
            ],
            transformation: 'extracted',
            internal_refs: []
          }
        ],
        external_refs: []
      }
    })
    await indexBlockImpl({ block_ids: r.blocks_created })

    const hits = await findRelatedImpl({ query: 'functors and monads', k: 5, threshold: 0.3 })
    const noteIds = hits.map(h => h.note_id)
    expect(new Set(noteIds).size).toBe(noteIds.length)
    expect(noteIds[0]).toBe(r.notes_created[0])
  })

  test('respects the k cap', async () => {
    for (let i = 0; i < 6; i++) {
      await seed(`Note about category theory ${i}`, `Category theory chunk number ${i} discussing functors.`)
    }
    const hits = await findRelatedImpl({ query: 'category theory', k: 3, threshold: 0.3 })
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})
