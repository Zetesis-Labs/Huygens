import type { FlowEdge, FlowGraph, FlowNode } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import { withNodeChangeHistory } from './nodeHistory'
import { existingEdgesAmong, listMits, type MitRow, relatedNoteIds, resolveNoteCards } from './surreal'

export type MitView = {
  date: string
  laidOut: LaidOutGraph
  /** The MITs themselves, for the informe panel. */
  mits: MitRow[]
}

const DONE_STATES = ['DONE', 'ARCHIVED']

/**
 * The MITs view as a live graph: today's MITs plus any **overdue** ones (dated
 * before today and never finished), surrounded by their context — the `part_of`
 * ancestry (project → area → objetivo) and their open blockers. MIT nodes are
 * flagged so the canvas renders them as the focus (🎯, solid); overdue MITs get
 * an amber "vencido" accent so they don't silently vanish at midnight; context
 * nodes are plain (dimmed / DONE-styled by CardNode). Edges are the real
 * relations among the set. Null if there are neither today's nor overdue MITs.
 */
export async function buildMitView(todayMadrid: string): Promise<MitView | null> {
  const all = await listMits()
  const today = all.filter(m => m.day === todayMadrid)
  // Overdue: a MIT from a past day that was never closed. It stays on the board
  // (amber) until the user does it, moves it, or drops it — that's the ZTD
  // promise. `day` is a 'YYYY-MM-DD' string, so the comparison is chronological.
  const overdue = all.filter(m => m.day < todayMadrid && !DONE_STATES.includes(m.state))
  const mits = [...overdue, ...today]
  if (mits.length === 0) return null

  const mitIds = mits.map(m => `note:${m.id}`)
  const overdueIds = new Set(overdue.map(m => `note:${m.id}`))
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
        overdue: overdueIds.has(id),
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
  return { date: todayMadrid, laidOut: await withNodeChangeHistory(await layoutGraph(flow)), mits }
}
