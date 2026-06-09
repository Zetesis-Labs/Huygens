import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId, type Surreal } from 'surrealdb'
import { z } from 'zod'
import { BLOCK_ID_RE } from '../domain'
import { embedTexts } from '../embeddings'
import { BlockNotFoundError } from '../errors'
import { blockEmbeddingContext } from '../serialize'
import { getDb, selectByIds } from '../surreal'
import { defineTool } from './define-tool'
import { type GraphNodeRecord, idStr, type RecordIdish } from './graph-records'

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

type BlockRow = { id: RecordIdish; content: string; block_kind?: string; note?: RecordIdish }
type OwnerInfo = { rec: GraphNodeRecord; parentId?: string }

/** The embedding context header for one block (see buildBlockContexts). */
function headerForBlock(
  row: BlockRow,
  ownerMap: Map<string, OwnerInfo>,
  aboutByBlock: Map<string, string[]>,
  noteRec: Map<string, GraphNodeRecord>
): string {
  if (row.block_kind === 'narrative') {
    const subjects = (aboutByBlock.get(idStr(row.id)) ?? [])
      .map(n => noteRec.get(n))
      .filter((rec): rec is GraphNodeRecord => rec != null)
    return blockEmbeddingContext(subjects, [])
  }
  if (!row.note) return ''
  const owner = ownerMap.get(idStr(row.note))
  if (!owner) return ''
  const parents = (owner.parentId ? [noteRec.get(owner.parentId)] : []).filter(
    (rec): rec is GraphNodeRecord => rec != null
  )
  return blockEmbeddingContext([owner.rec], parents)
}

// Owner notes (for descriptive blocks) + the id of their single part_of parent.
async function fetchOwners(db: Surreal, ownerIds: Set<string>): Promise<Map<string, OwnerInfo>> {
  if (ownerIds.size === 0) return new Map<string, OwnerInfo>()
  const refs = [...ownerIds].map(s => new StringRecordId(s))
  const [owners] = await db.query<[(GraphNodeRecord & { parents?: RecordIdish[] })[]]>(
    'SELECT id, title, type, state, ->part_of->note AS parents FROM note WHERE id IN $ids',
    { ids: refs }
  )
  return new Map<string, OwnerInfo>(
    (owners ?? []).map(o => [
      idStr(o.id),
      { rec: o, parentId: o.parents?.[0] ? idStr(o.parents[0]) : undefined }
    ])
  )
}

// Notes each narrative block is `about`.
async function fetchAboutByBlock(db: Surreal, narrativeIds: string[]): Promise<Map<string, string[]>> {
  if (narrativeIds.length === 0) return new Map<string, string[]>()
  const refs = narrativeIds.map(s => new StringRecordId(s))
  const [rows] = await db.query<[{ in: RecordIdish; out: RecordIdish }[]]>(
    'SELECT in, out FROM about WHERE in IN $ids',
    {
      ids: refs
    }
  )
  return (rows ?? []).reduce((byBlock, a) => {
    const block = idStr(a.in)
    return byBlock.set(block, [...(byBlock.get(block) ?? []), idStr(a.out)])
  }, new Map<string, string[]>())
}

type PartitionedRows = { ownerIds: Set<string>; narrativeIds: string[] }

function partitionRows(rows: BlockRow[]): PartitionedRows {
  return rows.reduce<PartitionedRows>(
    (acc, row) => {
      if (row.block_kind === 'narrative') return { ...acc, narrativeIds: [...acc.narrativeIds, idStr(row.id)] }
      if (row.note) return { ...acc, ownerIds: new Set(acc.ownerIds).add(idStr(row.note)) }
      return acc
    },
    { ownerIds: new Set<string>(), narrativeIds: [] }
  )
}

// The referenced notes whose labels we need: part_of parents + about targets.
function collectNoteIds(ownerMap: Map<string, OwnerInfo>, aboutByBlock: Map<string, string[]>): Set<string> {
  const parentIds = [...ownerMap.values()].map(owner => owner.parentId).filter((id): id is string => id != null)
  const aboutIds = [...aboutByBlock.values()].flat()
  return new Set<string>([...parentIds, ...aboutIds])
}

function buildContextMap(
  rows: BlockRow[],
  ownerMap: Map<string, OwnerInfo>,
  aboutByBlock: Map<string, string[]>,
  noteRec: Map<string, GraphNodeRecord>
): Map<string, string> {
  return new Map(rows.map(row => [idStr(row.id), headerForBlock(row, ownerMap, aboutByBlock, noteRec)]))
}

/**
 * A context header per block, so the embedded vector carries the block's subject
 * and its place in the hierarchy instead of an orphan fragment (see the retrieval
 * roadmap / "Talk like a Graph"). Descriptive blocks → their owning note + its
 * `part_of` parent; narrative blocks → the notes they are `about`. One level of
 * parent for now; deepening the breadcrumb is a follow-up.
 */
async function buildBlockContexts(db: Surreal, rows: BlockRow[]): Promise<Map<string, string>> {
  const { ownerIds, narrativeIds } = partitionRows(rows)

  const ownerMap = await fetchOwners(db, ownerIds)
  const aboutByBlock = await fetchAboutByBlock(db, narrativeIds)

  // Resolve labels for the referenced notes (parents + about targets).
  const noteIds = collectNoteIds(ownerMap, aboutByBlock)
  const noteRec = new Map<string, GraphNodeRecord>(
    (await selectByIds<GraphNodeRecord>([...noteIds])).map(r => [idStr(r.id), r])
  )

  return buildContextMap(rows, ownerMap, aboutByBlock, noteRec)
}

export async function indexBlockImpl(input: IndexBlockInput): Promise<IndexBlockResult> {
  const db = await getDb()
  const refs = input.block_ids.map(id => new StringRecordId(id))

  const [rows] = await db.query<[BlockRow[]]>('SELECT id, content, block_kind, note FROM block WHERE id IN $ids', {
    ids: refs
  })
  if (rows.length !== input.block_ids.length) {
    const found = new Set(rows.map(r => idStr(r.id)))
    const missing = input.block_ids.filter(id => !found.has(id))
    throw new BlockNotFoundError(missing)
  }

  const contexts = await buildBlockContexts(db, rows)
  const byId = new Map(rows.map(r => [idStr(r.id), r.content]))
  const orderedTexts = input.block_ids.map(id => {
    const content = byId.get(id)
    if (content == null) throw new Error(`internal: missing content for ${id}`)
    const header = contexts.get(id) ?? ''
    return header ? `${header}\n\n${content}` : content
  })

  const result = await embedTexts(orderedTexts)

  await Promise.all(
    refs.map((ref, i) =>
      db.query('UPDATE $id SET embedding = $emb, embedding_model = $model, dimensions = $dim', {
        id: ref,
        emb: result.embeddings[i],
        model: result.model,
        dim: result.dimensions
      })
    )
  )

  return {
    indexed: input.block_ids,
    model: result.model,
    dimensions: result.dimensions,
    input_tokens: result.input_tokens
  }
}

export function registerIndexBlock(server: McpServer): void {
  defineTool(
    server,
    'index_block',
    'Embed the content of 1..64 blocks with BGE-M3 and persist embedding/embedding_model/dimensions on each block. The HNSW index updates automatically.',
    indexBlockShape,
    async args => {
      const result = await indexBlockImpl(args)
      return {
        content: [
          { type: 'text', text: `Indexed ${result.indexed.length} block(s) with ${result.model}` },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(result, null, 2)}` }
        ]
      }
    }
  )
}
