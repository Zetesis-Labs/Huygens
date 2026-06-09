import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { QueryError } from '../errors'
import { getDb, getReadOnlyDb } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { idStr, isoString, type RecordIdish } from './graph-records'

// ─────────────────────────────────────────────────────────────────────────
// Conversations: chat threads from the dashboard agent, plus the views it
// generated. App-state, NOT domain topology — stored in the SCHEMALESS
// `conversation` table so the thread/view shape evolves in TS (here) without
// migrations, exactly like saved_query. `messages` and `state` are opaque
// blobs owned by the frontend (assistant-ui thread + shared canvas state).
// save/delete write as root; get/list read-only (huygens_reader).
// ─────────────────────────────────────────────────────────────────────────

const CONVERSATION_ID = z.string().regex(/^conversation:[A-Za-z0-9_-]+$/, 'must be a conversation id')

// ── save_conversation ───────────────────────────────────────────────────────

const saveConversationShape = {
  messages: z.array(z.unknown()).describe('Full assistant-ui thread (opaque; persisted as-is)'),
  title: z.string().min(1).optional().describe('Human-friendly title; defaults to a derived one'),
  state: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Shared canvas state (active view + view history); opaque, persisted as-is'),
  id: CONVERSATION_ID.optional().describe('Pass an existing id to update instead of creating')
}
const saveConversationSchema = z.object(saveConversationShape)
export type SaveConversationInput = z.infer<typeof saveConversationSchema>

async function updateConversation(
  db: Awaited<ReturnType<typeof getDb>>,
  id: string,
  doc: Record<string, unknown>
): Promise<{ id: string; updated: boolean }> {
  const [rows] = await db.query<[{ id: RecordIdish }[]]>('UPDATE $id MERGE $doc RETURN id', {
    id: new StringRecordId(id),
    doc
  })
  if (!rows?.[0]) throw new QueryError(`conversation not found: ${id}`)
  return { id: idStr(rows[0].id), updated: true }
}

async function createConversation(
  db: Awaited<ReturnType<typeof getDb>>,
  doc: Record<string, unknown>
): Promise<{ id: string; updated: boolean }> {
  const [rows] = await db.query<[{ id: RecordIdish }[]]>('CREATE conversation CONTENT $doc RETURN id', { doc })
  if (!rows?.[0]) throw new QueryError('failed to create conversation')
  return { id: idStr(rows[0].id), updated: false }
}

export async function saveConversationImpl(input: SaveConversationInput): Promise<{ id: string; updated: boolean }> {
  const db = await getDb()
  const doc: Record<string, unknown> = {
    messages: input.messages,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.state !== undefined ? { state: input.state } : {})
  }
  if (input.id) return updateConversation(db, input.id, doc)
  return createConversation(db, doc)
}

// ── get_conversation ─────────────────────────────────────────────────────────

const getConversationShape = { id: CONVERSATION_ID }
const getConversationSchema = z.object(getConversationShape)
export type GetConversationInput = z.infer<typeof getConversationSchema>

export interface ConversationDoc {
  id: string
  title: string | null
  messages: unknown[]
  state: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

type ConversationRow = {
  id: RecordIdish
  title?: string
  messages?: unknown[]
  state?: Record<string, unknown>
  created_at?: Date | string
  updated_at?: Date | string
}

function toDoc(r: ConversationRow): ConversationDoc {
  return {
    id: idStr(r.id),
    title: r.title ?? null,
    messages: r.messages ?? [],
    state: r.state ?? null,
    created_at: r.created_at ? isoString(r.created_at) : null,
    updated_at: r.updated_at ? isoString(r.updated_at) : null
  }
}

export async function getConversationImpl(input: GetConversationInput): Promise<ConversationDoc | null> {
  const db = await getReadOnlyDb()
  const [rows] = await db.query<[ConversationRow[]]>('SELECT * FROM $id', { id: new StringRecordId(input.id) })
  const row = rows?.[0]
  return row ? toDoc(row) : null
}

function formatConversationHeader(doc: ConversationDoc): string {
  return `${doc.title ?? doc.id} — ${doc.messages.length} message(s)`
}

// ── list_conversations ───────────────────────────────────────────────────────

const listConversationsShape = {
  limit: z.number().int().positive().max(200).default(50)
}
const listConversationsSchema = z.object(listConversationsShape)
export type ListConversationsInput = z.infer<typeof listConversationsSchema>

export interface ConversationSummary {
  id: string
  title: string | null
  message_count: number
  updated_at: string | null
}

export async function listConversationsImpl(input: ListConversationsInput): Promise<ConversationSummary[]> {
  const db = await getReadOnlyDb()
  type Row = { id: RecordIdish; title?: string; message_count?: number; updated_at?: Date | string }
  const [rows] = await db.query<[Row[]]>(
    'SELECT id, title, array::len(messages) AS message_count, updated_at FROM conversation ORDER BY updated_at DESC LIMIT $limit',
    { limit: input.limit }
  )
  return (rows ?? []).map(r => ({
    id: idStr(r.id),
    title: r.title ?? null,
    message_count: r.message_count ?? 0,
    updated_at: r.updated_at ? isoString(r.updated_at) : null
  }))
}

function formatConversationList(rows: ConversationSummary[]): string {
  if (rows.length === 0) return 'No conversations.'
  return rows.map(c => `- ${c.title ?? c.id} (${c.message_count} msg) — ${c.id}`).join('\n')
}

// ── delete_conversation ──────────────────────────────────────────────────────

const deleteConversationShape = { id: CONVERSATION_ID }
const deleteConversationSchema = z.object(deleteConversationShape)
export type DeleteConversationInput = z.infer<typeof deleteConversationSchema>

export async function deleteConversationImpl(input: DeleteConversationInput): Promise<{ deleted: string }> {
  const db = await getDb()
  await db.query('DELETE $id', { id: new StringRecordId(input.id) })
  return { deleted: input.id }
}

// ── registration ──────────────────────────────────────────────────────────

export function registerConversation(server: McpServer): void {
  defineTool(
    server,
    'save_conversation',
    'Persist a dashboard chat thread (messages + canvas state). Pass an existing `id` to update. Returns the conversation id.',
    saveConversationShape,
    async args => {
      const { id, updated } = await saveConversationImpl(args)
      return {
        content: [
          { type: 'text', text: `${updated ? 'Updated' : 'Saved'} conversation → ${id}` },
          jsonBlock({ id, updated })
        ]
      }
    }
  )

  defineTool(
    server,
    'get_conversation',
    'Load a persisted chat thread by id (read-only): its messages and canvas state.',
    getConversationShape,
    async args => {
      const doc = await getConversationImpl(args)
      if (!doc) return { content: [{ type: 'text', text: `Not found: ${args.id}` }] }
      return { content: [{ type: 'text', text: formatConversationHeader(doc) }, jsonBlock(doc)] }
    }
  )

  defineTool(
    server,
    'list_conversations',
    'List persisted chat threads (most recently updated first).',
    listConversationsShape,
    async args => {
      const rows = await listConversationsImpl(args)
      return { content: [{ type: 'text', text: formatConversationList(rows) }, jsonBlock(rows)] }
    }
  )

  defineTool(
    server,
    'delete_conversation',
    'Delete a persisted chat thread by id.',
    deleteConversationShape,
    async args => {
      const { deleted } = await deleteConversationImpl(args)
      return { content: [{ type: 'text', text: `Deleted ${deleted}` }, jsonBlock({ deleted })] }
    }
  )
}
