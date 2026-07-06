import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { EDGE_KINDS, TRACE_EDGE_KINDS } from '../domain'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'

/**
 * Operational health of the graph: how much is in it, and — the signal that
 * actually matters for retrieval — how many blocks are still unembedded (and so
 * invisible to vector_search / hybrid_search). Read-only; pure aggregation.
 */
export const collectionStatsShape = {}

export type CollectionStats = {
  raw_captures: { total: number; by_status: Record<string, number> }
  notes: { total: number; by_state: Record<string, number> }
  blocks: { total: number; embedded: number; unembedded: number; by_kind: Record<string, number> }
  /** Canonical operational relations (the Huygens 2 topology). */
  edges: Record<string, number>
  /** Technical proposal plumbing (about/affects/derived_from) — not domain topology. */
  trace_edges: Record<string, number>
  proposals: { total: number; by_status: Record<string, number> }
}

type GroupRow = { key: string | null; count: number }
type CountRow = { count: number }

/** Fold `SELECT <field> AS key, count() AS count … GROUP BY <field>` rows into a map + total. */
function distribution(rows: GroupRow[]): { total: number; by: Record<string, number> } {
  const by = Object.fromEntries(rows.map(r => [r.key ?? 'unknown', r.count]))
  const total = rows.reduce((sum, r) => sum + r.count, 0)
  return { total, by }
}

type StatsResults = [GroupRow[], GroupRow[], GroupRow[], CountRow[], GroupRow[], ...CountRow[][]]

/**
 * Pure shaping of the already-fetched query tuple into CollectionStats. The
 * positional contract is fragile: edgeRows is the rest of the tuple and lines
 * up index-for-index with EDGE_KINDS then TRACE_EDGE_KINDS because edgeSelects
 * is appended in that same order. Kept testable without a DB.
 */
function assembleCollectionStats(results: StatsResults): CollectionStats {
  const [rawRows, noteRows, blockKindRows, embeddedRows, proposalRows, ...edgeRows] = results

  const raw = distribution(rawRows)
  const note = distribution(noteRows)
  const blockKind = distribution(blockKindRows)
  const embedded = embeddedRows[0]?.count ?? 0
  const proposal = distribution(proposalRows)

  const edges = Object.fromEntries(EDGE_KINDS.map((table, i) => [table, edgeRows[i]?.[0]?.count ?? 0]))
  const trace_edges = Object.fromEntries(
    TRACE_EDGE_KINDS.map((table, i) => [table, edgeRows[EDGE_KINDS.length + i]?.[0]?.count ?? 0])
  )

  return {
    raw_captures: { total: raw.total, by_status: raw.by },
    notes: { total: note.total, by_state: note.by },
    blocks: {
      total: blockKind.total,
      embedded,
      unembedded: blockKind.total - embedded,
      by_kind: blockKind.by
    },
    edges,
    trace_edges,
    proposals: { total: proposal.total, by_status: proposal.by }
  }
}

export async function collectionStatsImpl(): Promise<CollectionStats> {
  const db = await getDb()
  const edgeSelects = [...EDGE_KINDS, ...TRACE_EDGE_KINDS]
    .map(t => `SELECT count() AS count FROM ${t} GROUP ALL`)
    .join(';\n')
  const sql = `SELECT status AS key, count() AS count FROM raw_capture GROUP BY key;
SELECT state AS key, count() AS count FROM note GROUP BY key;
SELECT block_kind AS key, count() AS count FROM block GROUP BY key;
SELECT count() AS count FROM block WHERE embedding != NONE GROUP ALL;
SELECT status AS key, count() AS count FROM proposal GROUP BY key;
${edgeSelects}`

  const results = await db.query<StatsResults>(sql)
  return assembleCollectionStats(results)
}

function summarize(s: CollectionStats): string {
  const edgeTotal = Object.values(s.edges).reduce((a, b) => a + b, 0)
  const coverage = s.blocks.total > 0 ? Math.round((s.blocks.embedded / s.blocks.total) * 100) : 100
  return [
    `raw_captures: ${s.raw_captures.total}  ${JSON.stringify(s.raw_captures.by_status)}`,
    `notes: ${s.notes.total}  ${JSON.stringify(s.notes.by_state)}`,
    `blocks: ${s.blocks.total} (embedded ${s.blocks.embedded}, unembedded ${s.blocks.unembedded} — ${coverage}% indexed)`,
    `edges: ${edgeTotal}  ${JSON.stringify(s.edges)}`,
    `trace edges: ${JSON.stringify(s.trace_edges)}`,
    `proposals: ${s.proposals.total}  ${JSON.stringify(s.proposals.by_status)}`
  ].join('\n')
}

export function registerCollectionStats(server: McpServer): void {
  defineTool(
    server,
    'collection_stats',
    'Operational health of the graph: counts of raw_captures (by status), notes (by state), blocks (total + how many are embedded vs unembedded), operational edges per kind (technical trace edges reported separately), and proposals (by status). The unembedded count is the key signal — those blocks are invisible to vector_search/hybrid_search until index_block runs. Read-only.',
    collectionStatsShape,
    async () => {
      const stats = await collectionStatsImpl()
      return {
        content: [
          { type: 'text', text: summarize(stats) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(stats, null, 2)}` }
        ]
      }
    }
  )
}
