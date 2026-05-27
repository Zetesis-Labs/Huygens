import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
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
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

/**
 * Lifecycle / validation coverage for proposals & commit. Companion to
 * proposal.test.ts (happy path + a few guards) — this file targets the
 * remaining holes: payload-validation rejections, committability guards,
 * double-commit / post-commit mutation guards, part_of single-parent
 * enforcement, the temp_id→real_id map, and transaction atomicity.
 */
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

async function noteCount(ctx: TestDb): Promise<number> {
  const [rows] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM note GROUP ALL')
  return rows[0]?.count ?? 0
}
async function blockCount(ctx: TestDb): Promise<number> {
  const [rows] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM block GROUP ALL')
  return rows[0]?.count ?? 0
}
async function rawStatuses(ctx: TestDb): Promise<string[]> {
  const [rows] = await ctx.db.query<[{ status: string; created_at: Date }[]]>(
    'SELECT status, created_at FROM raw_capture ORDER BY created_at'
  )
  return rows.map(r => r.status)
}

describe('proposal validation rejections (validatePayload, at create-time)', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('rejects when raw_ids argument does not match payload.raw_ids', async () => {
    const rawIds = await captureMany(['a', 'b'])
    // payload only declares the first raw; the argument declares both.
    await expect(createProposalImpl({ raw_ids: rawIds, payload: payload([rawIds[0] as string]) })).rejects.toThrow(
      'raw_ids argument must match payload.raw_ids'
    )
    expect(await noteCount(ctx)).toBe(0)
  })

  test('rejects a narrative block referencing a raw_id not in payload.raw_ids', async () => {
    const rawIds = await captureMany(['a', 'b'])
    const [r1, r2] = rawIds
    const bad = payload([r1 as string], {
      // declares only r1, but the narrative cites r2 too
      narrative_blocks: [{ temp_id: 'narrative1', content: 'x', raw_ids: [r1 as string, r2 as string] }]
    })
    await expect(createProposalImpl({ raw_ids: [r1 as string], payload: bad })).rejects.toThrow(
      /references undeclared raw_id/
    )
    expect(await noteCount(ctx)).toBe(0)
  })

  test('rejects duplicate temp_ids across notes and narrative blocks', async () => {
    const rawIds = await captureMany(['a'])
    // note temp_id collides with the narrative block temp_id
    const bad = payload(rawIds, {
      note_creates: [
        { temp_id: 'narrative1', type_slug: 'task', title: 'Clash', state: 'ACTIVE', descriptive_blocks: [] }
      ]
    })
    await expect(createProposalImpl({ raw_ids: rawIds, payload: bad })).rejects.toThrow('duplicate temp_id: narrative1')
    expect(await noteCount(ctx)).toBe(0)
  })

  test('rejects two note_creates sharing the same temp_id', async () => {
    const rawIds = await captureMany(['a'])
    const bad = payload(rawIds, {
      note_creates: [
        { temp_id: 'dup', type_slug: 'task', title: 'First', state: 'ACTIVE', descriptive_blocks: [] },
        { temp_id: 'dup', type_slug: 'project', title: 'Second', state: 'ACTIVE', descriptive_blocks: [] }
      ],
      edges: [],
      about: [{ block_temp_id: 'narrative1', note_ref: 'dup' }],
      affects: []
    })
    await expect(createProposalImpl({ raw_ids: rawIds, payload: bad })).rejects.toThrow('duplicate temp_id: dup')
  })
})

describe('assertProposalRefs (at commit, after a draft is stored)', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('commit rejects an about ref to a nonexistent note record id', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [],
        edges: [],
        affects: [],
        about: [{ block_temp_id: 'narrative1', note_ref: 'note:ghost' }]
      })
    })
    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('note not found: note:ghost')
    expect(await noteCount(ctx)).toBe(0)
    expect(await rawStatuses(ctx)).toEqual(['pending'])
  })

  test('commit rejects an affects ref to a nonexistent note record id', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [],
        edges: [],
        about: [],
        affects: [{ block_temp_id: 'narrative1', note_ref: 'note:ghost', action: 'linked' }]
      })
    })
    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('note not found: note:ghost')
    expect(await blockCount(ctx)).toBe(0)
  })

  test('commit rejects an edge referencing a nonexistent note record id', async () => {
    const rawIds = await captureMany(['a'])
    const real = await insertNote(ctx.db, { title: 'Real', type_slug: 'project' })
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [],
        about: [],
        affects: [],
        // real note as `from`, ghost note as `to`
        edges: [{ kind: 'part_of', from: real.note_id, to: 'note:ghost' }]
      })
    })
    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('note not found: note:ghost')
  })

  test('commit rejects an edge referencing a nonexistent block record id', async () => {
    const rawIds = await captureMany(['a'])
    const real = await insertNote(ctx.db, { title: 'Real', type_slug: 'task' })
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [],
        about: [],
        affects: [],
        edges: [{ kind: 'mentions', from: 'block:ghost', to: real.note_id }]
      })
    })
    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('block not found: block:ghost')
  })
})

describe('committability guards', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('commit rejects a raw already marked processed (not pending/deferred)', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await setRawStatusImpl({ raw_ids: rawIds, status: 'processed' })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('raw_capture not committable')
    // status string is surfaced in the error
    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow(/status=processed/)
    expect(await noteCount(ctx)).toBe(0)
  })

  test('commit allows a deferred raw (deferred is committable)', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await setRawStatusImpl({ raw_ids: rawIds, status: 'deferred' })

    const result = await commitProposalImpl({ proposal_id: created.id })
    expect(result.notes_created).toHaveLength(2)
    expect(await rawStatuses(ctx)).toEqual(['processed'])
  })
})

describe('lifecycle guards: double-commit and post-commit mutation', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('commit_proposal rejects a proposal already committed (anti double-commit)', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow('proposal is not draft: committed')
    // exactly one set of notes/blocks exists: the second commit did not re-materialize
    expect(await noteCount(ctx)).toBe(2)
  })

  test('update_proposal rejects a committed proposal', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    await expect(updateProposalImpl({ proposal_id: created.id, payload: payload(rawIds) })).rejects.toThrow(
      'proposal is not draft: committed'
    )
  })

  test('discard_proposal rejects a committed proposal', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    await expect(discardProposalImpl({ proposal_id: created.id })).rejects.toThrow('proposal is not draft: committed')
    const after = await getProposalImpl({ proposal_id: created.id })
    expect(after?.status).toBe('committed')
  })

  test('discard then re-discard is rejected (not draft anymore)', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await discardProposalImpl({ proposal_id: created.id })
    await expect(discardProposalImpl({ proposal_id: created.id })).rejects.toThrow('proposal is not draft: discarded')
  })
})

describe('part_of single-parent enforcement at commit', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('two part_of from the same note in one commit fails and rolls back atomically', async () => {
    const rawIds = await captureMany(['a'])
    // task1 -> project1 AND task1 -> project2 : both have `in = task1`, which the
    // part_of_single_parent UNIQUE index must reject.
    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [
          { temp_id: 'task1', type_slug: 'task', title: 'Child', state: 'ACTIVE', descriptive_blocks: [] },
          { temp_id: 'project1', type_slug: 'project', title: 'Parent A', state: 'ACTIVE', descriptive_blocks: [] },
          { temp_id: 'project2', type_slug: 'project', title: 'Parent B', state: 'ACTIVE', descriptive_blocks: [] }
        ],
        edges: [
          { kind: 'part_of', from: 'task1', to: 'project1' },
          { kind: 'part_of', from: 'task1', to: 'project2' }
        ],
        about: [{ block_temp_id: 'narrative1', note_ref: 'task1' }],
        affects: []
      })
    })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow()

    // Atomic rollback: nothing materialized, raws still pending, proposal still draft.
    expect(await noteCount(ctx)).toBe(0)
    expect(await blockCount(ctx)).toBe(0)
    const [edges] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM part_of GROUP ALL')
    expect(edges[0]?.count ?? 0).toBe(0)
    expect(await rawStatuses(ctx)).toEqual(['pending'])
    expect((await getProposalImpl({ proposal_id: created.id }))?.status).toBe('draft')
  })

  test('existing parent + a new part_of for the same child fails the commit', async () => {
    const rawIds = await captureMany(['a'])
    // Pre-existing topology: child -> oldParent already in the graph.
    const child = await insertNote(ctx.db, { title: 'Child', type_slug: 'task' })
    const oldParent = await insertNote(ctx.db, { title: 'Old parent', type_slug: 'project' })
    await ctx.db.query('RELATE $c->part_of->$p', {
      c: new StringRecordId(child.note_id),
      p: new StringRecordId(oldParent.note_id)
    })

    const created = await createProposalImpl({
      raw_ids: rawIds,
      payload: payload(rawIds, {
        note_creates: [
          { temp_id: 'project1', type_slug: 'project', title: 'New parent', state: 'ACTIVE', descriptive_blocks: [] }
        ],
        // child already has a parent; this second part_of must be rejected.
        edges: [{ kind: 'part_of', from: child.note_id, to: 'project1' }],
        about: [{ block_temp_id: 'narrative1', note_ref: child.note_id }],
        affects: []
      })
    })

    await expect(commitProposalImpl({ proposal_id: created.id })).rejects.toThrow()
    // The new "New parent" note must not survive (atomic rollback).
    const [projects] = await ctx.db.query<[{ count: number }[]]>(
      'SELECT count() AS count FROM note WHERE title = "New parent" GROUP ALL'
    )
    expect(projects[0]?.count ?? 0).toBe(0)
  })
})

describe('commit result mapping & materialized changes', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('temp_id→real_id map drives the about/affects edges to the created note', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    const result = await commitProposalImpl({ proposal_id: created.id })

    const taskId = result.temp_ids.notes.task1
    const narrativeId = result.temp_ids.blocks.narrative1
    expect(taskId).toMatch(/^note:/)
    expect(narrativeId).toMatch(/^block:/)

    // about edge: narrative block -> the very note temp_id task1 resolved to.
    const [about] = await ctx.db.query<[{ in: string; out: string }[]]>('SELECT in, out FROM about')
    expect(about).toHaveLength(1)
    expect(String(about[0]?.in)).toBe(narrativeId)
    expect(String(about[0]?.out)).toBe(taskId)

    // part_of edge: task1 -> project1, both via the temp map.
    const [partOf] = await ctx.db.query<[{ in: string; out: string }[]]>('SELECT in, out FROM part_of')
    expect(String(partOf[0]?.in)).toBe(taskId)
    expect(String(partOf[0]?.out)).toBe(result.temp_ids.notes.project1)
  })

  test('raws end up processed with a processed_at after commit', async () => {
    const rawIds = await captureMany(['a', 'b'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    const [rows] = await ctx.db.query<[{ status: string; processed_at: Date | null; created_at: Date }[]]>(
      'SELECT status, processed_at, created_at FROM raw_capture ORDER BY created_at'
    )
    expect(rows.map(r => r.status)).toEqual(['processed', 'processed'])
    for (const row of rows) expect(row.processed_at).toBeTruthy()
  })

  test('get_proposal_changes materialized view carries real ids and resolved records', async () => {
    const rawIds = await captureMany(['a', 'b'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    const result = await commitProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.status).toBe('committed')
    expect(changes.materialized).not.toBeNull()
    expect(changes.materialized?.notes_created).toHaveLength(2)
    expect(changes.materialized?.narrative_blocks_created).toHaveLength(1)
    expect(changes.materialized?.descriptive_blocks_created).toHaveLength(1)
    expect(changes.materialized?.derived_from).toHaveLength(2)
    expect(changes.materialized?.about).toHaveLength(1)
    expect(changes.materialized?.affects).toHaveLength(1)
    expect(changes.materialized?.semantic_edges).toHaveLength(2)

    // the resolved note records actually carry the created titles
    const titles = (changes.materialized?.notes_created as Array<{ title?: string }>).map(n => n.title).sort()
    expect(titles).toEqual(['Call Ana', 'Huygens migration'])

    // every materialized note id is one of the ids reported in the commit result
    const realIds = new Set(result.notes_created)
    for (const n of changes.materialized?.notes_created as Array<{ id: unknown }>) {
      expect(realIds.has(String(n.id))).toBe(true)
    }
  })

  test('get_proposal_changes on a discarded proposal yields no materialized result', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await discardProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.status).toBe('discarded')
    expect(changes.materialized).toBeNull()
    expect(changes.changefeed.available).toBe(false)
  })

  test('get_proposal_changes throws for an unknown proposal id', async () => {
    await expect(getProposalChangesImpl({ proposal_id: 'proposal:doesnotexist' })).rejects.toThrow('proposal not found')
  })
})
