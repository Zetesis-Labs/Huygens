import { describe, expect, test } from 'bun:test'
import {
  blockEmbeddingContext,
  type EdgeTriple,
  edgeLabel,
  nodeLabel,
  nodeLine,
  noteTypeSlug,
  serializeTriples,
  serializeTriplesGrouped
} from '../src/serialize'
import type { GraphNodeRecord } from '../src/tools/graph-records'

// serialize.ts is pure (no I/O): the single graph→text encoder the read tools
// and the contextual-embedding pipeline both lean on. These tests pin its
// output exactly, since the encoding quality is load-bearing for the LLM.

describe('noteTypeSlug', () => {
  test('strips the note_type: prefix', () => {
    expect(noteTypeSlug('note_type:task')).toBe('task')
  })

  test('returns "" when type is absent', () => {
    expect(noteTypeSlug(undefined)).toBe('')
    expect(noteTypeSlug(null as unknown as GraphNodeRecord['type'])).toBe('')
  })

  test('passes through an id without the prefix unchanged', () => {
    expect(noteTypeSlug('project')).toBe('project')
  })
})

describe('nodeLabel', () => {
  test('note with type and state → "slug · title (STATE)"', () => {
    const node: GraphNodeRecord = {
      id: 'note:a',
      title: 'Escribir a Stripe',
      type: 'note_type:task',
      state: 'WAITING'
    }
    expect(nodeLabel(node)).toBe('task · Escribir a Stripe (WAITING)')
  })

  test('note with type, no state → "slug · title"', () => {
    const node: GraphNodeRecord = { id: 'note:a', title: 'Proyecto X', type: 'note_type:project' }
    expect(nodeLabel(node)).toBe('project · Proyecto X')
  })

  test('note without type → title only (with state when present)', () => {
    expect(nodeLabel({ id: 'note:a', title: 'Sin tipo' })).toBe('Sin tipo')
    expect(nodeLabel({ id: 'note:a', title: 'Sin tipo', state: 'ACTIVE' })).toBe('Sin tipo (ACTIVE)')
  })

  test('note without title falls back to its id', () => {
    expect(nodeLabel({ id: 'note:abc' })).toBe('note:abc')
    expect(nodeLabel({ id: 'note:abc', type: 'note_type:idea' })).toBe('idea · note:abc')
  })

  test('raw_capture → "raw · <one-line snippet>"', () => {
    expect(nodeLabel({ id: 'raw_capture:r1', content: 'algo capturado' })).toBe('raw · algo capturado')
  })

  test('raw_capture snippet collapses whitespace and clamps to ~80 chars', () => {
    const long = `multi  line\n\ntext ${'x'.repeat(120)}`
    const label = nodeLabel({ id: 'raw_capture:r1', content: long })
    expect(label.startsWith('raw · ')).toBe(true)
    const snippet = label.slice('raw · '.length)
    expect(snippet).not.toContain('\n')
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet.length).toBe(80)
  })

  test('raw_capture with no content → "raw · "', () => {
    expect(nodeLabel({ id: 'raw_capture:r1' })).toBe('raw · ')
  })

  test('block uses its block_kind as the head', () => {
    expect(nodeLabel({ id: 'block:b1', block_kind: 'narrative', content: 'informe' })).toBe('narrative · informe')
    expect(nodeLabel({ id: 'block:b1', block_kind: 'descriptive', content: 'detalle' })).toBe('descriptive · detalle')
  })

  test('block without block_kind falls back to "block"', () => {
    expect(nodeLabel({ id: 'block:b1', content: 'huérfano' })).toBe('block · huérfano')
  })

  test('unknown table → the bare id', () => {
    expect(nodeLabel({ id: 'proposal:p1', title: 'ignored' })).toBe('proposal:p1')
  })
})

describe('nodeLine', () => {
  test('appends the id to the label with an em-dash', () => {
    const node: GraphNodeRecord = { id: 'note:a', title: 'T', type: 'note_type:task', state: 'ACTIVE' }
    expect(nodeLine(node)).toBe('task · T (ACTIVE) — note:a')
  })

  test('works for a fallback label too', () => {
    expect(nodeLine({ id: 'proposal:p1' })).toBe('proposal:p1 — proposal:p1')
  })
})

describe('edgeLabel', () => {
  test('maps the six known edge kinds to Spanish', () => {
    expect(edgeLabel('part_of')).toBe('parte de')
    expect(edgeLabel('blocked_by')).toBe('bloqueada por')
    expect(edgeLabel('mentions')).toBe('menciona')
    expect(edgeLabel('derived_from')).toBe('deriva de')
    expect(edgeLabel('about')).toBe('sobre')
    expect(edgeLabel('affects')).toBe('afecta a')
  })

  test('unknown kind passes through unchanged', () => {
    expect(edgeLabel('weird_edge')).toBe('weird_edge')
  })
})

describe('blockEmbeddingContext', () => {
  const note: GraphNodeRecord = { id: 'note:a', title: 'Hijo', type: 'note_type:task', state: 'ACTIVE' }
  const parent: GraphNodeRecord = { id: 'note:p', title: 'Padre', type: 'note_type:project' }
  const grandparent: GraphNodeRecord = { id: 'note:g', title: 'Abuelo', type: 'note_type:area' }

  test('no subjects → empty string (caller embeds bare content)', () => {
    expect(blockEmbeddingContext([], [])).toBe('')
    expect(blockEmbeddingContext([], [parent])).toBe('')
  })

  test('subject only → its label, no "parte de" line', () => {
    expect(blockEmbeddingContext([note], [])).toBe('task · Hijo (ACTIVE)')
  })

  test('subject + parents → label then a "parte de:" breadcrumb (nearest first)', () => {
    expect(blockEmbeddingContext([note], [parent, grandparent])).toBe(
      'task · Hijo (ACTIVE)\nparte de: project · Padre ▸ area · Abuelo'
    )
  })

  test('several subjects (narrative about-notes) → one label per line', () => {
    const about1: GraphNodeRecord = { id: 'note:x', title: 'Tema A', type: 'note_type:idea' }
    const about2: GraphNodeRecord = { id: 'note:y', title: 'Tema B', type: 'note_type:person' }
    expect(blockEmbeddingContext([about1, about2], [])).toBe('idea · Tema A\nperson · Tema B')
  })
})

describe('serializeTriples', () => {
  const label = (id: string): string => `L(${id})`

  test('renders each edge as subject —predicate→ object, one per line', () => {
    const edges: EdgeTriple[] = [
      { source: 'note:a', target: 'note:b', kind: 'part_of' },
      { source: 'note:a', target: 'note:c', kind: 'blocked_by' }
    ]
    expect(serializeTriples(edges, label)).toBe('L(note:a) —part_of→ L(note:b)\nL(note:a) —blocked_by→ L(note:c)')
  })

  test('qualifier refines the predicate as kind(qualifier)', () => {
    const edges: EdgeTriple[] = [
      { source: 'block:b', target: 'note:n', kind: 'affects', qualifier: 'state_changed' },
      { source: 'block:b', target: 'raw_capture:r', kind: 'derived_from', qualifier: 'verbatim' }
    ]
    expect(serializeTriples(edges, label)).toBe(
      'L(block:b) —affects(state_changed)→ L(note:n)\nL(block:b) —derived_from(verbatim)→ L(raw_capture:r)'
    )
  })

  test('empty edge list → empty string', () => {
    expect(serializeTriples([], label)).toBe('')
  })
})

describe('serializeTriplesGrouped', () => {
  const label = (id: string): string => `L(${id})`

  test('groups edges under their subject (entity-centric)', () => {
    const edges: EdgeTriple[] = [
      { source: 'note:a', target: 'note:b', kind: 'part_of' },
      { source: 'note:a', target: 'note:c', kind: 'blocked_by' },
      { source: 'note:d', target: 'note:e', kind: 'mentions' }
    ]
    expect(serializeTriplesGrouped(edges, label)).toBe(
      ['L(note:a)', '  —part_of→ L(note:b)', '  —blocked_by→ L(note:c)', 'L(note:d)', '  —mentions→ L(note:e)'].join(
        '\n'
      )
    )
  })

  test('preserves subject order from first appearance and includes qualifiers', () => {
    const edges: EdgeTriple[] = [
      { source: 'block:b', target: 'note:n', kind: 'affects', qualifier: 'created' },
      { source: 'block:b', target: 'note:m', kind: 'about' }
    ]
    expect(serializeTriplesGrouped(edges, label)).toBe(
      ['L(block:b)', '  —affects(created)→ L(note:n)', '  —about→ L(note:m)'].join('\n')
    )
  })

  test('empty edge list → empty string', () => {
    expect(serializeTriplesGrouped([], label)).toBe('')
  })
})
