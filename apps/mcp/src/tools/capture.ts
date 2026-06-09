import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { SourceKindSchema } from '../domain'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'

export const captureShape = {
  content: z.string().min(1).describe('The literal user input — no interpretation, no segmentation'),
  source_kind: SourceKindSchema.describe('Where the input originated'),
  source_ref: z.string().optional().describe('Optional identifier (session id, file path, URL, etc.)')
}

const captureSchema = z.object(captureShape)
export type CaptureInput = z.infer<typeof captureSchema>

export async function captureImpl(input: CaptureInput): Promise<{ raw_id: string }> {
  const db = await getDb()
  const data: Record<string, unknown> = {
    content: input.content,
    source_kind: input.source_kind,
    ...(input.source_ref != null ? { source_ref: input.source_ref } : {})
  }
  const [created] = await db.query<[{ id: RecordId }[]]>('CREATE raw_capture CONTENT $data RETURN AFTER', { data })
  const raw = created[0]
  if (!raw) throw new Error('capture: insert returned no record')

  await emitEvent({
    kind: 'raw_received',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: raw.id,
    payload: { source_kind: input.source_kind, content_length: input.content.length }
  })

  return { raw_id: String(raw.id) }
}

export function registerCapture(server: McpServer): void {
  defineTool(
    server,
    'capture',
    'Persist a raw user input as a pending raw_capture (Plane 1: evidence). No interpretation, no segmentation. The raw stays in the inbox until a proposal is committed.',
    captureShape,
    async args => {
      const { raw_id } = await captureImpl(args)
      return {
        content: [{ type: 'text', text: `Captured: ${raw_id}` }]
      }
    }
  )
}
