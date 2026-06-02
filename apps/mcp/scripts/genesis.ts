import { closeDb } from '../src/surreal'
import { commitGenesis } from '../src/tools/proposal/genesis'

// Admin op: flatten the legacy proposal history into ONE genesis snapshot of the
// live graph (máximo-limpio, real ids). Supersedes the old committed proposals so
// they leave the fold/rebuild window; the graph itself is untouched. Run with
// --apply to write; default is a dry-run report. Deploy the máximo-limpio MCP too
// — otherwise new commits are legacy-format again.
const apply = process.argv.includes('--apply')
const { report } = await commitGenesis({ apply })
console.log(apply ? '[genesis] APPLIED ✅' : '[genesis] DRY-RUN (pass --apply to write)')
console.log(JSON.stringify(report, null, 2))
await closeDb()
