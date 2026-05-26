import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import {
  AffectActionSchema,
  BLOCK_ID_RE,
  EdgeKindSchema,
  NOTE_ID_RE,
  NoteStateSchema,
  NoteTypeSlugSchema,
  PROPOSAL_ID_RE,
  RAW_CAPTURE_ID_RE
} from '../domain'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'
import { renderProposalDiff } from './proposal-render'

type RecordRef = RecordId | StringRecordId

const TEMP_ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/
const NoteRefSchema = z.string().refine(value => TEMP_ID_RE.test(value) || NOTE_ID_RE.test(value), {
  message: 'Must be a note temp_id or a note record id'
})
const NodeRefSchema = z
  .string()
  .refine(value => TEMP_ID_RE.test(value) || NOTE_ID_RE.test(value) || BLOCK_ID_RE.test(value), {
    message: 'Must be a temp_id, note id, or block id'
  })
const BlockRefSchema = z.string().refine(value => TEMP_ID_RE.test(value) || BLOCK_ID_RE.test(value), {
  message: 'Must be a block temp_id or a block record id'
})

const DescriptiveBlockSchema = z.object({
  content: z.string().min(1)
})

const NarrativeBlockSchema = z.object({
  temp_id: z.string().regex(TEMP_ID_RE),
  content: z.string().min(1),
  raw_ids: z.array(z.string().regex(RAW_CAPTURE_ID_RE)).min(1)
})

const NoteCreateSchema = z.object({
  temp_id: z.string().regex(TEMP_ID_RE),
  type_slug: NoteTypeSlugSchema,
  title: z.string().min(1),
  state: NoteStateSchema.default('CLARIFIED'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  descriptive_blocks: z.array(DescriptiveBlockSchema).default([])
})

const NoteUpdateSchema = z.object({
  id: z.string().regex(NOTE_ID_RE),
  title: z.string().min(1).optional(),
  state: NoteStateSchema.optional(),
  metadata_merge: z.record(z.string(), z.unknown()).optional(),
  descriptive_blocks_append: z.array(DescriptiveBlockSchema).default([])
})

const ProposalEdgeSchema = z.object({
  kind: EdgeKindSchema,
  from: NodeRefSchema,
  to: NodeRefSchema,
  reason: z.string().optional()
})

const ProposalAboutSchema = z.object({
  block_temp_id: BlockRefSchema,
  note_ref: NoteRefSchema
})

const ProposalAffectsSchema = z.object({
  block_temp_id: BlockRefSchema,
  note_ref: NoteRefSchema,
  action: AffectActionSchema,
  summary: z.string().min(1).optional()
})

export const proposalPayloadSchema = z.object({
  raw_ids: z.array(z.string().regex(RAW_CAPTURE_ID_RE)).min(1),
  narrative_blocks: z.array(NarrativeBlockSchema).min(1),
  note_creates: z.array(NoteCreateSchema).default([]),
  note_updates: z.array(NoteUpdateSchema).default([]),
  edges: z.array(ProposalEdgeSchema).default([]),
  about: z.array(ProposalAboutSchema).default([]),
  affects: z.array(ProposalAffectsSchema).default([])
})

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>

export const createProposalShape = {
  raw_ids: z
    .array(z.string().regex(RAW_CAPTURE_ID_RE, 'Must be a record id like "raw_capture:abc123"'))
    .min(1)
    .max(100),
  payload: proposalPayloadSchema
}

export const updateProposalShape = {
  proposal_id: z.string().regex(PROPOSAL_ID_RE, 'Must be a record id like "proposal:abc123"'),
  payload: proposalPayloadSchema
}

export const getProposalShape = {
  proposal_id: z.string().regex(PROPOSAL_ID_RE, 'Must be a record id like "proposal:abc123"')
}

export const discardProposalShape = getProposalShape
export const commitProposalShape = getProposalShape

const createProposalSchema = z.object(createProposalShape)
const updateProposalSchema = z.object(updateProposalShape)
const getProposalSchema = z.object(getProposalShape)
const discardProposalSchema = z.object(discardProposalShape)
const commitProposalSchema = z.object(commitProposalShape)

export type CreateProposalInput = z.infer<typeof createProposalSchema>
export type UpdateProposalInput = z.infer<typeof updateProposalSchema>
export type GetProposalInput = z.infer<typeof getProposalSchema>
export type DiscardProposalInput = z.infer<typeof discardProposalSchema>
export type CommitProposalInput = z.infer<typeof commitProposalSchema>

type ProposalRow = {
  id: RecordId
  status: string
  raw_captures: RecordRef[]
  payload: ProposalPayload
  created_at: Date
  updated_at: Date
}

export type ProposalDetail = {
  id: string
  status: string
  raw_captures: string[]
  payload: ProposalPayload
  created_at: string
  updated_at: string
}

export type CommitProposalResult = {
  proposal_id: string
  raw_ids_processed: string[]
  narrative_blocks_created: string[]
  notes_created: string[]
  notes_updated: string[]
  descriptive_blocks_created: string[]
  derived_from_created: number
  about_created: number
  affects_created: number
  semantic_edges_created: number
}

function toRawRef(rawId: string): StringRecordId {
  return new StringRecordId(rawId)
}

function toProposalRef(proposalId: string): StringRecordId {
  return new StringRecordId(proposalId)
}

function toNoteRef(noteId: string): StringRecordId {
  return new StringRecordId(noteId)
}

function toBlockRef(blockId: string): StringRecordId {
  return new StringRecordId(blockId)
}

function stringifyDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

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

async function assertRawCapturesExist(rawIds: string[]): Promise<void> {
  const db = await getDb()
  const refs = rawIds.map(toRawRef)
  const [rows] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM raw_capture WHERE id IN $ids', { ids: refs })
  const existing = new Set(rows.map(row => String(row.id)))
  const missing = rawIds.filter(id => !existing.has(id))
  if (missing.length > 0) throw new Error(`raw_capture not found: ${missing.join(', ')}`)
}

async function assertRawCapturesCommittable(rawIds: string[]): Promise<void> {
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

async function assertProposalRefs(payload: ProposalPayload): Promise<void> {
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

function validatePayload(rawIds: string[], payload: ProposalPayload): ProposalPayload {
  assertRawIdsMatch(rawIds, payload.raw_ids)
  assertUniqueTempIds(payload)
  assertNarrativeRawIdsAreDeclared(payload)
  return payload
}

function toProposalDetail(row: ProposalRow): ProposalDetail {
  return {
    id: String(row.id),
    status: row.status,
    raw_captures: row.raw_captures.map(String),
    payload: row.payload,
    created_at: stringifyDate(row.created_at),
    updated_at: stringifyDate(row.updated_at)
  }
}

async function fetchProposal(proposalId: string): Promise<ProposalRow | null> {
  const db = await getDb()
  const [rows] = await db.query<[ProposalRow[]]>('SELECT * FROM proposal WHERE id = $id', {
    id: toProposalRef(proposalId)
  })
  return rows[0] ?? null
}

async function requireDraftProposal(proposalId: string): Promise<ProposalRow> {
  const proposal = await fetchProposal(proposalId)
  if (!proposal) throw new Error(`proposal not found: ${proposalId}`)
  if (proposal.status !== 'draft') throw new Error(`proposal is not draft: ${proposal.status}`)
  return proposal
}

export async function createProposalImpl(input: CreateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const payload = validatePayload(input.raw_ids, proposalPayloadSchema.parse(input.payload))
  await assertRawCapturesExist(payload.raw_ids)

  const data = {
    status: 'draft',
    raw_captures: payload.raw_ids.map(toRawRef),
    payload
  }
  const [rows] = await db.query<[ProposalRow[]]>('CREATE proposal CONTENT $data RETURN AFTER', { data })
  const proposal = rows[0]
  if (!proposal) throw new Error('create_proposal: insert returned no record')

  await emitEvent({
    kind: 'proposal_created',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids }
  })

  return toProposalDetail(proposal)
}

export async function updateProposalImpl(input: UpdateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const payload = proposalPayloadSchema.parse(input.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesExist(payload.raw_ids)
  await requireDraftProposal(input.proposal_id)

  const [rows] = await db.query<[ProposalRow[]]>(
    'UPDATE $id SET raw_captures = $raw_captures, payload = $payload RETURN AFTER',
    {
      id: toProposalRef(input.proposal_id),
      raw_captures: payload.raw_ids.map(toRawRef),
      payload
    }
  )
  const proposal = rows[0]
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)

  await emitEvent({
    kind: 'proposal_updated',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids }
  })

  return toProposalDetail(proposal)
}

export async function getProposalImpl(input: GetProposalInput): Promise<ProposalDetail | null> {
  const proposal = await fetchProposal(input.proposal_id)
  return proposal ? toProposalDetail(proposal) : null
}

export async function discardProposalImpl(input: DiscardProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  await requireDraftProposal(input.proposal_id)
  const [rows] = await db.query<[ProposalRow[]]>("UPDATE $id SET status = 'discarded' RETURN AFTER", {
    id: toProposalRef(input.proposal_id)
  })
  const proposal = rows[0]
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)

  await emitEvent({
    kind: 'proposal_discarded',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: proposal.payload.raw_ids }
  })

  return toProposalDetail(proposal)
}

function buildNoteCreateData(note: z.infer<typeof NoteCreateSchema>): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: note.title,
    type: new StringRecordId(`note_type:${note.type_slug}`),
    state: note.state
  }
  if (note.metadata) data.metadata = note.metadata
  return data
}

async function createNote(note: z.infer<typeof NoteCreateSchema>): Promise<RecordId> {
  const db = await getDb()
  const [rows] = await db.query<[{ id: RecordId }[]]>('CREATE note CONTENT $data RETURN AFTER', {
    data: buildNoteCreateData(note)
  })
  const created = rows[0]
  if (!created) throw new Error(`failed to create note: ${note.title}`)
  return created.id
}

async function appendDescriptiveBlocks(noteId: RecordId, blocks: { content: string }[]): Promise<RecordId[]> {
  if (blocks.length === 0) return []
  const db = await getDb()
  const rowsToInsert = blocks.map(block => ({ note: noteId, block_kind: 'descriptive', content: block.content }))
  const [blockRows] = await db.query<[{ id: RecordId }[]]>('INSERT INTO block $rows RETURN AFTER', {
    rows: rowsToInsert
  })
  const blockIds = blockRows.map(row => row.id)
  const [notes] = await db.query<[{ block_order?: RecordId[] }[]]>('SELECT block_order FROM $note', { note: noteId })
  const currentOrder = notes[0]?.block_order ?? []
  await db.query('UPDATE $note SET block_order = $order', { note: noteId, order: [...currentOrder, ...blockIds] })
  return blockIds
}

async function updateNote(
  note: z.infer<typeof NoteUpdateSchema>
): Promise<{ id: RecordId; blocks_created: RecordId[] }> {
  const db = await getDb()
  const noteRef = toNoteRef(note.id)
  const [existingRows] = await db.query<[{ id: RecordId; metadata?: Record<string, unknown> | null }[]]>(
    'SELECT id, metadata FROM note WHERE id = $id',
    { id: noteRef }
  )
  const existing = existingRows[0]
  if (!existing) throw new Error(`note not found: ${note.id}`)

  const data: Record<string, unknown> = {}
  if (note.title != null) data.title = note.title
  if (note.state != null) data.state = note.state
  if (note.metadata_merge != null) data.metadata = { ...(existing.metadata ?? {}), ...note.metadata_merge }
  if (Object.keys(data).length > 0) {
    await db.query('UPDATE $id MERGE $data', { id: noteRef, data })
  }
  const blocksCreated = await appendDescriptiveBlocks(existing.id, note.descriptive_blocks_append)
  return { id: existing.id, blocks_created: blocksCreated }
}

async function createNarrativeBlock(block: z.infer<typeof NarrativeBlockSchema>): Promise<RecordId> {
  const db = await getDb()
  const data = {
    block_kind: 'narrative',
    content: block.content,
    topologized_at: new Date()
  }
  const [rows] = await db.query<[{ id: RecordId }[]]>('CREATE block CONTENT $data RETURN AFTER', { data })
  const created = rows[0]
  if (!created) throw new Error(`failed to create narrative block: ${block.temp_id}`)
  return created.id
}

function resolveNoteRef(ref: string, noteRefs: Map<string, RecordRef>): RecordRef {
  const found = noteRefs.get(ref)
  if (found) return found
  if (NOTE_ID_RE.test(ref)) return toNoteRef(ref)
  throw new Error(`unknown note ref: ${ref}`)
}

function resolveBlockRef(ref: string, blockRefs: Map<string, RecordRef>): RecordRef {
  const found = blockRefs.get(ref)
  if (found) return found
  if (BLOCK_ID_RE.test(ref)) return toBlockRef(ref)
  throw new Error(`unknown block ref: ${ref}`)
}

function resolveNodeRef(ref: string, noteRefs: Map<string, RecordRef>, blockRefs: Map<string, RecordRef>): RecordRef {
  const note = noteRefs.get(ref)
  if (note) return note
  const block = blockRefs.get(ref)
  if (block) return block
  if (NOTE_ID_RE.test(ref) || BLOCK_ID_RE.test(ref)) return new StringRecordId(ref)
  throw new Error(`unknown node ref: ${ref}`)
}

function requireNoteRecord(kind: string, ref: string, id: RecordRef): void {
  if (!String(id).startsWith('note:')) throw new Error(`${kind} requires a note ref: ${ref}`)
}

async function createSemanticEdge(
  kind: 'part_of' | 'blocked_by' | 'mentions',
  from: RecordRef,
  to: RecordRef
): Promise<void> {
  const db = await getDb()
  await db.query(`RELATE $from->${kind}->$to`, { from, to })
}

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposalPayloadSchema.parse(proposal.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)

  const noteRefs = new Map<string, RecordRef>()
  const blockRefs = new Map<string, RecordRef>()
  const notesCreated: RecordId[] = []
  const notesUpdated: RecordId[] = []
  const descriptiveBlocksCreated: RecordId[] = []
  const narrativeBlocksCreated: RecordId[] = []
  let derivedFromCreated = 0
  let aboutCreated = 0
  let affectsCreated = 0
  let semanticEdgesCreated = 0

  for (const note of payload.note_creates) {
    const noteId = await createNote(note)
    noteRefs.set(note.temp_id, noteId)
    notesCreated.push(noteId)
    descriptiveBlocksCreated.push(...(await appendDescriptiveBlocks(noteId, note.descriptive_blocks)))
  }

  for (const note of payload.note_updates) {
    const updated = await updateNote(note)
    noteRefs.set(note.id, updated.id)
    notesUpdated.push(updated.id)
    descriptiveBlocksCreated.push(...updated.blocks_created)
  }

  for (const block of payload.narrative_blocks) {
    const blockId = await createNarrativeBlock(block)
    blockRefs.set(block.temp_id, blockId)
    narrativeBlocksCreated.push(blockId)
    for (const rawId of block.raw_ids) {
      await db.query("RELATE $block->derived_from->$raw CONTENT { transformation: 'summarized' }", {
        block: blockId,
        raw: toRawRef(rawId)
      })
      derivedFromCreated++
    }
  }

  for (const about of payload.about) {
    const blockId = resolveBlockRef(about.block_temp_id, blockRefs)
    const noteId = resolveNoteRef(about.note_ref, noteRefs)
    await db.query('RELATE $block->about->$note', { block: blockId, note: noteId })
    aboutCreated++
  }

  for (const affect of payload.affects) {
    const blockId = resolveBlockRef(affect.block_temp_id, blockRefs)
    const noteId = resolveNoteRef(affect.note_ref, noteRefs)
    const content: Record<string, unknown> = { action: affect.action }
    if (affect.summary != null) content.summary = affect.summary
    await db.query('RELATE $block->affects->$note CONTENT $content', {
      block: blockId,
      note: noteId,
      content
    })
    affectsCreated++
  }

  for (const edge of payload.edges) {
    const from = resolveNodeRef(edge.from, noteRefs, blockRefs)
    const to = resolveNodeRef(edge.to, noteRefs, blockRefs)
    if (edge.kind === 'part_of' || edge.kind === 'blocked_by') {
      requireNoteRecord(edge.kind, edge.from, from)
      requireNoteRecord(edge.kind, edge.to, to)
    }
    await createSemanticEdge(edge.kind, from, to)
    semanticEdgesCreated++
  }

  await db.query("UPDATE raw_capture SET status = 'processed', processed_at = time::now() WHERE id IN $ids", {
    ids: payload.raw_ids.map(toRawRef)
  })
  await db.query("UPDATE $proposal SET status = 'committed'", { proposal: proposal.id })

  await emitEvent({
    kind: 'proposal_committed',
    actor: 'user',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: {
      raw_ids: payload.raw_ids,
      narrative_blocks_created: narrativeBlocksCreated.map(String),
      notes_created: notesCreated.map(String),
      notes_updated: notesUpdated.map(String)
    }
  })

  return {
    proposal_id: input.proposal_id,
    raw_ids_processed: payload.raw_ids,
    narrative_blocks_created: narrativeBlocksCreated.map(String),
    notes_created: notesCreated.map(String),
    notes_updated: notesUpdated.map(String),
    descriptive_blocks_created: descriptiveBlocksCreated.map(String),
    derived_from_created: derivedFromCreated,
    about_created: aboutCreated,
    affects_created: affectsCreated,
    semantic_edges_created: semanticEdgesCreated
  }
}

export function registerProposalTools(server: McpServer): void {
  server.tool(
    'create_proposal',
    'Persist a visible draft proposal from inbox raw_capture ids. Does not mutate notes, blocks, or graph edges.',
    createProposalShape,
    async args => {
      const proposal = await createProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'update_proposal',
    'Update a draft proposal payload. Rejected once the proposal is committed or discarded.',
    updateProposalShape,
    async args => {
      const proposal = await updateProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'get_proposal',
    'Fetch a persisted proposal: a deterministic, human-readable preview of what committing it will create and change, followed by the raw JSON.',
    getProposalShape,
    async args => {
      const proposal = await getProposalImpl(args)
      if (!proposal) return { content: [{ type: 'text', text: 'Proposal not found.' }] }
      const text = `${renderProposalDiff(proposal)}\n\n---\n\n${JSON.stringify(proposal, null, 2)}`
      return { content: [{ type: 'text', text }] }
    }
  )

  server.tool(
    'discard_proposal',
    'Discard a draft proposal without mutating notes, blocks, or graph edges.',
    discardProposalShape,
    async args => {
      const proposal = await discardProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'commit_proposal',
    'Commit an approved proposal: create narrative blocks, apply minimal note/edge mutations, link provenance, and mark raws processed.',
    commitProposalShape,
    async args => {
      const result = await commitProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )
}
