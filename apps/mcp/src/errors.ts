/**
 * Discriminated error hierarchy.
 *
 * Every error thrown by the domain layer is a HuygensError subclass with a
 * stable string `code`. Callers (MCP boundary, worker, tests) match on
 * `instanceof` or `error.code`, never on message text — messages are for
 * humans and may change.
 *
 * KEEP IN SYNC with backend/huygens-worker/huygens_worker/errors.py.
 */

export type ErrorCode =
  | 'RAW_NOT_FOUND'
  | 'RAW_ALREADY_PROCESSED'
  | 'BLOCK_NOT_FOUND'
  | 'NOTE_TYPE_NOT_FOUND'
  | 'INTERNAL_REF_OUT_OF_BOUNDS'
  | 'EXTERNAL_REF_OUT_OF_BOUNDS'
  | 'EMBEDDING_DIMENSION_MISMATCH'
  | 'EMBEDDING_PROVIDER_ERROR'
  | 'CONFIG_MISSING'

export abstract class HuygensError extends Error {
  abstract readonly code: ErrorCode
  readonly details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = this.constructor.name
    this.details = details
  }
}

export class RawNotFoundError extends HuygensError {
  readonly code = 'RAW_NOT_FOUND' as const
  constructor(raw_id: string) {
    super(`raw_capture not found: ${raw_id}`, { raw_id })
  }
}

export class RawAlreadyProcessedError extends HuygensError {
  readonly code = 'RAW_ALREADY_PROCESSED' as const
  constructor(raw_id: string) {
    super(`raw_capture already processed: ${raw_id}`, { raw_id })
  }
}

export class BlockNotFoundError extends HuygensError {
  readonly code = 'BLOCK_NOT_FOUND' as const
  constructor(block_ids: string[]) {
    super(`block(s) not found: ${block_ids.join(', ')}`, { block_ids })
  }
}

export class InternalRefOutOfBoundsError extends HuygensError {
  readonly code = 'INTERNAL_REF_OUT_OF_BOUNDS' as const
  constructor(to_note_index: number, notes_count: number) {
    super(`internal_ref to_note_index ${to_note_index} >= notes.length (${notes_count})`, {
      to_note_index,
      notes_count
    })
  }
}

export class ExternalRefOutOfBoundsError extends HuygensError {
  readonly code = 'EXTERNAL_REF_OUT_OF_BOUNDS' as const
  constructor(from_note_index: number, notes_count: number) {
    super(`external_ref from_note_index ${from_note_index} >= notes.length (${notes_count})`, {
      from_note_index,
      notes_count
    })
  }
}

export class EmbeddingDimensionMismatchError extends HuygensError {
  readonly code = 'EMBEDDING_DIMENSION_MISMATCH' as const
  constructor(got: number | undefined, want: number) {
    super(`embedding dimensions ${got} ≠ ${want}`, { got, want })
  }
}

export class EmbeddingProviderError extends HuygensError {
  readonly code = 'EMBEDDING_PROVIDER_ERROR' as const
  constructor(provider: string, status: number, body: string) {
    super(`${provider} ${status}: ${body.slice(0, 300)}`, { provider, status })
  }
}

export class ConfigMissingError extends HuygensError {
  readonly code = 'CONFIG_MISSING' as const
  constructor(name: string) {
    super(`required config missing: ${name}`, { name })
  }
}
