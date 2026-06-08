import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { NOTE_ID_RE, NoteStateSchema, NoteTypeSlugSchema } from '../domain'
import { getDb } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'

/**
 * Typed, high-intent read tools that return structured results — never an
 * ambiguous bare `[]`. They make obsolete the read-craft recipes that the skill
 * had to document as workarounds for raw query_query + neighborhood (hierarchy by
 * the wrong edges, projecting inside the recursion gate, reporting empty as truth,
 * counting by eye). Read-only.
 */

// ── get_hierarchy ───────────────────────────────────────────────────────────
type HierNode = { id: string; title: string; type: string; state: string }
type HierEdge = { in: string; out: string }

export async function getHierarchyImpl(root?: string): Promise<{
  root: string | null
  nodes: HierNode[]
  edges: HierEdge[]
  node_count: number
  edge_count: number
}> {
  const db = await getDb()
  // part_of is child->parent (in=child, out=parent). Pull the full forest once.
  const [edgeRows] = await db.query<[Array<{ in: unknown; out: unknown }>]>('SELECT in, out FROM part_of')
  const allEdges: HierEdge[] = (edgeRows ?? []).map(e => ({ in: String(e.in), out: String(e.out) }))

  let nodeIds: Set<string>
  let edges: HierEdge[]
  if (root) {
    // descendants of root: walk children (edges whose `out` is the current node)
    const childrenOf = new Map<string, string[]>()
    for (const e of allEdges) {
      const arr = childrenOf.get(e.out)
      if (arr) arr.push(e.in)
      else childrenOf.set(e.out, [e.in])
    }
    nodeIds = new Set([root])
    const stack = [root]
    while (stack.length > 0) {
      const n = stack.pop() as string
      for (const c of childrenOf.get(n) ?? []) {
        if (!nodeIds.has(c)) {
          nodeIds.add(c)
          stack.push(c)
        }
      }
    }
    edges = allEdges.filter(e => nodeIds.has(e.in) && nodeIds.has(e.out))
  } else {
    nodeIds = new Set(allEdges.flatMap(e => [e.in, e.out]))
    edges = allEdges
  }

  const ids = [...nodeIds]
  const [noteRows] = await db.query<[Array<{ id: unknown; title: string; type: string; state: string }>]>(
    'SELECT id, title, type.slug AS type, state FROM note WHERE id IN $ids',
    { ids: ids.map(id => new StringRecordId(id)) }
  )
  const nodes: HierNode[] = (noteRows ?? []).map(n => ({
    id: String(n.id),
    title: n.title,
    type: n.type,
    state: n.state
  }))
  return { root: root ?? null, nodes, edges, node_count: nodes.length, edge_count: edges.length }
}

// ── count_notes ─────────────────────────────────────────────────────────────
export async function countNotesImpl(
  typeSlug?: string,
  stateIn?: string[]
): Promise<{ total: number; by_type_state: Array<{ type: string; state: string; count: number }> }> {
  const db = await getDb()
  const conds: string[] = []
  const params: Record<string, unknown> = {}
  if (typeSlug) {
    conds.push('type.slug = $ts')
    params.ts = typeSlug
  }
  if (stateIn && stateIn.length > 0) {
    conds.push('state IN $st')
    params.st = stateIn
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
  const [totalRows] = await db.query<[Array<{ c: number }>]>(`SELECT count() AS c FROM note ${where} GROUP ALL`, params)
  const [rows] = await db.query<[Array<{ type: string; state: string; c: number }>]>(
    `SELECT type.slug AS type, state, count() AS c FROM note ${where} GROUP BY type, state ORDER BY type, state`,
    params
  )
  return {
    total: totalRows?.[0]?.c ?? 0,
    by_type_state: (rows ?? []).map(r => ({ type: r.type ?? 'unknown', state: r.state, count: r.c }))
  }
}

// ── daily_radar ─────────────────────────────────────────────────────────────
export async function dailyRadarImpl(): Promise<{
  live_count: number
  items: Array<{ id: string; title: string; type: string; state: string; parent: string | null; mit_for: string | null; due_at: string | null }>
}> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; title: string; type: string; state: string; parent: unknown[]; mit_for: unknown; due_at: unknown }>]
  >(
    `SELECT id, title, type.slug AS type, state, ->part_of->note.title AS parent, mit_for, due_at
     FROM note
     WHERE state IN ['ACTIVE','WAITING','CLARIFIED']
       AND (defer_until IS NONE OR defer_until <= time::now())
     ORDER BY type, state`
  )
  const items = (rows ?? []).map(r => ({
    id: String(r.id),
    title: r.title,
    type: r.type,
    state: r.state,
    parent: (r.parent?.[0] as string) ?? null,
    mit_for: r.mit_for != null ? String(r.mit_for) : null,
    due_at: r.due_at != null ? String(r.due_at) : null
  }))
  return { live_count: items.length, items }
}

export function registerViews(server: McpServer): void {
  defineTool(
    server,
    'get_hierarchy',
    'The part_of hierarchy as structured { nodes, edges } — the correct way to see areas → projects → tasks. Pass `root` (a note id) for that subtree; omit for the whole forest. Returns real edge rows (never the ambiguous bare [] that raw recursion produces, and never the semantic-edge noise of neighborhood/expand_context). Read-only.',
    { root: z.string().regex(NOTE_ID_RE).optional().describe('Note id to root the subtree at; omit for the whole forest') },
    async ({ root }) => {
      const r = await getHierarchyImpl(root)
      return {
        content: [
          { type: 'text', text: `${r.node_count} nodes, ${r.edge_count} part_of edges${r.root ? ` under ${r.root}` : ' (full forest)'}` },
          jsonBlock(r)
        ]
      }
    }
  )

  defineTool(
    server,
    'count_notes',
    'Count notes from count() (never eyeballed), optionally filtered by type slug and/or states, with a by-(type,state) breakdown. Read-only.',
    {
      type_slug: NoteTypeSlugSchema.optional(),
      state_in: z.array(NoteStateSchema).optional().describe('Filter by these states (e.g. ["ACTIVE","WAITING"])')
    },
    async ({ type_slug, state_in }) => {
      const r = await countNotesImpl(type_slug, state_in)
      return { content: [{ type: 'text', text: `total: ${r.total}` }, jsonBlock(r)] }
    }
  )

  defineTool(
    server,
    'daily_radar',
    'The live operational radar: notes in ACTIVE/WAITING/CLARIFIED that are not deferred (the active surface), with their parent and temporal axes. The canonical "what is live right now" view. Read-only.',
    {},
    async () => {
      const r = await dailyRadarImpl()
      return { content: [{ type: 'text', text: `${r.live_count} live (non-deferred) notes` }, jsonBlock(r)] }
    }
  )
}
