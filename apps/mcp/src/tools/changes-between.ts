import { type FlowGraph, type FuseItem, fuseProposals } from '@huygens/graph'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { idStr, type RecordIdish } from './graph-records'
import type { ProposalPayload } from './proposal/schemas'

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
  payload: ProposalPayload
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
export function aggregateChanges(proposals: CommittedInput[], from: string, to: string): Aggregate {
  const inWindow = proposals
    .filter(p => p.landedAt >= from && p.landedAt <= to)
    .sort((a, b) => a.landedAt.localeCompare(b.landedAt))

  const items: FuseItem[] = []
  const updatedCounts: Record<string, number> = {}
  const byDay = new Map<string, { proposals: number; creates: number; updates: number; edges: number }>()
  let raws = 0

  for (const p of inWindow) {
    items.push({ payload: p.payload, tempMap: p.tempMap })

    const day = p.landedAt.slice(0, 10)
    const bucket = byDay.get(day) ?? { proposals: 0, creates: 0, updates: 0, edges: 0 }
    bucket.proposals++
    bucket.creates += p.payload.note_creates.length
    bucket.updates += p.payload.note_updates.length
    bucket.edges += p.payload.edges.length
    byDay.set(day, bucket)
    raws += p.payload.raw_ids.length

    for (const n of p.payload.note_updates) {
      const id = idStr(n.id as RecordIdish)
      updatedCounts[id] = (updatedCounts[id] ?? 0) + 1
    }
  }

  return {
    from,
    to,
    proposalCount: inWindow.length,
    raws,
    graph: fuseProposals(items),
    updatedCounts,
    byDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => b.day.localeCompare(a.day))
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

  const sections: string[][] = []

  const dayCount = agg.byDay.length
  sections.push([
    `Aggregated changes ${agg.from} → ${agg.to} (UTC)`,
    agg.proposalCount === 0
      ? 'Nothing committed in this window.'
      : `${agg.proposalCount} ${plural(agg.proposalCount, 'proposal')} committed across ${dayCount} ${plural(dayCount, 'day')} · ` +
        `+${created.length} notes · ${updated.length} updated · ${graph.edges.length} edges · ${agg.raws} raw`
  ])

  if (created.length > 0) {
    const lines = [`CREATE ${created.length} ${plural(created.length, 'note')}:`]
    for (const n of created) {
      const attrs = n.data.lines.length > 0 ? ` · ${n.data.lines.join(' · ')}` : ''
      lines.push(`  • "${n.data.title}"  ${n.data.type}${attrs}`)
    }
    sections.push(lines)
  }
  if (updated.length > 0) {
    const lines = [`UPDATE ${updated.length} ${plural(updated.length, 'note')}:`]
    for (const n of updated) {
      const count = agg.updatedCounts[n.id] ?? 1
      const times = count > 1 ? `  (${count} proposals)` : ''
      lines.push(`  • ${n.id}${times}`)
    }
    sections.push(lines)
  }
  if (graph.edges.length > 0) {
    const lines = [`Topology (${graph.edges.length} ${plural(graph.edges.length, 'edge')}):`]
    for (const e of graph.edges) lines.push(`  • ${labelFor(e.source)} —${e.label}→ ${labelFor(e.target)}`)
    sections.push(lines)
  }
  if (agg.byDay.length > 0) {
    const lines = ['By day:']
    for (const d of agg.byDay) {
      lines.push(
        `  • ${d.day}  ${d.proposals} ${plural(d.proposals, 'proposal')} · +${d.creates} notes · ${d.updates} upd · ${d.edges} edges`
      )
    }
    sections.push(lines)
  }

  return sections.map(s => s.join('\n')).join('\n\n')
}

/** Every committed proposal, reduced for aggregation. Read-only. */
async function fetchCommitted(from: string, to: string): Promise<CommittedInput[]> {
  const db = await getDb()
  // The window is filtered in SurrealDB so only in-range payloads cross the wire.
  // `committed_at` is absent on pre-result commits → coalesce to `updated_at`.
  const [rows] = await db.query<
    [
      Array<{
        id: unknown
        payload: ProposalPayload
        result?: { committed_at?: unknown; temp_ids?: { notes?: Record<string, RecordIdish> } } | null
        updated_at: unknown
      }>
    ]
  >(
    `SELECT meta::id(id) AS id, payload, result, updated_at
     FROM proposal
     WHERE status = 'committed'
       AND (result.committed_at ?? updated_at) >= type::datetime($from)
       AND (result.committed_at ?? updated_at) <= type::datetime($to)`,
    { from, to }
  )
  return (rows ?? []).map(r => {
    const ca = r.result?.committed_at
    const notes = r.result?.temp_ids?.notes ?? {}
    const tempMap: Record<string, string> = {}
    for (const [k, v] of Object.entries(notes)) tempMap[k] = idStr(v)
    return {
      id: String(r.id),
      landedAt: ca != null ? toIso(ca) : toIso(r.updated_at),
      payload: r.payload,
      tempMap
    }
  })
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
