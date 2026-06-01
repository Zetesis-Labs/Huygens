import type { FlowGraph, FlowNode, NodeStatus } from './graph'

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

export type ConversationSummary = { id: string; title: string | null; message_count: number; updated_at: string | null }
export type ConversationDoc = {
  id: string
  title: string | null
  messages: unknown[]
  state: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

export const listConversations = (): Promise<ConversationSummary[]> => callTool('list_conversations', {})
export const getConversation = (id: string): Promise<ConversationDoc | null> => callTool('get_conversation', { id })
export const saveConversation = (args: {
  messages: unknown[]
  title?: string
  state?: Record<string, unknown>
  id?: string
}): Promise<{ id: string; updated: boolean }> => callTool('save_conversation', args)
export const deleteConversation = (id: string): Promise<{ deleted: string }> => callTool('delete_conversation', { id })

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

/** Resolve a record id from a value that may be a bare string ("note:x"), a
 * SurrealDB record-id object ({tb,id}), or a fetched record ({id:"note:x",
 * title,…}). Returns null when it isn't a record id. */
function recordIdOf(v: unknown): string | null {
  if (typeof v === 'string') return v.includes(':') ? v : null
  if (v && typeof v === 'object') {
    const o = v as { tb?: unknown; id?: unknown }
    if (o.tb !== undefined && o.id !== undefined) return `${String(o.tb)}:${String(o.id)}`
    if (typeof o.id === 'string' && o.id.includes(':')) return o.id
  }
  return null
}

/** Build a graph node from a row or a nested record object. */
function rowToNode(v: Record<string, unknown>, id: string, status: NodeStatus): FlowNode {
  const label = String(v.title ?? v.name ?? v.content ?? id).slice(0, 80)
  const rawType = v.type == null ? '' : idStr(v.type).replace(/^note_type:/, '')
  const type = rawType || id.split(':')[0]
  return {
    id,
    data: { title: label, type, status, lines: v.state ? [`state → ${String(v.state)}`] : [], descriptives: [] }
  }
}

function ensureNode(nodes: Map<string, FlowNode>, id: string, src: unknown): void {
  if (!nodes.has(id)) {
    nodes.set(id, rowToNode((src && typeof src === 'object' ? src : { id }) as Record<string, unknown>, id, 'context'))
  }
}

/** Append a deduped edge. `part_of` is the solid backbone (drives the radial
 * layout); everything else is a dashed context link. */
function pushEdge(edges: FlowGraph['edges'], seen: Set<string>, source: string, target: string, kind: string): void {
  const key = `${source}|${target}|${kind}`
  if (seen.has(key)) return
  seen.add(key)
  edges.push({
    id: `${source}->${target}:${kind}:${edges.length}`,
    source,
    target,
    label: kind,
    preexisting: kind !== 'part_of'
  })
}

// Single-field names that point at a parent → drawn as the `part_of` backbone.
const PARENT_KEY = /^(part_of|parent|parents)$/
// Ancestor-chain columns, nearest first: linked level-to-level (task→project→area)
// instead of all to the source, so a flat query still renders a real hierarchy.
const ANCESTOR_CHAIN = ['parent', 'grandparent', 'great_grandparent', 'great_great_grandparent']

/** Ordered ancestor objects of a row (an `ancestors` array, or the
 * parent/grandparent/… columns), nearest first. */
function ancestorChain(row: Record<string, unknown>): unknown[] {
  const out: unknown[] = []
  if (Array.isArray(row.ancestors)) out.push(...row.ancestors)
  for (const k of ANCESTOR_CHAIN) {
    const v = row[k]
    const item = Array.isArray(v) ? v[0] : v
    if (item != null) out.push(item)
  }
  return out
}

/** Infer edges for one row when the query gave no explicit edge rows: chain the
 * ancestors (task→project→area) and link any other record-valued field. */
function addRelations(
  row: Record<string, unknown>,
  source: string,
  nodes: Map<string, FlowNode>,
  edges: FlowGraph['edges'],
  seen: Set<string>
): void {
  let prev = source
  for (const item of ancestorChain(row)) {
    const tid = recordIdOf(item)
    if (!tid || tid === prev) continue
    ensureNode(nodes, tid, item)
    pushEdge(edges, seen, prev, tid, 'part_of')
    prev = tid
  }
  const skip = new Set(['id', 'ancestors', ...ANCESTOR_CHAIN])
  for (const [key, val] of Object.entries(row)) {
    if (skip.has(key)) continue
    for (const t of Array.isArray(val) ? val : [val]) {
      const tid = recordIdOf(t)
      if (!tid || tid === source) continue
      ensureNode(nodes, tid, t)
      pushEdge(edges, seen, source, tid, PARENT_KEY.test(key) ? 'part_of' : key)
    }
  }
}

/**
 * Single result set → FlowGraph by inferring edges from nested record fields
 * (the parent/grandparent columns the agent emits). Materializes nested targets
 * as `context` nodes. Prefer resultsToFlow when the query returns explicit edge
 * rows. Returns null when no row carries a record id.
 */
export function rowsToFlow(rows: Record<string, unknown>[]): FlowGraph | null {
  const nodes = new Map<string, FlowNode>()
  for (const r of rows) {
    const id = recordIdOf(r.id)
    if (id) nodes.set(id, rowToNode(r, id, 'created'))
  }
  if (nodes.size === 0) return null

  const edges: FlowGraph['edges'] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const source = recordIdOf(r.id)
    if (source) addRelations(r, source, nodes, edges, seen)
  }
  return { nodes: [...nodes.values()], edges }
}

/** An edge-table row carries `in` + `out` record ids (e.g. `SELECT id, in, out
 * FROM part_of`). */
function isEdgeRow(r: Record<string, unknown>): boolean {
  return 'in' in r && 'out' in r && recordIdOf(r.in) !== null && recordIdOf(r.out) !== null
}

/**
 * Build a FlowGraph from the FULL multi-statement SurrealQL result — the right
 * way to render a hierarchy. A query returns node rows AND edge rows
 * (`SELECT id, in, out FROM part_of …`); we use those REAL edges (kind = the
 * edge table, e.g. part_of) instead of guessing from nested columns. Falls back
 * to per-row inference (rowsToFlow) when there are no explicit edge rows.
 * Returns null when there are no nodes.
 */
export function resultsToFlow(results: unknown[]): FlowGraph | null {
  const rows: Record<string, unknown>[] = []
  for (const stmt of results) {
    for (const r of Array.isArray(stmt) ? stmt : [stmt]) {
      if (r && typeof r === 'object') rows.push(r as Record<string, unknown>)
    }
  }
  const edgeRows = rows.filter(isEdgeRow)
  const nodeRows = rows.filter(r => !isEdgeRow(r) && recordIdOf(r.id) !== null)
  if (edgeRows.length === 0) return rowsToFlow(nodeRows)

  const nodes = new Map<string, FlowNode>()
  for (const r of nodeRows) {
    const id = recordIdOf(r.id)
    if (id && !nodes.has(id)) nodes.set(id, rowToNode(r, id, 'created'))
  }
  const edges: FlowGraph['edges'] = []
  const seen = new Set<string>()
  for (const e of edgeRows) {
    const source = recordIdOf(e.in)
    const target = recordIdOf(e.out)
    if (!source || !target) continue
    ensureNode(nodes, source, undefined)
    ensureNode(nodes, target, undefined)
    pushEdge(edges, seen, source, target, recordIdOf(e.id)?.split(':')[0] ?? 'rel')
  }
  return nodes.size > 0 ? { nodes: [...nodes.values()], edges } : null
}
