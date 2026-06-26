import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChangeHistoryItem, FlowNodeData } from '../../lib/graph'
import HistoryGraph from './HistoryGraph'

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
.history > summary { cursor: pointer; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
.history-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.history-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border: 1px solid #e6e8eb; border-radius: 8px; color: inherit; text-decoration: none; background: #fff; cursor: pointer; font: inherit; }
.history-item:hover { border-color: #cdd6f6; background: #f7f9ff; }
.history-item.is-selected { border-color: #2f54eb; background: #eef2ff; box-shadow: 0 0 0 1px #2f54eb inset; }
.history-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.history-action { font-size: 11px; font-weight: 700; color: #2f54eb; text-transform: uppercase; letter-spacing: .03em; }
.history-status { font-size: 10px; font-weight: 700; color: #fff; background: #5b6b8c; border-radius: 999px; padding: 1px 7px; }
.history-at { margin-left: auto; font-size: 11px; color: #9aa3b2; white-space: nowrap; }
.history-title { font-size: 13px; font-weight: 600; color: #2a3346; margin-bottom: 3px; }
.history-summary { font-size: 12px; color: #5b6b8c; line-height: 1.45; }
.detail-empty { display: flex; height: 100%; align-items: center; justify-content: center; text-align: center; color: #9aa3b2; font-size: 13px; padding: 24px; }
.detail-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; }
.detail-graph { flex: 1; min-height: 0; border: 1px dashed #cdd6f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #9aa3b2; font-size: 13px; background: #fafbff; }
`

function formatHistoryDate(value: string | null): string {
  if (!value) return 'sin fecha'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/** The right-hand detail pane: shows the historical change selected in the left
 * column. The graph of that change will be mounted here (reusing the React Flow
 * canvas); for now it scaffolds the meta + a placeholder + a link to the full
 * proposal view. */
function HistoryDetail({ item, nodeId }: { item: ChangeHistoryItem | null; nodeId: string }) {
  if (!item) {
    return <div className="detail-empty">Selecciona un cambio del historial para ver su grafo.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div>
        <div className="detail-meta">
          <span className="history-action">{item.action}</span>
          <span className="history-status">{item.status}</span>
          <span className="history-at">{formatHistoryDate(item.at)}</span>
        </div>
        <strong style={{ fontSize: 15 }}>{item.title}</strong>
        {item.summary && (
          <div className="history-summary" style={{ marginTop: 4 }}>
            {item.summary}
          </div>
        )}
      </div>
      <HistoryGraph key={item.proposalId} proposalId={item.proposalId} />
      <a
        href={`/?proposal=${encodeURIComponent(item.proposalId)}&node=${encodeURIComponent(nodeId)}`}
        style={{ fontSize: 12, color: '#2f54eb', textDecoration: 'none' }}
      >
        Abrir esta propuesta en el grafo completo →
      </a>
    </div>
  )
}

/** Overlay rendering a node's descriptive blocks as markdown, one after another.
 * Maximised to the full viewport so a detail pane can host the historical graph.
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
  const history = node.changeHistory ?? []
  const [selected, setSelected] = useState<ChangeHistoryItem | null>(null)

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
        zIndex: 1000
      }}
    >
      <style>{MD_CSS}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          width: '100%',
          height: '100%',
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

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left column: descriptive content + change history (selectable). */}
          <div
            style={{
              flex: '0 0 clamp(360px, 38%, 560px)',
              padding: '16px 20px',
              overflow: 'auto',
              borderRight: '1px solid #eef0f2'
            }}
          >
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
              <details className="history" open>
                <summary>Historial de cambios ({history.length})</summary>
                <div className="history-list">
                  {history.map(item => {
                    const key = `${item.proposalId}-${item.action}-${item.at ?? ''}`
                    const isSelected =
                      selected?.proposalId === item.proposalId &&
                      selected?.action === item.action &&
                      selected?.at === item.at
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`history-item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelected(item)}
                      >
                        <div className="history-top">
                          <span className="history-action">{item.action}</span>
                          <span className="history-status">{item.status}</span>
                          <span className="history-at">{formatHistoryDate(item.at)}</span>
                        </div>
                        <div className="history-title">{item.title}</div>
                        {item.summary && <div className="history-summary">{item.summary}</div>}
                      </button>
                    )
                  })}
                </div>
              </details>
            )}
          </div>

          {/* Right column: detail of the selected historical change. */}
          <div style={{ flex: 1, minWidth: 0, padding: '16px 20px', overflow: 'auto' }}>
            <HistoryDetail item={selected} nodeId={nodeId} />
          </div>
        </div>
      </div>
    </div>
  )
}
