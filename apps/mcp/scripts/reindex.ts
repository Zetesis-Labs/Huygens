/**
 * Re-embed every block with the current contextual embedding format (see A2 /
 * docs/issues/2026-05-26-retrieval-and-trust-roadmap.md). Run it after the
 * embedding format changes so existing vectors aren't stuck in an older,
 * context-free format, and to index blocks that were never embedded.
 *
 *   bun run db:reindex          # re-embed every block (calls the embedder)
 *   bun run db:reindex --dry    # report scope only, no writes / no embedder calls
 */
import { closeDb, getDb } from '../src/surreal'
import { idStr } from '../src/tools/graph-records'
import { indexBlockImpl } from '../src/tools/index-block'

const BATCH = 64

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const db = await getDb()
  const [rows] = await db.query<[{ id: unknown }[]]>('SELECT id FROM block ORDER BY id')
  const ids = (rows ?? []).map(r => idStr(r.id)).filter(Boolean)

  console.log(`${ids.length} block(s) to re-embed${dry ? ' — dry run, no writes' : ''}`)
  if (dry || ids.length === 0) {
    await closeDb()
    return
  }

  let done = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const res = await indexBlockImpl({ block_ids: batch })
    done += res.indexed.length
    console.log(`  re-embedded ${done}/${ids.length}  (${res.model}, ${res.input_tokens} tokens)`)
  }
  console.log('done.')
  await closeDb()
}

main().catch(err => {
  console.error('reindex failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
