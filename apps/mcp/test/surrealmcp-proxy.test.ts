import { describe, expect, test } from 'bun:test'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { filterSurrealmcpTools, proxiedSurrealmcpToolName, READ_ONLY_UPSTREAM_TOOLS } from '../src/proxies/surrealmcp'

function tool(name: string): Tool {
  return {
    name,
    inputSchema: { type: 'object' }
  }
}

describe('surrealmcp proxy filtering', () => {
  test('only read-only allowlisted tools are visible', () => {
    const upstreamTools = [
      'query',
      'select',
      'info',
      'create',
      'update',
      'delete',
      'relate',
      'insert',
      'merge',
      'patch',
      'signin',
      'use'
    ].map(tool)

    const visible = filterSurrealmcpTools(upstreamTools)

    expect(visible.map(t => t.name)).toEqual(['query', 'select', 'info'])
  })

  test('new upstream tools are hidden until explicitly allowed', () => {
    const visible = filterSurrealmcpTools([tool('query'), tool('experimental_write')])

    expect(visible.map(t => t.name)).toEqual(['query'])
    expect(READ_ONLY_UPSTREAM_TOOLS.has('experimental_write')).toBe(false)
  })

  test('proxied tools use query namespace', () => {
    expect(proxiedSurrealmcpToolName('select')).toBe('query_select')
    expect(proxiedSurrealmcpToolName('query')).toBe('query_query')
  })
})
