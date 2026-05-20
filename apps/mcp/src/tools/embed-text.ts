import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { type EmbedResult, embedTexts } from '../embeddings'

export const embedTextShape = {
  texts: z.array(z.string().min(1)).min(1).max(64).describe('1..64 strings to embed in one batched call')
}

const embedTextSchema = z.object(embedTextShape)
export type EmbedTextInput = z.infer<typeof embedTextSchema>

export async function embedTextImpl(input: EmbedTextInput): Promise<EmbedResult> {
  return embedTexts(input.texts)
}

export function registerEmbedText(server: McpServer): void {
  server.tool(
    'embed_text',
    'Embed 1..64 strings with BGE-M3 (1024 dims, normalized). Returns embeddings + model + input_tokens.',
    embedTextShape,
    async args => {
      const result = await embedTextImpl(args)
      return {
        content: [
          {
            type: 'text',
            text: `Embedded ${result.embeddings.length} input(s) with ${result.model} (${result.dimensions} dims, ${result.input_tokens} input tokens)`
          },
          {
            type: 'text',
            text: `\n[raw JSON]\n${JSON.stringify(
              {
                model: result.model,
                dimensions: result.dimensions,
                input_tokens: result.input_tokens,
                count: result.embeddings.length
              },
              null,
              2
            )}`
          }
        ]
      }
    }
  )
}
