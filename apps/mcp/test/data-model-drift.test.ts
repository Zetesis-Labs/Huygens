import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createServer } from '../src/server'
import { type TestDb, withFreshDb } from './_fixtures'

const DATA_MODEL = readFileSync(new URL('../src/lore/data-model.md', import.meta.url), 'utf8')

/**
 * data-model.md promises to stay "in sync with schema.surql and the tool
 * contracts", but that sync was manual and had already rotted (12 registered
 * tools were undocumented — DOCT-005, docs/issues/2026-06-09). This guards the
 * doc the same way cookbook-drift guards the cookbook: everything that exists
 * (live tables, core fields, enum values, registered tools) must be mentioned
 * in the doc. Presence, not prose quality — a human still writes the meaning.
 */

type DbInfo = { tables?: Record<string, string> }
type TableInfo = { fields?: Record<string, string> }

/** Tables whose every field (and enum values) must appear in the doc. */
const CORE_TABLES = ['raw_capture', 'note', 'block']
const EDGE_TABLES = [
  'part_of',
  'blocked_by',
  'depends_on',
  'owned_by',
  'relates_to',
  'duplicates',
  'derived_from',
  'about',
  'affects',
  'mentions'
]

function mentions(doc: string, token: string): boolean {
  return new RegExp(`\\b${token}\\b`).test(doc)
}

function enumValues(fieldDefine: string): string[] {
  const inside = /INSIDE \[([^\]]*)\]/.exec(fieldDefine)
  if (!inside) return []
  return [...inside[1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

describe('data-model.md — anti-drift', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('every live table is mentioned in the doc', async () => {
    const [info] = await ctx.db.query<[DbInfo]>('INFO FOR DB')
    const tables = Object.keys(info?.tables ?? {})
    expect(tables.length).toBeGreaterThan(10)
    const missing = tables.filter(t => !mentions(DATA_MODEL, t))
    expect(missing).toEqual([])
  })

  test('every field of the core and edge tables is mentioned in the doc', async () => {
    const missing: string[] = []
    for (const table of [...CORE_TABLES, ...EDGE_TABLES]) {
      const [tinfo] = await ctx.db.query<[TableInfo]>(`INFO FOR TABLE \`${table}\``)
      for (const name of Object.keys(tinfo?.fields ?? {})) {
        if (name.includes('.')) continue // array-element sub-fields
        if (name === 'in' || name === 'out') continue // implicit on every relation
        if (!mentions(DATA_MODEL, name)) missing.push(`${table}.${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  test('every enum value enforced by the schema is mentioned in the doc', async () => {
    const missing: string[] = []
    for (const table of [...CORE_TABLES, ...EDGE_TABLES]) {
      const [tinfo] = await ctx.db.query<[TableInfo]>(`INFO FOR TABLE \`${table}\``)
      for (const [name, define] of Object.entries(tinfo?.fields ?? {})) {
        for (const value of enumValues(define)) {
          if (!mentions(DATA_MODEL, value)) missing.push(`${table}.${name} = '${value}'`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('data-model.md — tools surface anti-drift', () => {
  test('every registered MCP tool is documented in the Tools surface', () => {
    const server = createServer()
    // Private SDK field; if the SDK renames it this fails loudly, which is the
    // correct behavior for a drift guard (fix the accessor, keep the guard).
    const registry = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools
    if (!registry) throw new Error('McpServer._registeredTools not found — SDK changed, update this test')
    const tools = Object.keys(registry)
    expect(tools.length).toBeGreaterThan(20)
    const missing = tools.filter(t => !mentions(DATA_MODEL, t))
    expect(missing).toEqual([])
  })
})
