import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlowNodeData } from '../../lib/graph'

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

/** Overlay rendering a node's descriptive blocks as markdown, one after another.
 * Closes on Escape or backdrop click. */
export default function DescriptiveModal({ node, onClose }: { node: FlowNodeData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
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
          <strong style={{ fontSize: 14 }}>{node.title}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '16px 20px', overflow: 'auto' }}>
          {node.descriptives.map((md, i) => (
            <div key={md}>
              <div className="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
              </div>
              {i < node.descriptives.length - 1 && (
                <hr style={{ border: 0, borderTop: '1px solid #eef0f2', margin: '16px 0' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
