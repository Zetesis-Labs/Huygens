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

  test('existing parent + a new part_of for the same child reparents it (replace)', async () => {
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
        // child already has a parent; part_of is single-parent, so the commit
        // drops the old edge and reparents (máximo-limpio replace), not fails.
        edges: [{ kind: 'part_of', from: child.note_id, to: 'project1' }],
        about: [{ block_temp_id: 'narrative1', note_ref: child.note_id }],
        affects: []
      })
    })

    await commitProposalImpl({ proposal_id: created.id })

    // child now has exactly one parent — the new one — and the old edge is gone.
    const [newParent] = await ctx.db.query<[{ id: unknown }[]]>('SELECT id FROM note WHERE title = "New parent"')
    const [parents] = await ctx.db.query<[{ out: unknown }[]]>('SELECT out FROM part_of WHERE in = $c', {
      c: new StringRecordId(child.note_id)
    })
    expect(parents).toHaveLength(1)
    expect(String(parents[0]?.out)).toBe(String(newParent[0]?.id))
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

  test('about/affects and part_of edges land on the created records (real ids from payload)', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    // ids are pre-assigned in the stored payload — no commit-returned temp map.
    const taskId = created.payload.note_creates.find(n => n.title === 'Call Ana')?.id as string
    const projectId = created.payload.note_creates.find(n => n.title === 'Huygens migration')?.id as string
    const narrativeId = created.payload.narrative_blocks[0]?.id as string
    expect(taskId).toMatch(/^note:/)
    expect(narrativeId).toMatch(/^block:/)

    await commitProposalImpl({ proposal_id: created.id })

    // about edge: narrative block -> the created task note.
    const [about] = await ctx.db.query<[{ in: string; out: string }[]]>('SELECT in, out FROM about')
    expect(about).toHaveLength(1)
    expect(String(about[0]?.in)).toBe(narrativeId)
    expect(String(about[0]?.out)).toBe(taskId)

    // part_of edge: task -> project.
    const [partOf] = await ctx.db.query<[{ in: string; out: string }[]]>('SELECT in, out FROM part_of')
    expect(String(partOf[0]?.in)).toBe(taskId)
    expect(String(partOf[0]?.out)).toBe(projectId)
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

  test('get_proposal_changes derives a real-id delta from the payload', async () => {
    const rawIds = await captureMany(['a', 'b'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await commitProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.status).toBe('committed')
    expect(changes.source).toBe('payload')
    expect(changes.changes.notes_created).toHaveLength(2)
    expect(changes.changes.narrative_blocks).toHaveLength(1)
    expect(changes.changes.descriptive_blocks_created).toBe(1)
    expect(changes.changes.about).toHaveLength(1)
    expect(changes.changes.affects).toHaveLength(1)
    expect(changes.changes.edges_added).toHaveLength(2)
    expect(changes.changes.narrative_blocks[0]?.raw_ids).toHaveLength(2)

    const titles = changes.changes.notes_created.map(n => n.title).sort()
    expect(titles).toEqual(['Call Ana', 'Huygens migration'])
    for (const n of changes.changes.notes_created) {
      expect(n.id).toMatch(/^note:/)
    }
  })

  test('get_proposal_changes on a discarded proposal: committed_at null, changes from payload', async () => {
    const rawIds = await captureMany(['a'])
    const created = await createProposalImpl({ raw_ids: rawIds, payload: payload(rawIds) })
    await discardProposalImpl({ proposal_id: created.id })

    const changes = await getProposalChangesImpl({ proposal_id: created.id })
    expect(changes.status).toBe('discarded')
    expect(changes.committed_at).toBeNull()
    expect(changes.source).toBe('payload')
  })

  test('get_proposal_changes throws for an unknown proposal id', async () => {
    await expect(getProposalChangesImpl({ proposal_id: 'proposal:doesnotexist' })).rejects.toThrow('proposal not found')
  })
})
