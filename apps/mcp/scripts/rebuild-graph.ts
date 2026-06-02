import { closeDb } from '../src/surreal'
import { rebuildGraphImpl } from '../src/tools/proposal/rebuild'

// Admin op: re-derive the live graph (note/block/edges) from the committed
// proposals (the log). Destructive on the projection; the log is untouched.
// Run deliberately (not agent-facing). Re-index embeddings afterwards.
const result = await rebuildGraphImpl()
console.log(`[rebuild] wiped: ${result.tablesWiped.join(', ')}`)
console.log(`[rebuild] replayed ${result.replayed} committed proposals → graph re-derived from the log`)
await closeDb()
