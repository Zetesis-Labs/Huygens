import { describe, expect, test } from 'bun:test'
import { mergeExistingEdges, proposalToFlow } from '../src/lib/graph'
import type { ExistingEdge, Proposal } from '../src/lib/surreal'

// Minimal proposal factory: every payload list defaults to empty so each test
// only fills in what it exercises.
function makeProposal(payload: Partial<Proposal['payload']> = {}, rest: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal:test',
    status: 'draft',
    payload: {
      raw_ids: [],
      narrative_blocks: [],
      note_creates: [],
      note_updates: [],
      edges: [],
      ...payload
    },
    ...rest
  }
}

describe('proposalToFlow — note_creates', () => {
  test('creates a node with status "created", type from slug and attr lines', () => {
    const p = makeProposal({
      note_creates: [
        {
          temp_id: 'tmp:1',
          type_slug: 'task',
          title: 'Buy milk',
          state: 'ACTIVE',
          mit_for: '2026-05-27',
          metadata: { foo: 1, bar: 2 },
          descriptive_blocks: [{ content: 'detail A' }, { content: 'detail B' }]
        }
      ]
    })
    const flow = proposalToFlow(p)
    expect(flow.nodes).toHaveLength(1)
    const n = flow.nodes[0]
    expect(n.id).toBe('tmp:1')
    expect(n.data.title).toBe('Buy milk')
    expect(n.data.type).toBe('task')
    expect(n.data.status).toBe('created')
    expect(n.data.descriptives).toEqual(['detail A', 'detail B'])
    // createAttrLines: state, MIT (mit_for set), meta keys joined
    expect(n.data.lines).toEqual(['state → ACTIVE', 'MIT → 2026-05-27', 'meta: foo, bar'])
  })

  test('createAttrLines omits MIT and meta when absent', () => {
    const p = makeProposal({
      note_creates: [
        {
          temp_id: 'tmp:2',
          type_slug: 'idea',
          title: 'Spark',
          state: 'SOMEDAY',
          descriptive_blocks: []
        }
      ]
    })
    const n = proposalToFlow(p).nodes[0]
    expect(n.data.lines).toEqual(['state → SOMEDAY'])
    expect(n.data.descriptives).toEqual([])
  })

  test('createAttrLines omits meta line when metadata is empty object', () => {
    const p = makeProposal({
      note_creates: [
        { temp_id: 'tmp:3', type_slug: 'task', title: 'X', state: 'ACTIVE', metadata: {}, descriptive_blocks: [] }
      ]
    })
    expect(proposalToFlow(p).nodes[0].data.lines).toEqual(['state → ACTIVE'])
  })
})

describe('proposalToFlow — note_updates', () => {
  test('updated node uses label title/type when available and update change lines', () => {
    const p = makeProposal({
      note_updates: [
        {
          id: 'note:abc',
          title: 'New title',
          state: 'DONE',
          mit_for: '2026-06-01',
          metadata_merge: { tag: 'x' },
          descriptive_blocks_append: [{ content: 'appended' }]
        }
      ]
    })
    const flow = proposalToFlow(p, { 'note:abc': { type: 'project', title: 'Real title' } })
    const n = flow.nodes[0]
    expect(n.id).toBe('note:abc')
    expect(n.data.status).toBe('updated')
    // label wins for title + type
    expect(n.data.title).toBe('Real title')
    expect(n.data.type).toBe('project')
    expect(n.data.descriptives).toEqual(['appended'])
    expect(n.data.lines).toEqual(['title → "New title"', 'state → DONE', 'MIT → 2026-06-01', 'meta: tag'])
  })

  test('falls back to update.title then id when no label', () => {
    const p = makeProposal({
      note_updates: [{ id: 'note:xyz', title: 'Fallback title', descriptive_blocks_append: [] }]
    })
    const n = proposalToFlow(p).nodes[0]
    expect(n.data.title).toBe('Fallback title')
    expect(n.data.type).toBe('?')
  })

  test('falls back to id when neither label nor update.title', () => {
    const p = makeProposal({ note_updates: [{ id: 'note:bare', descriptive_blocks_append: [] }] })
    const n = proposalToFlow(p).nodes[0]
    expect(n.data.title).toBe('note:bare')
  })

  test('updateChangeLines: mit_for === null emits "MIT → cleared"', () => {
    const p = makeProposal({ note_updates: [{ id: 'note:c', mit_for: null, descriptive_blocks_append: [] }] })
    expect(proposalToFlow(p).nodes[0].data.lines).toEqual(['MIT → cleared'])
  })

  test('updateChangeLines: no field changes emits the "(sin cambios de campo)" placeholder', () => {
    const p = makeProposal({ note_updates: [{ id: 'note:d', descriptive_blocks_append: [] }] })
    expect(proposalToFlow(p).nodes[0].data.lines).toEqual(['(sin cambios de campo)'])
  })

  test('updateChangeLines omits meta line when metadata_merge is empty', () => {
    const p = makeProposal({
      note_updates: [{ id: 'note:e', state: 'WAITING', metadata_merge: {}, descriptive_blocks_append: [] }]
    })
    expect(proposalToFlow(p).nodes[0].data.lines).toEqual(['state → WAITING'])
  })
})

describe('proposalToFlow — edges and context nodes', () => {
  test('edge between two created notes, no extra context nodes', () => {
    const p = makeProposal({
      note_creates: [
        { temp_id: 'tmp:a', type_slug: 'task', title: 'A', state: 'ACTIVE', descriptive_blocks: [] },
        { temp_id: 'tmp:b', type_slug: 'project', title: 'B', state: 'ACTIVE', descriptive_blocks: [] }
      ],
      edges: [{ kind: 'part_of', from: 'tmp:a', to: 'tmp:b' }]
    })
    const flow = proposalToFlow(p)
    expect(flow.nodes).toHaveLength(2)
    expect(flow.edges).toHaveLength(1)
    const e = flow.edges[0]
    expect(e.source).toBe('tmp:a')
    expect(e.target).toBe('tmp:b')
    expect(e.label).toBe('part_of')
    expect(e.id).toBe('tmp:a->tmp:b:part_of:0')
    expect(e.preexisting).toBeUndefined()
  })

  test('edge to an unknown endpoint materialises a context node (typed via labels)', () => {
    const p = makeProposal({
      note_creates: [{ temp_id: 'tmp:a', type_slug: 'task', title: 'A', state: 'ACTIVE', descriptive_blocks: [] }],
      edges: [{ kind: 'mentions', from: 'tmp:a', to: 'note:ctx' }]
    })
    const flow = proposalToFlow(p, { 'note:ctx': { type: 'person', title: 'Alice' } })
    const ctx = flow.nodes.find(n => n.id === 'note:ctx')
    expect(ctx).toBeDefined()
    expect(ctx?.data.status).toBe('context')
    expect(ctx?.data.type).toBe('person')
    expect(ctx?.data.title).toBe('Alice')
    expect(ctx?.data.lines).toEqual([])
    expect(ctx?.data.descriptives).toEqual([])
  })

  test('context node without a label gets type from id and id as title (typeFromId)', () => {
    const p = makeProposal({
      edges: [
        { kind: 'mentions', from: 'raw_capture:r1', to: 'block:b1' },
        { kind: 'mentions', from: 'block:b1', to: 'note:n1' }
      ]
    })
    const flow = proposalToFlow(p)
    const raw = flow.nodes.find(n => n.id === 'raw_capture:r1')
    const block = flow.nodes.find(n => n.id === 'block:b1')
    const note = flow.nodes.find(n => n.id === 'note:n1')
    expect(raw?.data.type).toBe('raw')
    expect(block?.data.type).toBe('block')
    // note: ids resolved by typeFromId fall through to '?'
    expect(note?.data.type).toBe('?')
    expect(raw?.data.title).toBe('raw_capture:r1')
  })

  test('drops edges that touch a narrative block (the hub plumbing)', () => {
    const p = makeProposal({
      narrative_blocks: [{ temp_id: 'tmp:narr', content: 'informe', raw_ids: [] }],
      note_creates: [{ temp_id: 'tmp:a', type_slug: 'task', title: 'A', state: 'ACTIVE', descriptive_blocks: [] }],
      edges: [
        { kind: 'about', from: 'tmp:narr', to: 'tmp:a' },
        { kind: 'derived_from', from: 'tmp:narr', to: 'raw_capture:r1' },
        { kind: 'affects', from: 'tmp:narr', to: 'note:x' },
        { kind: 'part_of', from: 'tmp:a', to: 'note:proj' }
      ]
    })
    const flow = proposalToFlow(p)
    // all narrative-touching edges dropped; only the note↔note part_of survives
    expect(flow.edges).toHaveLength(1)
    expect(flow.edges[0].label).toBe('part_of')
    // narrative block is never a node; raw_capture:r1 / note:x not materialised (their only edge was dropped)
    expect(flow.nodes.find(n => n.id === 'tmp:narr')).toBeUndefined()
    expect(flow.nodes.find(n => n.id === 'raw_capture:r1')).toBeUndefined()
    expect(flow.nodes.find(n => n.id === 'note:x')).toBeUndefined()
    // note:proj materialised as context endpoint of the surviving edge
    expect(flow.nodes.find(n => n.id === 'note:proj')?.data.status).toBe('context')
  })

  test('edge ids stay unique via the running index suffix', () => {
    const p = makeProposal({
      edges: [
        { kind: 'mentions', from: 'note:a', to: 'note:b' },
        { kind: 'mentions', from: 'note:a', to: 'note:b' }
      ]
    })
    const ids = proposalToFlow(p).edges.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['note:a->note:b:mentions:0', 'note:a->note:b:mentions:1'])
  })
})

describe('mergeExistingEdges', () => {
  const baseFlow = () =>
    proposalToFlow(
      makeProposal({
        note_creates: [
          { temp_id: 'note:a', type_slug: 'task', title: 'A', state: 'ACTIVE', descriptive_blocks: [] },
          { temp_id: 'note:b', type_slug: 'task', title: 'B', state: 'ACTIVE', descriptive_blocks: [] }
        ],
        edges: [{ kind: 'part_of', from: 'note:a', to: 'note:b' }]
      })
    )

  test('adds a preexisting edge between existing nodes, dashed', () => {
    const existing: ExistingEdge[] = [{ source: 'note:b', target: 'note:a', kind: 'blocked_by' }]
    const merged = mergeExistingEdges(baseFlow(), existing)
    expect(merged.edges).toHaveLength(2)
    const added = merged.edges.find(e => e.label === 'blocked_by')
    expect(added?.preexisting).toBe(true)
    expect(added?.source).toBe('note:b')
    expect(added?.target).toBe('note:a')
    expect(added?.id).toBe('existing:note:b->note:a:blocked_by:0')
  })

  test('ignores edges whose endpoints are not both in the node set', () => {
    const existing: ExistingEdge[] = [
      { source: 'note:a', target: 'note:outside', kind: 'mentions' },
      { source: 'note:outside', target: 'note:b', kind: 'mentions' }
    ]
    const merged = mergeExistingEdges(baseFlow(), existing)
    expect(merged.edges).toHaveLength(1) // only the original proposal edge
  })

  test('dedupes against an existing proposal edge with the same source/target/kind', () => {
    const existing: ExistingEdge[] = [{ source: 'note:a', target: 'note:b', kind: 'part_of' }]
    const merged = mergeExistingEdges(baseFlow(), existing)
    expect(merged.edges).toHaveLength(1)
    expect(merged.edges[0].preexisting).toBeUndefined()
  })

  test('dedupes duplicates within the existing list itself', () => {
    const existing: ExistingEdge[] = [
      { source: 'note:a', target: 'note:b', kind: 'mentions' },
      { source: 'note:a', target: 'note:b', kind: 'mentions' }
    ]
    const merged = mergeExistingEdges(baseFlow(), existing)
    const added = merged.edges.filter(e => e.preexisting)
    expect(added).toHaveLength(1)
  })

  test('keeps original nodes untouched', () => {
    const flow = baseFlow()
    const merged = mergeExistingEdges(flow, [{ source: 'note:a', target: 'note:b', kind: 'mentions' }])
    expect(merged.nodes).toBe(flow.nodes)
  })
})
