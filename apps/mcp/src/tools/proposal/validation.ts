import type { RecordId } from 'surrealdb'
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
  const tempIds = new Set<string>()
  for (const note of payload.note_creates) {
    if (tempIds.has(note.temp_id)) throw new Error(`duplicate temp_id: ${note.temp_id}`)
    tempIds.add(note.temp_id)
  }
  for (const block of payload.narrative_blocks) {
    if (tempIds.has(block.temp_id)) throw new Error(`duplicate temp_id: ${block.temp_id}`)
    tempIds.add(block.temp_id)
  }
}

function assertNarrativeRawIdsAreDeclared(payload: ProposalPayload): void {
  const declared = new Set(payload.raw_ids)
  for (const block of payload.narrative_blocks) {
    for (const rawId of block.raw_ids) {
      if (!declared.has(rawId))
        throw new Error(`narrative block ${block.temp_id} references undeclared raw_id ${rawId}`)
    }
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

export async function assertRawCapturesCommittable(rawIds: string[]): Promise<void> {
  const db = await getDb()
  const refs = rawIds.map(toRawRef)
  const [rows] = await db.query<[{ id: RecordId; status: string }[]]>(
    'SELECT id, status FROM raw_capture WHERE id IN $ids',
    { ids: refs }
  )
  const byId = new Map(rows.map(row => [String(row.id), row.status]))
  const missing = rawIds.filter(id => !byId.has(id))
  if (missing.length > 0) throw new Error(`raw_capture not found: ${missing.join(', ')}`)

  const blocked = rawIds
    .map(id => ({ id, status: byId.get(id) }))
    .filter(row => row.status !== 'pending' && row.status !== 'deferred')
  if (blocked.length > 0) {
    throw new Error(`raw_capture not committable: ${blocked.map(row => `${row.id} status=${row.status}`).join(', ')}`)
  }
}

async function assertExistingRecordRefs(noteIds: Set<string>, blockIds: Set<string>): Promise<void> {
  const db = await getDb()
  if (noteIds.size > 0) {
    const ids = Array.from(noteIds)
    const [rows] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM note WHERE id IN $ids', {
      ids: ids.map(toNoteRef)
    })
    const existing = new Set(rows.map(row => String(row.id)))
    const missing = ids.filter(id => !existing.has(id))
    if (missing.length > 0) throw new Error(`note not found: ${missing.join(', ')}`)
  }
  if (blockIds.size > 0) {
    const ids = Array.from(blockIds)
    const [rows] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM block WHERE id IN $ids', {
      ids: ids.map(toBlockRef)
    })
    const existing = new Set(rows.map(row => String(row.id)))
    const missing = ids.filter(id => !existing.has(id))
    if (missing.length > 0) throw new Error(`block not found: ${missing.join(', ')}`)
  }
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
 * Validate the *stored* payload (real ids everywhere) before commit: every
 * referenced record that this proposal does NOT create must already exist, and
 * part_of/blocked_by endpoints must be notes. Pure-id; no temp resolution.
 */
export async function assertProposalRefs(payload: StoredProposalPayload): Promise<void> {
  const createdNotes = new Set(payload.note_creates.map(n => n.id))
  const createdBlocks = new Set(payload.narrative_blocks.map(b => b.id))
  const needNotes = new Set<string>()
  const needBlocks = new Set<string>()
  const needNote = (id: string): void => {
    if (!createdNotes.has(id)) needNotes.add(id)
  }
  const needBlock = (id: string): void => {
    if (!createdBlocks.has(id)) needBlocks.add(id)
  }

  for (const update of payload.note_updates) needNotes.add(update.id)
  for (const a of payload.about) {
    if (nodeKind(a.block_id) !== 'block') throw new Error(`about.block_id must be a block: ${a.block_id}`)
    needBlock(a.block_id)
    needNote(a.note_id)
  }
  for (const a of payload.affects) {
    if (nodeKind(a.block_id) !== 'block') throw new Error(`affects.block_id must be a block: ${a.block_id}`)
    needBlock(a.block_id)
    needNote(a.note_id)
  }

  assertSingleParentPerChild(payload.edges)
  for (const edge of [...payload.edges, ...payload.edges_remove]) {
    const fromKind = nodeKind(edge.from)
    const toKind = nodeKind(edge.to)
    if ((edge.kind === 'part_of' || edge.kind === 'blocked_by') && (fromKind !== 'note' || toKind !== 'note')) {
      throw new Error(`${edge.kind} requires note refs`)
    }
    fromKind === 'note' ? needNote(edge.from) : needBlock(edge.from)
    toKind === 'note' ? needNote(edge.to) : needBlock(edge.to)
  }

  await assertExistingRecordRefs(needNotes, needBlocks)
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

function assertNoTemporalLeakInMetadata(payload: ProposalPayload): void {
  const offenders: string[] = []
  const scan = (meta: Record<string, unknown> | undefined, where: string): void => {
    if (!meta) return
    for (const key of Object.keys(meta)) {
      if (TEMPORAL_LEAK_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        offenders.push(`${where}.metadata.${key}`)
      }
    }
  }
  for (const note of payload.note_creates) scan(note.metadata, note.temp_id)
  for (const note of payload.note_updates) scan(note.metadata_merge, note.id)
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
