import { type GraphNodeRecord, idStr, tableOf } from './tools/graph-records'

/**
 * Graph → text. The single place that turns nodes/edges into the compact, human
 * strings the agent reads and that get prepended to embeddings. Keeping it here
 * (instead of re-inventing a format per tool) is what makes the graph legible to
 * the LLM consistently — the encoding quality matters (see the retrieval/trust
 * roadmap). Pure: no I/O.
 */

/** Collapse whitespace and clamp to one short line. */
function oneLine(text: string | undefined, max = 80): string {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/** "task" from a note.type of "note_type:task"; "" if absent. */
export function noteTypeSlug(type: GraphNodeRecord['type']): string {
  return idStr(type).replace(/^note_type:/, '')
}

/**
 * Human, single-line label for a graph node, by table:
 *   note  → "task · Escribir a Stripe (WAITING)"
 *   raw   → "raw · <snippet>"
 *   block → "narrative · <snippet>"
 * Generalises the proposal-only `contextLabel`; the canonical graph→text atom.
 */
export function nodeLabel(node: GraphNodeRecord): string {
  const id = idStr(node.id)
  switch (tableOf(id)) {
    case 'note': {
      const slug = noteTypeSlug(node.type)
      const title = node.title ?? id
      const head = slug ? `${slug} · ${title}` : title
      return node.state ? `${head} (${node.state})` : head
    }
    case 'raw_capture':
      return `raw · ${oneLine(node.content)}`
    case 'block':
      return `${node.block_kind ?? 'block'} · ${oneLine(node.content)}`
    default:
      return id
  }
}

/** A node's label plus its id, the consistent one-line entry the read tools
 * (list_*, find_related, vector_search) emit so the agent sees one format. */
export function nodeLine(node: GraphNodeRecord): string {
  return `${nodeLabel(node)} — ${idStr(node.id)}`
}

const EDGE_LABELS: Record<string, string> = {
  part_of: 'parte de',
  blocked_by: 'bloqueada por',
  mentions: 'menciona',
  derived_from: 'deriva de',
  about: 'sobre',
  affects: 'afecta a'
}

/** Human label for a relation kind ("part_of" → "parte de"). */
export function edgeLabel(kind: string): string {
  return EDGE_LABELS[kind] ?? kind
}

/**
 * Context header prepended to a block before embedding, so the vector carries the
 * block's subject and its place in the hierarchy instead of being an orphan
 * fragment. `subjects` is the owning note (descriptive blocks) or the about-notes
 * (narrative blocks); `parents` is that note's `part_of` chain (nearest first).
 * Returns "" when there is nothing to add (so the caller embeds bare content).
 */
export function blockEmbeddingContext(subjects: GraphNodeRecord[], parents: GraphNodeRecord[]): string {
  if (subjects.length === 0) return ''
  const lines = subjects.map(nodeLabel)
  if (parents.length > 0) lines.push(`parte de: ${parents.map(nodeLabel).join(' ▸ ')}`)
  return lines.join('\n')
}

/** A graph edge as a subject–predicate–object triple. `qualifier` carries edge
 * metadata that refines the predicate (affects.action, derived_from.transformation). */
export type EdgeTriple = { source: string; target: string; kind: string; qualifier?: string }

function predicate(t: EdgeTriple): string {
  return t.qualifier ? `${t.kind}(${t.qualifier})` : t.kind
}

/** Render edges as `subject —predicate→ object` triples (the canonical KG-RAG
 * form). `label` resolves a record id to its human label (nodeLabel). */
export function serializeTriples(edges: EdgeTriple[], label: (id: string) => string): string {
  return edges.map(t => `${label(t.source)} —${predicate(t)}→ ${label(t.target)}`).join('\n')
}

/** The same triples grouped by subject (entity-centric), for reasoning about a
 * single node and its relations. */
export function serializeTriplesGrouped(edges: EdgeTriple[], label: (id: string) => string): string {
  const bySubject = new Map<string, EdgeTriple[]>()
  for (const t of edges) bySubject.set(t.source, [...(bySubject.get(t.source) ?? []), t])
  const lines: string[] = []
  for (const [subject, group] of bySubject) {
    lines.push(label(subject))
    for (const t of group) lines.push(`  —${predicate(t)}→ ${label(t.target)}`)
  }
  return lines.join('\n')
}
