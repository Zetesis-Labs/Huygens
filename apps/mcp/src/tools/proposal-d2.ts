import { type RecordIdish, idStr, tableOf } from './graph-records'
import type { ProposalChanges } from './proposal'

/** A record id ("note:abc-1") → a valid D2 key ("note_abc_1"). */
function d2key(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '_')
}

/** Strip the table prefix from a typed ref: "note_type:task" → "task". */
function shortType(value: RecordIdish | undefined): string {
  return idStr(value).replace(/^note_type:/, '')
}

/** An edge's kind is its table: "part_of:abc" → "part_of". */
function edgeKind(id: RecordIdish): string {
  return tableOf(id) || 'edge'
}

/** Normalize text for a quoted D2 label: collapse whitespace, avoid the closing
 * quote. No truncation — wrapping (below) keeps long text readable. */
function clean(text: string): string {
  return String(text).replace(/\s+/g, ' ').replace(/"/g, "'").trim()
}

/** Word-wrap into lines of ~perLine chars joined by the D2 newline escape (a
 * literal "\n" in the source, which D2 renders as a line break), so a node box
 * grows to fit the whole label instead of clipping it. Caps at maxLines with an
 * ellipsis only for pathologically long content. */
function wrap(text: string, perLine = 40, maxLines = 16): string {
  const words = clean(text).split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length === 0) line = word
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1]} …`
  }
  return lines.join('\\n')
}

type NodeClass = 'created' | 'updated' | 'context' | 'origin'

class D2Graph {
  private readonly nodes = new Map<string, string>()
  private readonly conns: string[] = []

  constructor(private readonly contextLabels: Record<string, string> = {}) {}

  node(id: string, text: string, cls: NodeClass, shape: string): void {
    const key = d2key(id)
    if ((cls === 'context' || cls === 'origin') && this.nodes.has(key)) return // don't downgrade a created node
    this.nodes.set(key, `${key}: "${wrap(text)}" { class: ${cls}; shape: ${shape} }`)
  }

  /** A free-floating banner placed above the graph (no edges). */
  caption(text: string): void {
    this.nodes.set('_caption', `_caption: "${wrap(text, 42, 10)}" { near: top-center; shape: text; class: caption }`)
  }

  /** Reference an endpoint; if unknown, add it as a context node (external to the
   * commit). Context nodes are labelled with their resolved human text when
   * available, falling back to the raw record id. */
  private endpoint(id: string): string {
    const key = d2key(id)
    if (!this.nodes.has(key)) {
      const table = id.split(':')[0] ?? ''
      const text = this.contextLabels[id] ?? id
      this.node(id, text, 'context', table === 'raw_capture' ? 'document' : 'rectangle')
    }
    return key
  }

  edge(from: string, to: string, text: string, opts: { dashed?: boolean } = {}): void {
    const style = opts.dashed ? ' { style: { stroke-dash: 4; stroke: "#8a93a6" } }' : ''
    this.conns.push(`${this.endpoint(from)} -> ${this.endpoint(to)}: "${clean(text)}"${style}`)
  }

  render(header: string): string {
    return [
      header,
      'direction: down',
      '',
      ...this.nodes.values(),
      '',
      ...this.conns,
      '',
      'classes: {',
      '  created: { style: { fill: "#e7f6ec"; stroke: "#2e7d32"; stroke-width: 2; border-radius: 10; shadow: true; font-size: 15 } }',
      '  updated: { style: { fill: "#fff3cd"; stroke: "#9a7d0a"; stroke-width: 2; border-radius: 10; shadow: true; font-size: 15 } }',
      '  context: { style: { fill: "#f4f4f6"; stroke: "#5b6b8c"; stroke-dash: 4; border-radius: 10; font-size: 15 } }',
      '  origin: { style: { fill: "#fafafa"; stroke: "#aab0bf"; stroke-dash: 3; font-size: 13; italic: true } }',
      '  caption: { style: { font-size: 16; italic: true; font-color: "#3a4252" } }',
      '}'
    ].join('\n')
  }
}

/**
 * Render the changes of a committed proposal as a D2 diagram (source code).
 * Pure: derived only from the materialized records plus an optional map of
 * context-endpoint labels (id → human text) resolved by the caller. Created /
 * updated nodes are highlighted; endpoints outside the commit (the parent
 * project, the source raw) appear as dashed "context" nodes labelled with their
 * own text. Descriptive blocks are not drawn as standalone nodes: their content
 * already lives in the note they describe; the diagram keeps the evidence →
 * interpretation (narrative) → topology shape. Same input → same output.
 */
export function renderProposalD2(
  changes: ProposalChanges,
  contextLabels: Record<string, string> = {}
): string {
  const m = changes.materialized
  if (!m) {
    return `# ${changes.proposal_id}: no materialized result (not committed, or committed before this feature)`
  }
  const g = new D2Graph(contextLabels)

  for (const n of m.notes_created)
    g.node(idStr(n.id), `${shortType(n.type)} · ${n.title ?? ''}`, 'created', 'rectangle')
  for (const n of m.notes_updated)
    g.node(idStr(n.id), `${shortType(n.type)} · ${n.title ?? ''}`, 'updated', 'rectangle')
  for (const b of m.narrative_blocks_created) g.node(idStr(b.id), `narrative · ${b.content ?? ''}`, 'created', 'page')

  for (const e of m.derived_from) g.edge(idStr(e.in), idStr(e.out), 'derived_from')
  for (const e of m.about) g.edge(idStr(e.in), idStr(e.out), 'about')
  for (const e of m.affects) g.edge(idStr(e.in), idStr(e.out), `affects · ${e.action ?? ''}`)
  for (const e of m.semantic_edges) g.edge(idStr(e.in), idStr(e.out), edgeKind(e.id))

  return g.render(`# ${changes.proposal_id} — Δ commit · audit (${changes.committed_at ?? ''})`)
}

/**
 * Render the *semantic* meaning of the change: what the user gained, not how it
 * was persisted. Nodes are notes; edges are the note↔note relations
 * (`part_of`, `blocked_by`, `mentions`). The narrative is a caption (the why),
 * and the source raw is a faint "origin" linked by a dashed `captura` edge. The
 * interpretation plumbing (the narrative *block* as a hub, `about`/`affects`/
 * `derived_from`) is intentionally dropped — see `renderProposalD2` for that
 * literal audit view.
 */
export function renderProposalSemanticD2(
  changes: ProposalChanges,
  contextLabels: Record<string, string> = {}
): string {
  const m = changes.materialized
  if (!m) {
    return `# ${changes.proposal_id}: no materialized result (not committed, or committed before this feature)`
  }
  const g = new D2Graph(contextLabels)

  const narrative = m.narrative_blocks_created
    .map(b => b.content ?? '')
    .filter(Boolean)
    .join(' / ')
  if (narrative) g.caption(narrative)

  const mutated: string[] = []
  for (const n of m.notes_created) {
    const id = idStr(n.id)
    g.node(id, `${shortType(n.type)} · ${n.title ?? ''}`, 'created', 'rectangle')
    mutated.push(id)
  }
  for (const n of m.notes_updated) {
    const id = idStr(n.id)
    g.node(id, `${shortType(n.type)} · ${n.title ?? ''}`, 'updated', 'rectangle')
    mutated.push(id)
  }

  // Note↔note topology — the part the user reasons about.
  for (const e of m.semantic_edges) g.edge(idStr(e.in), idStr(e.out), edgeKind(e.id))

  // Provenance kept lightweight: the originating raw(s) → the notes they mutated.
  const raws = new Set<string>()
  for (const e of m.derived_from) raws.add(idStr(e.out))
  for (const raw of raws) {
    g.node(raw, contextLabels[raw] ?? raw, 'origin', 'document')
    for (const noteId of mutated) g.edge(raw, noteId, 'captura', { dashed: true })
  }

  return g.render(`# ${changes.proposal_id} — cambio semántico (${changes.committed_at ?? ''})`)
}
