import { describe, expect, test } from 'bun:test'
import { checkClaimImpl } from '../src/tools/check-claim'
import { provenanceByBlock, traceProvenanceImpl } from '../src/tools/trace-provenance'
import { withFreshDb } from './_fixtures'

describe('check_claim — edge predicates beyond part_of', () => {
  test('mentions / about / affects / derived_from: supported when the edge exists, unsupported otherwise', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:tc_r SET content = 'fuente', source_kind = 'chat', status = 'processed';
        CREATE note:tc_n SET title = 'Nota', type = note_type:task, state = 'ACTIVE';
        CREATE note:tc_n2 SET title = 'Otra', type = note_type:project, state = 'ACTIVE';
        CREATE block:tc_b SET block_kind = 'narrative', content = 'informe';
        RELATE block:tc_b->derived_from->raw_capture:tc_r CONTENT { transformation: 'verbatim' };
        RELATE block:tc_b->about->note:tc_n;
        RELATE block:tc_b->affects->note:tc_n CONTENT { action: 'updated' };
        RELATE block:tc_b->mentions->note:tc_n2;
      `)

      const r = await checkClaimImpl({
        claims: [
          { subject: 'block:tc_b', predicate: 'mentions', object: 'note:tc_n2' }, // supported
          { subject: 'block:tc_b', predicate: 'mentions', object: 'note:tc_n' }, // unsupported (no mentions edge)
          { subject: 'block:tc_b', predicate: 'about', object: 'note:tc_n' }, // supported
          { subject: 'block:tc_b', predicate: 'about', object: 'note:tc_n2' }, // unsupported
          { subject: 'block:tc_b', predicate: 'affects', object: 'note:tc_n' }, // supported
          { subject: 'block:tc_b', predicate: 'affects', object: 'note:tc_n2' }, // unsupported
          { subject: 'block:tc_b', predicate: 'derived_from', object: 'raw_capture:tc_r' }, // supported
          { subject: 'block:tc_b', predicate: 'derived_from', object: 'raw_capture:nope' } // unsupported
        ]
      })

      expect(r.map(x => x.verdict)).toEqual([
        'supported',
        'unsupported',
        'supported',
        'unsupported',
        'supported',
        'unsupported',
        'supported',
        'unsupported'
      ])
      // multi-valued edges never contradict: absence is unsupported, not contradicted
      expect(r.every(x => x.verdict !== 'contradicted')).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  test('subject can be a block (not only a note): mentions block→block', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE block:tc_src SET block_kind = 'narrative', content = 'origen';
        CREATE block:tc_dst SET block_kind = 'narrative', content = 'destino';
        RELATE block:tc_src->mentions->block:tc_dst;
      `)

      const r = await checkClaimImpl({
        claims: [
          { subject: 'block:tc_src', predicate: 'mentions', object: 'block:tc_dst' }, // supported
          { subject: 'block:tc_dst', predicate: 'mentions', object: 'block:tc_src' } // unsupported (other direction)
        ]
      })
      expect(r.map(x => x.verdict)).toEqual(['supported', 'unsupported'])
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('check_claim — attribute contradictions', () => {
  test("'type' contradicted when the real type differs, supported when it matches", async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:tc_t SET title = 'Proyecto', type = note_type:project, state = 'ACTIVE';
      `)

      const r = await checkClaimImpl({
        claims: [
          { subject: 'note:tc_t', predicate: 'type', object: 'project' }, // supported
          { subject: 'note:tc_t', predicate: 'type', object: 'task' } // contradicted (real type is project)
        ]
      })
      expect(r.map(x => x.verdict)).toEqual(['supported', 'contradicted'])
      expect(r[1]?.detail).toContain('project') // surfaces the real type
    } finally {
      await ctx.cleanup()
    }
  })

  test("'state' against a nonexistent note is unsupported (not contradicted)", async () => {
    const ctx = await withFreshDb()
    try {
      const r = await checkClaimImpl({
        claims: [{ subject: 'note:tc_missing', predicate: 'state', object: 'ACTIVE' }]
      })
      expect(r[0]?.verdict).toBe('unsupported')
      expect(r[0]?.detail).toContain('no existe')
    } finally {
      await ctx.cleanup()
    }
  })

  test('state/type on a non-note subject is unsupported', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`CREATE block:tc_blk SET block_kind = 'narrative', content = 'x';`)
      const r = await checkClaimImpl({
        claims: [
          { subject: 'block:tc_blk', predicate: 'state', object: 'ACTIVE' },
          { subject: 'block:tc_blk', predicate: 'type', object: 'task' }
        ]
      })
      expect(r.map(x => x.verdict)).toEqual(['unsupported', 'unsupported'])
      expect(r[0]?.detail).toContain('solo aplican a note:')
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('check_claim — part_of contradiction combinations', () => {
  test('claiming any parent for a note that has a different parent is contradicted', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:tc_child SET title = 'Child', type = note_type:task, state = 'ACTIVE';
        CREATE note:tc_realp SET title = 'Real Parent', type = note_type:project, state = 'ACTIVE';
        CREATE note:tc_other SET title = 'Other', type = note_type:project, state = 'ACTIVE';
        CREATE note:tc_area SET title = 'Area', type = note_type:area, state = 'ACTIVE';
        RELATE note:tc_child->part_of->note:tc_realp;
      `)

      const r = await checkClaimImpl({
        claims: [
          { subject: 'note:tc_child', predicate: 'part_of', object: 'note:tc_realp' }, // supported
          { subject: 'note:tc_child', predicate: 'part_of', object: 'note:tc_other' }, // contradicted
          { subject: 'note:tc_child', predicate: 'part_of', object: 'note:tc_area' } // contradicted
        ]
      })
      expect(r.map(x => x.verdict)).toEqual(['supported', 'contradicted', 'contradicted'])
      expect(r[1]?.detail).toContain('note:tc_realp')
      expect(r[2]?.detail).toContain('note:tc_realp')
    } finally {
      await ctx.cleanup()
    }
  })

  test('claiming a parent for a note that has no parent is unsupported (not contradicted)', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:tc_orphan SET title = 'Orphan', type = note_type:task, state = 'ACTIVE';
        CREATE note:tc_p SET title = 'P', type = note_type:project, state = 'ACTIVE';
      `)
      const r = await checkClaimImpl({
        claims: [{ subject: 'note:tc_orphan', predicate: 'part_of', object: 'note:tc_p' }]
      })
      expect(r[0]?.verdict).toBe('unsupported')
    } finally {
      await ctx.cleanup()
    }
  })

  test('the ⚠ contradiction summary counts only contradicted verdicts', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:tc_s SET title = 'S', type = note_type:task, state = 'ACTIVE';
        CREATE note:tc_p1 SET title = 'P1', type = note_type:project, state = 'ACTIVE';
        CREATE note:tc_p2 SET title = 'P2', type = note_type:project, state = 'ACTIVE';
        RELATE note:tc_s->part_of->note:tc_p1;
      `)
      const r = await checkClaimImpl({
        claims: [
          { subject: 'note:tc_s', predicate: 'part_of', object: 'note:tc_p1' }, // supported
          { subject: 'note:tc_s', predicate: 'part_of', object: 'note:tc_p2' }, // contradicted
          { subject: 'note:tc_s', predicate: 'state', object: 'DONE' }, // contradicted
          { subject: 'note:tc_s', predicate: 'blocked_by', object: 'note:tc_p2' } // unsupported
        ]
      })
      const contradicted = r.filter(x => x.verdict === 'contradicted').length
      expect(contradicted).toBe(2)
      // the verbalized header that the tool surfaces to the user
      const mark = { supported: '✓', contradicted: '✗', unsupported: '·' } as const
      const header = contradicted > 0 ? `⚠ ${contradicted} afirmación(es) CONTRADICEN el grafo` : 'sin contradicciones'
      expect(header).toBe('⚠ 2 afirmación(es) CONTRADICEN el grafo')
      const firstVerdict = r[0]?.verdict
      expect(firstVerdict && mark[firstVerdict]).toBe('✓')
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('trace_provenance — seeds, empties and fan-out', () => {
  test('rejects a raw_capture seed (only note/block ids are traceable)', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`CREATE raw_capture:tp_seed SET content = 'x', source_kind = 'chat', status = 'pending';`)
      await expect(traceProvenanceImpl({ id: 'raw_capture:tp_seed' })).rejects.toThrow('only note: or block: ids')
    } finally {
      await ctx.cleanup()
    }
  })

  test('a node with no provenance returns empty sources and links', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE note:tp_lonely SET title = 'Sola', type = note_type:idea, state = 'CLARIFIED';
        CREATE block:tp_lonelyb SET block_kind = 'narrative', content = 'huérfano';
      `)
      const note = await traceProvenanceImpl({ id: 'note:tp_lonely' })
      expect(note?.sources).toEqual([])
      expect(note?.links).toEqual([])

      const block = await traceProvenanceImpl({ id: 'block:tp_lonelyb' })
      expect(block?.sources).toEqual([])
      expect(block?.links).toEqual([])
    } finally {
      await ctx.cleanup()
    }
  })

  test('a block with several derived_from surfaces each raw with its own transformation', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:tp_m1 SET content = 'cita literal', source_kind = 'chat', status = 'processed';
        CREATE raw_capture:tp_m2 SET content = 'idea suelta', source_kind = 'chat', status = 'processed';
        CREATE raw_capture:tp_m3 SET content = 'resumen', source_kind = 'chat', status = 'processed';
        CREATE block:tp_mb SET block_kind = 'narrative', content = 'sintesis';
        RELATE block:tp_mb->derived_from->raw_capture:tp_m1 CONTENT { transformation: 'verbatim' };
        RELATE block:tp_mb->derived_from->raw_capture:tp_m2 CONTENT { transformation: 'inferred' };
        RELATE block:tp_mb->derived_from->raw_capture:tp_m3 CONTENT { transformation: 'summarized' };
      `)
      const trace = await traceProvenanceImpl({ id: 'block:tp_mb' })
      expect(trace?.sources).toHaveLength(3)
      const byId = new Map(trace?.sources.map(s => [s.id, s.transformation]))
      expect(byId.get('raw_capture:tp_m1')).toBe('verbatim')
      expect(byId.get('raw_capture:tp_m2')).toBe('inferred')
      expect(byId.get('raw_capture:tp_m3')).toBe('summarized')
      expect(trace?.links).toEqual([])
    } finally {
      await ctx.cleanup()
    }
  })

  test('a note interpreted by several blocks (about + affects) lists all of them and their raws', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:tp_ra SET content = 'origen A', source_kind = 'chat', status = 'processed';
        CREATE raw_capture:tp_rb SET content = 'origen B', source_kind = 'chat', status = 'processed';
        CREATE note:tp_hub SET title = 'Hub', type = note_type:project, state = 'ACTIVE';
        CREATE block:tp_ba SET block_kind = 'narrative', content = 'bloque A';
        CREATE block:tp_bb SET block_kind = 'narrative', content = 'bloque B';
        RELATE block:tp_ba->about->note:tp_hub;
        RELATE block:tp_bb->affects->note:tp_hub CONTENT { action: 'state_changed', summary: 'pasó a ACTIVE' };
        RELATE block:tp_ba->derived_from->raw_capture:tp_ra CONTENT { transformation: 'extracted' };
        RELATE block:tp_bb->derived_from->raw_capture:tp_rb CONTENT { transformation: 'summarized' };
      `)
      const trace = await traceProvenanceImpl({ id: 'note:tp_hub' })

      expect(trace?.links).toHaveLength(2)
      const about = trace?.links.find(l => l.relation === 'about')
      const affects = trace?.links.find(l => l.relation === 'affects')
      expect(about?.id).toBe('block:tp_ba')
      expect(affects?.id).toBe('block:tp_bb')
      expect(affects?.action).toBe('state_changed')
      expect(affects?.summary).toBe('pasó a ACTIVE')

      // both interpreting blocks contribute their raw sources, tagged with `via`
      expect(trace?.sources).toHaveLength(2)
      const sources = new Map(trace?.sources.map(s => [s.id, s]))
      expect(sources.get('raw_capture:tp_ra')?.via).toBe('block:tp_ba')
      expect(sources.get('raw_capture:tp_ra')?.transformation).toBe('extracted')
      expect(sources.get('raw_capture:tp_rb')?.via).toBe('block:tp_bb')
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('provenanceByBlock — per-block provenance signal', () => {
  test('counts derived_from per block and picks a representative transformation', async () => {
    const ctx = await withFreshDb()
    try {
      await ctx.db.query(`
        CREATE raw_capture:pb_r1 SET content = 'a', source_kind = 'chat', status = 'processed';
        CREATE raw_capture:pb_r2 SET content = 'b', source_kind = 'chat', status = 'processed';
        CREATE block:pb_b1 SET block_kind = 'narrative', content = 'doble origen';
        CREATE block:pb_b2 SET block_kind = 'narrative', content = 'origen unico';
        CREATE block:pb_b3 SET block_kind = 'narrative', content = 'sin origen';
        RELATE block:pb_b1->derived_from->raw_capture:pb_r1 CONTENT { transformation: 'verbatim' };
        RELATE block:pb_b1->derived_from->raw_capture:pb_r2 CONTENT { transformation: 'inferred' };
        RELATE block:pb_b2->derived_from->raw_capture:pb_r1 CONTENT { transformation: 'summarized' };
      `)
      const map = await provenanceByBlock(['block:pb_b1', 'block:pb_b2', 'block:pb_b3'])

      expect(map.get('block:pb_b1')?.derived_from).toBe(2)
      expect(map.get('block:pb_b1')?.transformation).not.toBeNull()
      expect(map.get('block:pb_b2')).toEqual({ derived_from: 1, transformation: 'summarized' })
      // a block with no provenance is simply absent from the map
      expect(map.has('block:pb_b3')).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })

  test('returns an empty map for an empty id list', async () => {
    expect((await provenanceByBlock([])).size).toBe(0)
  })
})
