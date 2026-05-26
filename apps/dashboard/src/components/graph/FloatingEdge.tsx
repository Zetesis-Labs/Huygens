import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  type InternalNode,
  MarkerType,
  Position,
  useInternalNode
} from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import type { PositionedEdge } from '../../lib/layout'

// Colour + width by relation KIND: part_of is the structural backbone (thick,
// strong), blocked_by a dependency (medium), mentions the weak fallback (thin,
// faint). The other dimension is provenance: pre-existing (hydrated) edges are
// dashed + faded; edges the proposal creates are solid.
const KIND_STYLE: Record<string, { stroke: string; strokeWidth: number }> = {
  part_of: { stroke: '#4338ca', strokeWidth: 2.6 },
  blocked_by: { stroke: '#dc2626', strokeWidth: 2 },
  mentions: { stroke: '#94a3b8', strokeWidth: 1.25 }
}
const FALLBACK_EDGE = { stroke: '#5b6b8c', strokeWidth: 1.5 }

type Point = { x: number; y: number }

/** The point on `node`'s border that faces `other`, plus which side it's on, so
 * edges to a shared node fan out from distinct sides instead of stacking. */
function anchor(node: InternalNode, other: InternalNode): Point & { position: Position } {
  const w = (node.measured.width ?? 0) / 2
  const h = (node.measured.height ?? 0) / 2
  const cx = node.internals.positionAbsolute.x + w
  const cy = node.internals.positionAbsolute.y + h
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2
  const dx = ox - cx
  const dy = oy - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy, position: Position.Top }
  const horizontal = Math.abs(dx) / (w || 1) >= Math.abs(dy) / (h || 1)
  const scale = 1 / Math.max(Math.abs(dx) / (w || 1), Math.abs(dy) / (h || 1))
  const position = horizontal ? (dx >= 0 ? Position.Right : Position.Left) : dy >= 0 ? Position.Bottom : Position.Top
  return { x: cx + dx * scale, y: cy + dy * scale, position }
}

/** A floating bezier edge: anchors to the borders facing each other and curves
 * between them (recomputed live, so it follows dragging). Kind is conveyed by
 * colour/width; the relation name stays hidden until the edge is hovered ~1s. */
function FloatingEdge({ id, source, target, style, label, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const [hovered, setHovered] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  if (!sourceNode || !targetNode) return null

  const s = anchor(sourceNode, targetNode)
  const t = anchor(targetNode, sourceNode)
  const [path, lx, ly] = getBezierPath({
    sourceX: s.x,
    sourceY: s.y,
    sourcePosition: s.position,
    targetX: t.x,
    targetY: t.y,
    targetPosition: t.position
  })
  const onEnter = () => {
    timer.current = setTimeout(() => setHovered(true), 900)
  }
  const onLeave = () => {
    if (timer.current) clearTimeout(timer.current)
    setHovered(false)
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* wide invisible hit area so the thin edge is easy to hover */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ pointerEvents: 'stroke', cursor: 'help' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      {label && hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: '#1f2530',
              padding: '2px 7px',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,.25)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { routed: FloatingEdge }

/** Map laid-out edges to React Flow edges, styled by relation kind; pre-existing
 * (hydrated) relations are drawn dashed + faded to set them apart from the ones
 * the proposal creates. */
export function toReactFlowEdges(edges: PositionedEdge[]): Edge[] {
  return edges.map(e => {
    const ks = KIND_STYLE[e.label] ?? FALLBACK_EDGE
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'routed',
      style: e.preexisting ? { ...ks, strokeDasharray: '6 4', opacity: 0.6 } : ks,
      markerEnd: { type: MarkerType.ArrowClosed, color: ks.stroke }
    }
  })
}
