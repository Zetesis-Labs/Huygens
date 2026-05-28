import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import {
  commitProposalImpl,
  createProposalImpl,
  discardProposalImpl,
  getProposalChangesImpl,
  getProposalImpl,
  type ProposalPayload,
  updateProposalImpl
} from '../src/tools/proposal'
import { setRawStatusImpl } from '../src/tools/set-raw-status'
import { type TestDb, withFreshDb } from './_fixtures'

function payload(rawIds: string[], overrides: Partial<ProposalPayload> = {}): ProposalPayload {
  return {
    raw_ids: rawIds,
    narrative_blocks: [{ temp_id: 'narrative1', content: 'Aprobamos una tarea nueva.', raw_ids: rawIds }],
    note_creates: [
      {
        temp_id: 'task1',
        type_slug: 'task',
        title: 'Call Ana',
        state: 'ACTIVE',
        metadata: { priority: 'high' },
        descriptive_blocks: [{ content: 'Next action: call Ana this week.' }]
      },
      {
        temp_id: 'project1',
        type_slug: 'project',
        title: 'Huygens migration',
        state: 'ACTIVE',
        descriptive_blocks: []
      }
    ],
    note_updates: [],
    edges: [
      { kind: 'part_of', from: 'task1', to: 'project1' },
      { kind: 'mentions', from: 'narrative1', to: 'task1' }
    ],
    about: [{ block_temp_id: 'narrative1', note_ref: 'task1' }],
    affects: [{ block_temp_id: 'narrative1', note_ref: 'task1', action: 'created', summary: 'Created task.' }],
    ...overrides
  }
}

async function captureMany(contents: string[]): Promise<string[]> {
  const raws = []
  for (const content of contents) {
    raws.push(await captureImpl({ content, source_kind: 'manual' }))
  }
  return raws.map(raw => raw.raw_id)
}

describe('proposal v2.1-lite flow', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create_proposal stores a draft without mutating the graph', async () => {
    const rawIds = await captureMany(['a', 'b'])
    const proposal = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })

    expect(proposal.status).toBe('draft')
    expect(proposal.raw_captures).toEqual(rawIds)

    const [notes] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM note GROUP ALL')
    const [blocks] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM block GROUP ALL')
    expect(notes[0]?.count ?? 0).toBe(0)
    expect(blocks[0]?.count ?? 0).toBe(0)
  })

  test('update_proposal only updates drafts', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    const updatedPayload = payload(rawIds, {
      narrative_blocks: [{ temp_id: 'narrative1', content: 'Texto cambiado.', raw_ids: rawIds }]
    })

    const updated = await updateProposalImpl({ proposal_id: created.id, payload: updatedPayload })
    expect(updated.payload.narrative_blocks[0]?.content).toBe('Texto cambiado.')

    await discardProposalImpl({ proposal_id: created.id })
    await expect(updateProposalImpl({ proposal_id: created.id, payload: updatedPayload })).rejects.toThrow(
      'proposal is not draft'
    )
  })

  test('get_proposal and discard_proposal expose final status', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })

    const before = await getProposalImpl({ proposal_id: created.id })
    expect(before?.status).toBe('draft')

    const discarded = await discardProposalImpl({ proposal_id: created.id })
    expect(discarded.status).toBe('discarded')

    const after = await getProposalImpl({ proposal_id: created.id })
    expect(after?.status).toBe('discarded')
  })

  test('commit_proposal materializes narrative block, provenance, graph edges and processed raws', async () => {
    const rawIds = await captureMany(['raw one', 'raw two', 'raw three'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })

    const result = await commitProposalImpl({ proposal_id: created.id })

    expect(result.raw_ids_processed).toEqual(rawIds)
    expect(result.narrative_blocks_created).toHaveLength(1)
    expect(result.notes_created).toHaveLength(2)
    expect(result.descriptive_blocks_created).toHaveLength(1)
    expect(result.derived_from_created).toBe(3)
    expect(result.about_created).toBe(1)
    expect(result.affects_created).toBe(1)
    expect(result.semantic_edges_created).toBe(2)

    const [raws] = await ctx.db.query<[{ status: string; created_at: Date }[]]>(
      'SELECT status, created_at FROM raw_capture ORDER BY created_at'
    )
    expect(raws.map(raw => raw.status)).toEqual(['processed', 'processed', 'processed'])

    const [blocks] = await ctx.db.query<[{ block_kind: string; note?: unknown; created_at: Date }[]]>(
      'SELECT block_kind, note, created_at FROM block ORDER BY created_at'
    )
    expect(blocks.map(block => block.block_kind)).toEqual(['descriptive', 'narrative'])
    expect(blocks[1]?.note).toBeUndefined()

    const [derived] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM derived_from GROUP ALL')
    const [about] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM about GROUP ALL')
    const [affects] = await ctx.db.query<[{ action: string; summary: string | null }[]]>(
      'SELECT action, summary FROM affects'
    )
    const committed = await getProposalImpl({ proposal_id: created.id })

    expect(derived[0]?.count).toBe(3)
    expect(about[0]?.count).toBe(1)
    expect(affects[0]).toMatchObject({ action: 'created', summary: 'Created task.' })
    expect(committed?.status).toBe('committed')
  })

  test('commit_proposal materializes the result (real ids + versionstamp) on the proposal', async () => {
    const rawIds = await captureMany(['raw one', 'raw two', 'raw three'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })

    await commitProposalImpl({ proposal_id: created.id })

    const committed = await getProposalImpl({ proposal_id: created.id })
    const result = committed?.result
    expect(result).toBeTruthy()
    expect(result?.notes_created).toHaveLength(2)
    expect(result?.narrative_blocks_created).toHaveLength(1)
    expect(result?.descriptive_blocks_created).toHaveLength(1)
    expect(result?.derived_from).toHaveLength(3)
    expect(result?.about).toHaveLength(1)
    expect(result?.affects).toHaveLength(1)
    expect(result?.semantic_edges).toHaveLength(2)
    // the stored ids are real records, not temp ids
    expect(String(result?.notes_created[0])).toMatch(/^note:/)
    expect(String(result?.semantic_edges[0])).toMatch(/^(part_of|blocked_by|mentions):/)
    expect(result?.committed_at).toBeTruthy()
    // versionstamp capture is best-effort (changefeed flush): a string, or null
    expect(result?.versionstamp == null || typeof result?.versionstamp === 'string').toBe(true)
  })

  test('get_proposal_changes recovers materialized records and the changefeed delta', async () => {
    const rawIds = await captureMany(['raw one', 'raw two', 'raw three'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.status).toBe('committed')

    // Vía 1: materialized — real records resolved from the stored ids
    expect(changes.materialized?.notes_created).toHaveLength(2)
    expect(changes.materialized?.narrative_blocks_created).toHaveLength(1)
    expect(changes.materialized?.semantic_edges).toHaveLength(2)
    const note = changes.materialized?.notes_created[0] as { title?: string }
    expect(typeof note?.title).toBe('string')

    // Vía 2: changefeed — best-effort (available iff a versionstamp was captured)
    if (changes.changefeed.available) {
      expect(Object.keys(changes.changefeed.tables).length).toBeGreaterThan(0)
    }
  })

  test('get_proposal_changes on a non-committed proposal returns no materialized result', async () => {
    const rawIds = await captureMany(['solo raw'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.materialized).toBeNull()
    expect(changes.changefeed.available).toBe(false)
  })

  test('get_proposal_changes output is JSON-serializable (changefeed BigInt → string)', async () => {
    const rawIds = await captureMany(['raw one', 'raw two', 'raw three'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(() => JSON.stringify(changes)).not.toThrow()
    for (const rows of Object.values(changes.changefeed.tables)) {
      for (const changeset of rows as Array<{ versionstamp?: unknown }>) {
        expect(typeof changeset.versionstamp).not.toBe('bigint')
      }
    }
  })

  test('commit_proposal writes mit_for top-level so list_mits_for_date finds it', async () => {
    const rawIds = await captureMany(['mit raw'])
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [
          {
            temp_id: 'task1',
            type_slug: 'task',
            title: 'Call Ana',
            state: 'ACTIVE',
            mit_for: '2026-05-26',
            descriptive_blocks: []
          },
          {
            temp_id: 'project1',
            type_slug: 'project',
            title: 'Huygens migration',
            state: 'ACTIVE',
            descriptive_blocks: []
          }
        ]
      })
    })
    await commitProposalImpl({ proposal_id: created.id })

    const [mits26] = await ctx.db.query<[{ title: string }[]]>(
      "SELECT title FROM note WHERE mit_for >= d'2026-05-26' AND mit_for < d'2026-05-27'"
    )
    expect(mits26.map(m => m.title)).toContain('Call Ana')
    const [mits27] = await ctx.db.query<[{ title: string }[]]>(
      "SELECT title FROM note WHERE mit_for >= d'2026-05-27' AND mit_for < d'2026-05-28'"
    )
    expect(mits27).toEqual([])
  })

  test('commit_proposal returns a temp_id → real_id map for created notes and narrative blocks', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    const result = await commitProposalImpl({ proposal_id: created.id })

    expect(Object.keys(result.temp_ids.notes).sort()).toEqual(['project1', 'task1'])
    expect(result.temp_ids.notes.task1).toMatch(/^note:/)
    expect(result.temp_ids.blocks.narrative1).toMatch(/^block:/)
    // the mapped ids are exactly the ones reported as created
    expect(result.notes_created).toContain(result.temp_ids.notes.task1)
    expect(result.notes_created).toContain(result.temp_ids.notes.project1)
    expect(result.narrative_blocks_created).toContain(result.temp_ids.blocks.narrative1)

    // the persisted proposal carries the same map
    const committed = await getProposalImpl({ proposal_id: created.id })
    expect(committed?.result?.temp_ids.notes.task1).toBe(result.temp_ids.notes.task1)
  })

  test('commit_proposal rejects non-draft proposals', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await discardProposalImpl({ proposal_id: created.id })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('proposal is not draft')
  })

  test('commit_proposal rejects raws that are already closed', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await setRawStatusImpl({ raw_ids: rawIds, status: 'ignored' })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('raw_capture not committable')
  })

  test('commit_proposal rejects unknown temporary refs before mutating the graph', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, { about: [{ block_temp_id: 'missingBlock', note_ref: 'task1' }] })
    })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('unknown block ref')

    const [notes] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM note GROUP ALL')
    expect(notes[0]?.count ?? 0).toBe(0)
  })

  test('create_proposal rejects missing raw ids and unsupported edge kinds', async () => {
    await expect(
      createProposalImpl({ raw_ids: ['raw_capture:nope'], payload: payload(['raw_capture:nope']) })
    ).rejects.toThrow('raw_capture not found')

    const rawIds = await captureMany(['a'])
    await expect(
      createProposalImpl({
        raw_ids: rawIds,
        payload: payload(rawIds, {
          edges: [{ kind: 'supports', from: 'task1', to: 'project1' }]
        } as Partial<ProposalPayload>)
      })
    ).rejects.toThrow()
  })
})
