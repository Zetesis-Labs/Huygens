import { Background, Controls, type Node, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import type { FlowNodeData } from '../../lib/graph'
import type { LaidOutGraph } from '../../lib/layout'
import { nodeTypes } from './CardNode'
import DescriptiveModal from './DescriptiveModal'
import { edgeTypes, toReactFlowEdges } from './FloatingEdge'
import GraphLegend from './GraphLegend'
import { useGraphView } from './GraphViewContext'

/**
 * The interactive canvas. Nodes arrive already positioned (server-side ELK
 * radial layout); React Flow owns drag state via the *State hooks, while the
 * legend toggles flip `hidden` on the matching nodes/edges (so they stay in the
 * store and positions don't shift). Clicking a node with descriptive blocks
 * opens the markdown modal. Must render inside a GraphViewProvider.
 */
export default function GraphCanvas({ nodes, edges }: LaidOutGraph) {
  const { hiddenTypes, hiddenKinds, hiddenStates, showHydrated } = useGraphView()
  const [modal, setModal] = useState<FlowNodeData | null>(null)
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes as unknown as Node[])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(toReactFlowEdges(edges))

  // Ids of nodes hidden by a type or state filter — also used to hide edges that
  // would otherwise dangle into the gap left by a hidden endpoint.
  const hiddenNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const n of nodes) {
      if (hiddenTypes.has(n.data.type) || (n.data.state && hiddenStates.has(n.data.state))) ids.add(n.id)
    }
    return ids
  }, [nodes, hiddenTypes, hiddenStates])

  useEffect(() => {
    setRfNodes(ns => ns.map(n => ({ ...n, hidden: hiddenNodeIds.has(n.id) })))
  }, [hiddenNodeIds, setRfNodes])

  useEffect(() => {
    setRfEdges(es =>
      es.map(e => ({
        ...e,
        hidden:
          hiddenKinds.has(String(e.label)) ||
          (!showHydrated && Boolean(e.data?.preexisting)) ||
          hiddenNodeIds.has(e.source) ||
          hiddenNodeIds.has(e.target)
      }))
    )
  }, [hiddenKinds, showHydrated, hiddenNodeIds, setRfEdges])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const d = node.data as FlowNodeData
          if (d.descriptives.length > 0) setModal(d)
        }}
      >
        <Background />
        <Controls />
        <GraphLegend nodes={nodes} edges={edges} />
      </ReactFlow>

      {modal && <DescriptiveModal node={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
