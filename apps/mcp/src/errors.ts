/**
 * Discriminated error hierarchy.
 *
 * Every error thrown by the domain layer is a HuygensError subclass with a
 * stable string `code`. Callers (MCP boundary, worker, tests) match on
 * `instanceof` or `error.code`, never on message text — messages are for
 * humans and may change.
 *
 * Across the MCP boundary the error is repackaged as an `McpError` whose
 * `data` carries `{ code, details }`. Remote callers (the Python worker)
 * reconstruct a typed exception from that payload.
 *
 * KEEP IN SYNC with backend/huygens-worker/huygens_worker/errors.py.
 */

import { ErrorCode as JsonRpcCode, McpError } from '@modelcontextprotocol/sdk/types.js'

export type ErrorCode =
  | 'RAW_NOT_FOUND'
  | 'NOTE_NOT_FOUND'
  | 'BLOCK_NOT_FOUND'
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

export class NoteNotFoundError extends HuygensError {
  readonly code = 'NOTE_NOT_FOUND' as const
  constructor(note_id: string) {
    super(`note not found: ${note_id}`, { note_id })
  }
}

export class BlockNotFoundError extends HuygensError {
  readonly code = 'BLOCK_NOT_FOUND' as const
  constructor(block_ids: string[]) {
    super(`block(s) not found: ${block_ids.join(', ')}`, { block_ids })
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

// ─── MCP boundary ───────────────────────────────────────────────────────
// The SDK serializes McpError throws as `isError: true` content (not as a
// JSON-RPC error), so we can't rely on `error.data` reaching the wire.
// Instead we ship the discriminator in `structuredContent.error` which the
// Python client reads.

export type ToolErrorResult = {
  isError: true
  content: { type: 'text'; text: string }[]
  structuredContent: { error: { code: ErrorCode; message: string; details: Record<string, unknown> } }
}

export function huygensErrorToToolResult(err: HuygensError): ToolErrorResult {
  return {
    isError: true,
    content: [{ type: 'text', text: err.message }],
    structuredContent: { error: { code: err.code, message: err.message, details: err.details } }
  }
}

export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) return err
  const message = err instanceof Error ? err.message : String(err)
  return new McpError(JsonRpcCode.InternalError, message)
}
