import { Handle, type NodeProps, Position } from '@xyflow/react'
import {
  Bookmark,
  Compass,
  FileText,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListTodo,
  type LucideIcon,
  Repeat,
  Square,
  Target,
  User
} from 'lucide-react'
import type { FlowNodeData } from '../../lib/graph'

// Icon + colour by note type (the node's identity). Border style encodes
// provenance: solid = the proposal creates/updates it, dashed = pre-existing
// context only linked by an edge.
const TYPE_STYLE: Record<string, { Icon: LucideIcon; color: string; bg: string }> = {
  task: { Icon: ListTodo, color: '#2563eb', bg: '#eaf1fe' },
  project: { Icon: FolderKanban, color: '#7c3aed', bg: '#f1eafe' },
  area: { Icon: Compass, color: '#0d9488', bg: '#e6f7f4' },
  routine: { Icon: Repeat, color: '#d97706', bg: '#fdf0e3' },
  idea: { Icon: Lightbulb, color: '#ca8a04', bg: '#fdf8e3' },
  reference: { Icon: Bookmark, color: '#475569', bg: '#eef1f5' },
  person: { Icon: User, color: '#db2777', bg: '#fceaf3' },
  objetivo: { Icon: Target, color: '#dc2626', bg: '#fdeaea' },
  raw: { Icon: Inbox, color: '#5b6b8c', bg: '#f0f2f5' },
  block: { Icon: FileText, color: '#5b6b8c', bg: '#f0f2f5' },
  _: { Icon: Square, color: '#5b6b8c', bg: '#f4f4f6' }
}

/** A note/context card: type icon (corner chip), provenance badge + border,
 * change lines, and a footer hinting at descriptive blocks when present. */
function CardNode({ data }: NodeProps) {
  const d = data as FlowNodeData
  const t = TYPE_STYLE[d.type] ?? TYPE_STYLE._
  const Icon = t.Icon
  const dashed = d.status === 'context'
  const hasDesc = d.descriptives.length > 0
  const badge = d.status === 'created' ? 'nuevo' : d.status === 'updated' ? 'editado' : null
  return (
    <div
      style={{
        position: 'relative',
        background: t.bg,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${t.color}`,
        borderRadius: 10,
        padding: '16px 13px 11px',
        width: 240,
        boxSizing: 'border-box',
        fontSize: 12,
        color: '#1f2530',
        cursor: hasDesc ? 'pointer' : 'default',
        boxShadow: dashed ? 'none' : '0 1px 4px rgba(0,0,0,.12)',
        // context nodes (referenced but not changed by the proposal) are dimmed
        // so the actual creates/updates stand out
        opacity: dashed ? 0.6 : 1
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
            background: t.color,
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
