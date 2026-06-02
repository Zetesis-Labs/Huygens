import { describe, expect, test } from 'bun:test'
import { type FuseItem, foldTopology, type GraphPayload } from '../src/index'

function payload(over: Partial<GraphPayload> = {}): GraphPayload {
  return {
    note_creates: [],
    note_updates: [],
    edges: [],
    narrative_blocks: [],
    ...over
  }
}

function item(over: Partial<GraphPayload>, tempMap?: Record<string, string>): FuseItem {
  return { payload: payload(over), tempMap }
}

const key = (e: { source: string; target: string; kind: string }) => `${e.source}->${e.target}:${e.kind}`

describe('foldTopology', () => {
  test('accumulates edges across proposals', () => {
    const edges = foldTopology([
      item({ edges: [{ kind: 'part_of', from: 'note:a', to: 'note:root' }] }),
      item({ edges: [{ kind: 'blocked_by', from: 'note:a', to: 'note:b' }] })
    ])
    expect(edges.map(key).sort()).toEqual(['note:a->note:b:blocked_by', 'note:a->note:root:part_of'])
  })

  test('a later part_of replaces the child’s earlier parent (single-parent)', () => {
    const edges = foldTopology([
      item({ edges: [{ kind: 'part_of', from: 'note:domotica', to: 'note:casa' }] }),
      item({ edges: [{ kind: 'part_of', from: 'note:domotica', to: 'note:sistemas' }] })
    ])
    // only the latest parent survives — the old part_of is gone, as in the commit's
    // implicit DELETE part_of WHERE in = child AND out != newParent.
    expect(edges.map(key)).toEqual(['note:domotica->note:sistemas:part_of'])
  })

  test('does not replace for blocked_by / mentions (many-to-many)', () => {
    const edges = foldTopology([
      item({
        edges: [
          { kind: 'blocked_by', from: 'note:a', to: 'note:b' },
          { kind: 'blocked_by', from: 'note:a', to: 'note:c' }
        ]
      })
    ])
    expect(edges).toHaveLength(2)
  })

  test('explicit edges_remove drops the exact edge', () => {
    const edges = foldTopology([
      item({ edges: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }] }),
      item({ edges_remove: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }] })
    ])
    expect(edges).toHaveLength(0)
  })

  test('removals are applied before additions within one item', () => {
    // remove then re-add the same edge in one proposal → it survives.
    const edges = foldTopology([
      item({ edges: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }] }),
      item({
        edges: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }],
        edges_remove: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }]
      })
    ])
    expect(edges.map(key)).toEqual(['note:a->note:b:mentions'])
  })

  test('remaps temp ids to real note ids via tempMap', () => {
    // a note created as temp `child` in this proposal, linked under a real parent.
    const edges = foldTopology([
      item({ edges: [{ kind: 'part_of', from: 'child', to: 'note:root' }] }, { child: 'note:realchild' })
    ])
    expect(edges.map(key)).toEqual(['note:realchild->note:root:part_of'])
  })

  test('skips edges touching narrative blocks', () => {
    const edges = foldTopology([
      item({
        narrative_blocks: [{ id: 'n1' }],
        edges: [{ kind: 'mentions', from: 'n1', to: 'note:a' }]
      })
    ])
    expect(edges).toHaveLength(0)
  })

  test('empty input yields no edges', () => {
    expect(foldTopology([])).toEqual([])
  })
})
