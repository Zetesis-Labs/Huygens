import type { FlowGraph } from './graph'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard bridge to the MCP saved-query tools + ad-hoc SurrealQL. Read paths
// run as huygens_reader (writes rejected by SurrealDB). The query IS the unit.
// ─────────────────────────────────────────────────────────────────────────

const MCP_URL = import.meta.env.HUYGENS_MCP_URL ?? 'http://huygens-mcp:3030/mcp'

export type SavedQuery = {
  id: string
  name: string
  query: string | null
  script: string | null
  pinned: boolean
  updated_at: string | null
}

/** Call an MCP tool and return its last JSON content block. */
async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  const text = await res.text()
  const dataLine = text
    .split('\n')
    .reverse()
    .find(l => l.startsWith('data:'))
  if (!dataLine) throw new Error(`MCP: unexpected response: ${text.slice(0, 200)}`)
  const rpc = JSON.parse(dataLine.slice('data:'.length).trim()) as {
    error?: { message?: string }
    result?: { isError?: boolean; content?: { text: string }[] }
  }
  if (rpc.error) throw new Error(rpc.error.message ?? 'MCP error')
  const content = rpc.result?.content ?? []
  if (rpc.result?.isError) throw new Error(content[0]?.text ?? `${name} error`)
  const jsonText = content[content.length - 1]?.text
  if (!jsonText) throw new Error(`MCP: empty result for ${name}`)
  return JSON.parse(jsonText) as T
}

export const listQueries = (): Promise<SavedQuery[]> => callTool('list_queries', {})
export const runAdhoc = (query: string): Promise<unknown[]> => callTool('query_query', { query })
export const runSaved = (id: string): Promise<unknown[]> => callTool('run_query', { id })
export const saveQuery = (name: string, query: string, pinned: boolean): Promise<{ id: string }> =>
  callTool('save_query', { name, query, pinned })
export const saveScript = (name: string, script: string, pinned: boolean): Promise<{ id: string }> =>
  callTool('save_query', { name, script, pinned })
export const deleteQuery = (id: string): Promise<{ deleted: string }> => callTool('delete_query', { id })

/** SurrealDB returns one result per statement. Take the last statement's rows. */
export function extractRows(results: unknown[]): Record<string, unknown>[] {
  const last = results[results.length - 1]
  const arr = Array.isArray(last) ? last : Array.isArray(results) ? results : []
  return arr.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
}

/** Normalize any id-ish value to "table:id". */
function idStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as { tb?: string; id?: unknown }
    if (o.tb !== undefined && o.id !== undefined) return `${o.tb}:${String(o.id)}`
  }
  return String(v)
}

export type TableData = { columns: string[]; rows: Record<string, string>[] }

/** Flatten rows into a stringified table (union of keys as columns). */
export function rowsToTable(rows: Record<string, unknown>[]): TableData {
  const columns = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const cell = (v: unknown): string => {
    if (v == null) return ''
    if (typeof v === 'object') return idStr(v) === String(v) ? JSON.stringify(v) : idStr(v)
    return String(v)
  }
  return { columns, rows: rows.map(r => Object.fromEntries(columns.map(c => [c, cell(r[c])]))) }
}

/** If rows look like graph nodes (have an id + a label-ish field), build a
 * FlowGraph (nodes; edges only when a row exposes related record-ids that point
 * to other rows in the set). Otherwise null → no graph tab. */
export function rowsToFlow(rows: Record<string, unknown>[]): FlowGraph | null {
  const nodeRows = rows.filter(r => 'id' in r && idStr(r.id).includes(':'))
  if (nodeRows.length === 0) return null

  const present = new Set(nodeRows.map(r => idStr(r.id)))
  const nodes = nodeRows.map(r => {
    const id = idStr(r.id)
    const label = String(r.title ?? r.name ?? r.content ?? id).slice(0, 80)
    const type = idStr(r.type).replace(/^note_type:/, '') || id.split(':')[0]
    return {
      id,
      data: {
        title: label,
        type,
        status: 'created' as const,
        lines: r.state ? [`state → ${String(r.state)}`] : [],
        descriptives: []
      }
    }
  })

  // Best-effort edges: any field whose value is a record-id (or array of them)
  // pointing to another node in the result set.
  const edges: FlowGraph['edges'] = []
  for (const r of nodeRows) {
    const source = idStr(r.id)
    for (const [key, val] of Object.entries(r)) {
      if (key === 'id') continue
      const targets = Array.isArray(val) ? val : [val]
      for (const t of targets) {
        const tid = idStr(t)
        if (tid.includes(':') && present.has(tid) && tid !== source) {
          edges.push({
            id: `${source}->${tid}:${key}:${edges.length}`,
            source,
            target: tid,
            label: key,
            preexisting: key !== 'part_of' && key !== 'parents'
          })
        }
      }
    }
  }
  return { nodes, edges }
}
