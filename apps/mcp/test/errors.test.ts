import { describe, expect, test } from 'bun:test'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { BlockNotFoundError, huygensErrorToToolResult, toMcpError } from '../src/errors'

describe('error boundary', () => {
  test('huygensErrorToToolResult carries code, message and details', () => {
    const result = huygensErrorToToolResult(new BlockNotFoundError(['block:a', 'block:b']))
    expect(result.isError).toBe(true)
    expect(result.structuredContent.error.code).toBe('BLOCK_NOT_FOUND')
    expect(result.structuredContent.error.details).toEqual({
      block_ids: ['block:a', 'block:b']
    })
    expect(result.content[0]?.text).toContain('block:a')
  })

  test('toMcpError passes an existing McpError through', () => {
    const original = new McpError(-32603, 'already mcp')
    expect(toMcpError(original)).toBe(original)
  })

  test('toMcpError wraps a plain Error, preserving the message', () => {
    const wrapped = toMcpError(new Error('boom'))
    expect(wrapped).toBeInstanceOf(McpError)
    expect(wrapped.message).toContain('boom')
  })

  test('toMcpError stringifies a non-Error throw', () => {
    const wrapped = toMcpError('weird')
    expect(wrapped).toBeInstanceOf(McpError)
    expect(wrapped.message).toContain('weird')
  })
})
