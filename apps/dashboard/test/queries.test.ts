import { describe, expect, test } from 'bun:test'
import { resultsToFlow, rowsToFlow } from '../src/lib/queries'

// Reproduces the exact shape the chat agent's "tareas e ideas pendientes" query
// returns: task rows with their parent fetched as a nested record object. Before
// the fix this produced disconnected dots (parents weren't rows); now the parent
// is materialized as a context node and linked with a part_of edge.
describe('rowsToFlow — nested parents materialize as connected nodes', () => {
  test('a task whose parent is a nested record object connects to it', () => {
    const rows = [
      {
        id: 'note:task1',
        title: 'Terminar GitOps en Konect-Nixon',
        type: 'task',
        state: 'ACTIVE',
        parent: [{ id: 'note:proj1', title: 'Konect-Nixon', type: 'project', state: 'ACTIVE' }]
      }
    ]
    const flow = rowsToFlow(rows)
    expect(flow).not.toBeNull()
    // task node + materialized project node
    expect(flow?.nodes.map(n => n.id).sort()).toEqual(['note:proj1', 'note:task1'])
    const proj = flow?.nodes.find(n => n.id === 'note:proj1')
    expect(proj?.data.title).toBe('Konect-Nixon')
    expect(proj?.data.type).toBe('project')
    expect(proj?.data.status).toBe('context')
    // connected by a part_of backbone edge (solid, not preexisting/dashed)
    expect(flow?.edges).toHaveLength(1)
    expect(flow?.edges[0]).toMatchObject({
      source: 'note:task1',
      target: 'note:proj1',
      label: 'part_of',
      preexisting: false
    })
  })

  test('tasks sharing a parent collapse to one project node with two edges', () => {
    const proj = { id: 'note:huygens', title: 'Huygens', type: 'project', state: 'ACTIVE' }
    const rows = [
      { id: 'note:a', title: 'A', type: 'task', state: 'ACTIVE', parent: [proj] },
      { id: 'note:b', title: 'B', type: 'idea', state: 'CLARIFIED', parent: [proj] }
    ]
    const flow = rowsToFlow(rows)
    expect(flow?.nodes).toHaveLength(3) // a, b, huygens
    expect(flow?.edges).toHaveLength(2)
    expect(flow?.edges.every(e => e.target === 'note:huygens' && e.label === 'part_of')).toBe(true)
  })

  test('a task with no parent stays a lone node, no edges', () => {
    const flow = rowsToFlow([{ id: 'note:solo', title: 'Sin parent', type: 'task', state: 'ACTIVE', parent: [] }])
    expect(flow?.nodes).toHaveLength(1)
    expect(flow?.edges).toHaveLength(0)
  })

  test('returns null when no row carries a record id', () => {
    expect(rowsToFlow([{ total: 5 }, { state: 'ACTIVE', count: 3 }])).toBeNull()
  })

  test('parent + grandparent chain as task→project→area, not task→area', () => {
    const rows = [
      {
        id: 'note:task',
        title: 'Docusaurus',
        type: 'task',
        state: 'ACTIVE',
        parent: [{ id: 'note:proj', title: 'Konect-Nixon', type: 'project', state: 'ACTIVE' }],
        grandparent: [{ id: 'note:area', title: 'Irontec', type: 'area', state: 'ACTIVE' }]
      }
    ]
    const flow = rowsToFlow(rows)
    expect(flow?.nodes.map(n => n.id).sort()).toEqual(['note:area', 'note:proj', 'note:task'])
    // chained: task→proj and proj→area; NO direct task→area line
    const pairs = flow?.edges.map(e => `${e.source}->${e.target}:${e.label}`).sort()
    expect(pairs).toEqual(['note:proj->note:area:part_of', 'note:task->note:proj:part_of'])
  })
})

describe('resultsToFlow — explicit edge rows are authoritative', () => {
  // Shape of the well-designed "mapa por proyecto/área" query: a ledger statement
  // (flat columns), a node statement, and a part_of edge statement.
  test('uses real part_of edge rows and ignores the flat ledger columns', () => {
    const results = [
      // statement 1: ledger (flat nested columns — must be IGNORED for edges)
      [{ id: 'note:task', title: 'Docusaurus', type: 'task', state: 'ACTIVE', grandparent: [{ id: 'note:area' }] }],
      // statement 2: node rows
      [
        { id: 'note:task', title: 'Docusaurus', type: 'task', state: 'ACTIVE' },
        { id: 'note:proj', title: 'Konect-Nixon', type: 'project', state: 'ACTIVE' },
        { id: 'note:area', title: 'Irontec', type: 'area', state: 'ACTIVE' }
      ],
      // statement 3: real part_of edges
      [
        { id: 'part_of:1', in: 'note:task', out: 'note:proj' },
        { id: 'part_of:2', in: 'note:proj', out: 'note:area' }
      ]
    ]
    const flow = resultsToFlow(results)
    expect(flow?.nodes.map(n => n.id).sort()).toEqual(['note:area', 'note:proj', 'note:task'])
    const pairs = flow?.edges.map(e => `${e.source}->${e.target}:${e.label}`).sort()
    // exactly the two real part_of edges — no task→area from the ledger column
    expect(pairs).toEqual(['note:proj->note:area:part_of', 'note:task->note:proj:part_of'])
  })

  test('edge kind comes from the edge table (blocked_by stays a context link)', () => {
    const results = [
      [
        { id: 'note:a', title: 'A', type: 'task', state: 'WAITING' },
        { id: 'note:b', title: 'B', type: 'task', state: 'ACTIVE' }
      ],
      [{ id: 'blocked_by:1', in: 'note:a', out: 'note:b' }]
    ]
    const flow = resultsToFlow(results)
    const e = flow?.edges[0]
    expect(e).toMatchObject({ source: 'note:a', target: 'note:b', label: 'blocked_by', preexisting: true })
  })

  test('falls back to nested inference when there are no explicit edge rows', () => {
    const results = [
      [
        {
          id: 'note:t',
          title: 'T',
          type: 'task',
          state: 'ACTIVE',
          parent: [{ id: 'note:p', title: 'P', type: 'project' }]
        }
      ]
    ]
    const flow = resultsToFlow(results)
    expect(flow?.nodes.map(n => n.id).sort()).toEqual(['note:p', 'note:t'])
    expect(flow?.edges).toHaveLength(1)
    expect(flow?.edges[0]).toMatchObject({ source: 'note:t', target: 'note:p', label: 'part_of' })
  })
})
