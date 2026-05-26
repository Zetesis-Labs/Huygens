import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { type Chunk, chunkMarkdown } from '../chunk'
import { defineTool } from './define-tool'

export const chunkMarkdownShape = {
  text: z.string().min(1).describe('Markdown text to split'),
  max_chars: z
    .number()
    .int()
    .positive()
    .max(20000)
    .optional()
    .describe('Soft cap per chunk in characters. Default 4000 (~1000 tokens).')
}

const chunkMarkdownSchema = z.object(chunkMarkdownShape)
export type ChunkMarkdownInput = z.infer<typeof chunkMarkdownSchema>

export function chunkMarkdownImpl(input: ChunkMarkdownInput): Chunk[] {
  return chunkMarkdown(input.text, { maxChars: input.max_chars })
}

export function registerChunkMarkdown(server: McpServer): void {
  defineTool(
    server,
    'chunk_markdown',
    'Split markdown into heading-aware chunks (each preserves its heading breadcrumb). Pure function — no DB.',
    chunkMarkdownShape,
    async args => {
      const chunks = chunkMarkdownImpl(args)
      return {
        content: [
          { type: 'text', text: `Produced ${chunks.length} chunk(s).` },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(chunks, null, 2)}` }
        ]
      }
    }
  )
}
