import type { RecordId, StringRecordId } from 'surrealdb'
import { uuidv7 } from 'uuidv7'
import { getDb } from './surreal'

export type EventKind =
  | 'raw_received'
  | 'raw_claimed'
  | 'analysis_started'
  | 'related_context_fetched'
  | 'decomposition_proposed'
  | 'human_review_requested'
  | 'commit_attempted'
  | 'commit_succeeded'
  | 'commit_failed'
  | 'worker_yielded'

export type Actor = 'worker' | 'conversational' | 'user' | 'system'

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
 * Best-effort emit. NEVER throws — agent_event must not break the parent
 * operation. Errors are logged to stderr.
 */
export async function emitEvent(event: EmitEventInput): Promise<void> {
  try {
    const db = await getDb()
    const content: Record<string, unknown> = {
      kind: event.kind,
      actor: event.actor,
      session_id: event.session_id
    }
    if (event.subject != null) content.subject = event.subject
    if (event.payload != null) content.payload = event.payload
    if (event.confidence != null) content.confidence = event.confidence
    if (event.reasoning_summary != null) content.reasoning_summary = event.reasoning_summary
    if (event.model != null) content.model = event.model
    if (event.tokens_used != null) content.tokens_used = event.tokens_used
    if (event.duration_ms != null) content.duration_ms = event.duration_ms
    await db.query('CREATE agent_event CONTENT $content', { content })
  } catch (err) {
    console.error('[agent_event] emit failed:', err)
  }
}

export function newSessionId(): string {
  return uuidv7()
}
