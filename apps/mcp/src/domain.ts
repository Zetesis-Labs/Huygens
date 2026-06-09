import { z } from 'zod'

// ─── Entity literals ────────────────────────────────────────────────────
// Single source of truth for the values that appear in schema.surql
// validation, MCP tool schemas, agent prompts and event payloads.
// KEEP IN SYNC with backend/huygens-worker/huygens_worker/domain.py.

export const NOTE_STATES = ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'] as const
export type NoteState = (typeof NOTE_STATES)[number]
export const NoteStateSchema = z.enum(NOTE_STATES)

export const RAW_STATUSES = ['pending', 'processed', 'ignored', 'deferred'] as const
export type RawStatus = (typeof RAW_STATUSES)[number]
export const RawStatusSchema = z.enum(RAW_STATUSES)

export const BLOCK_KINDS = ['descriptive', 'narrative'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]
export const BlockKindSchema = z.enum(BLOCK_KINDS)

export const PROPOSAL_STATUSES = ['draft', 'committed', 'discarded'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]
export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES)

export const NOTE_TYPE_SLUGS = [
  'task',
  'project',
  'area',
  'routine',
  'idea',
  'reference',
  'person',
  'objetivo'
] as const
export type NoteTypeSlug = (typeof NOTE_TYPE_SLUGS)[number]
export const NoteTypeSlugSchema = z.enum(NOTE_TYPE_SLUGS)

export const EDGE_KINDS = ['part_of', 'blocked_by', 'mentions'] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]
export const EdgeKindSchema = z.enum(EDGE_KINDS)

export const TRACE_EDGE_KINDS = ['derived_from', 'about', 'affects'] as const
export type TraceEdgeKind = (typeof TRACE_EDGE_KINDS)[number]
export const TraceEdgeKindSchema = z.enum(TRACE_EDGE_KINDS)

/** Every edge (RELATION) table in the schema. The graph's full edge vocabulary. */
export const ALL_EDGE_TABLES = [...EDGE_KINDS, ...TRACE_EDGE_KINDS] as const

/** Ritual informe-blocks. When a narrative block is the output of a ritual it
 * carries one of these as `kind` so the dashboard can surface it in the
 * Bitácora rather than as a generic informe. A plain processing informe
 * (process_inbox) has no kind.
 *
 * `day` is the single daily ritual (la jornada): one narrative that settles
 * what was left pending and orients the day — planning and closing are NOT
 * distinguished structurally (the structure lives in the accompanying
 * note_updates/affects/mit_for, not in the narrative's taxonomy). `week` is
 * the weekly maintenance review. The old split kinds (plan_day / review_day /
 * plan_week / review_week) are legacy: still valid on historic blocks and
 * stored payloads, rejected for new proposals. */
export const INFORME_KINDS = ['day', 'week'] as const
export type InformeKind = (typeof INFORME_KINDS)[number]
export const InformeKindSchema = z.enum(INFORME_KINDS)
/** Retired ritual kinds, kept readable on historic data (blocks, stored payloads, Bitácora). */
export const LEGACY_INFORME_KINDS = ['plan_day', 'review_day', 'plan_week', 'review_week'] as const

export const AFFECT_ACTIONS = ['created', 'updated', 'state_changed', 'linked', 'archived'] as const
export type AffectAction = (typeof AFFECT_ACTIONS)[number]
export const AffectActionSchema = z.enum(AFFECT_ACTIONS)

export const TRANSFORMATIONS = ['verbatim', 'extracted', 'summarized', 'inferred'] as const
export type Transformation = (typeof TRANSFORMATIONS)[number]
export const TransformationSchema = z.enum(TRANSFORMATIONS)

export const SOURCE_KINDS = ['chat', 'voice', 'manual', 'import', 'agent-self'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
export const SourceKindSchema = z.enum(SOURCE_KINDS)

// ─── Identifier shapes ──────────────────────────────────────────────────

export const RAW_CAPTURE_ID_RE = /^raw_capture:[A-Za-z0-9_-]+$/
export const NOTE_ID_RE = /^note:[A-Za-z0-9_-]+$/
export const BLOCK_ID_RE = /^block:[A-Za-z0-9_-]+$/
export const PROPOSAL_ID_RE = /^proposal:[A-Za-z0-9_-]+$/
export const RECORD_ID_RE = /^[a-z_]+:[A-Za-z0-9_-]+$/i

// ─── Event taxonomy ─────────────────────────────────────────────────────

export const EVENT_KINDS = [
  'raw_received',
  'raw_status_changed',
  'proposal_created',
  'proposal_updated',
  'proposal_discarded',
  'proposal_committed',
  'note_state_changed',
  'retracted'
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const ACTORS = ['worker', 'conversational', 'user', 'system'] as const
export type Actor = (typeof ACTORS)[number]
