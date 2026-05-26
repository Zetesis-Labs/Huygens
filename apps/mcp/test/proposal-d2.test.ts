import { describe, expect, test } from 'bun:test'
import type { ProposalChanges } from '../src/tools/proposal'
import { renderProposalD2 } from '../src/tools/proposal-d2'

function changes(materialized: ProposalChanges['materialized']): ProposalChanges {
  return {
    proposal_id: 'proposal:test',
    status: 'committed',
    versionstamp: '116638557902667776',
    committed_at: '2026-05-24T00:00:00Z',
    materialized,
    changefeed: { available: true, versionstamp: '116638557902667776', tables: {} }
  }
}

describe('renderProposalD2', () => {
  test('renders created nodes and edges from materialized changes', () => {
    const d2 = renderProposalD2(
      changes({
        notes_created: [{ id: 'note:abc', title: 'Llamar a Ana', type: 'note_type:task' }],
        notes_updated: [],
        narrative_blocks_created: [{ id: 'block:n1' }],
        descriptive_blocks_created: [{ id: 'block:d1' }],
        derived_from: [{ id: 'derived_from:1', in: 'block:n1', out: 'raw_capture:r1' }],
        about: [{ id: 'about:1', in: 'block:n1', out: 'note:abc' }],
        affects: [{ id: 'affects:1', in: 'block:n1', out: 'note:abc', action: 'created' }],
        semantic_edges: [{ id: 'part_of:1', in: 'note:abc', out: 'note:project' }]
      })
    )
    expect(d2).toContain('note_abc: "task · Llamar a Ana" { class: created; shape: rectangle }')
    expect(d2).toContain('about')
    expect(d2).toContain('affects · created')
    expect(d2).toContain('part_of')
    // endpoints outside the commit become dashed context nodes
    expect(d2).toContain('note_project: "note:project" { class: context')
    expect(d2).toContain('raw_capture_r1')
    expect(d2).toContain('classes:')
  })

  test('returns a comment when there is no materialized result', () => {
    const d2 = renderProposalD2({
      proposal_id: 'proposal:x',
      status: 'draft',
      versionstamp: null,
      committed_at: null,
      materialized: null,
      changefeed: { available: false, versionstamp: null, tables: {} }
    })
    expect(d2).toContain('no materialized result')
  })

  test('is deterministic', () => {
    const c = changes({
      notes_created: [{ id: 'note:abc', title: 'X', type: 'note_type:task' }],
      notes_updated: [],
      narrative_blocks_created: [],
      descriptive_blocks_created: [],
      derived_from: [],
      about: [],
      affects: [],
      semantic_edges: []
    })
    expect(renderProposalD2(c)).toBe(renderProposalD2(c))
  })
})
