import type { ExistingEdge, Proposal } from './surreal'

/** Provenance of a node within this proposal. Drives the border: created/updated
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

function createAttrLines(n: Proposal['payload']['note_creates'][number]): string[] {
  const lines = [`state → ${n.state}`]
  if (n.mit_for) lines.push(`MIT → ${n.mit_for}`)
  const metaKeys = n.metadata ? Object.keys(n.metadata) : []
  if (metaKeys.length > 0) lines.push(`meta: ${metaKeys.join(', ')}`)
  return lines
}

function updateChangeLines(n: Proposal['payload']['note_updates'][number]): string[] {
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
 * Turn a proposal's payload into a React Flow graph: the notes it creates /
 * updates plus the note↔note topology (`part_of` / `blocked_by` / `mentions`).
 * The narrative block lives in the side panel, not as a graph hub, so its
 * plumbing (about / affects / derived_from) is dropped. Referenced records
 * outside the proposal become `context` nodes, labelled+typed from `labels`. Pure.
 */
export function proposalToFlow(p: Proposal, labels: Record<string, RefInfo> = {}): FlowGraph {
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

  for (const n of p.payload.note_creates) {
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
  for (const n of p.payload.note_updates) {
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

  const narrativeIds = new Set(p.payload.narrative_blocks.map(b => b.temp_id))
  for (const e of p.payload.edges) {
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
