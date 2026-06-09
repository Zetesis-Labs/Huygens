import type { ProposalDetail, StoredProposalPayload } from './proposal/schemas'

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
 * Label map for the preview, derived purely from the payload (real ids): a
 * created note by its title, a narrative block by a short tag. Pre-existing refs
 * (notes the proposal only links/updates) fall back to their id.
 */
function buildLabels(payload: StoredProposalPayload): Map<string, string> {
  return new Map<string, string>([
    ...payload.note_creates.map(note => [note.id, `"${note.title}"`] as const),
    ...payload.narrative_blocks.map(block => [block.id, '[informe]'] as const)
  ])
}

function labelFor(ref: string, labels: Map<string, string>): string {
  return labels.get(ref) ?? ref
}

function headerSection(detail: ProposalDetail): string[] {
  const committable = detail.status === 'draft' ? ' ✅ committable' : ` (not committable: ${detail.status})`
  return [`Proposal ${detail.id} — ${detail.status}${committable}`]
}

function rawSection(payload: StoredProposalPayload): string[] {
  return [
    `Processes ${payload.raw_ids.length} ${plural(payload.raw_ids.length, 'raw capture')}: ${payload.raw_ids.join(', ')}`
  ]
}

function createExtras(note: StoredProposalPayload['note_creates'][number]): string[] {
  const metaKeys = note.metadata ? Object.keys(note.metadata) : []
  return [
    note.descriptive_blocks.length > 0 &&
      `+${note.descriptive_blocks.length} ${plural(note.descriptive_blocks.length, 'descriptive block')}`,
    note.mit_for && `MIT ${note.mit_for}`,
    note.due_at && `due ${note.due_at}`,
    note.defer_until && `defer ${note.defer_until}`,
    metaKeys.length > 0 && `metadata: ${metaKeys.join(', ')}`
  ].filter((extra): extra is string => Boolean(extra))
}

function createLine(note: StoredProposalPayload['note_creates'][number]): string {
  const extras = createExtras(note)
  const suffix = extras.length > 0 ? ` · ${extras.join(' · ')}` : ''
  return `  • "${note.title}"  ${note.type_slug} · ${note.state}${suffix}  (${note.id})`
}

function createSection(payload: StoredProposalPayload): string[] {
  if (payload.note_creates.length === 0) return []
  const header = `CREATE ${payload.note_creates.length} ${plural(payload.note_creates.length, 'note')}:`
  return [header, ...payload.note_creates.map(createLine)]
}

/** Render a day-granular field change: `null` is an explicit clear, a value is a
 * set, `undefined` (field absent from the update) yields no change line. */
function tristate(value: string | null | undefined, label: string): string | null {
  if (value === null) return `${label} → cleared`
  if (value != null) return `${label} → ${value}`
  return null
}

function isNotNull(value: string | null): value is string {
  return value != null
}

function updateChanges(note: StoredProposalPayload['note_updates'][number]): string {
  const mergeKeys = note.metadata_merge ? Object.keys(note.metadata_merge) : []
  const changes = [
    note.title != null ? `title → "${note.title}"` : null,
    note.state != null ? `state → ${note.state}` : null,
    tristate(note.mit_for, 'MIT'),
    tristate(note.due_at, 'due'),
    tristate(note.defer_until, 'defer'),
    mergeKeys.length > 0 ? `metadata: ${mergeKeys.join(', ')}` : null,
    note.descriptive_blocks_append.length > 0
      ? `+${note.descriptive_blocks_append.length} ${plural(note.descriptive_blocks_append.length, 'descriptive block')}`
      : null
  ].filter(isNotNull)
  return changes.length > 0 ? changes.join(' · ') : 'no field changes'
}

function updateSection(payload: StoredProposalPayload): string[] {
  if (payload.note_updates.length === 0) return []
  const header = `UPDATE ${payload.note_updates.length} ${plural(payload.note_updates.length, 'note')}:`
  return [header, ...payload.note_updates.map(note => `  • ${note.id}  ${updateChanges(note)}`)]
}

function narrativeSection(payload: StoredProposalPayload): string[] {
  if (payload.narrative_blocks.length === 0) return []
  const header = `CREATE ${payload.narrative_blocks.length} ${plural(payload.narrative_blocks.length, 'narrative block')}:`
  return [
    header,
    ...payload.narrative_blocks.map(block => `  • "${oneLine(block.content)}"  ← from ${block.raw_ids.join(', ')}`)
  ]
}

function edgeSection(payload: StoredProposalPayload, labels: Map<string, string>, createdNotes: Set<string>): string[] {
  if (payload.edges.length === 0) return []
  const header = `Graph edges (${payload.edges.length}):`
  return [
    header,
    ...payload.edges.map(edge => {
      const reason = edge.reason ? `  (${oneLine(edge.reason)})` : ''
      // part_of onto a pre-existing note is a replace: the commit drops the prior parent.
      const replace = edge.kind === 'part_of' && !createdNotes.has(edge.from) ? '  (reemplaza padre anterior)' : ''
      return `  • ${labelFor(edge.from, labels)} —${edge.kind}→ ${labelFor(edge.to, labels)}${reason}${replace}`
    })
  ]
}

function edgesRemovedSection(payload: StoredProposalPayload, labels: Map<string, string>): string[] {
  if (payload.edges_remove.length === 0) return []
  const header = `Edges removed (${payload.edges_remove.length}):`
  return [
    header,
    ...payload.edges_remove.map(edge => `  • ${labelFor(edge.from, labels)} —${edge.kind}✕→ ${labelFor(edge.to, labels)}`)
  ]
}

function topologySection(payload: StoredProposalPayload, labels: Map<string, string>): string[] {
  if (payload.about.length === 0 && payload.affects.length === 0) return []
  return [
    'Topology:',
    ...payload.about.map(a => `  • about:   ${labelFor(a.block_id, labels)} → ${labelFor(a.note_id, labels)}`),
    ...payload.affects.map(a => {
      const summary = a.summary ? ` "${oneLine(a.summary)}"` : ''
      return `  • affects: ${labelFor(a.block_id, labels)} → ${labelFor(a.note_id, labels)}  (${a.action})${summary}`
    })
  ]
}

/** Counts computed deterministically from the payload. */
function summarySection(payload: StoredProposalPayload): string[] {
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

/** A committed proposal carries only the anchor; the change detail is derived from
 * the payload (the SSOT) — see get_proposal_changes. The payload above holds the real ids. */
function resultSection(detail: ProposalDetail): string[] {
  const r = detail.result
  if (!r) return []
  return [
    'Committed:',
    `  • committed_at: ${r.committed_at}`,
    '  • change detail → get_proposal_changes (from payload)'
  ]
}

/**
 * Render a deterministic, human-readable preview of what committing this proposal
 * will create and change, from the stored payload (real ids). Pure: no I/O. Empty
 * sections omitted; the summary always shows the full tally. For a committed
 * proposal the anchor (committed_at + versionstamp) is appended.
 */
export function renderProposalDiff(detail: ProposalDetail): string {
  const { payload } = detail
  const labels = buildLabels(payload)
  const createdNotes = new Set(payload.note_creates.map(n => n.id))
  const sections: string[][] = [
    headerSection(detail),
    rawSection(payload),
    createSection(payload),
    updateSection(payload),
    narrativeSection(payload),
    edgeSection(payload, labels, createdNotes),
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
