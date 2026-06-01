import { describe, expect, test } from 'bun:test'
import { RecordId } from 'surrealdb'
import { buildCommitTx } from '../src/tools/proposal/commit'
import type { ProposalPayload } from '../src/tools/proposal/schemas'

const PROPOSAL = new RecordId('proposal', 'test')

function payload(over: Partial<ProposalPayload> = {}): ProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ temp_id: 'n1', content: 'x', raw_ids: ['raw_capture:r1'] }],
    note_creates: [],
    note_updates: [],
    edges: [],
    edges_remove: [],
    about: [],
    affects: [],
    ...over
  }
}

describe('buildCommitTx — edge removal', () => {
  test('wraps everything in one BEGIN…COMMIT', () => {
    const { query } = buildCommitTx(payload(), PROPOSAL)
    expect(query.startsWith('BEGIN;')).toBe(true)
    expect(query.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  test('a part_of edge emits a parent-replace DELETE before the RELATE, in the same tx', () => {
    const { query } = buildCommitTx(
      payload({ edges: [{ kind: 'part_of', from: 'note:child', to: 'note:parent' }] }),
      PROPOSAL
    )
    const del = query.indexOf('DELETE part_of WHERE in =')
    const rel = query.indexOf('->part_of->') // the part_of RELATE specifically
    expect(del).toBeGreaterThan(-1)
    expect(rel).toBeGreaterThan(-1)
    expect(del).toBeLessThan(rel) // delete the old parent first
    expect(query).toContain('AND out != ') // idempotent: don't churn the same parent
    expect(query).toContain('RETURN BEFORE') // capture the removed id for the SSOT
  })

  test('does not emit a replace DELETE for blocked_by / mentions edges', () => {
    const { query } = buildCommitTx(payload({ edges: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }] }), PROPOSAL)
    expect(query).not.toContain('DELETE part_of')
  })

  test('edges_remove emits an exact-match DELETE per entry', () => {
    const { query } = buildCommitTx(
      payload({ edges_remove: [{ kind: 'blocked_by', from: 'note:a', to: 'note:b' }] }),
      PROPOSAL
    )
    expect(query).toContain('DELETE blocked_by WHERE in =')
    expect(query).toContain('AND out =') // exact edge, not the != of the part_of replace
    expect(query).toContain('RETURN BEFORE')
  })

  test('removals run before additions', () => {
    const { query } = buildCommitTx(
      payload({
        edges: [{ kind: 'mentions', from: 'note:a', to: 'note:c' }],
        edges_remove: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }]
      }),
      PROPOSAL
    )
    expect(query.indexOf('DELETE mentions WHERE in =')).toBeLessThan(query.indexOf('->mentions->'))
  })

  test('finalize materializes edges_removed into proposal.result (flattened)', () => {
    const { query } = buildCommitTx(
      payload({ edges_remove: [{ kind: 'mentions', from: 'note:a', to: 'note:b' }] }),
      PROPOSAL
    )
    expect(query).toContain('edges_removed: array::flatten([')
  })

  test('an empty payload still writes an empty edges_removed array', () => {
    const { query } = buildCommitTx(payload(), PROPOSAL)
    expect(query).toContain('edges_removed: array::flatten([])')
  })
})
