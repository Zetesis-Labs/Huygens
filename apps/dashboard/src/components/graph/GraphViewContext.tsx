import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

/** Visibility state for the change graph, driven by the legend toggles and read
 * by the canvas to hide/show nodes and edges. */
type GraphView = {
  /** Whether pre-existing (hydrated) relations are shown. */
  showHydrated: boolean
  /** Note types currently toggled off. */
  hiddenTypes: ReadonlySet<string>
  /** Relation kinds currently toggled off. */
  hiddenKinds: ReadonlySet<string>
  toggleHydrated: () => void
  toggleType: (type: string) => void
  toggleKind: (kind: string) => void
}

const GraphViewCtx = createContext<GraphView | null>(null)

function toggled(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function GraphViewProvider({ children }: { children: ReactNode }) {
  const [showHydrated, setShowHydrated] = useState(true)
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(() => new Set())
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(() => new Set())

  const value = useMemo<GraphView>(
    () => ({
      showHydrated,
      hiddenTypes,
      hiddenKinds,
      toggleHydrated: () => setShowHydrated(v => !v),
      toggleType: type => setHiddenTypes(prev => toggled(prev, type)),
      toggleKind: kind => setHiddenKinds(prev => toggled(prev, kind))
    }),
    [showHydrated, hiddenTypes, hiddenKinds]
  )

  return <GraphViewCtx.Provider value={value}>{children}</GraphViewCtx.Provider>
}

export function useGraphView(): GraphView {
  const ctx = useContext(GraphViewCtx)
  if (!ctx) throw new Error('useGraphView must be used within a GraphViewProvider')
  return ctx
}
