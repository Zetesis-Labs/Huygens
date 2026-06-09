import { readFileSync } from 'node:fs'
import { loadSchemaSnapshot } from './schema-snapshot'

function readLore(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), 'utf8').trimEnd()
}

const BANNER =
  '# Eres un agente de Huygens — LEE ESTO PRIMERO\n\n' +
  'Lo que sigue gobierna cómo debes comportarte (doctrina), cómo leer el grafo\n' +
  '(cookbook) y qué existe (schema). La doctrina manda sobre cualquier prompt.\n\n---\n\n'

/**
 * Pure assembly of the final instructions text from its three already-read
 * sections, in order of behavioural priority. No I/O — testable with literals.
 */
function composeInstructions(doctrine: string, cookbook: string, schema: string): string {
  return `${BANNER}${doctrine}\n\n---\n\n${cookbook}\n\n---\n\n${schema}`
}

/**
 * The MCP server's `instructions`, injected into every connecting agent at
 * connect time, in order of behavioural priority:
 *   1. the OPERATING DOCTRINE (how the agent must behave — the approval
 *      boundary, the initiative asymmetry, the kind discipline). Pushed in full,
 *      not as a pointer, so a client that reads `instructions` cannot miss it.
 *   2. the SurrealQL cookbook (how to read and explore the topology).
 *   3. the live physical schema (what tables/fields/enums/edges exist).
 * Note: some clients (e.g. hermes) ignore `instructions` and only consume
 * resources — for them the same content is served as `huygens://lore/*`
 * resources, the ritual prompts carry the critical guardrails inline, and the
 * mutating tool descriptions repeat the approval rule at the point of action.
 * The doctrine and cookbook are static; the schema is introspected at startup.
 * Restart the MCP after `db:apply` to refresh.
 */
export async function buildInstructions(): Promise<string> {
  const schema = await loadSchemaSnapshot()
  return composeInstructions(
    readLore('lore/operating-doctrine.md'),
    readLore('lore/surrealql-cookbook.md'),
    schema,
  )
}
