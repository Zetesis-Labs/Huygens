import { HttpAgent } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  makeAssistantToolUI,
  ThreadPrimitive,
  useThreadRuntime
} from '@assistant-ui/react'
import { useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toolResultToFlow, VIEW_TOOLS } from '../../lib/agentViews'
import type { FlowGraph } from '../../lib/graph'
import type { LaidOutGraph } from '../../lib/layout'
import ChangeGraph from '../ChangeGraph'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard chat: a collapsible chat side panel (assistant-ui over AG-UI) and
// a main canvas that shows the active graph view. Each exploration tool the
// agent runs becomes a selectable view; the canvas renders the active one.
// ─────────────────────────────────────────────────────────────────────────

type View = { id: string; tool: string; label: string; graph: FlowGraph }
type ViewStore = {
  views: View[]
  activeId: string | null
  active: View | null
  addView: (v: Omit<View, 'id'>) => void
  setActive: (id: string) => void
}
const ViewCtx = createContext<ViewStore | null>(null)

function useViewStore(): ViewStore {
  const c = useContext(ViewCtx)
  if (!c) throw new Error('useViewStore used outside ViewStoreProvider')
  return c
}

function ViewStoreProvider({ children }: { children: React.ReactNode }) {
  const [views, setViews] = useState<View[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const addView = useCallback((v: Omit<View, 'id'>) => {
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setViews(prev => [...prev, { ...v, id }])
    setActiveId(id)
  }, [])
  const setActive = useCallback((id: string) => setActiveId(id), [])
  const active = views.find(v => v.id === activeId) ?? null
  const value = useMemo<ViewStore>(
    () => ({ views, activeId, active, addView, setActive }),
    [views, activeId, active, addView, setActive]
  )
  return <ViewCtx.Provider value={value}>{children}</ViewCtx.Provider>
}

// One tool-UI per exploration tool: when the result lands, adapt it to a graph,
// register it as a view, and show a compact chip in the thread instead of raw JSON.
function ToolChip({ tool, result }: { tool: string; result: unknown }) {
  const { addView } = useViewStore()
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (result == null) return
    const graph = toolResultToFlow(tool, result)
    if (graph && graph.nodes.length > 0) {
      setCount(graph.nodes.length)
      addView({ tool, label: `${tool} · ${graph.nodes.length} nodos`, graph })
    }
  }, [tool, result, addView])
  return (
    <div className="tool-chip">
      🔎 {tool}
      {count != null ? ` · ${count} nodos → canvas` : '…'}
    </div>
  )
}

const viewToolUIs = VIEW_TOOLS.map(tool => ({
  tool,
  UI: makeAssistantToolUI({
    toolName: tool,
    render: ({ result }) => <ToolChip tool={tool} result={result} />
  })
}))

function Canvas() {
  const { active } = useViewStore()
  const [laid, setLaid] = useState<LaidOutGraph | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setLaid(null)
      return
    }
    let cancelled = false
    setError(null)
    setLaid(null)
    fetch('/api/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(active.graph)
    })
      .then(r => (r.ok ? (r.json() as Promise<LaidOutGraph>) : r.text().then(t => Promise.reject(new Error(t)))))
      .then(g => {
        if (!cancelled) setLaid(g)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [active])

  if (!active)
    return <div className="canvas-msg">El agente aún no ha generado vistas. Pídele que explore tu grafo.</div>
  if (error) return <div className="canvas-msg err">layout: {error}</div>
  if (!laid) return <div className="canvas-msg">Calculando layout…</div>
  return <ChangeGraph nodes={laid.nodes} edges={laid.edges} />
}

function ViewSelector() {
  const { views, activeId, setActive } = useViewStore()
  if (views.length === 0) return null
  return (
    <div className="view-selector">
      {views.map(v => (
        <button key={v.id} type="button" className={v.id === activeId ? 'on' : ''} onClick={() => setActive(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  )
}

function UserMessage() {
  return (
    <div className="msg user">
      <MessagePrimitive.Content />
    </div>
  )
}
function AssistantMessage() {
  return (
    <div className="msg assistant">
      <MessagePrimitive.Content />
    </div>
  )
}

function SaveBar() {
  const { views, activeId } = useViewStore()
  const threadRuntime = useThreadRuntime()
  const [status, setStatus] = useState<string | null>(null)

  const save = useCallback(async () => {
    setStatus('Guardando…')
    let messages: unknown[] = []
    try {
      messages = threadRuntime.export().messages as unknown[]
    } catch {
      messages = []
    }
    try {
      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages,
          state: { activeId, views: views.map(v => ({ tool: v.tool, label: v.label })) }
        })
      })
      setStatus(res.ok ? 'Guardada' : `Error ${res.status}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error')
    }
  }, [threadRuntime, views, activeId])

  return (
    <div className="save-bar">
      <button type="button" onClick={save}>
        Guardar conversación
      </button>
      {status && <span className="save-status">{status}</span>}
    </div>
  )
}

function ChatThread() {
  return (
    <ThreadPrimitive.Root className="thread">
      <ThreadPrimitive.Viewport className="thread-viewport">
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>
      <SaveBar />
      <ComposerPrimitive.Root className="composer">
        <ComposerPrimitive.Input className="composer-input" placeholder="Escribe a Huygens…" autoFocus />
        <ComposerPrimitive.Send className="composer-send">Enviar</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}

export default function ChatApp() {
  const agent = useMemo(() => new HttpAgent({ url: '/api/agui' }), [])
  const runtime = useAgUiRuntime({ agent })
  const [collapsed, setCollapsed] = useState(false)

  return (
    <ViewStoreProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        {viewToolUIs.map(({ tool, UI }) => (
          <UI key={tool} />
        ))}
        <div className={`chat-layout${collapsed ? ' collapsed' : ''}`}>
          <main className="chat-canvas">
            <ViewSelector />
            <Canvas />
          </main>
          <button
            type="button"
            className="chat-toggle"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Abrir chat' : 'Plegar chat'}
          >
            {collapsed ? '‹' : '›'}
          </button>
          {!collapsed && (
            <aside className="chat-side">
              <ChatThread />
            </aside>
          )}
        </div>
      </AssistantRuntimeProvider>
    </ViewStoreProvider>
  )
}
