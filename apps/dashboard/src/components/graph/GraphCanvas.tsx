import { Background, Controls, type Node, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FlowNodeData } from '../../lib/graph'
import type { LaidOutGraph } from '../../lib/layout'
import { nodeTypes } from './CardNode'
import DescriptiveModal from './DescriptiveModal'
import { edgeTypes, toReactFlowEdges } from './FloatingEdge'
import GraphLegend from './GraphLegend'
import { useGraphView } from './GraphViewContext'

function canOpenNode(d: FlowNodeData): boolean {
  return d.descriptives.length > 0 || d.lines.length > 0 || (d.changeHistory?.length ?? 0) > 0
}

/**
 * The interactive canvas. Nodes arrive already positioned (server-side ELK
 * radial layout); React Flow owns drag state via the *State hooks, while the
 * legend toggles flip `hidden` on the matching nodes/edges (so they stay in the
 * store and positions don't shift). Clicking a node with descriptive blocks
 * opens the markdown modal. Must render inside a GraphViewProvider.
 */
export default function GraphCanvas({ nodes, edges, initialNodeId }: LaidOutGraph & { initialNodeId?: string | null }) {
  const { hiddenTypes, hiddenKinds, hiddenStates, showHydrated } = useGraphView()
  const [modal, setModal] = useState<{ id: string; data: FlowNodeData } | null>(null)
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes as unknown as Node[])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(toReactFlowEdges(edges))

  const selectNode = useCallback(
    (id: string): void => {
      setRfNodes(ns => ns.map(n => ({ ...n, selected: n.id === id })))
    },
    [setRfNodes]
  )

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

  useEffect(() => {
    if (!initialNodeId) return
    selectNode(initialNodeId)
    const node = nodes.find(n => n.id === initialNodeId)
    if (node && canOpenNode(node.data)) setModal({ id: node.id, data: node.data })
  }, [initialNodeId, nodes, selectNode])

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
          selectNode(node.id)
          if (canOpenNode(d)) setModal({ id: node.id, data: d })
        }}
      >
        <Background />
        <Controls />
        <GraphLegend nodes={nodes} edges={edges} />
      </ReactFlow>

      {modal && <DescriptiveModal nodeId={modal.id} node={modal.data} onClose={() => setModal(null)} />}
    </div>
  )
}
