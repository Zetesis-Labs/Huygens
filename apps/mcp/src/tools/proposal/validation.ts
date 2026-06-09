import type { RecordId, StringRecordId } from 'surrealdb'
import { BLOCK_ID_RE, NOTE_ID_RE } from '../../domain'
import { getDb } from '../../surreal'
import type { ProposalPayload, StoredProposalPayload } from './schemas'
import { toBlockRef, toNoteRef, toRawRef } from './store'

function setEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every(item => rightSet.has(item))
}

function assertRawIdsMatch(inputRawIds: string[], payloadRawIds: string[]): void {
  if (!setEquals(inputRawIds, payloadRawIds)) {
    throw new Error('raw_ids argument must match payload.raw_ids')
  }
}

function assertUniqueTempIds(payload: ProposalPayload): void {
  // Order (note_creates then narrative_blocks) is preserved so the duplicate
  // reported is the same one the imperative scan would have caught.
  const allTempIds = [
    ...payload.note_creates.map(note => note.temp_id),
    ...payload.narrative_blocks.map(block => block.temp_id)
  ]
  const duplicate = allTempIds.find((id, index) => allTempIds.indexOf(id) !== index)
  if (duplicate != null) throw new Error(`duplicate temp_id: ${duplicate}`)
}

function assertNarrativeRawIdsAreDeclared(payload: ProposalPayload): void {
  const declared = new Set(payload.raw_ids)
  const offender = payload.narrative_blocks
    .flatMap(block => block.raw_ids.map(rawId => ({ block: block.temp_id, rawId })))
    .find(({ rawId }) => !declared.has(rawId))
  if (offender) {
    throw new Error(`narrative block ${offender.block} references undeclared raw_id ${offender.rawId}`)
  }
}

export async function assertRawCapturesExist(rawIds: string[]): Promise<void> {
  const db = await getDb()
  const refs = rawIds.map(toRawRef)
  const [rows] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM raw_capture WHERE id IN $ids', { ids: refs })
  const existing = new Set(rows.map(row => String(row.id)))
  const missing = rawIds.filter(id => !existing.has(id))
  if (missing.length > 0) throw new Error(`raw_capture not found: ${missing.join(', ')}`)
}

/** Pure split of fetched raw_capture rows into the requested ids that are missing
 * vs. those whose status blocks a commit (only pending|deferred are committable).
 * No I/O — testable without a DB. */
export function classifyRawCaptureCommittability(
  rawIds: string[],
  rows: { id: RecordId; status: string }[]
): { missing: string[]; blocked: { id: string; status: string | undefined }[] } {
  const byId = new Map(rows.map(row => [String(row.id), row.status]))
  const missing = rawIds.filter(id => !byId.has(id))
  const blocked = rawIds
    .map(id => ({ id, status: byId.get(id) }))
    .filter(row => row.status !== 'pending' && row.status !== 'deferred')
  return { missing, blocked }
}

export async function assertRawCapturesCommittable(rawIds: string[]): Promise<void> {
  const db = await getDb()
  const refs = rawIds.map(toRawRef)
  const [rows] = await db.query<[{ id: RecordId; status: string }[]]>(
    'SELECT id, status FROM raw_capture WHERE id IN $ids',
    { ids: refs }
  )
  const { missing, blocked } = classifyRawCaptureCommittability(rawIds, rows)
  if (missing.length > 0) throw new Error(`raw_capture not found: ${missing.join(', ')}`)
  if (blocked.length > 0) {
    throw new Error(`raw_capture not committable: ${blocked.map(row => `${row.id} status=${row.status}`).join(', ')}`)
  }
}

/** The requested ids absent from the fetched existing rows. Pure. */
function missingIds(ids: string[], rows: { id: RecordId }[]): string[] {
  const existing = new Set(rows.map(row => String(row.id)))
  return ids.filter(id => !existing.has(id))
}

async function assertAllExist(
  ids: string[],
  table: 'note' | 'block',
  toRef: (id: string) => StringRecordId,
  label: string
): Promise<void> {
  // Guard the degenerate empty-list query (invariant: never query with []).
  if (ids.length === 0) return
  const db = await getDb()
  const [rows] = await db.query<[{ id: RecordId }[]]>(`SELECT id FROM ${table} WHERE id IN $ids`, {
    ids: ids.map(toRef)
  })
  const missing = missingIds(ids, rows)
  if (missing.length > 0) throw new Error(`${label} not found: ${missing.join(', ')}`)
}

async function assertExistingRecordRefs(noteIds: Set<string>, blockIds: Set<string>): Promise<void> {
  await assertAllExist(Array.from(noteIds), 'note', toNoteRef, 'note')
  await assertAllExist(Array.from(blockIds), 'block', toBlockRef, 'block')
}

/** At most one part_of parent per child in a single proposal: two different
 * parents for the same `from` is ambiguous (which wins the replace?). */
function assertSingleParentPerChild(edges: StoredProposalPayload['edges']): void {
  const parent = new Map<string, string>()
  for (const edge of edges) {
    if (edge.kind !== 'part_of') continue
    const existing = parent.get(edge.from)
    if (existing != null && existing !== edge.to) {
      throw new Error(`note ${edge.from} is given two part_of parents in one proposal: ${existing} and ${edge.to}`)
    }
    parent.set(edge.from, edge.to)
  }
}

function nodeKind(id: string): 'note' | 'block' {
  if (NOTE_ID_RE.test(id)) return 'note'
  if (BLOCK_ID_RE.test(id)) return 'block'
  throw new Error(`unknown node ref: ${id}`)
}

/**
 * Pure derivation of which refs a *stored* payload requires to already exist
 * (the records it does NOT itself create), plus all the topology/kind guards:
 * about/affects block endpoints must be blocks, single-parent per child,
 * part_of/blocked_by endpoints must be notes. No I/O — testable without a DB.
 */
export function collectRequiredRefs(payload: StoredProposalPayload): { notes: Set<string>; blocks: Set<string> } {
  const createdNotes = new Set(payload.note_creates.map(n => n.id))
  const createdBlocks = new Set(payload.narrative_blocks.map(b => b.id))

  // about/affects: the block_id endpoint must be a block; surface the first offender
  // with the same message the imperative scan produced.
  const badAbout = payload.about.find(a => nodeKind(a.block_id) !== 'block')
  if (badAbout) throw new Error(`about.block_id must be a block: ${badAbout.block_id}`)
  const badAffect = payload.affects.find(a => nodeKind(a.block_id) !== 'block')
  if (badAffect) throw new Error(`affects.block_id must be a block: ${badAffect.block_id}`)

  assertSingleParentPerChild(payload.edges)
  // Per edge (in order): both endpoints must be known refs (nodeKind throws on an
  // unknown one), and part_of/blocked_by additionally require both to be notes.
  for (const edge of [...payload.edges, ...payload.edges_remove]) {
    const fromKind = nodeKind(edge.from)
    const toKind = nodeKind(edge.to)
    if ((edge.kind === 'part_of' || edge.kind === 'blocked_by') && (fromKind !== 'note' || toKind !== 'note')) {
      throw new Error(`${edge.kind} requires note refs`)
    }
  }

  // Required refs, derived declaratively. about/affects need their block + note
  // endpoints; each edge endpoint is needed as a note or a block according to its
  // own kind. These are filtered to the records this proposal does not itself
  // create (mirroring the old needNote/needBlock helpers).
  const edgeEndpoints = [...payload.edges, ...payload.edges_remove].flatMap(edge => [edge.from, edge.to])
  const linkedNoteIds = [
    ...payload.about.map(a => a.note_id),
    ...payload.affects.map(a => a.note_id),
    ...edgeEndpoints.filter(id => nodeKind(id) === 'note')
  ]
  const linkedBlockIds = [
    ...payload.about.map(a => a.block_id),
    ...payload.affects.map(a => a.block_id),
    ...edgeEndpoints.filter(id => nodeKind(id) === 'block')
  ]
  // note_updates always target an existing note, so their ids are needed even when
  // they would otherwise be created — unconditional, unlike the linked refs.
  const notes = new Set([
    ...payload.note_updates.map(update => update.id),
    ...linkedNoteIds.filter(id => !createdNotes.has(id))
  ])
  const blocks = new Set(linkedBlockIds.filter(id => !createdBlocks.has(id)))
  return { notes, blocks }
}

/**
 * Validate the *stored* payload (real ids everywhere) before commit: every
 * referenced record that this proposal does NOT create must already exist, and
 * part_of/blocked_by endpoints must be notes. Pure-id; no temp resolution.
 */
export async function assertProposalRefs(payload: StoredProposalPayload): Promise<void> {
  const { notes, blocks } = collectRequiredRefs(payload)
  await assertExistingRecordRefs(notes, blocks)
}

/**
 * The three temporal axes — mit_for (priority), due_at (hard deadline) and
 * defer_until (tickler) — are top-level, INDEXED note fields: they drive the
 * overdue radar, the MITs view and the tickler. A date stashed in the FLEXIBLE
 * `metadata` object (the audit found `metadata.deadline` / `metadata.due_before`)
 * is invisible to those queries — silently breaking the radar. Reject the leak at
 * the input boundary and point the agent at the right field so it can't recur.
 */
const TEMPORAL_LEAK_KEYS = new Set([
  'due',
  'dueat',
  'duedate',
  'duebefore',
  'duedates',
  'deadline',
  'deadlines',
  'fechalimite',
  'vencimiento',
  'mitfor',
  'deferuntil'
])

// Normalize a metadata key for leak detection: lowercase and strip everything
// but [a-z0-9], so `due_at`, `Due-Date`, `dueDate` all collapse onto the same
// canonical key checked against TEMPORAL_LEAK_KEYS.
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '')

function scanMetadata(meta: Record<string, unknown> | undefined, where: string): string[] {
  return Object.keys(meta ?? {})
    .filter(key => TEMPORAL_LEAK_KEYS.has(normalizeKey(key)))
    .map(key => `${where}.metadata.${key}`)
}

function assertNoTemporalLeakInMetadata(payload: ProposalPayload): void {
  const offenders = [
    ...payload.note_creates.flatMap(note => scanMetadata(note.metadata, note.temp_id)),
    ...payload.note_updates.flatMap(note => scanMetadata(note.metadata_merge, note.id))
  ]
  if (offenders.length > 0) {
    throw new Error(
      `deadline/date fields must not live in metadata (${offenders.join(', ')}): use the top-level due_at ` +
        `(hard deadline), mit_for (the day's priority) or defer_until (tickler). Those are indexed and drive ` +
        `the overdue radar / MITs / tickler — a date in metadata is invisible to them. See ` +
        `huygens://lore/operating-doctrine.`
    )
  }
}

/**
 * `part_of` is single-parent and the most-violated doctrine rule ("never assume
 * the parent from recent conversation context"). The server can't see the
 * conversation, so it can't verify the user anchored a parent — but it can force a
 * deliberate, audited assertion: a `part_of` edge MUST carry `anchored: true`. The
 * agent sets it ONLY when the user explicitly stated the parent; otherwise it
 * leaves the note parentless or asks. This turns the rule from prose into a
 * deterministic rejection (the same pattern as approved:true for rituals).
 */
function assertPartOfAnchored(payload: ProposalPayload): void {
  const offenders = payload.edges.filter(e => e.kind === 'part_of' && e.anchored !== true)
  if (offenders.length > 0) {
    throw new Error(
      `part_of requires { anchored: true } — set it ONLY when the user explicitly stated this parent. ` +
        `Never assume the parent from recent conversation context (part_of is single-parent). If the user ` +
        `did not anchor it, leave the note parentless or ask. Offending: ${offenders.map(e => `${e.from}->${e.to}`).join(', ')}. ` +
        `See huygens://lore/operating-doctrine.`
    )
  }
}

/** Input-level validation (temp_id space), run on create/update before realizing. */
export function validatePayload(rawIds: string[], payload: ProposalPayload): ProposalPayload {
  assertRawIdsMatch(rawIds, payload.raw_ids)
  assertUniqueTempIds(payload)
  assertNarrativeRawIdsAreDeclared(payload)
  assertNoTemporalLeakInMetadata(payload)
  assertPartOfAnchored(payload)
  return payload
}
