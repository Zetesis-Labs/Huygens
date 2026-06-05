import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { HuygensError, QueryError } from '../../errors'
import { getReadOnlyDb } from '../../surreal'
import { defineTool } from '../define-tool'
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
  // Goes through defineTool like every other tool, so the unified tool-call
  // trace (stderr + mcp_tool_call) covers query_query too — timing, ok/error and
  // the full query text in `args`. defineTool already maps HuygensError →
  // structured tool error and anything else → McpError, so the handler just runs
  // the query and returns the serialized result.
  defineTool(
    server,
    'query_query',
    'Run a read-only SurrealQL query against the Huygens graph and return the raw results as JSON. Executes as the `huygens_reader` user (VIEWER): writes are rejected by SurrealDB. Multi-statement queries return one result array per statement. Bind values via $name + `parameters`, never via string concatenation.',
    queryQueryShape,
    async args => ({
      content: [{ type: 'text', text: stringifySurrealResult(await queryQueryImpl(args)) }]
    })
  )
}
