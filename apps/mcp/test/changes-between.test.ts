import { describe, expect, test } from 'bun:test'
import { aggregateChanges, type CommittedInput, renderAggregate } from '../src/tools/changes-between'

function payload(over: Partial<CommittedInput['payload']> = {}): CommittedInput['payload'] {
  return {
    raw_ids: [],
    narrative_blocks: [{ id: 'block:narr', content: 'x', raw_ids: [] }],
    note_creates: [],
    note_updates: [],
    edges: [],
    edges_remove: [],
    about: [],
    affects: [],
    ...over
  }
}

describe('aggregateChanges', () => {
  test('filters to the [from, to] window inclusively', () => {
    const props: CommittedInput[] = [
      { id: 'a', landedAt: '2026-05-21T10:00:00.000Z', payload: payload(), tempMap: {} },
      { id: 'b', landedAt: '2026-05-22T00:00:00.000Z', payload: payload(), tempMap: {} },
      { id: 'c', landedAt: '2026-05-29T23:59:59.999Z', payload: payload(), tempMap: {} },
      { id: 'd', landedAt: '2026-05-30T00:00:00.000Z', payload: payload(), tempMap: {} }
    ]
    const agg = aggregateChanges(props, '2026-05-22T00:00:00.000Z', '2026-05-29T23:59:59.999Z')
    expect(agg.proposalCount).toBe(2)
  })

  test('a note created in one proposal links from another (by real id)', () => {
    const props: CommittedInput[] = [
      {
        id: 'p1',
        landedAt: '2026-05-22T10:00:00.000Z',
        payload: payload({
          note_creates: [
            { id: 'note:salud', type_slug: 'area', title: 'Salud', state: 'ACTIVE', descriptive_blocks: [] }
          ]
        }),
        tempMap: {}
      },
      {
        id: 'p2',
        landedAt: '2026-05-22T11:00:00.000Z',
        payload: payload({ edges: [{ kind: 'part_of', from: 'note:cita', to: 'note:salud' }] }),
        tempMap: {}
      }
    ]
    const agg = aggregateChanges(props, '2026-05-22T00:00:00.000Z', '2026-05-22T23:59:59.999Z')
    const salud = agg.graph.nodes.find(n => n.id === 'note:salud')
    expect(salud?.data).toMatchObject({ status: 'created', title: 'Salud', type: 'area' })
    expect(agg.graph.edges).toMatchObject([{ source: 'note:cita', target: 'note:salud', label: 'part_of' }])
    expect(renderAggregate(agg)).toContain('note:cita —part_of→ "Salud"')
  })

  test('dedupes edges and counts how many proposals touch an updated note', () => {
    const props: CommittedInput[] = [
      {
        id: 'p1',
        landedAt: '2026-05-24T10:00:00.000Z',
        payload: payload({
          note_updates: [{ id: 'note:x', descriptive_blocks_append: [] }],
          edges: [{ kind: 'mentions', from: 'note:x', to: 'note:y' }]
        }),
        tempMap: {}
      },
      {
        id: 'p2',
        landedAt: '2026-05-24T12:00:00.000Z',
        payload: payload({
          note_updates: [{ id: 'note:x', descriptive_blocks_append: [] }],
          edges: [{ kind: 'mentions', from: 'note:x', to: 'note:y' }]
        }),
        tempMap: {}
      }
    ]
    const agg = aggregateChanges(props, '2026-05-24', '2026-05-25')
    expect(agg.graph.edges).toHaveLength(1)
    expect(agg.updatedCounts).toEqual({ 'note:x': 2 })
    expect(agg.byDay).toEqual([{ day: '2026-05-24', proposals: 2, creates: 0, updates: 2, edges: 2 }])
    expect(renderAggregate(agg)).toContain('note:x  (2 proposals)')
  })

  test('empty window renders a clear message', () => {
    const agg = aggregateChanges([], '2026-01-01', '2026-01-02')
    expect(renderAggregate(agg)).toContain('Nothing committed in this window.')
  })
})
