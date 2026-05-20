import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeDb, getDb } from '../src/surreal'

const ROOT = join(import.meta.dir, '..')

async function run(file: string) {
  const path = join(ROOT, 'surreal', file)
  const surql = readFileSync(path, 'utf8')
  const db = await getDb()
  console.log(`[apply] ${file}`)
  await db.query(surql)
}

await run('schema.surql')
await run('seed.surql')

const db = await getDb()
const [types] = await db.query<[{ slug: string; name: string }[]]>('SELECT slug, name FROM note_type ORDER BY slug')
console.log(`[apply] note_type rows: ${types.length}`)
for (const t of types) console.log(`  - ${t.slug.padEnd(10)} ${t.name}`)

await closeDb()
