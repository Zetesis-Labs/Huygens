import { describe, expect, test } from 'bun:test'
import type { ProposalDetail, ProposalPayload } from '../src/tools/proposal'
import { renderProposalDiff } from '../src/tools/proposal-render'

function detail(payload: ProposalPayload, status = 'draft', id = 'proposal:test'): ProposalDetail {
  return {
    id,
    status,
    raw_captures: payload.raw_ids,
    payload,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z'
  }
}

function fullPayload(): ProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ temp_id: 'narrative1', content: 'Aprobamos una tarea nueva.', raw_ids: ['raw_capture:r1'] }],
    note_creates: [
      {
        temp_id: 'task1',
        type_slug: 'task',
        title: 'Call Ana',
        state: 'ACTIVE',
        metadata: { priority: 'high' },
        descriptive_blocks: [{ content: 'Next action: call Ana.' }]
      },
      { temp_id: 'project1', type_slug: 'project', title: 'Huygens migration', state: 'ACTIVE', descriptive_blocks: [] }
    ],
    note_updates: [
      {
        id: 'note:existing',
        state: 'DONE',
        metadata_merge: { closed: true },
        descriptive_blocks_append: [{ content: 'Done.' }]
      }
    ],
    edges: [
      { kind: 'part_of', from: 'task1', to: 'project1' },
      { kind: 'mentions', from: 'narrative1', to: 'note:existing' }
    ],
    about: [{ block_temp_id: 'narrative1', note_ref: 'task1' }],
    affects: [{ block_temp_id: 'narrative1', note_ref: 'task1', action: 'created', summary: 'Created task.' }]
  }
}

function minimalPayload(): ProposalPayload {
  return {
    raw_ids: ['raw_capture:r1'],
    narrative_blocks: [{ temp_id: 'n1', content: 'note', raw_ids: ['raw_capture:r1'] }],
    note_creates: [],
    note_updates: [],
    edges: [],
    about: [],
    affects: []
  }
}

describe('renderProposalDiff', () => {
  test('renders a committable header for draft proposals', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('Proposal proposal:test — draft ✅ committable')
  })

  test('flags non-draft proposals as not committable', () => {
    const out = renderProposalDiff(detail(fullPayload(), 'committed'))
    expect(out).toContain('(not committable: committed)')
  })

  test('lists notes to create with title, type, state, blocks and metadata', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('CREATE 2 notes:')
    expect(out).toContain('"Call Ana"  task · ACTIVE')
    expect(out).toContain('+1 descriptive block')
    expect(out).toContain('metadata: priority')
    expect(out).toContain('"Huygens migration"  project · ACTIVE')
  })

  test('lists note updates with their changing fields', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('UPDATE 1 note:')
    expect(out).toContain('note:existing')
    expect(out).toContain('state → DONE')
    expect(out).toContain('metadata: closed')
  })

  test('resolves temp_ids to labels and leaves real record ids as-is', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('"Call Ana" —part_of→ "Huygens migration"')
    expect(out).toContain('[narrative1] —mentions→ note:existing')
  })

  test('renders about/affects topology with action and summary', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain('about:   [narrative1] → "Call Ana"')
    expect(out).toContain('affects: [narrative1] → "Call Ana"  (created) "Created task."')
  })

  test('summary counts mirror commit effects', () => {
    const out = renderProposalDiff(detail(fullPayload()))
    expect(out).toContain(
      'On commit → notes +2 · updates 1 · narrative +1 · descriptive +2 · derived_from +1 · about +1 · affects +1 · edges +2'
    )
  })

  test('omits empty sections for a minimal payload', () => {
    const out = renderProposalDiff(detail(minimalPayload()))
    expect(out).not.toContain('CREATE 0')
    expect(out).not.toContain('UPDATE')
    expect(out).not.toContain('Graph edges')
    expect(out).not.toContain('Topology:')
    expect(out).toContain(
      'On commit → notes +0 · updates 0 · narrative +1 · descriptive +0 · derived_from +1 · about +0 · affects +0 · edges +0'
    )
  })

  test('collapses and truncates long narrative content to one line', () => {
    const payload = minimalPayload()
    payload.narrative_blocks = [
      { temp_id: 'n1', content: `${'x'.repeat(200)}\nsecond line`, raw_ids: ['raw_capture:r1'] }
    ]
    const out = renderProposalDiff(detail(payload))
    expect(out).toContain('…')
    expect(out).not.toContain('second line')
  })

  test('is deterministic: same input produces identical output', () => {
    const payload = fullPayload()
    expect(renderProposalDiff(detail(payload))).toBe(renderProposalDiff(detail(payload)))
  })
})
