import { Handle, type NodeProps, Position } from '@xyflow/react'
import { FileText } from 'lucide-react'
import type { FlowNodeData } from '../../lib/graph'
import { TYPE_STYLE } from './styles'

/** Amber accent for an overdue MIT (border + badge). */
const OVERDUE_COLOR = '#d97706'

/** A note/context card: type icon (corner chip), provenance badge + border,
 * change lines, and a footer hinting at descriptive blocks when present. */
function CardNode({ data }: NodeProps) {
  const d = data as FlowNodeData
  const t = TYPE_STYLE[d.type] ?? TYPE_STYLE._
  const Icon = t.Icon
  const isContext = d.status === 'context'
  const done = d.state === 'DONE'
  const isMit = Boolean(d.mit)
  const overdue = isMit && Boolean(d.overdue)
  // MIT nodes are the focus of the MITs view: always solid + full opacity. Else
  // DONE notes are de-emphasized like context (dimmed) but keep a SOLID border;
  // context (referenced, unchanged) is dashed + dimmed.
  const dimmed = !isMit && (isContext || done)
  const dashed = !isMit && isContext && !done
  const hasDesc = d.descriptives.length > 0
  // Overdue MITs swap the type colour for amber on the border + badge so an
  // unfinished MIT from a past day reads as "vencido" at a glance.
  const accent = overdue ? OVERDUE_COLOR : t.color
  const badge = isMit ? (overdue ? '⏰ vencido' : '🎯 MIT') : d.status === 'created' ? 'nuevo' : d.status === 'updated' ? 'editado' : null
  return (
    <div
      style={{
        position: 'relative',
        background: t.bg,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${accent}`,
        borderRadius: 10,
        padding: '16px 13px 11px',
        width: 240,
        boxSizing: 'border-box',
        fontSize: 12,
        color: '#1f2530',
        cursor: hasDesc ? 'pointer' : 'default',
        boxShadow: dimmed ? 'none' : '0 1px 4px rgba(0,0,0,.12)',
        // context (referenced, unchanged) AND done notes are dimmed so the active
        // creates/updates stand out; done keeps the solid border (see above).
        opacity: dimmed ? 0.6 : 1
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {/* type icon: chip on the top-left corner, straddling the border */}
      <div
        style={{
          position: 'absolute',
          top: -12,
          left: -12,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: t.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,.25)'
        }}
      >
        <Icon size={13} color="#fff" strokeWidth={2.4} />
      </div>
      {/* provenance badge: top-right corner */}
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: '#fff',
            background: accent,
            borderRadius: 999,
            padding: '2px 8px',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)'
          }}
        >
          {badge}
        </div>
      )}
      <div style={{ fontWeight: 600, wordBreak: 'break-word', marginBottom: d.lines.length ? 4 : 0 }}>{d.title}</div>
      {d.lines.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
          {d.lines.map(l => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {hasDesc && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            fontWeight: 600,
            color: t.color,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <FileText size={12} /> ver {d.descriptives.length} bloque{d.descriptives.length > 1 ? 's' : ''}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export const nodeTypes = { card: CardNode }
