import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ZodRawShape } from 'zod'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { logToolCall } from '../tool-log'

/**
 * Register an MCP tool with unified error handling. A thrown HuygensError is
 * mapped to a structured tool error (the discriminator the Python worker reads);
 * anything else becomes an McpError. Handlers just do the work and return
 * content — no per-tool try/catch.
 *
 * Because `shape` precedes `handler`, TypeScript infers the zod shape and
 * contextually types the handler's `args`, exactly like `server.tool`.
 */
/**
 * Pure classification of a thrown error into a log/return shape. A HuygensError
 * becomes a structured tool error returned to the caller (the discriminator the
 * Python worker reads); anything else maps to an McpError that is rethrown.
 */
function classifyToolError(
  err: unknown
):
  | { rethrow: false; result: CallToolResult; error: string; code: string }
  | { rethrow: true; mapped: ReturnType<typeof toMcpError> } {
  if (err instanceof HuygensError) {
    return { rethrow: false, result: huygensErrorToToolResult(err), error: err.message, code: err.code }
  }
  return { rethrow: true, mapped: toMcpError(err) }
}

export function defineTool<Args extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Args,
  handler: ToolCallback<Args>
): void {
  const guarded = (async (...callArgs: unknown[]) => {
    const args = callArgs[0]
    const start = performance.now()
    const baseLog = () => ({ tool: name, duration_ms: Math.round(performance.now() - start), args })
    try {
      const result = await (handler as (...a: unknown[]) => CallToolResult | Promise<CallToolResult>)(...callArgs)
      logToolCall({ ...baseLog(), ok: result?.isError !== true, result })
      return result
    } catch (err) {
      const outcome = classifyToolError(err)
      if (outcome.rethrow) {
        logToolCall({ ...baseLog(), ok: false, error: outcome.mapped.message })
        throw outcome.mapped
      }
      logToolCall({ ...baseLog(), ok: false, result: outcome.result, error: outcome.error, code: outcome.code })
      return outcome.result
    }
  }) as unknown as ToolCallback<Args>
  server.tool(name, description, shape, guarded)
}

/** The most common tool output: a single text block of pretty-printed JSON. */
export function jsonBlock(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: JSON.stringify(value, null, 2) }
}
