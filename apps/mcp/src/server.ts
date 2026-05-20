import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCapture } from './tools/capture'
import { registerChunkMarkdown } from './tools/chunk-markdown'
import { registerCommitClarify } from './tools/commit-clarify'
import { registerEmbedText } from './tools/embed-text'
import { registerFindRelated } from './tools/find-related'
import { registerGenerateReport } from './tools/generate-report'
import { registerGetRaw } from './tools/get-raw'
import { registerIndexBlock } from './tools/index-block'
import { registerListByType } from './tools/list-by-type'
import { registerListInbox } from './tools/list-inbox'
import { registerListMits } from './tools/list-mits'
import { registerUpdateNoteState } from './tools/update-note-state'
import { registerVectorSearch } from './tools/vector-search'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'huygens-mcp',
    version: '0.3.0'
  })

  registerCapture(server)
  registerListInbox(server)
  registerGetRaw(server)
  registerCommitClarify(server)
  registerChunkMarkdown(server)
  registerEmbedText(server)
  registerIndexBlock(server)
  registerVectorSearch(server)
  registerFindRelated(server)
  registerUpdateNoteState(server)
  registerListMits(server)
  registerListByType(server)
  registerGenerateReport(server)

  return server
}
