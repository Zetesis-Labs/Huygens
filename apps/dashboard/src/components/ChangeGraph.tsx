import { Background, Controls, type Node, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState } from 'react'
import type { FlowNodeData } from '../lib/graph'
import type { LaidOutGraph } from '../lib/layout'
import { nodeTypes } from './graph/CardNode'
import DescriptiveModal from './graph/DescriptiveModal'
import { edgeTypes, toReactFlowEdges } from './graph/FloatingEdge'

/**
 * Renders a proposal's change graph. Nodes arrive already positioned (server-side
 * ELK radial layout); this only wires them into React Flow and opens the
 * descriptive-blocks modal when a node that has them is clicked.
 */
export default function ChangeGraph({ nodes, edges }: LaidOutGraph) {
  const [modal, setModal] = useState<FlowNodeData | null>(null)
  const rfNodes = nodes as unknown as Node[]
  const rfEdges = toReactFlowEdges(edges)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        defaultNodes={rfNodes}
        defaultEdges={rfEdges}
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
      </ReactFlow>

      {modal && <DescriptiveModal node={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
