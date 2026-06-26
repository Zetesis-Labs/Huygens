import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ELK from 'elkjs/lib/elk-api.js'
import type { FlowGraph, FlowNodeData } from './graph'

export type PositionedNode = { id: string; type: 'card'; position: { x: number; y: number }; data: FlowNodeData }
export type PositionedEdge = { id: string; source: string; target: string; label: string; preexisting?: boolean }
export type LaidOutGraph = { nodes: PositionedNode[]; edges: PositionedEdge[] }

// elkjs runs its GWT layout in a Web Worker. We can't require the worker on the
// main thread (bun defines postMessage/onmessage globally, so the GWT code
// thinks it's already inside a worker and hangs) — so launch elk-worker as a
// real Worker. The worker URL is resolved with createRequire (import.meta.resolve
// isn't supported by Vite's SSR runner). Singleton: one worker per process.
const workerUrl = pathToFileURL(createRequire(import.meta.url).resolve('elkjs/lib/elk-worker.min.js')).href
const elk = new ELK({ workerUrl, workerFactory: (url?: string) => new Worker(url ?? workerUrl) })

const NODE_WIDTH = 240

// Estimate the rendered card height so ELK reserves the right space. The title
// wraps (no truncation), so account for its line count too.
function nodeHeight(d: FlowNodeData): number {
  const titleLines = Math.max(1, Math.ceil(d.title.length / 24))
  const hasFooter = d.descriptives.length > 0 || (d.changeHistory?.length ?? 0) > 0
  return 34 + titleLines * 20 + d.lines.length * 18 + (hasFooter ? 20 : 0)
}

/**
 * Place the nodes radially with ELK's radial algorithm, driven by the part_of
 * hierarchy (root at the centre, descendants on concentric rings) — organic and
 * hierarchical, and cross-links land at varied angles so they read clearly. Runs
 * server-side (Astro SSR). Edges are drawn on the client as bezier overlays.
 */
export async function layoutGraph(graph: FlowGraph): Promise<LaidOutGraph> {
  // Tree = the part_of hierarchy only (child→parent reversed so the parent is the
  // root). A "root" is any node with no part_of parent (incl. mention-only/isolated
  // nodes). Radial needs a single root: with a forest (≠1 root) we add an invisible
  // super-root so the components spread instead of overlapping; a lone tree keeps
  // its real root centred. mentions/blocked_by are overlays, excluded from layout.
  const partOf = graph.edges.filter(e => e.label === 'part_of')
  const childIds = new Set(partOf.map(e => e.source))
  const roots = graph.nodes.filter(n => !childIds.has(n.id)).map(n => n.id)
  const VROOT = '__vroot__'
  const useVRoot = roots.length !== 1

  const children: Array<{ id: string; width: number; height: number }> = graph.nodes.map(n => ({
    id: n.id,
    width: NODE_WIDTH,
    height: nodeHeight(n.data)
  }))
  const treeEdges = partOf.map(e => ({ id: e.id, sources: [e.target], targets: [e.source] }))
  if (useVRoot) {
    children.push({ id: VROOT, width: 1, height: 1 })
    roots.forEach((r, i) => {
      treeEdges.push({ id: `__v${i}`, sources: [VROOT], targets: [r] })
    })
  }

  const res = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'org.eclipse.elk.radial', 'elk.spacing.nodeNode': '60' },
    children,
    edges: treeEdges
  })

  const pos = new Map((res.children ?? []).map(c => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
  const nodes: PositionedNode[] = graph.nodes.map(n => ({
    id: n.id,
    type: 'card',
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: n.data
  }))
  const edges: PositionedEdge[] = graph.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    preexisting: e.preexisting
  }))

  return { nodes, edges }
}
