import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerLoreAndPrompts } from './lore-and-prompts'
import { registerCapture } from './tools/capture'
import { registerCheckClaim } from './tools/check-claim'
import { registerChunkMarkdown } from './tools/chunk-markdown'
import { registerEmbedText } from './tools/embed-text'
import { registerExpandContext } from './tools/expand-context'
import { registerFindRelated } from './tools/find-related'
import { registerGetRaw } from './tools/get-raw'
import { registerIndexBlock } from './tools/index-block'
import { registerListByType } from './tools/list-by-type'
import { registerListInbox } from './tools/list-inbox'
import { registerListMits } from './tools/list-mits'
import { registerNeighborhood } from './tools/neighborhood'
import { registerProposalTools } from './tools/proposal'
import { registerQueryQuery } from './tools/query/query'
import { registerSavedQuery } from './tools/saved-query'
import { registerSetRawStatus } from './tools/set-raw-status'
import { registerTraceProvenance } from './tools/trace-provenance'
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
  registerTraceProvenance(server)
  registerNeighborhood(server)
  registerExpandContext(server)
  registerCheckClaim(server)
  registerProposalTools(server)
  registerChunkMarkdown(server)
  registerEmbedText(server)
  registerIndexBlock(server)
  registerVectorSearch(server)
  registerFindRelated(server)
  registerListMits(server)
  registerListByType(server)
  registerQueryQuery(server)
  registerSavedQuery(server)

  registerLoreAndPrompts(server)

  return server
}
