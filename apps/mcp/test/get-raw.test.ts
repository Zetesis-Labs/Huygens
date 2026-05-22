import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { getRawImpl } from '../src/tools/get-raw'
import { commitProposalImpl, createProposalImpl } from '../src/tools/proposal'
import { type TestDb, withFreshDb } from './_fixtures'

describe('getRawImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns null for unknown raw_id', async () => {
    const raw = await getRawImpl({ raw_id: 'raw_capture:does-not-exist' })
    expect(raw).toBeNull()
  })

  test('returns the raw with no derived records when fresh', async () => {
    const { raw_id } = await captureImpl({
      content: 'hola',
      source_kind: 'manual',
      source_ref: 'ref-x'
    })
    const raw = await getRawImpl({ raw_id })
    expect(raw).not.toBeNull()
    expect(raw?.id).toBe(raw_id)
    expect(raw?.content).toBe('hola')
    expect(raw?.source_kind).toBe('manual')
    expect(raw?.source_ref).toBe('ref-x')
    expect(raw?.processed_at).toBeNull()
    expect(raw?.derived_records).toEqual([])
  })

  test('lists derived records after committing a proposal', async () => {
    const { raw_id } = await captureImpl({ content: 'multi-item raw', source_kind: 'manual' })
    const proposal = await createProposalImpl({
      raw_ids: [raw_id],
      payload: {
        raw_ids: [raw_id],
        narrative_blocks: [{ temp_id: 'n1', content: 'Narrative from raw.', raw_ids: [raw_id] }],
        note_creates: [{ temp_id: 'task1', type_slug: 'task', title: 'A', descriptive_blocks: [{ content: '# A' }] }],
        note_updates: [],
        edges: [],
        about: [{ block_temp_id: 'n1', note_ref: 'task1' }],
        affects: [{ block_temp_id: 'n1', note_ref: 'task1', action: 'created' }]
      }
    })
    const commit = await commitProposalImpl({ proposal_id: proposal.id })

    const raw = await getRawImpl({ raw_id })
    expect(raw?.processed_at).not.toBeNull()
    expect(raw?.derived_records).toEqual(commit.narrative_blocks_created)
  })
})
