import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { NOTE_ID_RE, NoteStateSchema } from '../domain'
import { NoteNotFoundError } from '../errors'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'

export const updateNoteStateShape = {
  note_id: z.string().regex(NOTE_ID_RE, 'Must be a note record id'),
  state: NoteStateSchema.describe('New ZTD state'),
  reason: z.string().optional().describe('Human-readable rationale, recorded on the agent_event')
}

const updateNoteStateSchema = z.object(updateNoteStateShape)
export type UpdateNoteStateInput = z.infer<typeof updateNoteStateSchema>

export type UpdateNoteStateResult = {
  note_id: string
  previous_state: string
  new_state: string
}

export async function updateNoteStateImpl(input: UpdateNoteStateInput): Promise<UpdateNoteStateResult> {
  const db = await getDb()
  const noteRef = new StringRecordId(input.note_id)

  const [rows] = await db.query<[{ state: string }[]]>('SELECT state FROM note WHERE id = $id', { id: noteRef })
  const current = rows[0]
  if (!current) throw new NoteNotFoundError(input.note_id)

  await db.query('UPDATE $id SET state = $state', { id: noteRef, state: input.state })

  await emitEvent({
    kind: 'note_state_changed',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: noteRef,
    payload: {
      action: 'state_transition',
      previous_state: current.state,
      new_state: input.state,
      ...(input.reason ? { reason: input.reason } : {})
    }
  })

  return { note_id: input.note_id, previous_state: current.state, new_state: input.state }
}

export function registerUpdateNoteState(server: McpServer): void {
  defineTool(
    server,
    'update_note_state',
    'Move a note through the ZTD state machine (CLARIFIED → ACTIVE → WAITING → SOMEDAY → DONE → ARCHIVED). Records the transition as an agent_event.',
    updateNoteStateShape,
    async args => {
      const result = await updateNoteStateImpl(args)
      return {
        content: [
          { type: 'text', text: `${result.note_id}: ${result.previous_state} → ${result.new_state}` },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(result, null, 2)}` }
        ]
      }
    }
  )
}
