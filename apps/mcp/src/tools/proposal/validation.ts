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

export async function assertProposalRefs(payload: ProposalPayload): Promise<void> {
  const declared = collectDeclaredRefs(payload)
  const existingNoteIds = new Set<string>()
  const existingBlockIds = new Set<string>()

  const rememberExisting = (ref: string) => {
    if (NOTE_ID_RE.test(ref)) existingNoteIds.add(ref)
    if (BLOCK_ID_RE.test(ref)) existingBlockIds.add(ref)
  }

  for (const update of payload.note_updates) {
    existingNoteIds.add(update.id)
  }

  for (const about of payload.about) {
    if (!declared.blockRefs.has(about.block_temp_id) && !BLOCK_ID_RE.test(about.block_temp_id)) {
      throw new Error(`unknown block ref: ${about.block_temp_id}`)
    }
    if (!declared.noteRefs.has(about.note_ref) && !NOTE_ID_RE.test(about.note_ref)) {
      throw new Error(`unknown note ref: ${about.note_ref}`)
    }
    rememberExisting(about.block_temp_id)
    rememberExisting(about.note_ref)
  }

  for (const affect of payload.affects) {
    if (!declared.blockRefs.has(affect.block_temp_id) && !BLOCK_ID_RE.test(affect.block_temp_id)) {
      throw new Error(`unknown block ref: ${affect.block_temp_id}`)
    }
    if (!declared.noteRefs.has(affect.note_ref) && !NOTE_ID_RE.test(affect.note_ref)) {
      throw new Error(`unknown note ref: ${affect.note_ref}`)
    }
    rememberExisting(affect.block_temp_id)
    rememberExisting(affect.note_ref)
  }

  for (const edge of payload.edges) {
    const fromKind = classifyNodeRef(edge.from, declared)
    const toKind = classifyNodeRef(edge.to, declared)
    if ((edge.kind === 'part_of' || edge.kind === 'blocked_by') && (fromKind !== 'note' || toKind !== 'note')) {
      throw new Error(`${edge.kind} requires note refs`)
    }
    rememberExisting(edge.from)
    rememberExisting(edge.to)
  }

  await assertExistingRecordRefs(existingNoteIds, existingBlockIds)
}

export function validatePayload(rawIds: string[], payload: ProposalPayload): ProposalPayload {
  assertRawIdsMatch(rawIds, payload.raw_ids)
  assertUniqueTempIds(payload)
  assertNarrativeRawIdsAreDeclared(payload)
  return payload
}
