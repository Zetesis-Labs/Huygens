import { describe, expect, test } from 'bun:test'
import { traceProvenanceImpl } from '../src/tools/trace-provenance'
import { withFreshDb } from './_fixtures'

describe('trace_provenance', () => {
  test('block: cites the raw it derives from (with transformation) and what it is about', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:tp_r SET content = 'el usuario dijo X', source_kind = 'chat', status = 'processed';
        CREATE note:tp_n SET title = 'Proyecto X', type = note_type:project, state = 'ACTIVE';
        CREATE block:tp_b SET block_kind = 'narrative', content = 'informe sobre X';
        RELATE block:tp_b->derived_from->raw_capture:tp_r CONTENT { transformation: 'verbatim' };
        RELATE block:tp_b->about->note:tp_n;
      `)

      const trace = await traceProvenanceImpl({ id: 'block:tp_b' })
      expect(trace).not.toBeNull()
      expect(trace?.sources).toHaveLength(1)
      expect(trace?.sources[0]?.id).toBe('raw_capture:tp_r')
      expect(trace?.sources[0]?.transformation).toBe('verbatim')
      expect(trace?.sources[0]?.label).toContain('raw ·')
      expect(trace?.links).toHaveLength(1)
      expect(trace?.links[0]?.relation).toBe('about')
      expect(trace?.links[0]?.id).toBe('note:tp_n')
      expect(trace?.links[0]?.label).toBe('project · Proyecto X (ACTIVE)')
    } finally {
      await ctx.cleanup()
    }
  })

  test('note: traces back through the interpreting block to its raw source', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:tp_r2 SET content = 'fuente', source_kind = 'chat', status = 'processed';
        CREATE note:tp_n2 SET title = 'Tarea', type = note_type:task, state = 'ACTIVE';
        CREATE block:tp_b2 SET block_kind = 'narrative', content = 'informe';
        RELATE block:tp_b2->derived_from->raw_capture:tp_r2 CONTENT { transformation: 'summarized' };
        RELATE block:tp_b2->affects->note:tp_n2 CONTENT { action: 'created' };
      `)

      const trace = await traceProvenanceImpl({ id: 'note:tp_n2' })
      expect(trace?.links).toHaveLength(1)
      expect(trace?.links[0]?.relation).toBe('affects')
      expect(trace?.links[0]?.id).toBe('block:tp_b2')
      expect(trace?.links[0]?.action).toBe('created')
      expect(trace?.sources).toHaveLength(1)
      expect(trace?.sources[0]?.id).toBe('raw_capture:tp_r2')
      expect(trace?.sources[0]?.transformation).toBe('summarized')
      expect(trace?.sources[0]?.via).toBe('block:tp_b2')
    } finally {
      await ctx.cleanup()
    }
  })

  test('returns null for a missing id', async () => {
    const ctx = await withFreshDb()
    try {
      expect(await traceProvenanceImpl({ id: 'note:nope' })).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })
})
