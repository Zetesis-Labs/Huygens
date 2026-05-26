import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ZodRawShape } from 'zod'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'

/**
 * Register an MCP tool with unified error handling. A thrown HuygensError is
 * mapped to a structured tool error (the discriminator the Python worker reads);
 * anything else becomes an McpError. Handlers just do the work and return
 * content — no per-tool try/catch.
 *
 * Because `shape` precedes `handler`, TypeScript infers the zod shape and
 * contextually types the handler's `args`, exactly like `server.tool`.
 */
export function defineTool<Args extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Args,
  handler: ToolCallback<Args>
): void {
  const guarded = (async (...callArgs: unknown[]) => {
    try {
      return await (handler as (...a: unknown[]) => CallToolResult | Promise<CallToolResult>)(...callArgs)
    } catch (err) {
      if (err instanceof HuygensError) return huygensErrorToToolResult(err)
      throw toMcpError(err)
    }
  }) as unknown as ToolCallback<Args>
  server.tool(name, description, shape, guarded)
}

/** The most common tool output: a single text block of pretty-printed JSON. */
export function jsonBlock(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: JSON.stringify(value, null, 2) }
}
