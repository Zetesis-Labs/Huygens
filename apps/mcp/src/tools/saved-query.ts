import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { QueryError } from '../errors'
import { getDb, getReadOnlyDb } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { idStr, isoString, type RecordIdish } from './graph-records'
import { queryQueryImpl } from './query/query'
import { stringifySurrealResult } from './query/serialize'

// ─────────────────────────────────────────────────────────────────────────
// Saved queries: named SurrealQL strings, stored in the SCHEMALESS
// `saved_query` table and executed read-only (huygens_reader). The query IS
// the saved unit — no declarative Filter layer. save/delete write as root;
// list/run read-only.
// ─────────────────────────────────────────────────────────────────────────

const QUERY_ID = z.string().regex(/^saved_query:[A-Za-z0-9_-]+$/, 'must be a saved_query id')

// ── save_query ────────────────────────────────────────────────────────────

const saveQueryShape = {
  name: z.string().min(1).describe('Human-friendly name'),
  query: z.string().min(1).describe('SurrealQL (read-only; runs as huygens_reader)'),
  pinned: z.boolean().default(false).describe('Pin as a favorite'),
  id: QUERY_ID.optional().describe('Pass an existing id to update instead of creating')
}
const saveQuerySchema = z.object(saveQueryShape)
export type SaveQueryInput = z.infer<typeof saveQuerySchema>

export async function saveQueryImpl(input: SaveQueryInput): Promise<{ id: string; updated: boolean }> {
  const db = await getDb()
  const doc = { name: input.name, pinned: input.pinned, query: input.query } as const
  if (input.id) {
    // Upsert: a caller-chosen id creates the query if it doesn't exist yet, and
    // updates it if it does — so agents can use a stable, memorable id without a
    // separate "does it exist?" dance.
    const id = new StringRecordId(input.id)
    const [existing] = await db.query<[{ id: RecordIdish }[]]>('SELECT id FROM $id', { id })
    const updated = (existing?.length ?? 0) > 0
    const [rows] = await db.query<[{ id: RecordIdish }[]]>('UPSERT $id MERGE $doc RETURN id', { id, doc })
    if (!rows?.[0]) throw new QueryError(`failed to save query: ${input.id}`)
    return { id: idStr(rows[0].id), updated }
  }
  const [rows] = await db.query<[{ id: RecordIdish }[]]>('CREATE saved_query CONTENT $doc RETURN id', { doc })
  if (!rows?.[0]) throw new QueryError('failed to create saved query')
  return { id: idStr(rows[0].id), updated: false }
}

// ── list_queries ──────────────────────────────────────────────────────────

const listQueriesShape = {
  pinned: z.boolean().optional().describe('Filter by pinned (favorites)'),
  limit: z.number().int().positive().max(200).default(100)
}
const listQueriesSchema = z.object(listQueriesShape)
export type ListQueriesInput = z.infer<typeof listQueriesSchema>

export interface SavedQuerySummary {
  id: string
  name: string
  query: string | null
  pinned: boolean
  updated_at: string | null
}

export async function listQueriesImpl(input: ListQueriesInput): Promise<SavedQuerySummary[]> {
  const db = await getReadOnlyDb()
  const where = input.pinned !== undefined ? ' WHERE pinned = $pinned' : ''
  type Row = {
    id: RecordIdish
    name: string
    query?: string
    pinned?: boolean
    updated_at?: Date | string
  }
  const [rows] = await db.query<[Row[]]>(`SELECT * FROM saved_query${where} ORDER BY updated_at DESC LIMIT $limit`, {
    pinned: input.pinned,
    limit: input.limit
  })
  return (rows ?? []).map(r => ({
    id: idStr(r.id),
    name: r.name,
    query: r.query ?? null,
    pinned: Boolean(r.pinned),
    updated_at: r.updated_at ? isoString(r.updated_at) : null
  }))
}

// ── run_query ──────────────────────────────────────────────────────────────

const runQueryShape = { id: QUERY_ID }
const runQuerySchema = z.object(runQueryShape)
export type RunQueryInput = z.infer<typeof runQuerySchema>

/** Load a saved query and execute it read-only. Returns the raw SurrealQL result. */
export async function runQueryImpl(input: RunQueryInput): Promise<unknown[]> {
  const db = await getReadOnlyDb()
  const [rows] = await db.query<[{ query?: string }[]]>('SELECT * FROM $id', {
    id: new StringRecordId(input.id)
  })
  const query = rows?.[0]?.query
  if (!query) throw new QueryError(`saved query not found: ${input.id}`)
  return queryQueryImpl({ query })
}

// ── delete_query ───────────────────────────────────────────────────────────

const deleteQueryShape = { id: QUERY_ID }

// ── registration ────────────────────────────────────────────────────────

export function registerSavedQuery(server: McpServer): void {
  defineTool(
    server,
    'save_query',
    'Save a named SurrealQL query (read-only). Pass an existing `id` to update. Returns the saved_query id.',
    saveQueryShape,
    async args => {
      const { id, updated } = await saveQueryImpl(args)
      return {
        content: [
          { type: 'text', text: `${updated ? 'Updated' : 'Saved'} "${args.name}" → ${id}` },
          jsonBlock({ id, updated })
        ]
      }
    }
  )

  defineTool(
    server,
    'list_queries',
    'List saved SurrealQL queries (most recently updated first). Optionally filter by pinned.',
    listQueriesShape,
    async args => {
      const queries = await listQueriesImpl(args)
      const text =
        queries.length === 0
          ? 'No saved queries.'
          : queries.map(q => `- ${q.pinned ? '★ ' : ''}${q.name} — ${q.id}`).join('\n')
      return { content: [{ type: 'text', text }, jsonBlock(queries)] }
    }
  )

  defineTool(
    server,
    'run_query',
    'Run a saved query by id (read-only) and return its raw SurrealQL result.',
    runQueryShape,
    async args => {
      const results = await runQueryImpl(args)
      return { content: [{ type: 'text', text: stringifySurrealResult(results) }, jsonBlock(results)] }
    }
  )

  defineTool(server, 'delete_query', 'Delete a saved query by id.', deleteQueryShape, async args => {
    const db = await getDb()
    await db.query('DELETE $id', { id: new StringRecordId(args.id) })
    return { content: [{ type: 'text', text: `Deleted ${args.id}` }, jsonBlock({ deleted: args.id })] }
  })
}
