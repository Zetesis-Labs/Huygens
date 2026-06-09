import { getDb } from './surreal'

type DbInfo = { tables?: Record<string, string> }
type TableInfo = { fields?: Record<string, string>; indexes?: Record<string, string> }
type TableSnapshot = { define: string; tinfo: TableInfo | undefined }
type Introspection = { ns: string; dbName: string; tables: TableSnapshot[] }

/** Drop the trailing `PERMISSIONS …` clause so each DEFINE stays compact. */
function stripPermissions(define: string): string {
  return define.replace(/\s+PERMISSIONS\b.*$/is, '').trim()
}

const SNAPSHOT_HEADER = (ns: string, dbName: string): string[] => [
  `# Huygens — live database schema (ns=${ns}, db=${dbName})`,
  '',
  'The real schema, introspected from SurrealDB at startup. Use it to write',
  'correct read-only SurrealQL through `query_query` / `run_query`: edges are',
  'RELATION tables traversed with `->edge->` / `<-edge<-`, and field `ASSERT`',
  'clauses list the allowed enum values. Restart the MCP after `db:apply` to',
  'refresh this snapshot.',
  ''
]

/** Pure render of a single table block: DEFINE TABLE, fields, indexes, blank line. */
function renderTable({ define, tinfo }: TableSnapshot): string[] {
  const fieldLines = Object.entries(tinfo?.fields ?? {})
    .filter(([name]) => !name.includes('.')) // skip array-element sub-fields (e.g. block_order.*)
    .map(([, def]) => `  ${stripPermissions(def)}`)
  const indexLines = Object.values(tinfo?.indexes ?? {}).map(def => `  ${stripPermissions(def)}`)
  return [stripPermissions(define), ...fieldLines, ...indexLines, '']
}

/**
 * I/O at the border: introspect the live database into a flat structure.
 * `INFO FOR DB` then `INFO FOR TABLE` fetched sequentially, one per table,
 * before the pure render step composes the snapshot.
 */
async function fetchIntrospection(): Promise<Introspection> {
  const db = await getDb()
  const ns = process.env.SURREAL_NS ?? 'huygens'
  const dbName = process.env.SURREAL_DB ?? 'main'

  const [info] = await db.query<[DbInfo]>('INFO FOR DB')
  const tableNames = Object.keys(info?.tables ?? {}).sort()

  const fetchTableSnapshot = async (table: string): Promise<TableSnapshot> => {
    const define = info?.tables?.[table] ?? `DEFINE TABLE ${table}`
    try {
      const [tinfo] = await db.query<[TableInfo]>(`INFO FOR TABLE \`${table}\``)
      return { define, tinfo }
    } catch {
      return { define, tinfo: undefined }
    }
  }

  const tables = await tableNames.reduce<Promise<TableSnapshot[]>>(
    async (acc, table) => [...(await acc), await fetchTableSnapshot(table)],
    Promise.resolve([])
  )

  return { ns, dbName, tables }
}

/** Pure render of the introspected schema into the snapshot markdown. */
function renderSchemaSnapshot({ ns, dbName, tables }: Introspection): string {
  const lines = [...SNAPSHOT_HEADER(ns, dbName), ...tables.flatMap(renderTable)]
  return lines.join('\n').trimEnd()
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
  return renderSchemaSnapshot(await fetchIntrospection())
}
