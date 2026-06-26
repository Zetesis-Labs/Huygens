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
.node-lines { margin: 0 0 14px; padding: 0 0 12px; border-bottom: 1px solid #eef0f2; }
.node-lines h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
.node-lines ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: #2a3346; }
.history { margin-top: 16px; padding-top: 12px; border-top: 1px solid #eef0f2; }
.history summary { cursor: pointer; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
.history-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.history-item { display: block; padding: 10px 12px; border: 1px solid #e6e8eb; border-radius: 8px; color: inherit; text-decoration: none; background: #fff; }
.history-item:hover { border-color: #cdd6f6; background: #f7f9ff; }
.history-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.history-action { font-size: 11px; font-weight: 700; color: #2f54eb; text-transform: uppercase; letter-spacing: .03em; }
.history-status { font-size: 10px; font-weight: 700; color: #fff; background: #5b6b8c; border-radius: 999px; padding: 1px 7px; }
.history-at { margin-left: auto; font-size: 11px; color: #9aa3b2; white-space: nowrap; }
.history-title { font-size: 13px; font-weight: 600; color: #2a3346; margin-bottom: 3px; }
.history-summary { font-size: 12px; color: #5b6b8c; line-height: 1.45; }
`

function formatHistoryDate(value: string | null): string {
  if (!value) return 'sin fecha'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/** Overlay rendering a node's descriptive blocks as markdown, one after another.
 * Closes on Escape or backdrop click. */
export default function DescriptiveModal({
  nodeId,
  node,
  onClose
}: {
  nodeId: string
  node: FlowNodeData
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const history = node.changeHistory ?? []

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
          {node.lines.length > 0 && (
            <section className="node-lines">
              <h3>Cambios en esta vista</h3>
              <ul>
                {node.lines.map(l => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          )}
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
          {history.length > 0 && (
            <details className="history">
              <summary>Historial de cambios ({history.length})</summary>
              <div className="history-list">
                {history.map(item => (
                  <a
                    key={`${item.proposalId}-${item.action}-${item.at ?? ''}`}
                    className="history-item"
                    href={`/?proposal=${encodeURIComponent(item.proposalId)}&node=${encodeURIComponent(nodeId)}`}
                  >
                    <div className="history-top">
                      <span className="history-action">{item.action}</span>
                      <span className="history-status">{item.status}</span>
                      <span className="history-at">{formatHistoryDate(item.at)}</span>
                    </div>
                    <div className="history-title">{item.title}</div>
                    {item.summary && <div className="history-summary">{item.summary}</div>}
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
