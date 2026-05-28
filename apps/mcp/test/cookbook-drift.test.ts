import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

const COOKBOOK = readFileSync(new URL('../src/lore/surrealql-cookbook.md', import.meta.url), 'utf8')

/**
 * Every recipe in the cookbook must keep parsing and executing — the cookbook
 * ships inside the MCP `instructions`, so a query that silently rots there
 * teaches every agent a broken pattern. We extract both the fenced ```surql
 * recipes and the inline `SELECT …;` latent templates, and run each against a
 * fresh graph. We assert STATUS OK (no throw), not row counts: a young/empty
 * graph legitimately returns [].
 */
function extractQueries(md: string): string[] {
  const out: string[] = []
  for (const m of md.matchAll(/```surql\n([\s\S]*?)```/g)) out.push(m[1].trim())
  for (const m of md.matchAll(/`(SELECT [^`]*?;)`/g)) out.push(m[1].trim())
  return out
}

describe('surrealql-cookbook — anti-drift', () => {
  let ctx: TestDb
  let placeholderId: string
  let placeholderBlockId: string
  beforeEach(async () => {
    ctx = await withFreshDb()
    // A real note so `FROM ONLY note:abc` (which needs exactly one record) resolves.
    const r = await insertNote(ctx.db, { title: 'placeholder', type_slug: 'task', blocks: ['# body'] })
    placeholderId = r.note_id
    // Two blocks with synthetic 1024-d embeddings so the KNN recipes have vectors to
    // search; a fresh graph has none otherwise. block:abc in the cookbook maps here.
    const embA = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.1)
    const embB = Array.from({ length: 1024 }, (_, i) => Math.cos(i) * 0.1)
    await ctx.db.query("CREATE block:vec_a SET content='vector seed a', block_kind='narrative', embedding=$e", {
      e: embA
    })
    await ctx.db.query("CREATE block:vec_b SET content='vector seed b', block_kind='narrative', embedding=$e", {
      e: embB
    })
    placeholderBlockId = 'block:vec_a'
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const queries = extractQueries(COOKBOOK)

  test('the cookbook actually contains recipes to check', () => {
    expect(queries.length).toBeGreaterThan(15)
  })

  test('every recipe parses and executes (STATUS OK) on a fresh graph', async () => {
    const failures: string[] = []
    for (const raw of queries) {
      const q = raw.replaceAll('note:abc', placeholderId).replaceAll('block:abc', placeholderBlockId)
      try {
        await ctx.db.query(q)
      } catch (err) {
        failures.push(`  ✗ ${(err as Error).message}\n    ${q}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length}/${queries.length} cookbook recipe(s) failed:\n${failures.join('\n')}`)
    }
  })
})
