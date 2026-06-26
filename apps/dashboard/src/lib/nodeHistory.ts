import type { LaidOutGraph } from './layout'
import { changeHistoryForNotes } from './surreal'

export async function withNodeChangeHistory(laidOut: LaidOutGraph): Promise<LaidOutGraph> {
  const noteIds = laidOut.nodes.map(n => n.id).filter(id => id.startsWith('note:'))
  const histories = await changeHistoryForNotes([...new Set(noteIds)])
  return {
    ...laidOut,
    nodes: laidOut.nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        changeHistory: histories[n.id] ?? []
      }
    }))
  }
}
