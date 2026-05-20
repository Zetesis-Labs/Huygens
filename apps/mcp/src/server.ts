import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCapture } from './tools/capture'
import { registerCommitClarify } from './tools/commit-clarify'
import { registerGetRaw } from './tools/get-raw'
import { registerListInbox } from './tools/list-inbox'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'huygens-mcp',
    version: '0.1.0'
  })

  registerCapture(server)
  registerListInbox(server)
  registerGetRaw(server)
  registerCommitClarify(server)

  return server
}
