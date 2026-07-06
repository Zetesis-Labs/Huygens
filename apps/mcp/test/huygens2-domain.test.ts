import { describe, expect, test } from 'bun:test'
import { EDGE_KINDS, NOTE_STATES, NOTE_TYPE_SLUGS } from '../src/domain'
import { type ProposalPayload, proposalPayloadSchema } from '../src/tools/proposal/schemas'
import { validatePayload } from '../src/tools/proposal/validation'

const RAW = 'raw_capture:abc123'

function basePayload(overrides: Partial<ProposalPayload> = {}): ProposalPayload {
  return {
    raw_ids: [RAW],
    narrative_blocks: [{ temp_id: 'narrative1', content: 'Mutation summary.', raw_ids: [RAW] }],
    note_creates: [
      {
        temp_id: 'area1',
        type_slug: 'area',
        title: 'Systems',
        state: 'ACTIVE',
        descriptive_blocks: []
      },
      {
        temp_id: 'task1',
        type_slug: 'task',
        title: 'Ship operational graph',
        state: 'ACTIVE',
        descriptive_blocks: []
      }
    ],
    note_updates: [],
    edges: [{ kind: 'part_of', from: 'task1', to: 'area1', anchored: true }],
    edges_remove: [],
    about: [],
    affects: [],
    ...overrides
  }
}

function firstNoteCreate(): ProposalPayload['note_creates'][number] {
  const [note] = basePayload().note_creates
  if (!note) throw new Error('basePayload must have a note_create')
  return note
}

describe('Huygens 2 operational domain', () => {
  test('domain constants expose only the canonical operational vocabulary', () => {
    expect([...NOTE_STATES]).toEqual(['ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'])
    expect([...NOTE_TYPE_SLUGS]).toEqual(['area', 'objective', 'project', 'task', 'idea', 'reference', 'agent', 'tool'])
    expect([...EDGE_KINDS]).toEqual(['part_of', 'blocked_by', 'depends_on', 'owned_by', 'relates_to', 'duplicates'])
  })

  test('proposal schema defaults new notes to ACTIVE, never CLARIFIED', () => {
    const parsed = proposalPayloadSchema.parse({
      raw_ids: [RAW],
      narrative_blocks: [{ temp_id: 'narrative1', content: 'summary', raw_ids: [RAW] }],
      note_creates: [{ temp_id: 'task1', type_slug: 'task', title: 'Task' }]
    })
    expect(parsed.note_creates[0]?.state).toBe('ACTIVE')
  })

  test('proposal schema rejects retired types, retired states, and retired edge kind', () => {
    expect(() =>
      proposalPayloadSchema.parse(basePayload({ note_creates: [{ ...firstNoteCreate(), type_slug: 'objetivo' }] }))
    ).toThrow()
    expect(() =>
      proposalPayloadSchema.parse(basePayload({ note_creates: [{ ...firstNoteCreate(), state: 'CLARIFIED' }] }))
    ).toThrow()
    expect(() =>
      proposalPayloadSchema.parse(basePayload({ edges: [{ kind: 'mentions', from: 'task1', to: 'area1' }] }))
    ).toThrow()
  })

  test('proposal validation enforces type/state matrix', () => {
    expect(() =>
      validatePayload(
        [RAW],
        basePayload({ note_creates: [{ ...firstNoteCreate(), type_slug: 'area', state: 'DONE' }] })
      )
    ).toThrow(/state DONE is not allowed for type area/)
    expect(() =>
      validatePayload(
        [RAW],
        basePayload({ note_creates: [{ ...firstNoteCreate(), type_slug: 'reference', state: 'SOMEDAY' }] })
      )
    ).toThrow(/state SOMEDAY is not allowed for type reference/)
  })

  test('proposal validation enforces Huygens 2 metadata guardrails', () => {
    expect(() =>
      validatePayload([RAW], basePayload({ note_creates: [{ ...firstNoteCreate(), metadata: { priority: 'high' } }] }))
    ).toThrow(/metadata\.priority/)
    expect(() =>
      validatePayload(
        [RAW],
        basePayload({
          note_creates: [{ ...firstNoteCreate(), metadata: { last_reviewed_at: '2026-07-06' } }]
        })
      )
    ).toThrow(/metadata\.last_reviewed_at/)
    expect(() =>
      validatePayload(
        [RAW],
        basePayload({
          note_creates: [{ ...firstNoteCreate(), type_slug: 'agent', metadata: { agent_kind: 'robot' } }]
        })
      )
    ).toThrow(/agent_kind/)
    expect(() =>
      validatePayload(
        [RAW],
        basePayload({
          note_creates: [{ ...firstNoteCreate(), type_slug: 'agent', metadata: { agent_kind: 'ai_agent' } }]
        })
      )
    ).not.toThrow()
  })
})
