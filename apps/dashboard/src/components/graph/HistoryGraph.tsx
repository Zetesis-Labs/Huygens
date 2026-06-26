import { Background, type Node, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import type { LaidOutGraph } from '../../lib/layout'
import { nodeTypes } from './CardNode'
import { edgeTypes, toReactFlowEdges } from './FloatingEdge'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'legacy' }
  | { kind: 'ready'; graph: LaidOutGraph }

/** Read-only mini-canvas for a single proposal's change graph, shown in the
 * descriptive modal's detail pane. Fetches the laid-out graph from
 * /api/proposal-graph and renders it with the same nodes/edges as the main view,
 * but without selection, the legend, or click-to-open (no nested modals). */
export default function HistoryGraph({ proposalId }: { proposalId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/proposal-graph?id=${encodeURIComponent(proposalId)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        return r.json() as Promise<LaidOutGraph & { legacy: boolean }>
      })
      .then(data => {
        if (cancelled) return
        if (data.legacy) return setState({ kind: 'legacy' })
        setState({ kind: 'ready', graph: { nodes: data.nodes, edges: data.edges } })
      })
      .catch(e => {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [proposalId])

  if (state.kind === 'loading') return <div className="detail-graph">Cargando grafo…</div>
  if (state.kind === 'legacy')
    return <div className="detail-graph">Propuesta legacy (aplanada en la génesis): sin grafo.</div>
  if (state.kind === 'error') return <div className="detail-graph">No se pudo cargar el grafo: {state.message}</div>
  if (state.graph.nodes.length === 0) return <div className="detail-graph">Esta propuesta no tiene grafo.</div>

  return (
    <div style={{ flex: 1, minHeight: 0, border: '1px solid #e6e8eb', borderRadius: 10, overflow: 'hidden' }}>
      <ReactFlow
        nodes={state.graph.nodes as unknown as Node[]}
        edges={toReactFlowEdges(state.graph.edges)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}
