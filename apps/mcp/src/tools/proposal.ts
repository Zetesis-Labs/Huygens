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

export type ProposalResult = {
  notes_created: string[]
  notes_updated: string[]
  narrative_blocks_created: string[]
  descriptive_blocks_created: string[]
  derived_from: string[]
  about: string[]
  affects: string[]
  semantic_edges: string[]
  versionstamp: string | null
  committed_at: string
}

type ProposalRow = {
  id: RecordId
  status: string
  raw_captures: RecordRef[]
  payload: ProposalPayload
  result?: ProposalResult | null
  created_at: Date
  updated_at: Date
}

export type ProposalDetail = {
  id: string
  status: string
  raw_captures: string[]
  payload: ProposalPayload
  result: ProposalResult | null
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
    result: row.result ?? null,
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

/** Highest versionstamp currently in a table's changefeed (0n if none). */
async function maxVersionstamp(table: string): Promise<bigint> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(`SHOW CHANGES FOR TABLE ${table} SINCE 0`)
  let max = 0n
  for (const r of rows ?? []) if (typeof r.versionstamp === 'bigint' && r.versionstamp > max) max = r.versionstamp
  return max
}

/**
 * The versionstamp of the changeset that landed after `since`. Best-effort:
 * the changefeed needs a moment to flush, so retry a few times. Returns the
 * versionstamp as a string (it is a u64 bigint, beyond Number precision), or
 * null if nothing surfaced.
 */
async function versionstampSince(table: string, since: bigint): Promise<string | null> {
  const db = await getDb()
  for (let attempt = 0; attempt < 5; attempt++) {
    const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(
      `SHOW CHANGES FOR TABLE ${table} SINCE ${since + 1n}`
    )
    let max = 0n
    for (const r of rows ?? []) if (typeof r.versionstamp === 'bigint' && r.versionstamp > max) max = r.versionstamp
    if (max > 0n) return String(max)
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return null
}

/**
 * Build the single SurrealQL transaction that materializes a committed proposal.
 * All mutations run inside one BEGIN…COMMIT (atomic: all-or-nothing) and share a
 * single versionstamp. The created/touched record ids are captured in LET vars and
 * stored verbatim into `proposal.result`, so "what did this proposal change" is
 * answerable without the changefeed. The versionstamp is filled in afterwards.
 */
/** Accumulates the SurrealQL statements + params for a committed proposal. */
class CommitTx {
  readonly params: Record<string, unknown> = {}
  readonly lines: string[] = ['BEGIN;']
  private pc = 0
  private lc = 0
  private readonly noteTok = new Map<string, string>()
  private readonly blockTok = new Map<string, string>()
  readonly out = {
    notes_created: [] as string[],
    notes_updated: [] as string[],
    narrative_blocks_created: [] as string[],
    descriptive_blocks_created: [] as string[],
    derived_from: [] as string[],
    about: [] as string[],
    affects: [] as string[],
    semantic_edges: [] as string[]
  }

  private p(value: unknown): string {
    const name = `v${this.pc++}`
    this.params[name] = value
    return `$${name}`
  }
  private letVar(): string {
    return `$L${this.lc++}`
  }
  private static arr(xs: string[]): string {
    return `[${xs.join(', ')}]`
  }

  private appendBlocks(target: string, blocks: { content: string }[]): void {
    const bvars: string[] = []
    for (const block of blocks) {
      const bv = this.letVar()
      this.lines.push(
        `LET ${bv} = (CREATE block SET note = ${target}, block_kind = 'descriptive', content = ${this.p(block.content)} RETURN AFTER)[0].id;`
      )
      bvars.push(bv)
      this.out.descriptive_blocks_created.push(bv)
    }
    if (bvars.length > 0) this.lines.push(`UPDATE ${target} SET block_order += ${CommitTx.arr(bvars)};`)
  }

  private creates(payload: ProposalPayload): void {
    for (const note of payload.note_creates) {
      const v = this.letVar()
      this.lines.push(`LET ${v} = (CREATE note CONTENT ${this.p(buildNoteCreateData(note))} RETURN AFTER)[0].id;`)
      this.noteTok.set(note.temp_id, v)
      this.out.notes_created.push(v)
      this.appendBlocks(v, note.descriptive_blocks)
    }
  }

  private updates(payload: ProposalPayload): void {
    for (const note of payload.note_updates) {
      const target = this.p(new StringRecordId(note.id))
      this.noteTok.set(note.id, target)
      this.out.notes_updated.push(target)
      const sets: string[] = []
      if (note.title != null) sets.push(`title = ${this.p(note.title)}`)
      if (note.state != null) sets.push(`state = ${this.p(note.state)}`)
      if (note.metadata_merge != null)
        sets.push(`metadata = object::extend(metadata ?? {}, ${this.p(note.metadata_merge)})`)
      if (sets.length > 0) this.lines.push(`UPDATE ${target} SET ${sets.join(', ')};`)
      this.appendBlocks(target, note.descriptive_blocks_append)
    }
  }

  private narratives(payload: ProposalPayload): void {
    for (const block of payload.narrative_blocks) {
      const v = this.letVar()
      this.lines.push(
        `LET ${v} = (CREATE block SET block_kind = 'narrative', content = ${this.p(block.content)}, topologized_at = time::now() RETURN AFTER)[0].id;`
      )
      this.blockTok.set(block.temp_id, v)
      this.out.narrative_blocks_created.push(v)
      for (const rawId of block.raw_ids) {
        const ev = this.letVar()
        this.lines.push(
          `LET ${ev} = (RELATE ${v}->derived_from->${this.p(new StringRecordId(rawId))} CONTENT { transformation: 'summarized' } RETURN AFTER)[0].id;`
        )
        this.out.derived_from.push(ev)
      }
    }
  }

  private noteToken(ref: string): string {
    const found = this.noteTok.get(ref)
    if (found) return found
    if (NOTE_ID_RE.test(ref)) {
      const tok = this.p(new StringRecordId(ref))
      this.noteTok.set(ref, tok)
      return tok
    }
    throw new Error(`unknown note ref: ${ref}`)
  }
  private blockToken(ref: string): string {
    const found = this.blockTok.get(ref)
    if (found) return found
    if (BLOCK_ID_RE.test(ref)) {
      const tok = this.p(new StringRecordId(ref))
      this.blockTok.set(ref, tok)
      return tok
    }
    throw new Error(`unknown block ref: ${ref}`)
  }
  private nodeToken(ref: string): { tok: string; isNote: boolean } {
    const note = this.noteTok.get(ref)
    if (note) return { tok: note, isNote: true }
    const block = this.blockTok.get(ref)
    if (block) return { tok: block, isNote: false }
    if (NOTE_ID_RE.test(ref)) return { tok: this.p(new StringRecordId(ref)), isNote: true }
    if (BLOCK_ID_RE.test(ref)) return { tok: this.p(new StringRecordId(ref)), isNote: false }
    throw new Error(`unknown node ref: ${ref}`)
  }

  private topology(payload: ProposalPayload): void {
    for (const link of payload.about) {
      const ev = this.letVar()
      this.lines.push(
        `LET ${ev} = (RELATE ${this.blockToken(link.block_temp_id)}->about->${this.noteToken(link.note_ref)} RETURN AFTER)[0].id;`
      )
      this.out.about.push(ev)
    }
    for (const affect of payload.affects) {
      const content: Record<string, unknown> = { action: affect.action }
      if (affect.summary != null) content.summary = affect.summary
      const ev = this.letVar()
      this.lines.push(
        `LET ${ev} = (RELATE ${this.blockToken(affect.block_temp_id)}->affects->${this.noteToken(affect.note_ref)} CONTENT ${this.p(content)} RETURN AFTER)[0].id;`
      )
      this.out.affects.push(ev)
    }
  }

  private edges(payload: ProposalPayload): void {
    for (const edge of payload.edges) {
      const from = this.nodeToken(edge.from)
      const to = this.nodeToken(edge.to)
      if (edge.kind === 'part_of' || edge.kind === 'blocked_by') {
        if (!from.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.from}`)
        if (!to.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.to}`)
      }
      const ev = this.letVar()
      this.lines.push(`LET ${ev} = (RELATE ${from.tok}->${edge.kind}->${to.tok} RETURN AFTER)[0].id;`)
      this.out.semantic_edges.push(ev)
    }
  }

  private finalize(payload: ProposalPayload, proposalId: RecordId): void {
    this.lines.push(
      `UPDATE raw_capture SET status = 'processed', processed_at = time::now() WHERE id IN ${this.p(payload.raw_ids.map(id => new StringRecordId(id)))};`
    )
    const o = this.out
    this.lines.push(
      `UPDATE ${this.p(proposalId)} SET status = 'committed', result = { ` +
        `notes_created: ${CommitTx.arr(o.notes_created)}, notes_updated: ${CommitTx.arr(o.notes_updated)}, ` +
        `narrative_blocks_created: ${CommitTx.arr(o.narrative_blocks_created)}, descriptive_blocks_created: ${CommitTx.arr(o.descriptive_blocks_created)}, ` +
        `derived_from: ${CommitTx.arr(o.derived_from)}, about: ${CommitTx.arr(o.about)}, affects: ${CommitTx.arr(o.affects)}, semantic_edges: ${CommitTx.arr(o.semantic_edges)}, ` +
        'versionstamp: NONE, committed_at: time::now() };'
    )
    this.lines.push('COMMIT;')
  }

  build(payload: ProposalPayload, proposalId: RecordId): { query: string; params: Record<string, unknown> } {
    this.creates(payload)
    this.updates(payload)
    this.narratives(payload)
    this.topology(payload)
    this.edges(payload)
    this.finalize(payload, proposalId)
    return { query: this.lines.join('\n'), params: this.params }
  }
}

function buildCommitTx(
  payload: ProposalPayload,
  proposalId: RecordId
): { query: string; params: Record<string, unknown> } {
  return new CommitTx().build(payload, proposalId)
}

const ids = (xs: unknown): string[] => (Array.isArray(xs) ? xs.map(String) : [])

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposalPayloadSchema.parse(proposal.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)

  // Narrative blocks (>= 1 always) guarantee the `block` table is written, so it
  // is a reliable witness for locating the commit's versionstamp.
  const vsBefore = await maxVersionstamp('block')

  const { query, params } = buildCommitTx(payload, proposal.id)
  await db.query(query, params) // atomic: any failure rolls the whole commit back

  // Best-effort: stamp the proposal with the transaction's versionstamp.
  const versionstamp = await versionstampSince('block', vsBefore)
  if (versionstamp != null) {
    await db.query('UPDATE $proposal SET result.versionstamp = $vs', { proposal: proposal.id, vs: versionstamp })
  }

  const committed = await fetchProposal(input.proposal_id)
  const result = (committed?.result ?? null) as ProposalResult | null

  await emitEvent({
    kind: 'proposal_committed',
    actor: 'user',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids, versionstamp }
  })

  return {
    proposal_id: input.proposal_id,
    raw_ids_processed: payload.raw_ids,
    narrative_blocks_created: ids(result?.narrative_blocks_created),
    notes_created: ids(result?.notes_created),
    notes_updated: ids(result?.notes_updated),
    descriptive_blocks_created: ids(result?.descriptive_blocks_created),
    derived_from_created: ids(result?.derived_from).length,
    about_created: ids(result?.about).length,
    affects_created: ids(result?.affects).length,
    semantic_edges_created: ids(result?.semantic_edges).length
  }
}

export type ProposalChanges = {
  proposal_id: string
  status: string
  versionstamp: string | null
  committed_at: string | null
  materialized: {
    notes_created: unknown[]
    notes_updated: unknown[]
    narrative_blocks_created: unknown[]
    descriptive_blocks_created: unknown[]
    derived_from: unknown[]
    about: unknown[]
    affects: unknown[]
    semantic_edges: unknown[]
  } | null
  changefeed: {
    available: boolean
    versionstamp: string | null
    tables: Record<string, unknown[]>
    note?: string
  }
}

/** Vía 1: resolve a list of record ids to their current records. */
async function resolveRecords(idsList: unknown): Promise<unknown[]> {
  const list = Array.isArray(idsList) ? idsList : []
  if (list.length === 0) return []
  const db = await getDb()
  const refs = list.map(value => new StringRecordId(String(value)))
  const [rows] = await db.query<[unknown[]]>('SELECT * FROM $ids', { ids: refs })
  return rows ?? []
}

/** Deep-normalize a value to JSON-safe form (changefeed versionstamps are BigInt,
 * which JSON.stringify cannot serialize). BigInt → string; record ids keep their
 * own JSON form. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)))
}

/** Vía 2: changefeed changesets that belong to exactly this commit's versionstamp. */
async function changefeedAt(table: string, vs: bigint): Promise<unknown[]> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(
    `SHOW CHANGES FOR TABLE ${table} SINCE ${vs - 1n} LIMIT 200`
  )
  const matching = (rows ?? []).filter(change => String(change.versionstamp) === String(vs))
  return jsonSafe(matching)
}

function tablesFromResult(result: ProposalResult): string[] {
  const all = [
    ...result.notes_created,
    ...result.notes_updated,
    ...result.narrative_blocks_created,
    ...result.descriptive_blocks_created,
    ...result.derived_from,
    ...result.about,
    ...result.affects,
    ...result.semantic_edges
  ]
  const tables = new Set<string>(['raw_capture'])
  for (const id of all) {
    const table = String(id).split(':')[0]
    if (table) tables.add(table)
  }
  return [...tables]
}

async function materializeResult(result: ProposalResult): Promise<NonNullable<ProposalChanges['materialized']>> {
  return {
    notes_created: await resolveRecords(result.notes_created),
    notes_updated: await resolveRecords(result.notes_updated),
    narrative_blocks_created: await resolveRecords(result.narrative_blocks_created),
    descriptive_blocks_created: await resolveRecords(result.descriptive_blocks_created),
    derived_from: await resolveRecords(result.derived_from),
    about: await resolveRecords(result.about),
    affects: await resolveRecords(result.affects),
    semantic_edges: await resolveRecords(result.semantic_edges)
  }
}

async function changefeedForResult(result: ProposalResult): Promise<ProposalChanges['changefeed']> {
  if (!result.versionstamp) {
    return {
      available: false,
      versionstamp: null,
      tables: {},
      note: 'No versionstamp captured (best-effort changefeed flush); use the materialized view.'
    }
  }
  const vs = BigInt(result.versionstamp)
  const tables: Record<string, unknown[]> = {}
  for (const table of tablesFromResult(result)) {
    const changes = await changefeedAt(table, vs)
    if (changes.length > 0) tables[table] = changes
  }
  return { available: true, versionstamp: result.versionstamp, tables }
}

/**
 * Recover the exact changes a committed proposal produced, two ways:
 * - materialized: the real record ids in proposal.result resolved to records.
 * - changefeed: the literal transaction delta at the commit versionstamp.
 */
export async function getProposalChangesImpl(input: GetProposalInput): Promise<ProposalChanges> {
  const proposal = await fetchProposal(input.proposal_id)
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)
  const result = proposal.result ?? null
  const base = { proposal_id: String(proposal.id), status: proposal.status }
  if (!result) {
    return {
      ...base,
      versionstamp: null,
      committed_at: null,
      materialized: null,
      changefeed: {
        available: false,
        versionstamp: null,
        tables: {},
        note: 'No materialized result: the proposal is not committed, or was committed before this feature.'
      }
    }
  }
  return {
    ...base,
    versionstamp: result.versionstamp,
    committed_at: result.committed_at,
    materialized: await materializeResult(result),
    changefeed: await changefeedForResult(result)
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
    'get_proposal_changes',
    'Recover the exact changes a committed proposal produced, two ways: "materialized" resolves the real record ids in proposal.result to their current records; "changefeed" returns the literal transaction delta at the commit versionstamp. Read-only.',
    getProposalShape,
    async args => {
      const changes = await getProposalChangesImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }] }
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
