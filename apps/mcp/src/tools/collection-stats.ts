import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ALL_EDGE_TABLES } from '../domain'
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
  edges: Record<string, number>
  proposals: { total: number; by_status: Record<string, number> }
}

type GroupRow = { key: string | null; count: number }
type CountRow = { count: number }

/** Fold `SELECT <field> AS key, count() AS count … GROUP BY <field>` rows into a map + total. */
function distribution(rows: GroupRow[]): { total: number; by: Record<string, number> } {
  const by: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    const key = r.key ?? 'unknown'
    by[key] = r.count
    total += r.count
  }
  return { total, by }
}

export async function collectionStatsImpl(): Promise<CollectionStats> {
  const db = await getDb()
  const edgeSelects = ALL_EDGE_TABLES.map(t => `SELECT count() AS count FROM ${t} GROUP ALL`).join(';\n')
  const sql = `SELECT status AS key, count() AS count FROM raw_capture GROUP BY key;
SELECT state AS key, count() AS count FROM note GROUP BY key;
SELECT block_kind AS key, count() AS count FROM block GROUP BY key;
SELECT count() AS count FROM block WHERE embedding != NONE GROUP ALL;
SELECT status AS key, count() AS count FROM proposal GROUP BY key;
${edgeSelects}`

  const results = await db.query<[GroupRow[], GroupRow[], GroupRow[], CountRow[], GroupRow[], ...CountRow[][]]>(sql)
  const [rawRows, noteRows, blockKindRows, embeddedRows, proposalRows, ...edgeRows] = results

  const raw = distribution(rawRows)
  const note = distribution(noteRows)
  const blockKind = distribution(blockKindRows)
  const embedded = embeddedRows[0]?.count ?? 0
  const proposal = distribution(proposalRows)

  const edges: Record<string, number> = {}
  ALL_EDGE_TABLES.forEach((table, i) => {
    edges[table] = edgeRows[i]?.[0]?.count ?? 0
  })

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
    proposals: { total: proposal.total, by_status: proposal.by }
  }
}

function summarize(s: CollectionStats): string {
  const edgeTotal = Object.values(s.edges).reduce((a, b) => a + b, 0)
  const coverage = s.blocks.total > 0 ? Math.round((s.blocks.embedded / s.blocks.total) * 100) : 100
  return [
    `raw_captures: ${s.raw_captures.total}  ${JSON.stringify(s.raw_captures.by_status)}`,
    `notes: ${s.notes.total}  ${JSON.stringify(s.notes.by_state)}`,
    `blocks: ${s.blocks.total} (embedded ${s.blocks.embedded}, unembedded ${s.blocks.unembedded} — ${coverage}% indexed)`,
    `edges: ${edgeTotal}  ${JSON.stringify(s.edges)}`,
    `proposals: ${s.proposals.total}  ${JSON.stringify(s.proposals.by_status)}`
  ].join('\n')
}

export function registerCollectionStats(server: McpServer): void {
  defineTool(
    server,
    'collection_stats',
    'Operational health of the graph: counts of raw_captures (by status), notes (by state), blocks (total + how many are embedded vs unembedded), edges per type, and proposals (by status). The unembedded count is the key signal — those blocks are invisible to vector_search/hybrid_search until index_block runs. Read-only.',
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
