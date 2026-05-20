import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCapture } from './tools/capture'
import { registerChunkMarkdown } from './tools/chunk-markdown'
import { registerCommitClarify } from './tools/commit-clarify'
import { registerEmbedText } from './tools/embed-text'
import { registerGetRaw } from './tools/get-raw'
import { registerIndexBlock } from './tools/index-block'
import { registerListInbox } from './tools/list-inbox'
import { registerVectorSearch } from './tools/vector-search'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'huygens-mcp',
    version: '0.2.0'
  })

  registerCapture(server)
  registerListInbox(server)
  registerGetRaw(server)
  registerCommitClarify(server)
  registerChunkMarkdown(server)
  registerEmbedText(server)
  registerIndexBlock(server)
  registerVectorSearch(server)

  return server
}
