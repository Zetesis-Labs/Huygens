import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { BLOCK_ID_RE } from '../domain'
import { embedTexts } from '../embeddings'
import { BlockNotFoundError, HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { getDb } from '../surreal'

export const indexBlockShape = {
  block_ids: z
    .array(z.string().regex(BLOCK_ID_RE, 'Must be a block record id'))
    .min(1)
    .max(64)
    .describe('1..64 block record ids to embed and index')
}

const indexBlockSchema = z.object(indexBlockShape)
export type IndexBlockInput = z.infer<typeof indexBlockSchema>

export type IndexBlockResult = {
  indexed: string[]
  model: string
  dimensions: number
  input_tokens: number
}

export async function indexBlockImpl(input: IndexBlockInput): Promise<IndexBlockResult> {
  const db = await getDb()
  const refs = input.block_ids.map(id => new StringRecordId(id))

  const [rows] = await db.query<[{ id: { toString(): string }; content: string }[]]>(
    'SELECT id, content FROM block WHERE id IN $ids',
    { ids: refs }
  )
  if (rows.length !== input.block_ids.length) {
    const found = new Set(rows.map(r => String(r.id)))
    const missing = input.block_ids.filter(id => !found.has(id))
    throw new BlockNotFoundError(missing)
  }

  const byId = new Map(rows.map(r => [String(r.id), r.content]))
  const orderedContents = input.block_ids.map(id => {
    const c = byId.get(id)
    if (c == null) throw new Error(`internal: missing content for ${id}`)
    return c
  })

  const result = await embedTexts(orderedContents)

  for (let i = 0; i < input.block_ids.length; i++) {
    await db.query('UPDATE $id SET embedding = $emb, embedding_model = $model, dimensions = $dim', {
      id: refs[i],
      emb: result.embeddings[i],
      model: result.model,
      dim: result.dimensions
    })
  }

  return {
    indexed: input.block_ids,
    model: result.model,
    dimensions: result.dimensions,
    input_tokens: result.input_tokens
  }
}

export function registerIndexBlock(server: McpServer): void {
  server.tool(
    'index_block',
    'Embed the content of 1..64 blocks with BGE-M3 and persist embedding/embedding_model/dimensions on each block. The HNSW index updates automatically.',
    indexBlockShape,
    async args => {
      try {
        const result = await indexBlockImpl(args)
        return {
          content: [
            { type: 'text', text: `Indexed ${result.indexed.length} block(s) with ${result.model}` },
            { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(result, null, 2)}` }
          ]
        }
      } catch (err) {
        if (err instanceof HuygensError) return huygensErrorToToolResult(err)
        throw toMcpError(err)
      }
    }
  )
}
