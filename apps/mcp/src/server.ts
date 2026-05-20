import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'huygens-mcp',
    version: '0.0.0'
  })

  // No tools registered yet — the MCP scope is still TBD.
  // Register tools, resources and prompts here as the domain takes shape.

  return server
}
