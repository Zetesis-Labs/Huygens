import { describe, expect, test } from 'bun:test'
import type { ProposalDetail, ProposalResult, StoredProposalPayload } from '../src/tools/proposal/schemas'
import { renderProposalDiff } from '../src/tools/proposal-render'

function detail(
  payload: StoredProposalPayload,
  status = 'draft',
  id = 'proposal:test',
  result: ProposalResult | null = null
): ProposalDetail {
  return {
    id,
    status,
    raw_captures: payload.raw_ids,
    payload,
    result,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z'
  }
}

function fullPayload(): StoredProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ id: 'block:narr1', content: 'Aprobamos una tarea nueva.', raw_ids: ['raw_capture:r1'] }],
    note_creates: [
      {
        id: 'note:task1',
        type_slug: 'task',
        title: 'Call Ana',
        state: 'ACTIVE',
        mit_for: '2026-05-26',
        metadata: { priority: 'high' },
        descriptive_blocks: [{ content: 'Next action: call Ana.' }]
      },
      { id: 'note:project1', type_slug: 'project', title: 'Huygens migration', state: 'ACTIVE', descriptive_blocks: [] }
    ],
    note_updates: [
      {
        id: 'note:existing',
        state: 'DONE',
        mit_for: '2026-05-27',
        metadata_merge: { closed: true },
        descriptive_blocks_append: [{ content: 'Done.' }]
      }
    ],
    edges: [
      { kind: 'part_of', from: 'note:task1', to: 'note:project1', anchored: true },
      { kind: 'mentions', from: 'block:narr1', to: 'note:existing' }
    ],
    edges_remove: [],
    about: [{ block_id: 'block:narr1', note_id: 'note:task1' }],
    affects: [{ block_id: 'block:narr1', note_id: 'note:task1', action: 'created', summary: 'Created task.' }]
  }
}

function minimalPayload(): StoredProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ id: 'block:n1', content: 'note', raw_ids: ['raw_capture:r1'] }],
    note_creates: [],
    note_updates: [],
    edges: [],
    edges_remove: [],
    about: [],
    affects: []
  }
}

describe('renderProposalDiff', () => {
  test('renders a committable header for draft proposals', () => {
    expect(renderProposalDiff(detail(fullPayload()))).toContain('Proposal proposal:test — draft ✅ committable')
  })

  test('flags non-draft proposals as not committable', () => {
    expect(renderProposalDiff(detail(fullPayload(), 'committed'))).toContain('(not committable: committed)')
  })

  test('lists notes to create with title, type, state, blocks and metadata', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('CREATE 2 notes:')
    expect(out).toContain('"Call Ana"  task · ACTIVE')
    expect(out).toContain('+1 descriptive block')
    expect(out).toContain('MIT 2026-05-26')
    expect(out).toContain('metadata: priority')
    expect(out).toContain('"Huygens migration"  project · ACTIVE')
  })

  test('lists note updates with their changing fields', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('UPDATE 1 note:')
    expect(out).toContain('note:existing')
    expect(out).toContain('state → DONE')
    expect(out).toContain('MIT → 2026-05-27')
    expect(out).toContain('metadata: closed')
  })

  test('labels created notes by title in edges; real ids stay as-is', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('"Call Ana" —part_of→ "Huygens migration"')
    expect(out).toContain('[informe] —mentions→ note:existing')
  })

  test('renders about/affects topology with action and summary', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('about:   [informe] → "Call Ana"')
    expect(out).toContain('affects: [informe] → "Call Ana"  (created) "Created task."')
  })

  test('summary counts mirror commit effects', () => {
    expect(renderProposalDiff(detail(fullPayload()))).toContain(
      'On commit → notes +2 · updates 1 · narrative +1 · descriptive +2 · derived_from +1 · about +1 · affects +1 · edges +2'
    )
  })

  test('omits empty sections for a minimal payload', () => {
    const out = renderProposalDiff(detail(minimalPayload()))
    expect(out).not.toContain('CREATE 0')
    expect(out).not.toContain('UPDATE')
    expect(out).not.toContain('Graph edges')
    expect(out).not.toContain('Topology:')
  })

  test('collapses and truncates long narrative content to one line', () => {
    const payload = minimalPayload()
    payload.narrative_blocks = [
      { id: 'block:n1', content: `${'x'.repeat(200)}\nsecond line`, raw_ids: ['raw_capture:r1'] }
    ]
    const out = renderProposalDiff(detail(payload))
    expect(out).toContain('…')
    expect(out).not.toContain('second line')
  })

  test('is deterministic: same input produces identical output', () => {
    const payload = fullPayload()
    expect(renderProposalDiff(detail(payload))).toBe(renderProposalDiff(detail(payload)))
  })

  test('annotates a part_of onto a pre-existing note as a parent replace', () => {
    const payload = minimalPayload()
    payload.edges = [{ kind: 'part_of', from: 'note:child', to: 'note:parent', anchored: true }]
    expect(renderProposalDiff(detail(payload))).toContain(
      'note:child —part_of→ note:parent  (reemplaza padre anterior)'
    )
  })

  test('does not annotate replace when the child is created in this proposal', () => {
    // note:task1 → note:project1 are both created here: no prior parent to replace.
    expect(renderProposalDiff(detail(fullPayload()))).not.toContain('(reemplaza padre anterior)')
  })

  test('renders the edges_remove section and tallies it in the summary', () => {
    const payload = minimalPayload()
    payload.edges_remove = [
      { kind: 'blocked_by', from: 'note:a', to: 'note:b' },
      { kind: 'mentions', from: 'note:a', to: 'note:c' }
    ]
    const out = renderProposalDiff(detail(payload))
    expect(out).toContain('Edges removed (2):')
    expect(out).toContain('note:a —blocked_by✕→ note:b')
    expect(out).toContain('· edges-removed 2')
  })

  test('committed proposal shows the anchor (committed_at) + the changes pointer, not id-lists', () => {
    const result: ProposalResult = { versionstamp: '116638335457689600', committed_at: '2026-05-24T12:00:00Z' }
    const out = renderProposalDiff(detail(fullPayload(), 'committed', 'proposal:test', result))
    expect(out).toContain('Committed:')
    expect(out).toContain('committed_at: 2026-05-24T12:00:00Z')
    expect(out).toContain('get_proposal_changes')
    expect(out).not.toContain('notes created:')
  })

  test('omits the committed section when there is no result', () => {
    expect(renderProposalDiff(detail(fullPayload()))).not.toContain('Committed:')
  })
})
