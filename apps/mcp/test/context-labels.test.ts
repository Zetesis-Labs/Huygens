import { describe, expect, test } from 'bun:test'
import {
  contextEndpointIds,
  contextLabel,
  type MaterializedGraph,
  mutatedNodeIds
} from '../src/tools/proposal/context-labels'

// Pure logic, no database: the I/O (selectByIds) lives in changes.ts, these
// helpers are just set math + string building.

function emptyGraph(): MaterializedGraph {
  return {
    notes_created: [],
    notes_updated: [],
    narrative_blocks_created: [],
    descriptive_blocks_created: [],
    derived_from: [],
    about: [],
    affects: [],
    semantic_edges: []
  }
}

describe('contextLabel', () => {
  test('raw_capture → "raw · <content>"', () => {
    expect(contextLabel({ id: 'raw_capture:a', content: 'Apunta algo' })).toBe('raw · Apunta algo')
  })

  test('note with type → "<type> · <title>"', () => {
    expect(contextLabel({ id: 'note:a', title: 'Omnia', type: 'note_type:project' })).toBe('project · Omnia')
  })

  test('note without type → just the title', () => {
    expect(contextLabel({ id: 'note:a', title: 'Omnia' })).toBe('Omnia')
  })

  test('block → "block · <content>"', () => {
    expect(contextLabel({ id: 'block:a', content: 'cuerpo' })).toBe('block · cuerpo')
  })

  test('unknown table → null', () => {
    expect(contextLabel({ id: 'agent_event:a' })).toBeNull()
  })
})

describe('mutatedNodeIds', () => {
  test('collects the ids of created and updated nodes', () => {
    const g = emptyGraph()
    g.notes_created = [{ id: 'note:a' }]
    g.notes_updated = [{ id: 'note:b' }]
    g.narrative_blocks_created = [{ id: 'block:n' }]
    expect(mutatedNodeIds(g)).toEqual(new Set(['note:a', 'note:b', 'block:n']))
  })
})

describe('contextEndpointIds', () => {
  test('returns edge endpoints the commit did not create or update', () => {
    const g = emptyGraph()
    g.notes_created = [{ id: 'note:new' }]
    g.narrative_blocks_created = [{ id: 'block:n' }]
    g.derived_from = [{ id: 'derived_from:1', in: 'block:n', out: 'raw_capture:r' }]
    g.affects = [
      { id: 'affects:1', in: 'block:n', out: 'note:new', action: 'created' },
      { id: 'affects:2', in: 'block:n', out: 'note:project', action: 'linked' }
    ]
    g.semantic_edges = [{ id: 'part_of:1', in: 'note:new', out: 'note:project' }]

    // block:n and note:new are mutated → excluded; the pre-existing raw and
    // project are the context endpoints to label.
    expect(new Set(contextEndpointIds(g, mutatedNodeIds(g)))).toEqual(new Set(['raw_capture:r', 'note:project']))
  })
})
