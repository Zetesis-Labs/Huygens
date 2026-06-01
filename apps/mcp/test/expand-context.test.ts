import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setEmbedderOverride } from '../src/embeddings'
import { expandContextImpl } from '../src/tools/expand-context'
import { indexBlockImpl } from '../src/tools/index-block'
import { fakeEmbedder } from './_embedder'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// Deterministic bag-of-words embedder (see _embedder.ts): "related" means lexical
// overlap. Exercises the hybrid composition (vector seed → graph expansion), not
// semantic quality.
describe('expandContextImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('vector-seeds a note then expands its connected subgraph into triples', async () => {
    const child = await insertNote(ctx.db, {
      title: 'Applicative functors',
      type_slug: 'task',
      blocks: ['Applicative functor pattern wraps values.']
    })
    const parent = await insertNote(ctx.db, {
      title: 'Category theory',
      type_slug: 'project',
      blocks: ['Category theory umbrella project.']
    })
    await indexBlockImpl({ block_ids: child.block_ids })
    await ctx.db.query(`RELATE ${child.note_id}->part_of->${parent.note_id}`)

    const r = await expandContextImpl({
      query: 'applicative functor patterns',
      seeds: 3,
      hops: 1,
      max_nodes: 30,
      threshold: 0.3
    })
    expect(r.seeds.map(s => s.id)).toContain(child.note_id) // vector seed
    expect(r.node_count).toBeGreaterThanOrEqual(2) // pulled the part_of parent in
    expect(r.triples).toContain('—part_of→')
    expect(r.triples).toContain('Applicative functors')
    expect(r.triples).toContain('Category theory')
    expect(r.edges).toEqual(
      expect.arrayContaining([{ source: child.note_id, target: parent.note_id, kind: 'part_of', qualifier: undefined }])
    )
  })

  test('no vector match → empty result', async () => {
    const r = await expandContextImpl({ query: 'nothing matches', seeds: 3, hops: 1, max_nodes: 10, threshold: 0.9 })
    expect(r.seeds).toEqual([])
    expect(r.node_count).toBe(0)
  })
})
