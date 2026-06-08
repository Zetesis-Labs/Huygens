import type { RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import {
  AffectActionSchema,
  BLOCK_ID_RE,
  EdgeKindSchema,
  InformeKindSchema,
  NOTE_ID_RE,
  NoteStateSchema,
  NoteTypeSlugSchema,
  PROPOSAL_ID_RE,
  RAW_CAPTURE_ID_RE
} from '../../domain'

export type RecordRef = RecordId | StringRecordId

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

/**
 * Validate a day-granular date string: it must start with a REAL calendar day
 * (YYYY-MM-DD) and parse. Rejects impossible dates like `2026-02-31` — `new Date`
 * would silently roll those into the next month, so we round-trip the Y/M/D
 * components and require they survive unchanged. The optional time/zone suffix
 * only needs to parse (it's discarded on commit, which keeps just the day).
 */
function isValidDayDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const day = new Date(`${y}-${mo}-${d}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime())) return false
  // round-trip: a rolled-over impossible date won't match its own components
  if (day.getUTCFullYear() !== Number(y) || day.getUTCMonth() + 1 !== Number(mo) || day.getUTCDate() !== Number(d)) {
    return false
  }
  return !Number.isNaN(new Date(value).getTime()) // the full value (with any time/zone) must parse too
}

/**
 * A day-granular date: a calendar day (YYYY-MM-DD) or a full ISO datetime. Used by
 * the three temporal axes — `mit_for` (priority), `due_at` (hard deadline) and
 * `defer_until` (tickler). On commit it is normalized to that day's UTC midnight
 * (see commit.ts `toDayUtcMidnight`), so date-range queries are consistent.
 */
const DayDateSchema = z.string().refine(isValidDayDate, {
  message: 'must be a real calendar date (YYYY-MM-DD) or ISO datetime — e.g. 2026-02-31 is rejected'
})

const DescriptiveBlockSchema = z.object({
  content: z.string().min(1)
})

const NarrativeBlockSchema = z.object({
  temp_id: z.string().regex(TEMP_ID_RE),
  content: z.string().min(1),
  raw_ids: z.array(z.string().regex(RAW_CAPTURE_ID_RE)).min(1),
  // Set by the planning/review rituals so the dashboard can surface this informe
  // as a first-class plan/review (Bitácora). Absent for a plain processing informe.
  kind: InformeKindSchema.optional()
})

export const NoteCreateSchema = z.object({
  temp_id: z.string().regex(TEMP_ID_RE),
  type_slug: NoteTypeSlugSchema,
  title: z.string().min(1),
  state: NoteStateSchema.default('CLARIFIED'),
  mit_for: DayDateSchema.optional(),
  due_at: DayDateSchema.optional(),
  defer_until: DayDateSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  descriptive_blocks: z.array(DescriptiveBlockSchema).default([])
})

const NoteUpdateSchema = z.object({
  id: z.string().regex(NOTE_ID_RE),
  title: z.string().min(1).optional(),
  state: NoteStateSchema.optional(),
  mit_for: DayDateSchema.nullable().optional(),
  due_at: DayDateSchema.nullable().optional(),
  defer_until: DayDateSchema.nullable().optional(),
  metadata_merge: z.record(z.string(), z.unknown()).optional(),
  descriptive_blocks_append: z.array(DescriptiveBlockSchema).default([])
})

const ProposalEdgeSchema = z.object({
  kind: EdgeKindSchema,
  from: NodeRefSchema,
  to: NodeRefSchema,
  reason: z.string().optional()
})

// Retirada explícita de un edge semántico (part_of / blocked_by / mentions): el
// inverso de `edges`. No lleva `reason` — el porqué vive en el informe-block. El
// reparent de part_of NO necesita declararse aquí: el commit hace replace
// implícito (borra el padre anterior). Declararlo aquí solo mejora el preview.
const EdgeRemoveSchema = z.object({
  kind: EdgeKindSchema,
  from: NodeRefSchema,
  to: NodeRefSchema
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
  edges_remove: z.array(EdgeRemoveSchema).default([]),
  about: z.array(ProposalAboutSchema).default([]),
  affects: z.array(ProposalAffectsSchema).default([])
})

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>
export type NoteCreate = z.infer<typeof NoteCreateSchema>

// ── Stored payload (máximo-limpio) ──────────────────────────────────────────
// The INPUT payload above speaks in `temp_id` placeholders (ergonomic: the agent
// references not-yet-created notes in edges). On create_proposal we *realize* it:
// every new note/narrative-block gets a real record id (uuidv7) and EVERY ref is
// rewritten temp→real. What we persist — and what commit, the readers and the
// dashboard see — is this `StoredProposalPayload`: real ids everywhere, no temp_id,
// no bridge. The changefeed (anchored by the commit versionstamp) is the history.
export type StoredNoteCreate = {
  id: string
  type_slug: string
  title: string
  state: string
  mit_for?: string
  due_at?: string
  defer_until?: string
  metadata?: Record<string, unknown>
  descriptive_blocks: { id: string; content: string }[]
}
export type StoredNarrativeBlock = { id: string; content: string; raw_ids: string[]; kind?: string }
export type StoredNoteUpdate = {
  id: string
  title?: string
  state?: string
  mit_for?: string | null
  due_at?: string | null
  defer_until?: string | null
  metadata_merge?: Record<string, unknown>
  descriptive_blocks_append: { id: string; content: string }[]
}
export type StoredEdge = { kind: string; from: string; to: string; reason?: string }
export type StoredEdgeRemove = { kind: string; from: string; to: string }
export type StoredAbout = { block_id: string; note_id: string }
export type StoredAffect = { block_id: string; note_id: string; action: string; summary?: string }
export type StoredProposalPayload = {
  raw_ids: string[]
  narrative_blocks: StoredNarrativeBlock[]
  note_creates: StoredNoteCreate[]
  note_updates: StoredNoteUpdate[]
  edges: StoredEdge[]
  edges_remove: StoredEdgeRemove[]
  about: StoredAbout[]
  affects: StoredAffect[]
}

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

const proposalIdShape = {
  proposal_id: z.string().regex(PROPOSAL_ID_RE, 'Must be a record id like "proposal:abc123"')
}

export const getProposalShape = proposalIdShape
export const discardProposalShape = proposalIdShape
export const commitProposalShape = {
  proposal_id: z.string().regex(PROPOSAL_ID_RE, 'Must be a record id like "proposal:abc123"'),
  // The user's explicit approval to apply this commit. REQUIRED to be `true` when
  // the proposal carries a daily-ritual informe (a narrative block with
  // kind=plan_day/review_day): such a plan/close must never be committed unless
  // the user actually asked for it. Plain (non-ritual) commits ignore it. The
  // server can't verify a human said yes, but this forces a deliberate, audited
  // assertion — see huygens://lore/operating-doctrine.
  approved: z
    .boolean()
    .optional()
    .describe("The user's explicit approval. Must be true to commit a daily-ritual informe (plan_day/review_day).")
}
export const getProposalChangesShape = proposalIdShape

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

/** Legacy: maps payload temp_id → real id. Only present on results committed
 * before the changefeed refactor; new commits don't write it. */
export type TempIdMap = {
  notes: Record<string, string>
  blocks: Record<string, string>
}

/**
 * What a commit stamps on the proposal: just the **anchor**. `committed_at` (the
 * time anchor) + `versionstamp` (the changefeed anchor — which entries are this
 * commit's). The history lives in the changefeed; the payload (real ids) is the
 * intent. The optional fields below only appear on *legacy* results (pre-refactor);
 * new commits never write them and the readers ignore them.
 */
export type ProposalResult = {
  versionstamp: string | null
  committed_at: string
  notes_created?: string[]
  notes_updated?: string[]
  narrative_blocks_created?: string[]
  descriptive_blocks_created?: string[]
  derived_from?: string[]
  about?: string[]
  affects?: string[]
  semantic_edges?: string[]
  edges_removed?: string[]
  temp_ids?: TempIdMap
}

export type ProposalRow = {
  id: RecordId
  status: string
  raw_captures: RecordRef[]
  payload: StoredProposalPayload
  result?: ProposalResult | null
  created_at: Date
  updated_at: Date
}

export type ProposalDetail = {
  id: string
  status: string
  raw_captures: string[]
  payload: StoredProposalPayload
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
  semantic_edges_removed: number
}
