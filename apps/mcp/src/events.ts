import type { RecordId, StringRecordId } from 'surrealdb'
import { uuidv7 } from 'uuidv7'
import type { Actor, EventKind } from './domain'
import { getDb } from './surreal'

export type { Actor, EventKind }

export type EmitEventInput = {
  kind: EventKind
  actor: Actor
  session_id: string
  subject?: RecordId | StringRecordId | null
  payload?: Record<string, unknown> | null
  confidence?: number | null
  reasoning_summary?: string | null
  model?: string | null
  tokens_used?: { input?: number; output?: number; cached?: number } | null
  duration_ms?: number | null
}

/**
 * Pure shaping of the agent_event CONTENT object. The optional fields use
 * `!= null` semantics: both null and undefined are intentionally dropped.
 */
export function buildEventContent(event: EmitEventInput): Record<string, unknown> {
  const optionalFields: Array<[string, unknown]> = [
    ['subject', event.subject],
    ['payload', event.payload],
    ['confidence', event.confidence],
    ['reasoning_summary', event.reasoning_summary],
    ['model', event.model],
    ['tokens_used', event.tokens_used],
    ['duration_ms', event.duration_ms]
  ]
  return {
    kind: event.kind,
    actor: event.actor,
    session_id: event.session_id,
    ...Object.fromEntries(optionalFields.filter(([, value]) => value != null))
  }
}

/**
 * Best-effort emit. NEVER throws — agent_event must not break the parent
 * operation. Errors are logged to stderr.
 */
export async function emitEvent(event: EmitEventInput): Promise<void> {
  try {
    const db = await getDb()
    await db.query('CREATE agent_event CONTENT $content', { content: buildEventContent(event) })
  } catch (err) {
    console.error('[agent_event] emit failed:', err)
  }
}

export function newSessionId(): string {
  return uuidv7()
}
