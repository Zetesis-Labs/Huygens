import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EdgeTriple } from '../serialize'
import { getDb } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { findRelatedImpl } from './find-related'
import { expand, verbalizeSubgraph } from './neighborhood'

export const expandContextShape = {
  query: z.string().min(1).describe('Free-form concept to pull connected context for'),
  seeds: z.number().int().min(1).max(5).default(3).describe('How many vector-matched notes to seed from (default 3)'),
  hops: z.number().int().min(1).max(3).default(1).describe('Hops to expand from each seed (default 1)'),
  max_nodes: z.number().int().min(2).max(60).default(30).describe('Node budget; expansion stops here (default 30)'),
  threshold: z.number().min(0).max(1).default(0.45).describe('Cosine-similarity floor for the seeds')
}

const expandContextSchema = z.object(expandContextShape)
export type ExpandContextInput = z.infer<typeof expandContextSchema>

export type ExpandContextResult = {
  query: string
  seeds: { id: string; score: number }[]
  node_count: number
  nodes: { id: string; label: string }[]
  edges: EdgeTriple[]
  triples: string
}

/**
 * Hybrid retrieval ("Vía A ligera"): vector-match notes for a free-form query
 * (the seeds), then expand their connected subgraph and verbalize it as triples.
 * The 80%-case way to pull relevant context as text — vector + graph, not just
 * one. Composes find_related + neighborhood. Read-only.
 */
export async function expandContextImpl(input: ExpandContextInput): Promise<ExpandContextResult> {
  const hits = await findRelatedImpl({ query: input.query, k: input.seeds, threshold: input.threshold })
  const seeds = hits.map(h => ({ id: h.note_id, score: h.score }))
  if (seeds.length === 0) return { query: input.query, seeds: [], node_count: 0, nodes: [], edges: [], triples: '' }

  const db = await getDb()
  const { visited, edges } = await expand(
    db,
    seeds.map(s => s.id),
    input.hops,
    input.max_nodes
  )
  const sub = await verbalizeSubgraph(visited, edges)
  return { query: input.query, seeds, ...sub }
}

export function registerExpandContext(server: McpServer): void {
  defineTool(
    server,
    'expand_context',
    'Hybrid retrieval: vector-match notes for a free-form query, then expand their connected subgraph into subject —predicate→ object triples (with a node legend). The default way to pull relevant context as text — vector + graph.',
    expandContextShape,
    async args => {
      const r = await expandContextImpl(args)
      if (r.seeds.length === 0) return { content: [{ type: 'text', text: `Sin coincidencias para: ${args.query}` }] }
      const seedLine = r.seeds.map(s => `${s.id} (${s.score.toFixed(2)})`).join(', ')
      const legend = r.nodes.map(n => `${n.id}  ${n.label}`).join('\n')
      const text = `query: ${r.query}\nsemillas: ${seedLine}\n${r.node_count} nodo(s)\n\n${r.triples || '(sin relaciones)'}\n\n— nodos —\n${legend}`
      return { content: [{ type: 'text', text }, jsonBlock(r)] }
    }
  )
}
