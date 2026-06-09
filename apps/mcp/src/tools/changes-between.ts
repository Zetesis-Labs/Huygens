import { type FlowGraph, type FuseItem, fuseProposals } from '@huygens/graph'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { idStr, type RecordIdish } from './graph-records'
import type { StoredProposalPayload } from './proposal/schemas'

function plural(n: number, singular: string, suffix = 's'): string {
  return `${singular}${n === 1 ? '' : suffix}`
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v)
}

/** Date-only bounds expand to the whole UTC day; full datetimes pass through. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
function startBound(s: string): string {
  return DATE_ONLY.test(s) ? `${s}T00:00:00.000Z` : new Date(s).toISOString()
}
function endBound(s: string): string {
  return DATE_ONLY.test(s) ? `${s}T23:59:59.999Z` : new Date(s).toISOString()
}

/** One committed proposal, reduced to what the aggregation fuses over. */
export type CommittedInput = {
  id: string
  landedAt: string
  payload: StoredProposalPayload
  /** temp note id → the real `note:` id the commit produced. */
  tempMap: Record<string, string>
}

export type Aggregate = {
  from: string
  to: string
  proposalCount: number
  raws: number
  /** The fused change graph (shared with the dashboard via @huygens/graph). */
  graph: FlowGraph
  /** real note id → how many proposals updated it in the window. */
  updatedCounts: Record<string, number>
  byDay: { day: string; proposals: number; creates: number; updates: number; edges: number }[]
}

/**
 * Fuse every committed proposal whose commit `landedAt` falls in [from, to] into
 * one aggregate. The topology is built by the shared `fuseProposals` (same merge
 * the dashboard uses); the per-day tally, raw count and "touched by N proposals"
 * map are reductions over the windowed proposals. Pure.
 */
type DayTally = { proposals: number; creates: number; updates: number; edges: number }

/** Sum one day's proposals into a single tally. Pure. */
function tallyForDay(proposals: CommittedInput[]): DayTally {
  return proposals.reduce(
    (tally, p) => ({
      proposals: tally.proposals + 1,
      creates: tally.creates + p.payload.note_creates.length,
      updates: tally.updates + p.payload.note_updates.length,
      edges: tally.edges + p.payload.edges.length
    }),
    { proposals: 0, creates: 0, updates: 0, edges: 0 }
  )
}

export function aggregateChanges(proposals: CommittedInput[], from: string, to: string): Aggregate {
  const inWindow = proposals
    .filter(p => p.landedAt >= from && p.landedAt <= to)
    .sort((a, b) => a.landedAt.localeCompare(b.landedAt))

  const items: FuseItem[] = inWindow.map(p => ({ payload: p.payload, tempMap: p.tempMap }))

  const raws = inWindow.reduce((sum, p) => sum + p.payload.raw_ids.length, 0)

  // Local accumulator mutation (not spread-per-item, which is O(n²)); the
  // result object is still freshly built and never escapes mid-fold.
  const updatedCounts = inWindow
    .flatMap(p => p.payload.note_updates)
    .reduce<Record<string, number>>((acc, n) => {
      const id = idStr(n.id as RecordIdish)
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})

  const dayGroups = inWindow.reduce<Record<string, CommittedInput[]>>((acc, p) => {
    const day = p.landedAt.slice(0, 10)
    const group = acc[day] ?? []
    group.push(p)
    acc[day] = group
    return acc
  }, {})
  const byDay = Object.entries(dayGroups)
    .map(([day, dayProposals]) => ({ day, ...tallyForDay(dayProposals) }))
    .sort((a, b) => b.day.localeCompare(a.day))

  return {
    from,
    to,
    proposalCount: inWindow.length,
    raws,
    graph: fuseProposals(items),
    updatedCounts,
    byDay
  }
}

/** Deterministic, human-readable rendering of an aggregate. Pure. */
export function renderAggregate(agg: Aggregate): string {
  const { graph } = agg
  const created = graph.nodes.filter(n => n.data.status === 'created')
  const updated = graph.nodes.filter(n => n.data.status === 'updated')
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  // Created/updated notes show their title; bare context endpoints fall back to id.
  const labelFor = (id: string): string => {
    const n = byId.get(id)
    return n && n.data.status !== 'context' ? `"${n.data.title}"` : id
  }

  const dayCount = agg.byDay.length
  const summarySection = [
    `Aggregated changes ${agg.from} → ${agg.to} (UTC)`,
    agg.proposalCount === 0
      ? 'Nothing committed in this window.'
      : `${agg.proposalCount} ${plural(agg.proposalCount, 'proposal')} committed across ${dayCount} ${plural(dayCount, 'day')} · ` +
        `+${created.length} notes · ${updated.length} updated · ${graph.edges.length} edges · ${agg.raws} raw`
  ]

  const createdSection =
    created.length > 0
      ? [
          `CREATE ${created.length} ${plural(created.length, 'note')}:`,
          ...created.map(n => {
            const attrs = n.data.lines.length > 0 ? ` · ${n.data.lines.join(' · ')}` : ''
            return `  • "${n.data.title}"  ${n.data.type}${attrs}`
          })
        ]
      : null

  const updatedSection =
    updated.length > 0
      ? [
          `UPDATE ${updated.length} ${plural(updated.length, 'note')}:`,
          ...updated.map(n => {
            const count = agg.updatedCounts[n.id] ?? 1
            const times = count > 1 ? `  (${count} proposals)` : ''
            return `  • ${n.id}${times}`
          })
        ]
      : null

  const topologySection =
    graph.edges.length > 0
      ? [
          `Topology (${graph.edges.length} ${plural(graph.edges.length, 'edge')}):`,
          ...graph.edges.map(e => `  • ${labelFor(e.source)} —${e.label}→ ${labelFor(e.target)}`)
        ]
      : null

  const byDaySection =
    agg.byDay.length > 0
      ? [
          'By day:',
          ...agg.byDay.map(
            d =>
              `  • ${d.day}  ${d.proposals} ${plural(d.proposals, 'proposal')} · +${d.creates} notes · ${d.updates} upd · ${d.edges} edges`
          )
        ]
      : null

  return [summarySection, createdSection, updatedSection, topologySection, byDaySection]
    .filter((s): s is string[] => s !== null)
    .map(s => s.join('\n'))
    .join('\n\n')
}

/** One row of the committed-proposal query. */
type CommittedRow = {
  id: unknown
  payload: StoredProposalPayload
  result?: { committed_at?: unknown; temp_ids?: { notes?: Record<string, RecordIdish> } } | null
  updated_at: unknown
}

/** temp note id → real `note:` id, with every value normalized to a string. Pure. */
function normalizeTempMap(notes: Record<string, RecordIdish>): Record<string, string> {
  return Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, idStr(v)]))
}

/** A committed-proposal row reduced to what the aggregation fuses over. Pure. */
function toCommittedInput(row: CommittedRow): CommittedInput {
  const committedAt = row.result?.committed_at
  return {
    id: String(row.id),
    // `committed_at` is absent on pre-result commits → coalesce to `updated_at`.
    landedAt: committedAt != null ? toIso(committedAt) : toIso(row.updated_at),
    payload: row.payload,
    tempMap: normalizeTempMap(row.result?.temp_ids?.notes ?? {})
  }
}

/** Every committed proposal, reduced for aggregation. Read-only. */
async function fetchCommitted(from: string, to: string): Promise<CommittedInput[]> {
  const db = await getDb()
  // The window is filtered in SurrealDB so only in-range payloads cross the wire.
  const [rows] = await db.query<[CommittedRow[]]>(
    `SELECT meta::id(id) AS id, payload, result, updated_at
     FROM proposal
     WHERE status = 'committed'
       AND (result.committed_at ?? updated_at) >= type::datetime($from)
       AND (result.committed_at ?? updated_at) <= type::datetime($to)`,
    { from, to }
  )
  return (rows ?? []).map(toCommittedInput)
}

const shape = {
  from: z
    .string()
    .describe('Start of the window, inclusive. ISO date (YYYY-MM-DD, whole UTC day) or full ISO datetime.'),
  to: z.string().describe('End of the window, inclusive. ISO date (YYYY-MM-DD, whole UTC day) or full ISO datetime.')
}

export function registerChangesBetween(server: McpServer): void {
  defineTool(
    server,
    'changes_between',
    'Aggregated change graph of everything committed between two dates. Fuses all committed ' +
      'proposals whose commit landed in [from, to] into one view — notes created/updated, the ' +
      'note↔note topology (temp ids resolved to the real notes the commits produced), plus a ' +
      'per-day tally. Read-only.',
    shape,
    async ({ from, to }) => {
      const lo = startBound(from)
      const hi = endBound(to)
      const committed = await fetchCommitted(lo, hi)
      const agg = aggregateChanges(committed, lo, hi)
      return { content: [{ type: 'text', text: renderAggregate(agg) }] }
    }
  )
}
