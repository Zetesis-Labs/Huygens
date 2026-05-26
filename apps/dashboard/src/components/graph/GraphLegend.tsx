import { Panel } from '@xyflow/react'
import { type ReactNode, useState } from 'react'
import type { LaidOutGraph } from '../../lib/layout'
import { useGraphView } from './GraphViewContext'
import { FALLBACK_EDGE, KIND_LABEL, KIND_STYLE, TYPE_LABEL, TYPE_STYLE } from './styles'

/** Distinct values in `items`, preserving first-seen order. */
function distinct(items: string[]): string[] {
  return [...new Set(items)]
}

/** Interactive legend: documents the node/edge encoding and lets each type,
 * each relation kind and the hydrated relations be toggled on/off. Lives in a
 * React Flow panel so it floats over the canvas; collapsible to stay out of the
 * way. State is shared through GraphViewContext. */
export default function GraphLegend({ nodes, edges }: LaidOutGraph) {
  const { hiddenTypes, hiddenKinds, showHydrated, toggleType, toggleKind, toggleHydrated } = useGraphView()
  const [collapsed, setCollapsed] = useState(false)

  const types = distinct(nodes.map(n => n.data.type))
  const kinds = distinct(edges.map(e => e.label))
  const hasHydrated = edges.some(e => e.preexisting)

  return (
    <Panel position="bottom-right">
      <div
        style={{
          background: 'rgba(255,255,255,.95)',
          border: '1px solid #e6e8eb',
          borderRadius: 10,
          boxShadow: '0 2px 10px rgba(0,0,0,.08)',
          fontSize: 12,
          color: '#1f2530',
          width: 196,
          overflow: 'hidden'
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: '#6b7280'
          }}
        >
          Leyenda <span style={{ fontSize: 10 }}>{collapsed ? '▸' : '▾'}</span>
        </button>

        {!collapsed && (
          <div style={{ padding: '0 12px 12px' }}>
            <Section title="Nodos">
              {types.map(t => {
                const s = TYPE_STYLE[t] ?? TYPE_STYLE._
                const Icon = s.Icon
                return (
                  <ToggleRow key={t} off={hiddenTypes.has(t)} onClick={() => toggleType(t)}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: s.color,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto'
                      }}
                    >
                      <Icon size={11} color="#fff" strokeWidth={2.4} />
                    </span>
                    {TYPE_LABEL[t] ?? t}
                  </ToggleRow>
                )
              })}
            </Section>

            <Section title="Relaciones">
              {kinds.map(k => {
                const s = KIND_STYLE[k] ?? FALLBACK_EDGE
                return (
                  <ToggleRow key={k} off={hiddenKinds.has(k)} onClick={() => toggleKind(k)}>
                    <span
                      style={{
                        width: 22,
                        flex: '0 0 auto',
                        borderTop: `${s.strokeWidth}px solid ${s.stroke}`
                      }}
                    />
                    {KIND_LABEL[k] ?? k}
                  </ToggleRow>
                )
              })}
            </Section>

            <Section title="Trazo">
              <Hint swatch={<Swatch dashed={false} />}>creado / editado</Hint>
              <Hint swatch={<Swatch dashed />}>contexto · preexistente</Hint>
              {hasHydrated && (
                <ToggleRow off={!showHydrated} onClick={toggleHydrated}>
                  <span style={{ fontSize: 13, flex: '0 0 auto', width: 18, textAlign: 'center' }}>
                    {showHydrated ? '☑' : '☐'}
                  </span>
                  Relaciones preexistentes
                </ToggleRow>
              )}
            </Section>
          </div>
        )}
      </div>
    </Panel>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#9aa1ad', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</div>
    </div>
  )
}

/** A clickable legend entry that dims + strikes through when toggled off. */
function ToggleRow({ off, onClick, children }: { off: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '2px 0',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 12,
        color: '#1f2530',
        opacity: off ? 0.4 : 1,
        textDecoration: off ? 'line-through' : 'none'
      }}
    >
      {children}
    </button>
  )
}

function Hint({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5b6b8c' }}>
      {swatch}
      {children}
    </div>
  )
}

function Swatch({ dashed }: { dashed: boolean }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        flex: '0 0 auto',
        border: `2px ${dashed ? 'dashed' : 'solid'} #5b6b8c`,
        opacity: dashed ? 0.6 : 1
      }}
    />
  )
}
