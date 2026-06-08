import { closeDb } from '../src/surreal'
import { rebuildGraphImpl } from '../src/tools/proposal/rebuild'

// Admin op: re-derive the live graph (note/block/edges) from the committed
// proposals (the log). Destructive on the projection; the log is untouched.
// Run deliberately (not agent-facing). Re-index embeddings afterwards.
//
// GUARDED: rebuild currently flattens edge provenance onto the genesis proposal
// (see rebuildGraphImpl). It refuses unless you pass --force to acknowledge the
// loss. Do NOT --force until the rebuild path is provenance-preserving (M1).
const force = process.argv.includes('--force')
const result = await rebuildGraphImpl({ allowProvenanceFlattening: force })
console.log(`[rebuild] wiped: ${result.tablesWiped.join(', ')}`)
console.log(`[rebuild] replayed ${result.replayed} committed proposals → graph re-derived from the log`)
await closeDb()
