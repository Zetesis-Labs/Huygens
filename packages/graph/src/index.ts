// @huygens/graph — the proposal change-graph model, shared by the dashboard (which
// lays it out with ELK and renders it in React Flow) and the MCP (which renders it
// as text for the agent). Pure: types + builders, zero I/O, zero DB knowledge.

/** Provenance of a node within a proposal. Drives the border: created/updated
 * (the proposal mutates the note) → solid; context (pre-existing, only linked by
 * an edge) → dashed. */
export type NodeStatus = 'created' | 'updated' | 'context'

export type FlowNodeData = {
  title: string
  /** Note type slug (task|project|area|routine|idea|reference|person|objetivo)
   * or 'raw' | 'block' | '?'. Drives the icon and colour. */
  type: string
  status: NodeStatus
  lines: string[]
  /** Full content of the note's descriptive blocks (markdown), shown on click. */
  descriptives: string[]
}

export type FlowNode = { id: string; data: FlowNodeData }
/** `preexisting`: the relation already existed in the KG (not created by this
 * proposal) → rendered dashed. */
export type FlowEdge = { id: string; source: string; target: string; label: string; preexisting?: boolean }
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] }

/** Human label + type of an existing record a proposal references. */
export type RefInfo = { type: string; title: string }

/** A relation that already exists in the KG between two records. */
export type ExistingEdge = { source: string; target: string; kind: string }

/** The slice of a proposal payload the graph builders read. Both apps' richer
 * payload types are structurally assignable to this. */
export type GraphPayload = {
  note_creates: {
    temp_id: string
    type_slug: string
    title: string
    state: string
    mit_for?: string
    metadata?: Record<string, unknown>
    descriptive_blocks: { content: string }[]
  }[]
  note_updates: {
    id: string
    title?: string
    state?: string
    mit_for?: string | null
    metadata_merge?: Record<string, unknown>
    descriptive_blocks_append: { content: string }[]
  }[]
  edges: { kind: string; from: string; to: string }[]
  /** Semantic edges this proposal retires (the inverse of `edges`). Optional:
   * older payloads predate the feature. Read by foldTopology, not proposalToFlow. */
  edges_remove?: { kind: string; from: string; to: string }[]
  narrative_blocks: { temp_id: string }[]
}

function createAttrLines(n: GraphPayload['note_creates'][number]): string[] {
  const lines = [`state → ${n.state}`]
  if (n.mit_for) lines.push(`MIT → ${n.mit_for}`)
  const metaKeys = n.metadata ? Object.keys(n.metadata) : []
  if (metaKeys.length > 0) lines.push(`meta: ${metaKeys.join(', ')}`)
  return lines
}

function updateChangeLines(n: GraphPayload['note_updates'][number]): string[] {
  const lines: string[] = []
  if (n.title != null) lines.push(`title → "${n.title}"`)
  if (n.state != null) lines.push(`state → ${n.state}`)
  if (n.mit_for === null) lines.push('MIT → cleared')
  else if (n.mit_for != null) lines.push(`MIT → ${n.mit_for}`)
  const metaKeys = n.metadata_merge ? Object.keys(n.metadata_merge) : []
  if (metaKeys.length > 0) lines.push(`meta: ${metaKeys.join(', ')}`)
  return lines.length > 0 ? lines : ['(sin cambios de campo)']
}

function typeFromId(id: string): string {
  if (id.startsWith('raw_capture:')) return 'raw'
  if (id.startsWith('block:')) return 'block'
  return '?'
}

/**
 * Turn a proposal payload into a graph: the notes it creates / updates plus the
 * note↔note topology (`part_of` / `blocked_by` / `mentions`). The narrative block
 * lives outside the graph, so its plumbing (about / affects / derived_from) is
 * dropped. Referenced records outside the proposal become `context` nodes,
 * labelled+typed from `labels`. Pure.
 */
export function proposalToFlow(payload: GraphPayload, labels: Record<string, RefInfo> = {}): FlowGraph {
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []

  const ensureContext = (id: string): void => {
    if (nodes.has(id)) return
    const info = labels[id]
    nodes.set(id, {
      id,
      data: {
        title: info?.title ?? id,
        type: info?.type ?? typeFromId(id),
        status: 'context',
        lines: [],
        descriptives: []
      }
    })
  }
  const addEdge = (source: string, target: string, label: string): void => {
    ensureContext(source)
    ensureContext(target)
    edges.push({ id: `${source}->${target}:${label}:${edges.length}`, source, target, label })
  }

  for (const n of payload.note_creates) {
    nodes.set(n.temp_id, {
      id: n.temp_id,
      data: {
        title: n.title,
        type: n.type_slug,
        status: 'created',
        lines: createAttrLines(n),
        descriptives: n.descriptive_blocks.map(b => b.content)
      }
    })
  }
  for (const n of payload.note_updates) {
    const info = labels[n.id]
    nodes.set(n.id, {
      id: n.id,
      data: {
        title: info?.title ?? n.title ?? n.id,
        type: info?.type ?? '?',
        status: 'updated',
        lines: updateChangeLines(n),
        descriptives: n.descriptive_blocks_append.map(b => b.content)
      }
    })
  }

  const narrativeIds = new Set(payload.narrative_blocks.map(b => b.temp_id))
  for (const e of payload.edges) {
    if (narrativeIds.has(e.from) || narrativeIds.has(e.to)) continue
    addEdge(e.from, e.to, e.kind)
  }

  return { nodes: [...nodes.values()], edges }
}

/**
 * Add relations that already existed in the KG between the graph's nodes
 * (`existing`) as dashed `preexisting` edges. Skips any already present as a
 * proposal edge, and any whose endpoints aren't both in the graph. Pure.
 */
export function mergeExistingEdges(flow: FlowGraph, existing: ExistingEdge[]): FlowGraph {
  const nodeIds = new Set(flow.nodes.map(n => n.id))
  const seen = new Set(flow.edges.map(e => `${e.source}->${e.target}:${e.label}`))
  const extra: FlowEdge[] = []
  for (const e of existing) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    const key = `${e.source}->${e.target}:${e.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    extra.push({
      id: `existing:${key}:${extra.length}`,
      source: e.source,
      target: e.target,
      label: e.kind,
      preexisting: true
    })
  }
  return { nodes: flow.nodes, edges: [...flow.edges, ...extra] }
}

/** One proposal's contribution to a fused graph: its payload, the temp_id → real
 * note-id map from its commit, and optional resolved labels for context nodes. */
export type FuseItem = { payload: GraphPayload; tempMap?: Record<string, string>; labels?: Record<string, RefInfo> }

// When the same node is touched by several proposals: a note created somewhere
// outranks one merely updated, which outranks bare context.
const RANK: Record<NodeStatus, number> = { context: 0, updated: 1, created: 2 }

/**
 * Fuse several proposals into one graph. Each proposal's flow has its temp ids
 * rewritten to the real note ids its commit produced (`tempMap`), so a note
 * created by one proposal and linked by another collapses to a single node. On
 * collision the higher-ranked status wins and lines/descriptives are unioned.
 * Edges are de-duplicated by endpoints+label. Pure.
 */
export function fuseProposals(items: FuseItem[]): FlowGraph {
  const nodes = new Map<string, FlowNode>()
  const edgeSeen = new Set<string>()
  const edges: FlowEdge[] = []

  for (const it of items) {
    const tm = it.tempMap ?? {}
    const remap = (id: string): string => tm[id] ?? id
    const flow = proposalToFlow(it.payload, it.labels)

    for (const n of flow.nodes) {
      const id = remap(n.id)
      const ex = nodes.get(id)
      if (!ex) {
        nodes.set(id, { ...n, id })
        continue
      }
      const winner = RANK[n.data.status] > RANK[ex.data.status] ? n.data : ex.data
      nodes.set(id, {
        id,
        data: {
          ...winner,
          lines: [...new Set([...ex.data.lines, ...n.data.lines])],
          descriptives: [...new Set([...ex.data.descriptives, ...n.data.descriptives])]
        }
      })
    }
    for (const e of flow.edges) {
      const source = remap(e.source)
      const target = remap(e.target)
      const key = `${source}->${target}:${e.label}`
      if (edgeSeen.has(key)) continue
      edgeSeen.add(key)
      edges.push({ id: `${key}:${edges.length}`, source, target, label: e.label, preexisting: e.preexisting })
    }
  }

  return { nodes: [...nodes.values()], edges }
}

/**
 * Fold committed proposals' payloads, in chronological order, into the note↔note
 * edge set that exists after all of them — the SSOT-based reconstruction of
 * historical topology, with no changefeed dependency. Each item is remapped
 * temp→real via its `tempMap`. Mutations mirror the commit transaction exactly:
 * within an item, `edges_remove` (an exact-edge retirada) is applied before
 * `edges`, and an added `part_of` replaces the child's previous parent (the
 * single-parent index → the commit's implicit DELETE). `parentOf` persists across
 * items so a reparent in a later proposal supersedes an earlier one. Narrative
 * endpoints are skipped (defensive; semantic edges are note↔note). Pure.
 *
 * Pass the proposals committed strictly *before* the one being viewed; the viewed
 * proposal's own edges come from `proposalToFlow`. The caller filters the result
 * to the nodes on screen via `mergeExistingEdges`.
 */
export function foldTopology(items: FuseItem[]): ExistingEdge[] {
  const edges = new Map<string, ExistingEdge>()
  const parentOf = new Map<string, string>() // child id → its current part_of parent
  const key = (s: string, t: string, k: string): string => `${s}->${t}:${k}`

  for (const it of items) {
    const tm = it.tempMap ?? {}
    const remap = (id: string): string => tm[id] ?? id
    const narrative = new Set(it.payload.narrative_blocks.map(b => b.temp_id))

    for (const e of it.payload.edges_remove ?? []) {
      if (narrative.has(e.from) || narrative.has(e.to)) continue
      const s = remap(e.from)
      const t = remap(e.to)
      edges.delete(key(s, t, e.kind))
      if (e.kind === 'part_of' && parentOf.get(s) === t) parentOf.delete(s)
    }
    for (const e of it.payload.edges) {
      if (narrative.has(e.from) || narrative.has(e.to)) continue
      const s = remap(e.from)
      const t = remap(e.to)
      if (e.kind === 'part_of') {
        const prev = parentOf.get(s)
        if (prev != null && prev !== t) edges.delete(key(s, prev, 'part_of'))
        parentOf.set(s, t)
      }
      edges.set(key(s, t, e.kind), { source: s, target: t, kind: e.kind })
    }
  }
  return [...edges.values()]
}
