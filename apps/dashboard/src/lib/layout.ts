import dagre from '@dagrejs/dagre'
import type { FlowGraph, FlowNodeData } from './graph'

export type PositionedNode = { id: string; type: 'card'; position: { x: number; y: number }; data: FlowNodeData }
export type PositionedEdge = { id: string; source: string; target: string; label: string }
export type LaidOutGraph = { nodes: PositionedNode[]; edges: PositionedEdge[] }

const NODE_WIDTH = 240

// Estimate the rendered card height so dagre spaces nodes without overlap. The
// title wraps (no truncation), so account for its line count too.
function nodeHeight(d: FlowNodeData): number {
  const titleLines = Math.max(1, Math.ceil(d.title.length / 24))
  return 34 + titleLines * 20 + d.lines.length * 18 + (d.descriptives.length > 0 ? 20 : 0)
}

/**
 * Lay out a change graph top-to-bottom with dagre. Runs server-side (Astro SSR),
 * so the React Flow island receives nodes already positioned — no client-side
 * layout, no worker, no fitView race. dagre yields centre coordinates; React
 * Flow positions are top-left, so we offset by half the node size.
 */
export function layoutGraph(graph: FlowGraph): LaidOutGraph {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 55, ranksep: 70, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const heights = new Map(graph.nodes.map(n => [n.id, nodeHeight(n.data)]))
  for (const n of graph.nodes) g.setNode(n.id, { width: NODE_WIDTH, height: heights.get(n.id) })
  for (const e of graph.edges) g.setEdge(e.source, e.target)

  dagre.layout(g)

  const nodes: PositionedNode[] = graph.nodes.map(n => {
    const d = g.node(n.id)
    const h = heights.get(n.id) ?? nodeHeight(n.data)
    return { id: n.id, type: 'card', position: { x: d.x - NODE_WIDTH / 2, y: d.y - h / 2 }, data: n.data }
  })
  const edges: PositionedEdge[] = graph.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label
  }))
  return { nodes, edges }
}
