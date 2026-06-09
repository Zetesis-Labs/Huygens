import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId, type Surreal } from 'surrealdb'
import { z } from 'zod'
import { RECORD_ID_RE } from '../domain'
import { type EdgeTriple, nodeLabel, serializeTriples } from '../serialize'
import { getDb, selectByIds } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { type GraphNodeRecord, idStr, type RecordIdish } from './graph-records'

export const neighborhoodShape = {
  seed_id: z
    .string()
    .regex(RECORD_ID_RE, 'Must be a record id like "note:abc" / "block:xyz" / "raw_capture:…"')
    .describe('The node to expand around'),
  hops: z.number().int().min(1).max(3).default(2).describe('How many hops to expand (default 2)'),
  max_nodes: z.number().int().min(2).max(60).default(30).describe('Node budget; expansion stops here (default 30)')
}

const neighborhoodSchema = z.object(neighborhoodShape)
export type NeighborhoodInput = z.infer<typeof neighborhoodSchema>

type EdgeRow = {
  id: RecordIdish
  in: RecordIdish
  out: RecordIdish
  kind: string
  action?: string
  transformation?: string
}

export type SubgraphText = {
  node_count: number
  nodes: { id: string; label: string }[]
  /** Structured edges of the induced subgraph (both endpoints visited), so
   * callers can render a graph instead of re-parsing the `triples` string. */
  edges: EdgeTriple[]
  triples: string
}
export type NeighborhoodResult = SubgraphText & { seed: string }

/** Edges (any kind) with at least one endpoint in `frontier`, in one query. */
async function edgesTouching(db: Surreal, frontier: string[]): Promise<EdgeRow[]> {
  const frontierIds = frontier.map(s => new StringRecordId(s))
  const [rows] = await db.query<[EdgeRow[]]>(
    `SELECT id, in, out, meta::tb(id) AS kind, action, transformation
     FROM part_of, blocked_by, mentions, about, affects, derived_from
     WHERE in IN $f OR out IN $f`,
    { f: frontierIds }
  )
  return rows ?? []
}

/** BFS out from the seed(s) up to `hops`/`max_nodes`, collecting visited nodes
 * and the edges seen (deduped by edge id). Exported so the hybrid retriever
 * (expand_context) can expand several vector seeds into one connected subgraph. */
export async function expand(
  db: Surreal,
  seeds: string[],
  hops: number,
  maxNodes: number
): Promise<{ visited: Set<string>; edges: Map<string, EdgeRow> }> {
  const visited = new Set<string>(seeds)
  const edges = new Map<string, EdgeRow>()
  let frontier = [...seeds]
  for (let hop = 0; hop < hops && frontier.length > 0 && visited.size < maxNodes; hop++) {
    const next: string[] = []
    for (const edge of await edgesTouching(db, frontier)) {
      edges.set(idStr(edge.id), edge)
      for (const endpoint of [idStr(edge.in), idStr(edge.out)]) {
        if (endpoint && !visited.has(endpoint) && visited.size < maxNodes) {
          visited.add(endpoint)
          next.push(endpoint)
        }
      }
    }
    frontier = next
  }
  return { visited, edges }
}

/** Triples of the induced subgraph: edges with both endpoints visited. Pure. */
function inducedTriples(visited: Set<string>, edges: Map<string, EdgeRow>): EdgeTriple[] {
  return [...edges.values()]
    .filter(edge => visited.has(idStr(edge.in)) && visited.has(idStr(edge.out)))
    .map(edge => ({
      source: idStr(edge.in),
      target: idStr(edge.out),
      kind: edge.kind,
      qualifier: edge.action ?? edge.transformation ?? undefined
    }))
}

/** Render the visited nodes and induced triples as a SubgraphText. Pure. */
function renderSubgraph(visited: Set<string>, triples: EdgeTriple[], labels: Map<string, string>): SubgraphText {
  const label = (id: string): string => labels.get(id) ?? id
  return {
    node_count: visited.size,
    nodes: [...visited].map(id => ({ id, label: label(id) })),
    edges: triples,
    triples: serializeTriples(triples, label)
  }
}

/**
 * Resolve labels for the visited nodes and render the induced subgraph (edges
 * with both endpoints visited) as `subject —predicate→ object` triples. Shared
 * by neighborhood and expand_context. Read-only.
 */
export async function verbalizeSubgraph(visited: Set<string>, edges: Map<string, EdgeRow>): Promise<SubgraphText> {
  const triples = inducedTriples(visited, edges)
  const records = await selectByIds<GraphNodeRecord>([...visited])
  const labels = new Map(records.map(r => [idStr(r.id), nodeLabel(r)]))
  return renderSubgraph(visited, triples, labels)
}

/**
 * Verbalize the subgraph around a node as triples. Pass any seed (e.g. a
 * vector_search hit) and get its connected context as text the agent can read —
 * instead of bare, disconnected hits. Read-only.
 */
export async function neighborhoodImpl(input: NeighborhoodInput): Promise<NeighborhoodResult | null> {
  const [seedRecord] = await selectByIds<GraphNodeRecord>([input.seed_id])
  if (!seedRecord) return null
  const db = await getDb()
  const { visited, edges } = await expand(db, [input.seed_id], input.hops, input.max_nodes)
  return { seed: input.seed_id, ...(await verbalizeSubgraph(visited, edges)) }
}

export function registerNeighborhood(server: McpServer): void {
  defineTool(
    server,
    'neighborhood',
    "Expand the graph around a note/block/raw N hops and return the connected subgraph as subject —predicate→ object triples (plus a node legend). Use it to pull a hit's context as text instead of disconnected results.",
    neighborhoodShape,
    async args => {
      const result = await neighborhoodImpl(args)
      if (!result) return { content: [{ type: 'text', text: `Not found: ${args.seed_id}` }] }
      const legend = result.nodes.map(n => `${n.id}  ${n.label}`).join('\n')
      const text = `${result.node_count} nodo(s) alrededor de ${result.seed}\n\n${result.triples || '(sin relaciones)'}\n\n— nodos —\n${legend}`
      return { content: [{ type: 'text', text }, jsonBlock(result)] }
    }
  )
}
