import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
import { captureImpl } from '../src/tools/capture'
import {
  commitProposalImpl,
  createProposalImpl,
  getProposalImpl,
  type ProposalPayload,
  updateProposalImpl
} from '../src/tools/proposal'
import { commitPreviewed, insertNote, type TestDb, withFreshDb } from './_fixtures'

/**
 * The two server-side muros added around commit_proposal:
 *
 * 1. PREVIEW REQUIRED — "la propuesta visible" as a precondition, not
 *    choreography: get_proposal stamps previewed_at, update_proposal clears
 *    it, commit_proposal refuses a payload that was never rendered as-is.
 * 2. PART_OF ACYCLIC — the UNIQUE single-parent index can't see cycles
 *    (A→B, B→A is two valid rows); commit checks reachability against the
 *    post-commit graph (replace-on-write applied).
 */
function payload(rawIds: string[], overrides: Partial<ProposalPayload> = {}): ProposalPayload {
  return {
    raw_ids: rawIds,
    narrative_blocks: [{ temp_id: 'informe1', content: 'Informe de proceso.', raw_ids: rawIds }],
    note_creates: [],
    note_updates: [],
    edges: [],
    about: [],
    affects: [],
    ...overrides
  }
}

async function captureRaw(content: string): Promise<string> {
  const raw = await captureImpl({ content, source_kind: 'manual' })
  return raw.raw_id
}

describe('commit muro — preview required', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('a never-previewed proposal cannot be committed; after get_proposal it can', async () => {
    const rawId = await captureRaw('algo')
    const created = await createProposalImpl({ raw_ids: [rawId], payload: payload([rawId]) })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('never previewed')

    await getProposalImpl({ proposal_id: created.id })
    const result = await commitProposalImpl({ proposal_id: created.id })
    expect(result.narrative_blocks_created.length).toBe(1)
  })

  test('update_proposal invalidates the preview: the new payload must be re-rendered', async () => {
    const rawId = await captureRaw('algo')
    const created = await createProposalImpl({ raw_ids: [rawId], payload: payload([rawId]) })
    await getProposalImpl({ proposal_id: created.id }) // previewed…

    await updateProposalImpl({
      proposal_id: created.id,
      payload: payload([rawId], {
        narrative_blocks: [{ temp_id: 'informe1', content: 'Texto cambiado tras el preview.', raw_ids: [rawId] }]
      })
    }) // …but the payload changed: stale preview must not authorize this commit

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('never previewed')

    await getProposalImpl({ proposal_id: created.id })
    const result = await commitProposalImpl({ proposal_id: created.id })
    expect(result.narrative_blocks_created.length).toBe(1)
  })
})

describe('commit muro — part_of stays acyclic', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('a direct two-node cycle is rejected', async () => {
    const a = await insertNote(ctx.db, { title: 'A', type_slug: 'project' })
    const b = await insertNote(ctx.db, { title: 'B', type_slug: 'project' })
    await ctx.db.query('RELATE $a->part_of->$b', { a: new StringRecordId(a.note_id), b: new StringRecordId(b.note_id) })

    const rawId = await captureRaw('ciclo directo')
    const created = await createProposalImpl({
      raw_ids: [rawId],
      payload: payload([rawId], { edges: [{ kind: 'part_of', from: b.note_id, to: a.note_id, anchored: true }] })
    })
    await expect(commitPreviewed({ proposal_id: created.id })).rejects.toThrow('part_of cycle')
  })

  test('a transitive cycle through a chain is rejected; reparenting away from it is allowed', async () => {
    const a = await insertNote(ctx.db, { title: 'A', type_slug: 'project' })
    const b = await insertNote(ctx.db, { title: 'B', type_slug: 'project' })
    const c = await insertNote(ctx.db, { title: 'C', type_slug: 'project' })
    await ctx.db.query('RELATE $a->part_of->$b', { a: new StringRecordId(a.note_id), b: new StringRecordId(b.note_id) })
    await ctx.db.query('RELATE $b->part_of->$c', {
      a: new StringRecordId(a.note_id),
      b: new StringRecordId(b.note_id),
      c: new StringRecordId(c.note_id)
    })

    // C → A would close A → B → C → A.
    const raw1 = await captureRaw('ciclo transitivo')
    const bad = await createProposalImpl({
      raw_ids: [raw1],
      payload: payload([raw1], { edges: [{ kind: 'part_of', from: c.note_id, to: a.note_id, anchored: true }] })
    })
    await expect(commitPreviewed({ proposal_id: bad.id })).rejects.toThrow('part_of cycle')

    // But the same edge is fine if A is simultaneously reparented out of the
    // chain (replace-on-write: A→B is replaced by A→other).
    const other = await insertNote(ctx.db, { title: 'Otro padre', type_slug: 'area' })
    const raw2 = await captureRaw('reparent que rompe el ciclo')
    const ok = await createProposalImpl({
      raw_ids: [raw2],
      payload: payload([raw2], {
        edges: [
          { kind: 'part_of', from: c.note_id, to: a.note_id, anchored: true },
          { kind: 'part_of', from: a.note_id, to: other.note_id, anchored: true }
        ]
      })
    })
    const result = await commitPreviewed({ proposal_id: ok.id })
    expect(result.semantic_edges_created).toBe(2)
  })

  test('a self-parent is rejected', async () => {
    const a = await insertNote(ctx.db, { title: 'A', type_slug: 'project' })
    const rawId = await captureRaw('self parent')
    const created = await createProposalImpl({
      raw_ids: [rawId],
      payload: payload([rawId], { edges: [{ kind: 'part_of', from: a.note_id, to: a.note_id, anchored: true }] })
    })
    await expect(commitPreviewed({ proposal_id: created.id })).rejects.toThrow('part_of cycle')
  })
})
