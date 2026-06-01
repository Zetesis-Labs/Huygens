import { NOTE_ID_RE } from '../domain'
import type { ProposalDetail, ProposalPayload } from './proposal/schemas'

const PREVIEW_MAX = 60

/** Collapse whitespace and clamp to a single short line for previews. */
function oneLine(text: string, max = PREVIEW_MAX): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`
}

function plural(n: number, singular: string, suffix = 's'): string {
  return `${singular}${n === 1 ? '' : suffix}`
}

/**
 * Map every ref a commit can resolve to a readable label, derived purely from
 * the payload: notes-to-create by their title, narrative blocks by [temp_id].
 * Real record ids (note:…, block:… in updates or pre-existing refs) fall back
 * to themselves.
 */
function buildLabels(payload: ProposalPayload): Map<string, string> {
  const labels = new Map<string, string>()
  for (const note of payload.note_creates) labels.set(note.temp_id, `"${note.title}"`)
  for (const block of payload.narrative_blocks) labels.set(block.temp_id, `[${block.temp_id}]`)
  return labels
}

function labelFor(ref: string, labels: Map<string, string>): string {
  return labels.get(ref) ?? ref
}

function headerSection(detail: ProposalDetail): string[] {
  const committable = detail.status === 'draft' ? ' ✅ committable' : ` (not committable: ${detail.status})`
  return [`Proposal ${detail.id} — ${detail.status}${committable}`]
}

function rawSection(payload: ProposalPayload): string[] {
  return [
    `Processes ${payload.raw_ids.length} ${plural(payload.raw_ids.length, 'raw capture')}: ${payload.raw_ids.join(', ')}`
  ]
}

function createSection(payload: ProposalPayload): string[] {
  if (payload.note_creates.length === 0) return []
  const lines = [`CREATE ${payload.note_creates.length} ${plural(payload.note_creates.length, 'note')}:`]
  for (const note of payload.note_creates) {
    const extras: string[] = []
    if (note.descriptive_blocks.length > 0) {
      extras.push(`+${note.descriptive_blocks.length} ${plural(note.descriptive_blocks.length, 'descriptive block')}`)
    }
    if (note.mit_for) extras.push(`MIT ${note.mit_for}`)
    const metaKeys = note.metadata ? Object.keys(note.metadata) : []
    if (metaKeys.length > 0) extras.push(`metadata: ${metaKeys.join(', ')}`)
    const suffix = extras.length > 0 ? ` · ${extras.join(' · ')}` : ''
    lines.push(`  • "${note.title}"  ${note.type_slug} · ${note.state}${suffix}`)
  }
  return lines
}

function updateChanges(note: ProposalPayload['note_updates'][number]): string {
  const changes: string[] = []
  if (note.title != null) changes.push(`title → "${note.title}"`)
  if (note.state != null) changes.push(`state → ${note.state}`)
  if (note.mit_for === null) changes.push('MIT → cleared')
  else if (note.mit_for != null) changes.push(`MIT → ${note.mit_for}`)
  const mergeKeys = note.metadata_merge ? Object.keys(note.metadata_merge) : []
  if (mergeKeys.length > 0) changes.push(`metadata: ${mergeKeys.join(', ')}`)
  if (note.descriptive_blocks_append.length > 0) {
    changes.push(
      `+${note.descriptive_blocks_append.length} ${plural(note.descriptive_blocks_append.length, 'descriptive block')}`
    )
  }
  return changes.length > 0 ? changes.join(' · ') : 'no field changes'
}

function updateSection(payload: ProposalPayload): string[] {
  if (payload.note_updates.length === 0) return []
  const lines = [`UPDATE ${payload.note_updates.length} ${plural(payload.note_updates.length, 'note')}:`]
  for (const note of payload.note_updates) lines.push(`  • ${note.id}  ${updateChanges(note)}`)
  return lines
}

function narrativeSection(payload: ProposalPayload): string[] {
  if (payload.narrative_blocks.length === 0) return []
  const lines = [
    `CREATE ${payload.narrative_blocks.length} ${plural(payload.narrative_blocks.length, 'narrative block')}:`
  ]
  for (const block of payload.narrative_blocks) {
    lines.push(`  • [${block.temp_id}] "${oneLine(block.content)}"  ← from ${block.raw_ids.join(', ')}`)
  }
  return lines
}

function edgeSection(payload: ProposalPayload, labels: Map<string, string>): string[] {
  if (payload.edges.length === 0) return []
  const lines = [`Graph edges (${payload.edges.length}):`]
  for (const edge of payload.edges) {
    const reason = edge.reason ? `  (${oneLine(edge.reason)})` : ''
    // part_of on an existing note is a replace: the commit drops the prior parent.
    const replace = edge.kind === 'part_of' && NOTE_ID_RE.test(edge.from) ? '  (reemplaza padre anterior)' : ''
    lines.push(`  • ${labelFor(edge.from, labels)} —${edge.kind}→ ${labelFor(edge.to, labels)}${reason}${replace}`)
  }
  return lines
}

function edgesRemovedSection(payload: ProposalPayload, labels: Map<string, string>): string[] {
  if (payload.edges_remove.length === 0) return []
  const lines = [`Edges removed (${payload.edges_remove.length}):`]
  for (const edge of payload.edges_remove) {
    lines.push(`  • ${labelFor(edge.from, labels)} —${edge.kind}✕→ ${labelFor(edge.to, labels)}`)
  }
  return lines
}

function topologySection(payload: ProposalPayload, labels: Map<string, string>): string[] {
  if (payload.about.length === 0 && payload.affects.length === 0) return []
  const lines = ['Topology:']
  for (const a of payload.about) {
    lines.push(`  • about:   ${labelFor(a.block_temp_id, labels)} → ${labelFor(a.note_ref, labels)}`)
  }
  for (const a of payload.affects) {
    const summary = a.summary ? ` "${oneLine(a.summary)}"` : ''
    lines.push(
      `  • affects: ${labelFor(a.block_temp_id, labels)} → ${labelFor(a.note_ref, labels)}  (${a.action})${summary}`
    )
  }
  return lines
}

/** Mirror of CommitProposalResult counts, computed deterministically from the payload. */
function summarySection(payload: ProposalPayload): string[] {
  const descriptive =
    payload.note_creates.reduce((sum, n) => sum + n.descriptive_blocks.length, 0) +
    payload.note_updates.reduce((sum, n) => sum + n.descriptive_blocks_append.length, 0)
  const derivedFrom = payload.narrative_blocks.reduce((sum, b) => sum + b.raw_ids.length, 0)
  return [
    `On commit → notes +${payload.note_creates.length} · updates ${payload.note_updates.length} · ` +
      `narrative +${payload.narrative_blocks.length} · descriptive +${descriptive} · ` +
      `derived_from +${derivedFrom} · about +${payload.about.length} · ` +
      `affects +${payload.affects.length} · edges +${payload.edges.length}` +
      (payload.edges_remove.length > 0 ? ` · edges-removed ${payload.edges_remove.length}` : '')
  ]
}

/** Materialized result of a committed proposal: the real record ids it produced. */
function resultSection(detail: ProposalDetail): string[] {
  const r = detail.result
  if (!r) return []
  const lines = ['Committed result:']
  if (r.notes_created.length > 0) lines.push(`  • notes created:      ${r.notes_created.join(', ')}`)
  if (r.notes_updated.length > 0) lines.push(`  • notes updated:      ${r.notes_updated.join(', ')}`)
  if (r.narrative_blocks_created.length > 0)
    lines.push(`  • narrative blocks:   ${r.narrative_blocks_created.join(', ')}`)
  if (r.descriptive_blocks_created.length > 0)
    lines.push(`  • descriptive blocks: ${r.descriptive_blocks_created.join(', ')}`)
  const edges = r.derived_from.length + r.about.length + r.affects.length + r.semantic_edges.length
  if (edges > 0) {
    lines.push(
      `  • edges: ${edges} (derived_from ${r.derived_from.length}, about ${r.about.length}, ` +
        `affects ${r.affects.length}, semantic ${r.semantic_edges.length})`
    )
  }
  if (r.edges_removed.length > 0) lines.push(`  • edges removed:      ${r.edges_removed.join(', ')}`)
  const temps = [...Object.entries(r.temp_ids.notes), ...Object.entries(r.temp_ids.blocks)]
  if (temps.length > 0) {
    lines.push(`  • temp_ids: ${temps.map(([temp, id]) => `${temp} → ${id}`).join(', ')}`)
  }
  lines.push(`  • versionstamp: ${r.versionstamp ?? '—'} · committed ${r.committed_at}`)
  return lines
}

/**
 * Render a deterministic, human-readable preview of what committing this
 * proposal will create and change. Pure: same input → same output, no I/O.
 * Empty sections are omitted; the summary always shows the full tally. For a
 * committed proposal, the materialized result (real ids) is appended.
 */
export function renderProposalDiff(detail: ProposalDetail): string {
  const { payload } = detail
  const labels = buildLabels(payload)
  const sections: string[][] = [
    headerSection(detail),
    rawSection(payload),
    createSection(payload),
    updateSection(payload),
    narrativeSection(payload),
    edgeSection(payload, labels),
    edgesRemovedSection(payload, labels),
    topologySection(payload, labels),
    summarySection(payload),
    resultSection(detail)
  ]
  return sections
    .filter(section => section.length > 0)
    .map(section => section.join('\n'))
    .join('\n\n')
}
