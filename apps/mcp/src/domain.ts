import { z } from 'zod'

// ─── Entity literals ────────────────────────────────────────────────────
// Single source of truth for the values that appear in schema.surql
// validation, MCP tool schemas, agent prompts and event payloads.
// KEEP IN SYNC with backend/huygens-worker/huygens_worker/domain.py.

export const NOTE_STATES = ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'] as const
export type NoteState = (typeof NOTE_STATES)[number]
export const NoteStateSchema = z.enum(NOTE_STATES)

export const NOTE_TYPE_SLUGS = [
  'task',
  'project',
  'area',
  'routine',
  'note',
  'report',
  'person',
  'reference',
  'objetivo',
  'idea'
] as const
export type NoteTypeSlug = (typeof NOTE_TYPE_SLUGS)[number]
export const NoteTypeSlugSchema = z.enum(NOTE_TYPE_SLUGS)

export const EDGE_KINDS = ['mentions', 'supports', 'refutes', 'part_of', 'blocked_by', 'about', 'authored_by'] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]
export const EdgeKindSchema = z.enum(EDGE_KINDS)

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
export const RECORD_ID_RE = /^[a-z_]+:[A-Za-z0-9_-]+$/i

// ─── Event taxonomy ─────────────────────────────────────────────────────

export const EVENT_KINDS = [
  'raw_received',
  'raw_claimed',
  'analysis_started',
  'related_context_fetched',
  'decomposition_proposed',
  'human_review_requested',
  'commit_attempted',
  'commit_succeeded',
  'commit_failed',
  'worker_yielded'
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const ACTORS = ['worker', 'conversational', 'user', 'system'] as const
export type Actor = (typeof ACTORS)[number]
