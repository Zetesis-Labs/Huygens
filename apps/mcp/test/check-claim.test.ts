import { describe, expect, test } from 'bun:test'
import { checkClaimImpl } from '../src/tools/check-claim'
import { withFreshDb } from './_fixtures'

describe('check_claim', () => {
  test('supported / contradicted / unsupported across edges and attributes', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:cc_a SET title = 'A', type = note_type:task, state = 'ACTIVE';
        CREATE note:cc_b SET title = 'B', type = note_type:project, state = 'ACTIVE';
        CREATE note:cc_c SET title = 'C', type = note_type:project, state = 'ACTIVE';
        RELATE note:cc_a->part_of->note:cc_b;
      `)
      const r = await checkClaimImpl({
        claims: [
          { subject: 'note:cc_a', predicate: 'part_of', object: 'note:cc_b' }, // supported
          { subject: 'note:cc_a', predicate: 'part_of', object: 'note:cc_c' }, // contradicted (real parent is b)
          { subject: 'note:cc_a', predicate: 'blocked_by', object: 'note:cc_b' }, // unsupported (no such edge)
          { subject: 'note:cc_a', predicate: 'state', object: 'ACTIVE' }, // supported
          { subject: 'note:cc_a', predicate: 'state', object: 'DONE' }, // contradicted
          { subject: 'note:cc_a', predicate: 'type', object: 'task' }, // supported
          { subject: 'note:nope', predicate: 'state', object: 'ACTIVE' } // unsupported (missing subject)
        ]
      })
      expect(r.map(x => x.verdict)).toEqual([
        'supported',
        'contradicted',
        'unsupported',
        'supported',
        'contradicted',
        'supported',
        'unsupported'
      ])
      expect(r[1]?.detail).toContain('note:cc_b') // contradiction surfaces the real parent
      expect(r[4]?.detail).toContain('ACTIVE') // and the real state
    } finally {
      await ctx.cleanup()
    }
  })
})
