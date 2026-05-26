import { describe, expect, test } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { NoteNotFoundError } from '../src/errors'
import { defineTool } from '../src/tools/define-tool'

type GuardedCb = (args: unknown, extra: unknown) => Promise<unknown>

/** Register a handler through defineTool and return the wrapped callback the
 * SDK would receive, so we can drive its error mapping directly. */
function wrap(handler: () => Promise<unknown>): GuardedCb {
  let captured: GuardedCb | undefined
  const server = {
    tool: (_name: string, _description: string, _shape: unknown, cb: GuardedCb) => {
      captured = cb
    }
  } as unknown as McpServer
  defineTool(server, 'x', 'desc', {}, handler as never)
  if (!captured) throw new Error('defineTool did not register a callback')
  return captured
}

describe('defineTool', () => {
  test('maps a HuygensError to a structured tool error', async () => {
    const run = wrap(async () => {
      throw new NoteNotFoundError('note:abc')
    })
    const result = (await run({}, {})) as {
      isError?: boolean
      structuredContent?: { error?: { code?: string; message?: string } }
    }
    expect(result.isError).toBe(true)
    expect(result.structuredContent?.error?.code).toBe('NOTE_NOT_FOUND')
    expect(result.structuredContent?.error?.message).toContain('note:abc')
  })

  test('wraps an unknown error as an McpError', async () => {
    const run = wrap(async () => {
      throw new Error('boom')
    })
    await expect(run({}, {})).rejects.toBeInstanceOf(McpError)
  })

  test('passes a successful result through unchanged', async () => {
    const out = { content: [{ type: 'text', text: 'ok' }] }
    const run = wrap(async () => out)
    expect(await run({}, {})).toBe(out)
  })
})
