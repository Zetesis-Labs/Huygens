import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerLoreAndPrompts } from './lore-and-prompts'
import { registerSurrealmcpProxy } from './proxies/surrealmcp'
import { registerCapture } from './tools/capture'
import { registerChunkMarkdown } from './tools/chunk-markdown'
import { registerEmbedText } from './tools/embed-text'
import { registerFindRelated } from './tools/find-related'
import { registerGetRaw } from './tools/get-raw'
import { registerIndexBlock } from './tools/index-block'
import { registerListByType } from './tools/list-by-type'
import { registerListInbox } from './tools/list-inbox'
import { registerListMits } from './tools/list-mits'
import { registerProposalTools } from './tools/proposal'
import { registerSetRawStatus } from './tools/set-raw-status'
import { registerUpdateNoteState } from './tools/update-note-state'
import { registerVectorSearch } from './tools/vector-search'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'huygens-mcp',
    version: '0.4.0'
  })

  registerCapture(server)
  registerListInbox(server)
  registerSetRawStatus(server)
  registerGetRaw(server)
  registerProposalTools(server)
  registerChunkMarkdown(server)
  registerEmbedText(server)
  registerIndexBlock(server)
  registerVectorSearch(server)
  registerFindRelated(server)
  registerUpdateNoteState(server)
  registerListMits(server)
  registerListByType(server)
  registerSurrealmcpProxy(server)

  registerLoreAndPrompts(server)

  return server
}
