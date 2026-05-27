import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Surreal } from 'surrealdb'
import { type TestDb, withFreshDb } from './_fixtures'

// SurrealDB-level invariants. These bypass the MCP tools and hit `ctx.db`
// directly with raw RELATE/CREATE so we assert the *schema* enforces the
// model, not the application layer. Every case below MUST be rejected by
// SurrealDB itself; if one starts passing, a guarantee the rest of the code
// relies on has silently disappeared.

/**
 * Run a query expected to be rejected by SurrealDB and return the thrown error
 * message. NOTE: we do NOT use bun's `expect(promise).rejects` matcher directly
 * on `db.query(...)` — that combination hangs until the test times out (the
 * SurrealDB SDK's rejected query promise isn't observed correctly by the
 * matcher). Awaiting in a try/catch and asserting on a plain string is reliable
 * and fast. See the report's BUG note.
 */
async function rejection(db: Surreal, q: string): Promise<string> {
  try {
    await db.query(q)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  throw new Error(`expected query to be rejected but it succeeded: ${q}`)
}

describe('schema constraints (SurrealDB-enforced)', () => {
  let ctx: TestDb
  let db: Surreal

  beforeAll(async () => {
    ctx = await withFreshDb()
    db = ctx.db
    // Shared fixtures. Notes p1/p2 are candidate parents; bn is a narrative
    // block; n1/n2 are plain notes used as edge endpoints.
    await db.query(`
      CREATE note:p1 SET title = 'p1', state = 'ACTIVE';
      CREATE note:p2 SET title = 'p2', state = 'ACTIVE';
      CREATE note:n1 SET title = 'n1', state = 'ACTIVE';
      CREATE note:n2 SET title = 'n2', state = 'ACTIVE';
      CREATE block:bn SET content = 'narrative body', block_kind = 'narrative';
    `)
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  // ── part_of: single parent + endpoints must be notes ────────────────────

  test('a note cannot have two parents (part_of_single_parent UNIQUE on `in`)', async () => {
    // First parent is fine.
    await db.query('RELATE note:n1->part_of->note:p1;')
    // A second part_of from the same child must be rejected — part_of is a
    // forest, not a DAG. The UNIQUE index on `in` is what enforces this.
    expect(await rejection(db, 'RELATE note:n1->part_of->note:p2;')).toMatch(/part_of_single_parent/)
  })

  test('a duplicate part_of edge is rejected (part_of_unique on (in,out))', async () => {
    // Re-RELATEing the exact same pair must not spawn a second edge. The same
    // child already has a parent so part_of_single_parent also covers this
    // pair, but the (in,out) UNIQUE guarantee is what makes RELATE idempotent.
    // Either index firing proves the duplicate was refused.
    expect(await rejection(db, 'RELATE note:n1->part_of->note:p1;')).toMatch(
      /part_of_single_parent|part_of_unique|already contains/
    )
  })

  test('part_of from a block is rejected (FROM note only)', async () => {
    expect(await rejection(db, 'RELATE block:bn->part_of->note:p1;')).toMatch(/Expected `record<note>`.*found `block/)
  })

  test('part_of to a block is rejected (TO note only)', async () => {
    expect(await rejection(db, 'RELATE note:p2->part_of->block:bn;')).toMatch(/Expected `record<note>`.*found `block/)
  })

  // ── blocked_by: note -> note | block ────────────────────────────────────

  test('blocked_by accepts note -> note', async () => {
    const [rows] = await db.query<[unknown[]]>('RELATE note:p1->blocked_by->note:p2;')
    expect(Array.isArray(rows) && rows.length).toBe(1)
  })

  test('blocked_by accepts note -> block (target may be a block)', async () => {
    const [rows] = await db.query<[unknown[]]>('RELATE note:n1->blocked_by->block:bn;')
    expect(Array.isArray(rows) && rows.length).toBe(1)
  })

  test('blocked_by from a block is rejected (FROM note only)', async () => {
    expect(await rejection(db, 'RELATE block:bn->blocked_by->note:p1;')).toMatch(
      /Expected `record<note>`.*found `block/
    )
  })

  // ── affects: action required + enum ─────────────────────────────────────

  test('affects requires an `action`', async () => {
    // No SET action → the field is NONE and the NOT-NULL string field rejects it.
    expect(await rejection(db, 'RELATE block:bn->affects->note:n1;')).toMatch(/`action`/)
  })

  test('affects rejects an action outside the enum', async () => {
    expect(await rejection(db, "RELATE block:bn->affects->note:n2 SET action = 'frobnicate';")).toMatch(
      /must conform to.*created.*updated.*state_changed/
    )
  })

  test('affects accepts a valid action and (in,out) is UNIQUE', async () => {
    const [rows] = await db.query<[unknown[]]>("RELATE block:bn->affects->note:n1 SET action = 'linked';")
    expect(Array.isArray(rows) && rows.length).toBe(1)
    expect(await rejection(db, "RELATE block:bn->affects->note:n1 SET action = 'linked';")).toMatch(
      /affects_unique|already contains/
    )
  })

  // ── (in,out) UNIQUE on the cleaner edge tables ──────────────────────────

  test('about rejects a duplicate edge (about_unique on (in,out))', async () => {
    await db.query('RELATE block:bn->about->note:n1;')
    expect(await rejection(db, 'RELATE block:bn->about->note:n1;')).toMatch(/about_unique|already contains/)
  })

  test('mentions rejects a duplicate edge (mentions_unique on (in,out))', async () => {
    await db.query('RELATE note:n1->mentions->block:bn;')
    expect(await rejection(db, 'RELATE note:n1->mentions->block:bn;')).toMatch(/mentions_unique|already contains/)
  })

  // ── Field-level ASSERT enums ────────────────────────────────────────────

  test('note.state outside NOTE_STATES is rejected (ASSERT INSIDE)', async () => {
    expect(await rejection(db, "CREATE note:bad_state SET title = 'x', state = 'NOPE';")).toMatch(
      /must conform to.*CLARIFIED.*ACTIVE/
    )
  })

  test('note.state accepts every value in NOTE_STATES', async () => {
    for (const s of ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED']) {
      const [rows] = await db.query<[unknown[]]>(`CREATE note SET title = 'st', state = '${s}';`)
      expect(Array.isArray(rows) && rows.length).toBe(1)
    }
  })

  test('raw_capture.status outside the enum is rejected', async () => {
    expect(
      await rejection(db, "CREATE raw_capture:bad_status SET content = 'x', source_kind = 'chat', status = 'weird';")
    ).toMatch(/must conform to.*pending.*processed/)
  })

  test('raw_capture.source_kind outside the enum is rejected', async () => {
    expect(await rejection(db, "CREATE raw_capture:bad_src SET content = 'x', source_kind = 'telepathy';")).toMatch(
      /must conform to.*chat.*voice/
    )
  })

  test('block.block_kind outside the enum is rejected', async () => {
    expect(await rejection(db, "CREATE block:bad_kind SET content = 'x', block_kind = 'wat';")).toMatch(
      /must conform to.*descriptive.*narrative/
    )
  })

  test('derived_from.transformation outside the enum is rejected', async () => {
    await db.query("CREATE raw_capture:r_df SET content = 'src', source_kind = 'chat';")
    expect(
      await rejection(db, "RELATE block:bn->derived_from->raw_capture:r_df SET transformation = 'hallucinated';")
    ).toMatch(/must conform to.*verbatim.*extracted/)
  })
})
