import type { FlowEdge, FlowGraph, FlowNode } from './graph'
import { resultsToFlow } from './queries'

// ─────────────────────────────────────────────────────────────────────────
// Adapters: turn an MCP tool result (as it arrives through the AG-UI agent)
// into a FlowGraph the canvas can render. The agent's exploration tools have
// different shapes, so each maps differently:
//   neighborhood / expand_context → {nodes:[{id,label}], edges:[{source,target,kind}]}
//   find_related / vector_search   → hit list (no edges → disconnected nodes)
//   query_query / run_query        → multi-statement rows (resultsToFlow: real
//                                     edge rows when present, else nested-field inference)
// ─────────────────────────────────────────────────────────────────────────

/** Tools whose results we render as a graph view on the canvas. */
export const VIEW_TOOLS = [
  'neighborhood',
  'expand_context',
  'find_related',
  'vector_search',
  'query_query',
  'run_query'
] as const

/** Pull the machine-readable JSON payload out of a tool result. It arrives in
 * several shapes depending on how Agno forwards the MCP output:
 *   - already-parsed JSON (object/array)
 *   - a string that is pure JSON (e.g. query_query rows)
 *   - a string with a trailing `[raw JSON]` block
 *   - human text immediately followed by the JSON (neighborhood/expand_context):
 *     `query: …\n40 nodo(s)\n…triples…{ "nodes": […], "edges": […] }`
 * Returns null when nothing parses. */
export function extractToolJson(result: unknown): unknown {
  if (result == null) return null
  if (typeof result !== 'string') return result
  const s = result.trim()

  const marker = '[raw JSON]'
  const mi = s.lastIndexOf(marker)
  if (mi >= 0) {
    try {
      return JSON.parse(s.slice(mi + marker.length).trim())
    } catch {
      /* fall through */
    }
  }

  try {
    return JSON.parse(s)
  } catch {
    /* not pure JSON — look for embedded JSON below */
  }

  // Human text + trailing JSON: parse from the first { or [ to the end.
  const a = s.indexOf('{')
  const b = s.indexOf('[')
  const start = a < 0 ? b : b < 0 ? a : Math.min(a, b)
  if (start > 0) {
    try {
      return JSON.parse(s.slice(start))
    } catch {
      const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
      if (end > start) {
        try {
          return JSON.parse(s.slice(start, end + 1))
        } catch {
          /* give up */
        }
      }
    }
  }
  return null
}

type SubgraphNode = { id: string; label: string }
type SubgraphEdge = { source: string; target: string; kind: string; qualifier?: string }

/** Split a graph label ("task · Title (STATE)") into a type slug + title, using
 * the id's table to disambiguate (notes carry their slug in the label head;
 * raws/blocks use their table). */
function typeAndTitle(id: string, label: string): { type: string; title: string } {
  const sep = label.indexOf(' · ')
  const head = sep >= 0 ? label.slice(0, sep) : ''
  const tail = sep >= 0 ? label.slice(sep + 3) : label
  if (id.startsWith('raw_capture:')) return { type: 'raw', title: tail || label }
  if (id.startsWith('block:')) return { type: 'block', title: tail || label }
  if (id.startsWith('note:')) return { type: head || 'note', title: tail || label }
  return { type: head || '?', title: tail || label }
}

function subgraphToFlow(json: { nodes?: SubgraphNode[]; edges?: SubgraphEdge[] }): FlowGraph | null {
  const rawNodes = json.nodes ?? []
  if (rawNodes.length === 0) return null
  const nodes: FlowNode[] = rawNodes.map(n => {
    const { type, title } = typeAndTitle(n.id, n.label)
    return { id: n.id, data: { title, type, status: 'created', lines: [], descriptives: [] } }
  })
  const present = new Set(nodes.map(n => n.id))
  const edges: FlowEdge[] = (json.edges ?? [])
    .filter(e => present.has(e.source) && present.has(e.target))
    .map((e, i) => ({
      id: `${e.source}->${e.target}:${e.kind}:${i}`,
      source: e.source,
      target: e.target,
      label: e.qualifier ? `${e.kind}(${e.qualifier})` : e.kind,
      // part_of is the structural backbone (solid); the rest are context (dashed).
      preexisting: e.kind !== 'part_of'
    }))
  return { nodes, edges }
}

type Hit = {
  note_id?: string | null
  block_id?: string
  id?: string
  title?: string
  note_title?: string | null
  content?: string
  type_slug?: string | null
  state?: string | null
  score?: number
}

function hitId(h: Hit): string | undefined {
  return h.note_id ?? h.id ?? h.block_id ?? undefined
}

function hitToNode(h: Hit, id: string): FlowNode {
  const title = h.title ?? h.note_title ?? (h.content ? h.content.slice(0, 60) : id)
  const type = h.type_slug ?? (id.startsWith('block:') ? 'block' : id.startsWith('raw_capture:') ? 'raw' : 'note')
  const lines: string[] = []
  if (h.state) lines.push(`state → ${h.state}`)
  if (typeof h.score === 'number') lines.push(`score → ${h.score.toFixed(2)}`)
  return { id, data: { title, type, status: 'created', lines, descriptives: [] } }
}

function hitsToFlow(json: unknown): FlowGraph | null {
  const hits: Hit[] = Array.isArray(json) ? (json as Hit[]) : ((json as { hits?: Hit[] })?.hits ?? [])
  const nodes: FlowNode[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    const id = hitId(h)
    if (!id || seen.has(id)) continue
    seen.add(id)
    nodes.push(hitToNode(h, id))
  }
  return nodes.length > 0 ? { nodes, edges: [] } : null
}

/** Map a tool result to a FlowGraph, or null when it isn't graph-shaped. */
export function toolResultToFlow(toolName: string, rawResult: unknown): FlowGraph | null {
  const json = extractToolJson(rawResult)
  if (json == null) return null
  switch (toolName) {
    case 'neighborhood':
    case 'expand_context':
      return subgraphToFlow(json as { nodes?: SubgraphNode[]; edges?: SubgraphEdge[] })
    case 'find_related':
    case 'vector_search':
      return hitsToFlow(json)
    case 'query_query':
    case 'run_query':
      return resultsToFlow(Array.isArray(json) ? json : [json])
    default:
      if (json && typeof json === 'object' && 'nodes' in json)
        return subgraphToFlow(json as { nodes?: SubgraphNode[]; edges?: SubgraphEdge[] })
      if (Array.isArray(json)) return resultsToFlow(json)
      return null
  }
}
