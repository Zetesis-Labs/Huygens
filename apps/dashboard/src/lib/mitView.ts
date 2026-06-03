import type { FlowEdge, FlowGraph, FlowNode } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import { existingEdgesAmong, listMits, type MitRow, relatedNoteIds, resolveNoteCards } from './surreal'

export type MitView = {
  date: string
  laidOut: LaidOutGraph
  /** The MITs themselves, for the informe panel. */
  mits: MitRow[]
}

/**
 * The MITs view as a live graph: today's MITs (focus) surrounded by their context
 * — the `part_of` ancestry (project → area → objetivo) and their open blockers.
 * MIT nodes are flagged so the canvas renders them as the focus (🎯, solid); the
 * context nodes are plain (dimmed / DONE-styled by CardNode). Edges are the real
 * relations among the set. Null if there are no MITs for the day.
 */
export async function buildMitView(todayMadrid: string): Promise<MitView | null> {
  const mits = (await listMits()).filter(m => m.day === todayMadrid)
  if (mits.length === 0) return null

  const mitIds = mits.map(m => `note:${m.id}`)
  const related = await relatedNoteIds(mitIds)
  const nodeIds = [...new Set([...mitIds, ...related])]
  const cards = await resolveNoteCards(nodeIds)
  const mitSet = new Set(mitIds)

  const nodes: FlowNode[] = nodeIds.map(id => {
    const c = cards[id]
    return {
      id,
      data: {
        title: c?.title ?? id,
        type: c?.type ?? '?',
        status: 'context',
        state: c?.state,
        mit: mitSet.has(id),
        lines: [],
        descriptives: []
      }
    }
  })

  const edges: FlowEdge[] = (await existingEdgesAmong(nodeIds)).map((e, i) => ({
    id: `${e.source}->${e.target}:${e.kind}:${i}`,
    source: e.source,
    target: e.target,
    label: e.kind
  }))

  const flow: FlowGraph = { nodes, edges }
  return { date: todayMadrid, laidOut: await layoutGraph(flow), mits }
}
