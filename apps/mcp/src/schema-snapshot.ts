import { getDb } from './surreal'

type DbInfo = { tables?: Record<string, string> }
type TableInfo = { fields?: Record<string, string>; indexes?: Record<string, string> }

/** Drop the trailing `PERMISSIONS …` clause so each DEFINE stays compact. */
function stripPermissions(define: string): string {
  return define.replace(/\s+PERMISSIONS\b.*$/is, '').trim()
}

/**
 * Build a compact, human-readable snapshot of the *live* database schema by
 * introspecting `INFO FOR DB` + `INFO FOR TABLE`. It is exposed as the MCP
 * server's `instructions`, so every connecting agent always sees the real
 * tables, field types, enums and edges (RELATION in/out) and can compose
 * correct read-only SurrealQL (`query_query` / `run_query`) without guessing
 * or drifting from a hand-maintained doc.
 *
 * Introspected once at startup; restart the MCP after `db:apply` to refresh.
 */
export async function loadSchemaSnapshot(): Promise<string> {
  const db = await getDb()
  const ns = process.env.SURREAL_NS ?? 'huygens'
  const dbName = process.env.SURREAL_DB ?? 'main'

  const [info] = await db.query<[DbInfo]>('INFO FOR DB')
  const tables = Object.keys(info?.tables ?? {}).sort()

  const out: string[] = [
    `# Huygens — live database schema (ns=${ns}, db=${dbName})`,
    '',
    'The real schema, introspected from SurrealDB at startup. Use it to write',
    'correct read-only SurrealQL through `query_query` / `run_query`: edges are',
    'RELATION tables traversed with `->edge->` / `<-edge<-`, and field `ASSERT`',
    'clauses list the allowed enum values. Restart the MCP after `db:apply` to',
    'refresh this snapshot.',
    ''
  ]

  for (const table of tables) {
    const define = info?.tables?.[table] ?? `DEFINE TABLE ${table}`
    out.push(stripPermissions(define))

    let tinfo: TableInfo | undefined
    try {
      ;[tinfo] = await db.query<[TableInfo]>(`INFO FOR TABLE \`${table}\``)
    } catch {
      tinfo = undefined
    }

    for (const [name, def] of Object.entries(tinfo?.fields ?? {})) {
      if (name.includes('.')) continue // skip array-element sub-fields (e.g. block_order.*)
      out.push(`  ${stripPermissions(def)}`)
    }
    for (const def of Object.values(tinfo?.indexes ?? {})) {
      out.push(`  ${stripPermissions(def)}`)
    }
    out.push('')
  }

  return out.join('\n').trimEnd()
}
