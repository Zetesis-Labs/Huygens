import type { RecordId } from 'surrealdb'
import { BLOCK_ID_RE, NOTE_ID_RE } from '../../domain'
import { getDb } from '../../surreal'
import type { ProposalPayload } from './schemas'
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

function collectDeclaredRefs(payload: ProposalPayload): { noteRefs: Set<string>; blockRefs: Set<string> } {
  return {
    noteRefs: new Set([
      ...payload.note_creates.map(note => note.temp_id),
      ...payload.note_updates.map(note => note.id)
    ]),
    blockRefs: new Set(payload.narrative_blocks.map(block => block.temp_id))
  }
}

function classifyNodeRef(ref: string, declared: { noteRefs: Set<string>; blockRefs: Set<string> }): 'note' | 'block' {
  if (declared.noteRefs.has(ref) || NOTE_ID_RE.test(ref)) return 'note'
  if (declared.blockRefs.has(ref) || BLOCK_ID_RE.test(ref)) return 'block'
  throw new Error(`unknown node ref: ${ref}`)
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

type RefScope = {
  declared: { noteRefs: Set<string>; blockRefs: Set<string> }
  rememberExisting: (ref: string) => void
}

/** A block→note trace link (about / affects): both ends must be declared or real. */
function assertTraceLink(link: { block_temp_id: string; note_ref: string }, scope: RefScope): void {
  if (!scope.declared.blockRefs.has(link.block_temp_id) && !BLOCK_ID_RE.test(link.block_temp_id)) {
    throw new Error(`unknown block ref: ${link.block_temp_id}`)
  }
  if (!scope.declared.noteRefs.has(link.note_ref) && !NOTE_ID_RE.test(link.note_ref)) {
    throw new Error(`unknown note ref: ${link.note_ref}`)
  }
  scope.rememberExisting(link.block_temp_id)
  scope.rememberExisting(link.note_ref)
}

/** A semantic edge (in `edges` or `edges_remove`): part_of/blocked_by need notes. */
function assertEdgeEndpoints(edge: { kind: string; from: string; to: string }, scope: RefScope): void {
  const fromKind = classifyNodeRef(edge.from, scope.declared)
  const toKind = classifyNodeRef(edge.to, scope.declared)
  if ((edge.kind === 'part_of' || edge.kind === 'blocked_by') && (fromKind !== 'note' || toKind !== 'note')) {
    throw new Error(`${edge.kind} requires note refs`)
  }
  scope.rememberExisting(edge.from)
  scope.rememberExisting(edge.to)
}

/** At most one part_of parent per child in a single proposal: two different
 * parents for the same `from` is ambiguous (which wins the replace?). */
function assertSingleParentPerChild(edges: ProposalPayload['edges']): void {
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

export async function assertProposalRefs(payload: ProposalPayload): Promise<void> {
  const declared = collectDeclaredRefs(payload)
  const existingNoteIds = new Set<string>()
  const existingBlockIds = new Set<string>()
  const rememberExisting = (ref: string) => {
    if (NOTE_ID_RE.test(ref)) existingNoteIds.add(ref)
    if (BLOCK_ID_RE.test(ref)) existingBlockIds.add(ref)
  }
  const scope: RefScope = { declared, rememberExisting }

  for (const update of payload.note_updates) existingNoteIds.add(update.id)
  for (const about of payload.about) assertTraceLink(about, scope)
  for (const affect of payload.affects) assertTraceLink(affect, scope)
  assertSingleParentPerChild(payload.edges)
  for (const edge of payload.edges) assertEdgeEndpoints(edge, scope)
  for (const edge of payload.edges_remove) assertEdgeEndpoints(edge, scope)

  await assertExistingRecordRefs(existingNoteIds, existingBlockIds)
}

export function validatePayload(rawIds: string[], payload: ProposalPayload): ProposalPayload {
  assertRawIdsMatch(rawIds, payload.raw_ids)
  assertUniqueTempIds(payload)
  assertNarrativeRawIdsAreDeclared(payload)
  return payload
}
