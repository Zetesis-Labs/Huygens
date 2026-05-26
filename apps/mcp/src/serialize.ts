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
