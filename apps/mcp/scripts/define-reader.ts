import { closeDb, getDb } from '../src/surreal'

const password = process.env.SURREAL_READER_PASS ?? process.env.SURREALDB_PASS

if (!password) {
  console.error('SURREAL_READER_PASS or SURREALDB_PASS is required')
  process.exit(1)
}

function surrealStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const db = await getDb()
await db.query(
  `DEFINE USER IF NOT EXISTS huygens_reader ON DATABASE
     PASSWORD ${surrealStringLiteral(password)}
     ROLES VIEWER`
)
console.log('[define-reader] huygens_reader ensured (VIEWER on DATABASE)')

await closeDb()
