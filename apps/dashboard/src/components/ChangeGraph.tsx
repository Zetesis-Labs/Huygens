import type { LaidOutGraph } from '../lib/layout'
import GraphCanvas from './graph/GraphCanvas'
import { GraphViewProvider } from './graph/GraphViewContext'

/**
 * Entry point for the proposal change-graph island. Provides the shared view
 * state (legend toggles) and renders the interactive canvas.
 */
export default function ChangeGraph(graph: LaidOutGraph) {
  return (
    <GraphViewProvider>
      <GraphCanvas {...graph} />
    </GraphViewProvider>
  )
}
