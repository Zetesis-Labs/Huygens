import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { HuygensError, huygensErrorToToolResult, QueryError, toMcpError } from '../../errors'
import { getReadOnlyDb } from '../../surreal'
import { stringifySurrealResult } from './serialize'

export const queryQueryShape = {
  query: z
    .string()
    .min(1)
    .describe(
      'SurrealQL statement(s) to execute. Read-only — the connection runs as the `huygens_reader` user (VIEWER role), so CREATE/UPDATE/DELETE/RELATE are rejected by SurrealDB itself. Use $name placeholders for values and pass them via `parameters` instead of string-interpolating them.'
    ),
  parameters: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Optional bind variables referenced as $name in the query. Strings, numbers, arrays and objects are supported.'
    )
}

const queryQuerySchema = z.object(queryQueryShape)
export type QueryQueryInput = z.infer<typeof queryQuerySchema>

let invocationCounter = 0

function nextQueryId(): string {
  invocationCounter = (invocationCounter + 1) >>> 0
  return `q${invocationCounter.toString(36)}`
}

export async function queryQueryImpl(input: QueryQueryInput): Promise<unknown[]> {
  const db = await getReadOnlyDb()
  try {
    return await db.query(input.query, input.parameters)
  } catch (err) {
    if (err instanceof HuygensError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new QueryError(message)
  }
}

export function registerQueryQuery(server: McpServer): void {
  server.tool(
    'query_query',
    'Run a read-only SurrealQL query against the Huygens graph and return the raw results as JSON. Executes as the `huygens_reader` user (VIEWER): writes are rejected by SurrealDB. Multi-statement queries return one result array per statement. Bind values via $name + `parameters`, never via string concatenation.',
    queryQueryShape,
    async args => {
      const queryId = nextQueryId()
      const startedAt = performance.now()
      try {
        const results = await queryQueryImpl(args)
        const durationMs = Math.round(performance.now() - startedAt)
        console.error(`[huygens-mcp] query_query ${queryId} ok in ${durationMs}ms`)
        return {
          content: [{ type: 'text', text: stringifySurrealResult(results) }]
        }
      } catch (err) {
        const durationMs = Math.round(performance.now() - startedAt)
        if (err instanceof HuygensError) {
          console.error(`[huygens-mcp] query_query ${queryId} ${err.code} in ${durationMs}ms: ${err.message}`)
          return huygensErrorToToolResult(err)
        }
        console.error(`[huygens-mcp] query_query ${queryId} crash in ${durationMs}ms:`, err)
        throw toMcpError(err)
      }
    }
  )
}
