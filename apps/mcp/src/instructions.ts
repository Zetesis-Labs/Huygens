import { readFileSync } from 'node:fs'
import { loadSchemaSnapshot } from './schema-snapshot'

/** Static, hand-verified SurrealQL cookbook for exploring the graph. */
function readCookbook(): string {
  return readFileSync(new URL('./lore/surrealql-cookbook.md', import.meta.url), 'utf8').trimEnd()
}

/**
 * The MCP server's `instructions`, injected into every connecting agent at
 * connect time: the SurrealQL cookbook (how to read and explore the topology)
 * followed by the live physical schema (what tables, fields, enums and edges
 * actually exist). The cookbook is static and verified; the schema is
 * introspected at startup. Restart the MCP after `db:apply` to refresh.
 */
export async function buildInstructions(): Promise<string> {
  const schema = await loadSchemaSnapshot()
  return `${readCookbook()}\n\n${schema}`
}
