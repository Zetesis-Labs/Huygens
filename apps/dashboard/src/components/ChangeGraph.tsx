import { Background, Controls, type Edge, Handle, type Node, type NodeProps, Position, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlowNodeData } from '../lib/graph'
import type { LaidOutGraph } from '../lib/layout'

// Icon + colour by note type (the node's identity). Border style encodes
// provenance (see CardNode): solid = the proposal creates/updates it, dashed =
// pre-existing context only linked by an edge.
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

const MD_CSS = `
.md { font-size: 14px; line-height: 1.6; color: #1f2530; }
.md > :first-child { margin-top: 0; }
.md h1, .md h2, .md h3 { line-height: 1.3; margin: 1em 0 .4em; }
.md h1 { font-size: 18px; } .md h2 { font-size: 16px; } .md h3 { font-size: 14px; }
.md p { margin: .5em 0; }
.md ul, .md ol { margin: .5em 0; padding-left: 1.4em; }
.md code { background: #f1f3f5; padding: .1em .35em; border-radius: 4px; font-size: .9em; }
.md pre { background: #f6f8fa; padding: 12px; border-radius: 8px; overflow: auto; }
.md pre code { background: none; padding: 0; }
.md blockquote { border-left: 3px solid #d7dbe0; margin: .6em 0; padding-left: .8em; color: #5b6b8c; }
.md a { color: #2f54eb; }
`

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
        boxShadow: dashed ? 'none' : '0 1px 4px rgba(0,0,0,.12)'
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

const nodeTypes = { card: CardNode }
const edgeStyle = { stroke: '#2f54eb' }
const labelStyle = { fontSize: 11, fill: '#5b6b8c' }

// Nodes arrive already positioned (server-side dagre). Clicking a node that has
// descriptive blocks opens a modal rendering their markdown, one after another.
export default function ChangeGraph({ nodes, edges }: LaidOutGraph) {
  const [modal, setModal] = useState<FlowNodeData | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rfNodes = nodes as unknown as Node[]
  const rfEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: edgeStyle,
    labelStyle
  }))

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        defaultNodes={rfNodes}
        defaultEdges={rfEdges}
        nodeTypes={nodeTypes}
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

      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,20,30,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24
          }}
        >
          <style>{MD_CSS}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 'min(680px, 100%)',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 40px rgba(0,0,0,.25)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid #eef0f2'
              }}
            >
              <strong style={{ fontSize: 14 }}>{modal.title}</strong>
              <button
                type="button"
                onClick={() => setModal(null)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflow: 'auto' }}>
              {modal.descriptives.map((md, i) => (
                <div key={md}>
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
                  </div>
                  {i < modal.descriptives.length - 1 && (
                    <hr style={{ border: 0, borderTop: '1px solid #eef0f2', margin: '16px 0' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
