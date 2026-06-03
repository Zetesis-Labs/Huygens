import { type FuseItem, fuseProposals, mergeExistingEdges } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import {
  type CommittedProposal,
  existingEdgesAmong,
  listCommittedProposalRows,
  listCommittedProposalsForDay,
  type Proposal,
  resolveLabels
} from './surreal'

// Day bucketing + counting now live in SurrealDB (see surreal.ts MADRID_DAY); a
// day arrives here as a `YYYY-MM-DD` string. We only label it for display. Noon
// UTC sidesteps any midnight rounding when formatting the (already-local) date.
const labelFmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

export function dayLabel(day: string): string {
  return labelFmt.format(new Date(`${day}T12:00:00Z`))
}

export type DiaryProposal = { id: string; title: string; status: string }
export type DiaryDay = { day: string; label: string; count: number; proposals: DiaryProposal[] }

/** Days with at least one committed proposal, newest first, each with its
 * committed proposals nested — so the diary nav can drill day → proposals
 * instead of keeping a separate flat Proposals section. */
export async function listDiaryDays(): Promise<DiaryDay[]> {
  const rows = await listCommittedProposalRows()
  const byDay = new Map<string, DiaryProposal[]>()
  for (const r of rows) {
    const list = byDay.get(r.day) ?? []
    list.push({ id: r.id, title: r.title, status: r.status })
    byDay.set(r.day, list)
  }
  return [...byDay].map(([day, proposals]) => ({ day, label: dayLabel(day), count: proposals.length, proposals }))
}

function asProposal(p: CommittedProposal): Proposal {
  return { id: p.id, status: 'committed', payload: p.payload, result: null }
}

export type DayView = {
  day: string
  label: string
  laidOut: LaidOutGraph
  counts: { creates: number; updates: number; edges: number; raws: number; proposals: number }
  narratives: string[]
}

/**
 * Fuse every change that landed on `day` into a single graph (via the shared
 * `fuseProposals`): temp ids rewritten to the real notes the commits produced, so
 * a note created by one proposal and linked by another collapses to one node.
 * Pre-existing relations among the day's nodes are hydrated live (dashed) for
 * context. Returns null if nothing committed that day.
 */
export async function buildDayView(day: string): Promise<DayView | null> {
  const committed = await listCommittedProposalsForDay(day)
  if (committed.length === 0) return null

  const items: FuseItem[] = []
  let creates = 0
  let updates = 0
  let edgeCount = 0
  let raws = 0
  const narratives: string[] = []

  for (const cp of committed) {
    const labels = await resolveLabels(asProposal(cp))
    items.push({ payload: cp.payload, tempMap: cp.tempMap, labels })
    creates += cp.payload.note_creates.length
    updates += cp.payload.note_updates.length
    edgeCount += cp.payload.edges.length
    raws += cp.payload.raw_ids.length
    for (const b of cp.payload.narrative_blocks) narratives.push(b.content)
  }

  let flow = fuseProposals(items)
  const realIds = flow.nodes.map(n => n.id).filter(id => id.includes(':'))
  flow = mergeExistingEdges(flow, await existingEdgesAmong(realIds))

  return {
    day,
    label: dayLabel(day),
    laidOut: await layoutGraph(flow),
    counts: { creates, updates, edges: edgeCount, raws, proposals: committed.length },
    narratives
  }
}
