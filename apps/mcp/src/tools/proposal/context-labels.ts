import { type GraphEdgeRecord, type GraphNodeRecord, idStr, tableOf } from '../graph-records'

/** The change graph a committed proposal produced: created/updated nodes plus
 * the edges. Pure shape — no I/O lives in this module. */
export type MaterializedGraph = {
  notes_created: GraphNodeRecord[]
  notes_updated: GraphNodeRecord[]
  narrative_blocks_created: GraphNodeRecord[]
  descriptive_blocks_created: GraphNodeRecord[]
  derived_from: GraphEdgeRecord[]
  about: GraphEdgeRecord[]
  affects: GraphEdgeRecord[]
  semantic_edges: GraphEdgeRecord[]
  /** Ids of edges this commit removed — kept as raw strings, not resolved: the
   * records no longer exist, so selectByIds would silently drop them. The
   * per-table changefeed shows the real DELETE. */
  edges_removed: string[]
}

/** Ids of every node the commit created or updated. */
export function mutatedNodeIds(m: MaterializedGraph): Set<string> {
  const ids = new Set<string>()
  for (const node of [
    ...m.notes_created,
    ...m.notes_updated,
    ...m.narrative_blocks_created,
    ...m.descriptive_blocks_created
  ]) {
    ids.add(idStr(node.id))
  }
  return ids
}

/** Edge endpoints that aren't part of the commit — the records to label as context. */
export function contextEndpointIds(m: MaterializedGraph, mutated: Set<string>): string[] {
  const endpoints = new Set<string>()
  for (const edge of [...m.derived_from, ...m.about, ...m.affects, ...m.semantic_edges]) {
    for (const id of [idStr(edge.in), idStr(edge.out)]) {
      if (id && !mutated.has(id)) endpoints.add(id)
    }
  }
  return [...endpoints]
}

/** Human label for a context record, by table; null for tables we don't label. */
export function contextLabel(row: GraphNodeRecord): string | null {
  const id = idStr(row.id)
  switch (tableOf(id)) {
    case 'raw_capture':
      return `raw · ${row.content ?? ''}`
    case 'note': {
      const type = idStr(row.type).replace(/^note_type:/, '')
      const title = row.title ?? ''
      return type ? `${type} · ${title}` : title || id
    }
    case 'block':
      return `block · ${row.content ?? ''}`
    default:
      return null
  }
}
