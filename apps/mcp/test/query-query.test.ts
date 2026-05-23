import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { QueryError } from '../src/errors'
import { queryQueryImpl } from '../src/tools/query/query'
import { surrealJsonReplacer } from '../src/tools/query/serialize'
import { insertNote, type TestDbWithReader, withFreshDbAndReader } from './_fixtures'

describe('queryQueryImpl', () => {
  let ctx: TestDbWithReader
  beforeEach(async () => {
    ctx = await withFreshDbAndReader()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns rows from a SELECT', async () => {
    await insertNote(ctx.db, { title: 'first', type_slug: 'task' })
    await insertNote(ctx.db, { title: 'second', type_slug: 'task' })

    const results = await queryQueryImpl({ query: 'SELECT title FROM note ORDER BY title' })
    expect(results).toHaveLength(1)
    const rows = (results[0] ?? []) as { title: string }[]
    expect(rows.map(r => r.title)).toEqual(['first', 'second'])
  })

  test('binds $parameters instead of string-interpolating', async () => {
    await insertNote(ctx.db, { title: 'alpha', type_slug: 'task' })
    await insertNote(ctx.db, { title: "bravo'; --", type_slug: 'task' })

    const results = await queryQueryImpl({
      query: 'SELECT title FROM note WHERE title = $needle',
      parameters: { needle: "bravo'; --" }
    })
    const rows = (results[0] ?? []) as { title: string }[]
    expect(rows.map(r => r.title)).toEqual(["bravo'; --"])
  })

  test('serializes RecordId fields as "table:id" strings via JSON.stringify', async () => {
    const { note_id } = await insertNote(ctx.db, { title: 'rec', type_slug: 'task' })
    const results = await queryQueryImpl({ query: 'SELECT id FROM note' })
    const rows = (results[0] ?? []) as { id: unknown }[]
    expect(rows).toHaveLength(1)
    const json = JSON.stringify(rows[0], surrealJsonReplacer)
    expect(json).toContain(`"${note_id}"`)
  })

  test('writes via VIEWER do not mutate the graph', async () => {
    // SurrealDB v2.6 returns an empty result instead of throwing when a
    // VIEWER hits a SCHEMAFULL table without an explicit PERMISSIONS
    // clause — the row is silently filtered out. The safety boundary we
    // actually rely on is that the data is unchanged, so we verify that
    // from a root connection instead of asserting on the call's return.
    const out = await queryQueryImpl({ query: "CREATE note SET title = 'illegal'" })
    const created = (out[0] ?? []) as unknown[]
    expect(created).toEqual([])

    const [rootRows] = await ctx.db.query<[{ count: number }[]]>(
      'SELECT count() AS count FROM note GROUP ALL'
    )
    expect(rootRows[0]?.count ?? 0).toBe(0)
  })

  test('wraps SurrealQL syntax errors in QueryError', async () => {
    let caught: unknown
    try {
      await queryQueryImpl({ query: 'NOT A REAL STATEMENT' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(QueryError)
  })
})
