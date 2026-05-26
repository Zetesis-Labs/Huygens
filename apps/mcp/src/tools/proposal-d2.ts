import type { ProposalChanges } from './proposal'

// Resolved records / edges come back from the graph as flexible objects.
type Rec = {
  id?: unknown
  title?: unknown
  type?: unknown
  in?: unknown
  out?: unknown
  action?: unknown
}

/** A record id ("note:abc-1") → a valid D2 key ("note_abc_1"). */
function d2key(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '_')
}

/** Strip the table prefix from a typed ref: "note_type:task" → "task". */
function shortType(value: unknown): string {
  return String(value ?? '').replace(/^note_type:/, '')
}

/** D2 labels are quoted; keep them on one line and avoid the closing quote. */
function label(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
}

function asArray(value: unknown): Rec[] {
  return Array.isArray(value) ? (value as Rec[]) : []
}

type NodeClass = 'created' | 'updated' | 'context'

class D2Graph {
  private readonly nodes = new Map<string, string>()
  private readonly conns: string[] = []

  node(id: string, text: string, cls: NodeClass, shape: string): void {
    const key = d2key(id)
    if (cls === 'context' && this.nodes.has(key)) return // don't downgrade a created node
    this.nodes.set(key, `${key}: "${label(text)}" { class: ${cls}; shape: ${shape} }`)
  }

  /** Reference an endpoint; if unknown, add it as a context node (external to the commit). */
  private endpoint(id: string): string {
    const key = d2key(id)
    if (!this.nodes.has(key)) {
      const table = id.split(':')[0] ?? ''
      this.node(id, id, 'context', table === 'raw_capture' ? 'document' : 'rectangle')
    }
    return key
  }

  edge(from: string, to: string, text: string): void {
    this.conns.push(`${this.endpoint(from)} -> ${this.endpoint(to)}: "${label(text)}"`)
  }

  render(header: string): string {
    return [
      header,
      '',
      ...this.nodes.values(),
      '',
      ...this.conns,
      '',
      'classes: {',
      '  created: { style: { fill: "#d4f4dd"; stroke: "#2e7d32" } }',
      '  updated: { style: { fill: "#fff3cd"; stroke: "#9a7d0a" } }',
      '  context: { style: { fill: "#f0f0f0"; stroke-dash: 3 } }',
      '}'
    ].join('\n')
  }
}

/**
 * Render the changes of a committed proposal as a D2 diagram (source code).
 * Pure: derived only from the materialized records. Created/updated nodes are
 * highlighted; endpoints outside the commit (e.g. the parent project, the source
 * raw) appear as dashed "context" nodes. Same input → same output.
 */
export function renderProposalD2(changes: ProposalChanges): string {
  const m = changes.materialized
  if (!m) {
    return `# ${changes.proposal_id}: no materialized result (not committed, or committed before this feature)`
  }
  const g = new D2Graph()

  for (const n of asArray(m.notes_created))
    g.node(String(n.id), `${shortType(n.type)} · ${n.title}`, 'created', 'rectangle')
  for (const n of asArray(m.notes_updated))
    g.node(String(n.id), `${shortType(n.type)} · ${n.title}`, 'updated', 'rectangle')
  for (const b of asArray(m.narrative_blocks_created)) g.node(String(b.id), 'narrative block', 'created', 'page')
  for (const b of asArray(m.descriptive_blocks_created)) g.node(String(b.id), 'descriptive block', 'created', 'page')

  for (const e of asArray(m.derived_from)) g.edge(String(e.in), String(e.out), 'derived_from')
  for (const e of asArray(m.about)) g.edge(String(e.in), String(e.out), 'about')
  for (const e of asArray(m.affects)) g.edge(String(e.in), String(e.out), `affects · ${String(e.action ?? '')}`)
  for (const e of asArray(m.semantic_edges)) g.edge(String(e.in), String(e.out), String(e.id).split(':')[0] ?? 'edge')

  return g.render(`# ${changes.proposal_id} — Δ commit (${changes.committed_at ?? ''})`)
}
