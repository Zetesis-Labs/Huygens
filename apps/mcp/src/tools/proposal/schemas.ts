import type { RecordId, StringRecordId } from 'surrealdb'
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

const DescriptiveBlockSchema = z.object({
  content: z.string().min(1)
})

const NarrativeBlockSchema = z.object({
  temp_id: z.string().regex(TEMP_ID_RE),
  content: z.string().min(1),
  raw_ids: z.array(z.string().regex(RAW_CAPTURE_ID_RE)).min(1)
})

export const NoteCreateSchema = z.object({
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
export type NoteCreate = z.infer<typeof NoteCreateSchema>

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

export const getProposalChangesShape = {
  proposal_id: z.string().regex(PROPOSAL_ID_RE, 'Must be a record id like "proposal:abc123"'),
  format_d2: z
    .enum(['code', 'svg', 'png', 'jpeg'])
    .nullish()
    .describe(
      'Omit for JSON (both views). "code" returns the D2 source; "svg"/"png"/"jpeg" return a rendered image of the change graph.'
    ),
  d2_view: z
    .enum(['semantic', 'audit'])
    .default('semantic')
    .describe(
      'Only with format_d2. "semantic" (default): what changed for the user — notes and their note↔note relations, the narrative as a caption, the source raw as a faint origin. "audit": the literal persistence graph (narrative block as hub, derived_from/about/affects edges) for traceability.'
    )
}

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

export type ProposalRow = {
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
