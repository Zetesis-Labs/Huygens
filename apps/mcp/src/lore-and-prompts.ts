import { readFileSync } from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadSchemaSnapshot } from './schema-snapshot'

/**
 * Self-describing layer: the MCP serves both the LORE (how Huygens
 * understands itself) and the canonical PROMPTS (how an agent should
 * operate in different modes). Any consumer — a conversational client like
 * Claude Code or future specialized workers — fetches
 * these from here and stays in sync with us.
 */

type LoreEntry = { uri: string; name: string; description: string; path: string }
type PromptEntry = { name: string; description: string; path: string }

const LORE_ENTRIES: LoreEntry[] = [
  {
    uri: 'huygens://lore/data-model',
    name: 'data-model',
    description:
      'The two-plane data model (raw_capture as evidence vs note+block+edges as interpretation) and the audit layer.',
    path: 'lore/data-model.md'
  },
  {
    uri: 'huygens://lore/surrealql-cookbook',
    name: 'surrealql-cookbook',
    description:
      'Verified, composable read-only SurrealQL recipes for exploring the graph (query_query/run_query): rules, brick vocabulary, subqueries, graph recursion, vector/hybrid, audit.',
    path: 'lore/surrealql-cookbook.md'
  }
]

const PROMPT_ENTRIES: PromptEntry[] = [
  {
    name: 'process_inbox',
    description:
      'Guion para una sesión deliberada de procesamiento del inbox: de raw_capture a informe-block + mutaciones propuestas y aprobadas.',
    path: 'prompts/inbox-processing.md'
  },
  {
    name: 'plan_day',
    description:
      'Ritual de planificación diaria: elegir 1-3 MITs (Most Important Tasks) del día como informe-block prospectivo + mutaciones mit_for propuestas y aprobadas.',
    path: 'prompts/plan-day.md'
  }
]

function readDoc(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), 'utf8')
}

export function registerLoreAndPrompts(server: McpServer): void {
  for (const entry of LORE_ENTRIES) {
    server.resource(
      entry.name,
      entry.uri,
      { description: entry.description, mimeType: 'text/markdown' },
      async uri => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readDoc(entry.path) }]
      })
    )
  }

  // Live schema, introspected on each read (INFO FOR DB + INFO FOR TABLE). Exposed
  // as a resource — not only in the server `instructions` — so clients that consume
  // resources but ignore `instructions` (e.g. hermes) still get the real schema.
  server.resource(
    'schema',
    'huygens://lore/schema',
    {
      description: 'Live physical schema (tables, fields, enums, edges, indexes) introspected from SurrealDB.',
      mimeType: 'text/markdown'
    },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await loadSchemaSnapshot() }]
    })
  )

  for (const entry of PROMPT_ENTRIES) {
    server.prompt(entry.name, entry.description, async () => ({
      messages: [{ role: 'user', content: { type: 'text', text: readDoc(entry.path) } }]
    }))
  }
}

export { LORE_ENTRIES, PROMPT_ENTRIES }
