import { describe, expect, test } from 'bun:test'
import { neighborhoodImpl } from '../src/tools/neighborhood'
import { withFreshDb } from './_fixtures'

describe('neighborhood', () => {
  test('expands a node into connected subject—predicate→object triples', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:nb_a SET title = 'A', type = note_type:task, state = 'ACTIVE';
        CREATE note:nb_b SET title = 'B', type = note_type:project, state = 'ACTIVE';
        CREATE note:nb_c SET title = 'C', type = note_type:task, state = 'WAITING';
        RELATE note:nb_a->part_of->note:nb_b;
        RELATE note:nb_a->blocked_by->note:nb_c;
      `)
      const r = await neighborhoodImpl({ seed_id: 'note:nb_a', hops: 2, max_nodes: 30 })
      expect(r).not.toBeNull()
      expect(r?.node_count).toBe(3)
      expect(r?.triples).toContain('—part_of→')
      expect(r?.triples).toContain('—blocked_by→')
      expect(r?.triples).toContain('task · A (ACTIVE)')
      expect(r?.triples).toContain('project · B (ACTIVE)')
      // Structured edges mirror the triples (record ids, not labels).
      expect(r?.edges).toEqual(
        expect.arrayContaining([
          { source: 'note:nb_a', target: 'note:nb_b', kind: 'part_of', qualifier: undefined },
          { source: 'note:nb_a', target: 'note:nb_c', kind: 'blocked_by', qualifier: undefined }
        ])
      )
    } finally {
      await ctx.cleanup()
    }
  })

  test('traverses operational edges only — trace edges (affects) are not surfaced', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:nb_n SET title = 'N', type = note_type:task, state = 'ACTIVE';
        CREATE note:nb_d SET title = 'D', type = note_type:task, state = 'ACTIVE';
        CREATE block:nb_blk SET block_kind = 'narrative', content = 'informe';
        RELATE note:nb_n->depends_on->note:nb_d;
        RELATE block:nb_blk->affects->note:nb_n CONTENT { action: 'state_changed' };
      `)
      const r = await neighborhoodImpl({ seed_id: 'note:nb_n', hops: 1, max_nodes: 30 })
      // Only the operational depends_on neighbour is reached; the affects trace block is not.
      expect(r?.node_count).toBe(2)
      expect(r?.triples).toContain('—depends_on→')
      expect(r?.triples).not.toContain('affects')
      expect(r?.edges).toEqual([{ source: 'note:nb_n', target: 'note:nb_d', kind: 'depends_on', qualifier: undefined }])
    } finally {
      await ctx.cleanup()
    }
  })

  test('returns null for a missing seed', async () => {
    const ctx = await withFreshDb()
    try {
      expect(await neighborhoodImpl({ seed_id: 'note:nope', hops: 1, max_nodes: 5 })).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })
})
