import { describe, expect, test } from 'bun:test'
import { RecordId } from 'surrealdb'
import { buildCommitTx } from '../src/tools/proposal/commit'
import type { StoredProposalPayload } from '../src/tools/proposal/schemas'

const PROPOSAL = new RecordId('proposal', 'test')

function payload(over: Partial<StoredProposalPayload> = {}): StoredProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ id: 'block:n1', content: 'x', raw_ids: ['raw_capture:r1'] }],
    note_creates: [],
    note_updates: [],
    edges: [],
    edges_remove: [],
    about: [],
    affects: [],
    ...over
  }
}

describe('buildCommitTx — máximo-limpio', () => {
  test('wraps everything in one BEGIN…COMMIT', () => {
    const { query } = buildCommitTx(payload(), PROPOSAL)
    expect(query.startsWith('BEGIN;')).toBe(true)
    expect(query.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  test('creates notes with an explicit id (CREATE … CONTENT)', () => {
    const { query } = buildCommitTx(
      payload({
        note_creates: [{ id: 'note:abc', type_slug: 'task', title: 'T', state: 'ACTIVE', descriptive_blocks: [] }]
      }),
      PROPOSAL
    )
    expect(query).toContain('CREATE ')
    expect(query).toContain('CONTENT')
  })

  test('a part_of edge emits a parent-replace DELETE before the RELATE', () => {
    const { query } = buildCommitTx(
      payload({ edges: [{ kind: 'part_of', from: 'note:child', to: 'note:parent', anchored: true }] }),
      PROPOSAL
    )
    const del = query.indexOf('DELETE part_of WHERE in =')
    const rel = query.indexOf('->part_of->')
    expect(del).toBeGreaterThan(-1)
    expect(rel).toBeGreaterThan(-1)
    expect(del).toBeLessThan(rel)
    expect(query).toContain('AND out != ') // idempotent: don't churn the same parent
  })

  test('does not emit a replace DELETE for blocked_by / relates_to', () => {
    const { query } = buildCommitTx(
      payload({ edges: [{ kind: 'relates_to', from: 'note:a', to: 'note:b' }] }),
      PROPOSAL
    )
    expect(query).not.toContain('DELETE part_of')
  })

  test('edges_remove emits an exact-match DELETE per entry', () => {
    const { query } = buildCommitTx(
      payload({ edges_remove: [{ kind: 'blocked_by', from: 'note:a', to: 'note:b' }] }),
      PROPOSAL
    )
    expect(query).toContain('DELETE blocked_by WHERE in =')
    expect(query).toContain('AND out = ') // exact edge, not the != of the part_of replace
  })

  test('removals run before additions', () => {
    const { query } = buildCommitTx(
      payload({
        edges: [{ kind: 'relates_to', from: 'note:a', to: 'note:c' }],
        edges_remove: [{ kind: 'relates_to', from: 'note:a', to: 'note:b' }]
      }),
      PROPOSAL
    )
    expect(query.indexOf('DELETE relates_to WHERE in =')).toBeLessThan(query.indexOf('->relates_to->'))
  })

  test('stamps only the anchor on the proposal — no materialized id-lists', () => {
    const { query } = buildCommitTx(payload(), PROPOSAL)
    expect(query).toContain('versionstamp: NONE')
    expect(query).toContain('committed_at: time::now()')
    expect(query).not.toContain('notes_created:')
    expect(query).not.toContain('semantic_edges:')
    expect(query).not.toContain('temp_ids:')
  })
})
