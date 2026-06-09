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

// Adjacency: parent id -> child ids (edges whose `out` is the parent).
function childrenByParent(allEdges: HierEdge[]): Map<string, string[]> {
  return allEdges.reduce((adjacency, edge) => {
    const siblings = adjacency.get(edge.out) ?? []
    return adjacency.set(edge.out, [...siblings, edge.in])
  }, new Map<string, string[]>())
}

// Descendants of root: walk children breadth/depth-first from the adjacency map.
function computeSubtree(allEdges: HierEdge[], root: string): { nodeIds: Set<string>; edges: HierEdge[] } {
  const childrenOf = childrenByParent(allEdges)
  const nodeIds = new Set([root])
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const childId of childrenOf.get(current) ?? []) {
      if (!nodeIds.has(childId)) {
        nodeIds.add(childId)
        stack.push(childId)
      }
    }
  }
  const edges = allEdges.filter(edge => nodeIds.has(edge.in) && nodeIds.has(edge.out))
  return { nodeIds, edges }
}

function selectForest(allEdges: HierEdge[]): { nodeIds: Set<string>; edges: HierEdge[] } {
  return { nodeIds: new Set(allEdges.flatMap(edge => [edge.in, edge.out])), edges: allEdges }
}

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
  const allEdges: HierEdge[] = (edgeRows ?? []).map(edge => ({ in: String(edge.in), out: String(edge.out) }))

  const { nodeIds, edges } = root ? computeSubtree(allEdges, root) : selectForest(allEdges)

  const ids = [...nodeIds]
  const [noteRows] = await db.query<[Array<{ id: unknown; title: string; type: string; state: string }>]>(
    'SELECT id, title, type.slug AS type, state FROM note WHERE id IN $ids',
    { ids: ids.map(id => new StringRecordId(id)) }
  )
  const nodes: HierNode[] = (noteRows ?? []).map(noteRow => ({
    id: String(noteRow.id),
    title: noteRow.title,
    type: noteRow.type,
    state: noteRow.state
  }))
  return { root: root ?? null, nodes, edges, node_count: nodes.length, edge_count: edges.length }
}

// ── count_notes ─────────────────────────────────────────────────────────────
// Pure: filters -> { where, params }. An empty stateIn is treated as no filter.
function buildNoteFilter({ typeSlug, stateIn }: { typeSlug?: string; stateIn?: string[] }): {
  where: string
  params: Record<string, unknown>
} {
  const clauses = [
    typeSlug ? { cond: 'type.slug = $ts', param: { ts: typeSlug } } : null,
    stateIn && stateIn.length > 0 ? { cond: 'state IN $st', param: { st: stateIn } } : null
  ].filter(clause => clause != null)
  const where = clauses.length > 0 ? `WHERE ${clauses.map(clause => clause.cond).join(' AND ')}` : ''
  const params = Object.assign({}, ...clauses.map(clause => clause.param))
  return { where, params }
}

export async function countNotesImpl(
  typeSlug?: string,
  stateIn?: string[]
): Promise<{ total: number; by_type_state: Array<{ type: string; state: string; count: number }> }> {
  const db = await getDb()
  const { where, params } = buildNoteFilter({ typeSlug, stateIn })
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
  items: Array<{
    id: string
    title: string
    type: string
    state: string
    parent: string | null
    mit_for: string | null
    due_at: string | null
  }>
}> {
  const db = await getDb()
  const [rows] = await db.query<
    [
      Array<{
        id: unknown
        title: string
        type: string
        state: string
        parent: unknown[]
        mit_for: unknown
        due_at: unknown
      }>
    ]
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

// ── mit_history ───────────────────────────────────────────────────────────────
// The live `note.mit_for` is a single cell: assigning today's MIT, or clearing it
// (`mit_for: null`), erases yesterday's. But the trace is NOT lost — every
// assignment and every clear is a `mit_for` write inside a committed proposal's
// payload (set in `note_creates`/`note_updates` only when the field was touched;
// absent otherwise, `null` when deliberately cleared). This derives that timeline
// read-only from the log: no schema, no extra state. It is what coaching streaks
// ("how many days running has Rubén planned a MIT?") read from.
type MitEvent = {
  committed_at: string
  proposal_id: string
  mit_for: string | null
  action: 'assigned' | 'moved' | 'cleared'
  source: 'create' | 'update'
}
type MitTimeline = {
  note_id: string
  note_title: string | null
  note_state: string | null
  current_mit_for: string | null
  history: MitEvent[]
}

type MitRow = {
  proposal_id: unknown
  committed_at: unknown
  upd: Array<{ id: unknown; mit_for: string | null }> | null
  cre: Array<{ id: unknown; mit_for: string | null }> | null
}

type MitWrite = Omit<MitEvent, 'action'> & { mit_for: string | null }
type NoteMeta = { title: string | null; state: string | null; mit_for: string | null }

// Pure: flatten committed-proposal rows to per-note event lists, in commit order.
// Keeps create-before-update ordering within a row, since that ordering feeds the
// assigned/moved classify. Filters to a single note when noteId is given.
function groupMitWritesByNote(rows: MitRow[], noteId?: string): Map<string, MitWrite[]> {
  const flatEvents = rows.flatMap(proposalRow => {
    const committed_at = proposalRow.committed_at != null ? String(proposalRow.committed_at) : ''
    const proposal_id = String(proposalRow.proposal_id)
    const creates = (proposalRow.cre ?? []).map(createWrite => ({
      noteId: String(createWrite.id),
      event: { committed_at, proposal_id, mit_for: createWrite.mit_for ?? null, source: 'create' as const }
    }))
    const updates = (proposalRow.upd ?? []).map(updateWrite => ({
      noteId: String(updateWrite.id),
      event: { committed_at, proposal_id, mit_for: updateWrite.mit_for ?? null, source: 'update' as const }
    }))
    return [...creates, ...updates]
  })
  return flatEvents
    .filter(({ noteId: eventNoteId }) => !noteId || eventNoteId === noteId)
    .reduce((grouped, { noteId: eventNoteId, event }) => {
      const events = grouped.get(eventNoteId) ?? []
      return grouped.set(eventNoteId, [...events, event])
    }, new Map<string, MitWrite[]>())
}

// Classify each write relative to the previous non-null value in this note's
// own timeline: first date = assigned, a later (different) date = moved, null
// = cleared. A consciously soltado MIT is exactly the `cleared` row. The reduce
// threads `prev` through the accumulator so the map stays pure.
function classifyHistory(events: MitWrite[]): MitEvent[] {
  return events.reduce<{ prev: string | null; history: MitEvent[] }>(
    ({ prev, history }, mitEvent) => {
      const action: MitEvent['action'] = mitEvent.mit_for == null ? 'cleared' : prev == null ? 'assigned' : 'moved'
      return { prev: mitEvent.mit_for, history: [...history, { ...mitEvent, action }] }
    },
    { prev: null, history: [] }
  ).history
}

// Pure: classify per-note events, decorate with note meta, sort most-recently-
// active first.
function buildMitTimelines(eventsByNote: Map<string, MitWrite[]>, metaByNote: Map<string, NoteMeta>): MitTimeline[] {
  const timeline: MitTimeline[] = [...eventsByNote.keys()].map(id => {
    const history = classifyHistory(eventsByNote.get(id) ?? [])
    const noteMeta = metaByNote.get(id)
    return {
      note_id: id,
      note_title: noteMeta?.title ?? null,
      note_state: noteMeta?.state ?? null,
      current_mit_for: noteMeta?.mit_for ?? null,
      history
    }
  })
  // Most-recently-active timelines first.
  return [...timeline].sort((a, b) => {
    const lastA = a.history[a.history.length - 1]?.committed_at ?? ''
    const lastB = b.history[b.history.length - 1]?.committed_at ?? ''
    return lastB.localeCompare(lastA)
  })
}

export async function mitHistoryImpl(noteId?: string): Promise<{
  note_id: string | null
  note_count: number
  event_count: number
  timeline: MitTimeline[]
}> {
  const db = await getDb()
  // Pull every committed proposal that touched `mit_for` on any note, oldest
  // first. `[WHERE mit_for != NONE]` keeps only the entries that actually wrote
  // the field (a deliberate `null` clear counts; an untouched note does not).
  const [rows] = await db.query<[MitRow[]]>(
    `SELECT
       id AS proposal_id,
       result.committed_at AS committed_at,
       payload.note_updates[WHERE mit_for != NONE] AS upd,
       payload.note_creates[WHERE mit_for != NONE] AS cre
     FROM proposal
     WHERE status = 'committed'
       AND result.committed_at IS NOT NONE
       AND (payload.note_updates[WHERE mit_for != NONE] OR payload.note_creates[WHERE mit_for != NONE])
     ORDER BY committed_at`
  )

  const byNote = groupMitWritesByNote(rows ?? [], noteId)

  if (byNote.size === 0) return { note_id: noteId ?? null, note_count: 0, event_count: 0, timeline: [] }

  // Decorate with the note's current title/state/mit_for.
  const ids = [...byNote.keys()]
  const [noteRows] = await db.query<[Array<{ id: unknown; title: string; state: string; mit_for: unknown }>]>(
    'SELECT id, title, state, mit_for FROM note WHERE id IN $ids',
    { ids: ids.map(id => new StringRecordId(id)) }
  )
  const meta = new Map<string, NoteMeta>(
    (noteRows ?? []).map(noteRow => [
      String(noteRow.id),
      {
        title: noteRow.title ?? null,
        state: noteRow.state ?? null,
        mit_for: noteRow.mit_for != null ? String(noteRow.mit_for) : null
      }
    ])
  )

  const sortedTimeline = buildMitTimelines(byNote, meta)
  const event_count = sortedTimeline.reduce((total, entry) => total + entry.history.length, 0)

  return { note_id: noteId ?? null, note_count: sortedTimeline.length, event_count, timeline: sortedTimeline }
}

export function registerViews(server: McpServer): void {
  defineTool(
    server,
    'get_hierarchy',
    'The part_of hierarchy as structured { nodes, edges } — the correct way to see areas → projects → tasks. Pass `root` (a note id) for that subtree; omit for the whole forest. Returns real edge rows (never the ambiguous bare [] that raw recursion produces, and never the semantic-edge noise of neighborhood/expand_context). Read-only.',
    {
      root: z
        .string()
        .regex(NOTE_ID_RE)
        .optional()
        .describe('Note id to root the subtree at; omit for the whole forest')
    },
    async ({ root }) => {
      const r = await getHierarchyImpl(root)
      return {
        content: [
          {
            type: 'text',
            text: `${r.node_count} nodes, ${r.edge_count} part_of edges${r.root ? ` under ${r.root}` : ' (full forest)'}`
          },
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

  defineTool(
    server,
    'mit_history',
    'The MIT timeline derived from the commit log. The live note.mit_for is a single cell — reassigning or clearing it erases the prior value — but every assignment/move/clear is preserved as a mit_for write in a committed proposal. This reconstructs, per note, the ordered history (assigned → moved → cleared) with the committing proposal and timestamp. Pass `note_id` for one task; omit for every note that ever held a MIT. The source of truth for coaching streaks (consecutive days planned/closed). Read-only.',
    {
      note_id: z
        .string()
        .regex(NOTE_ID_RE)
        .optional()
        .describe('Note id to trace; omit for every note that ever held a MIT')
    },
    async ({ note_id }) => {
      const r = await mitHistoryImpl(note_id)
      return {
        content: [{ type: 'text', text: `${r.event_count} MIT events across ${r.note_count} note(s)` }, jsonBlock(r)]
      }
    }
  )
}
