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
    uri: 'huygens://lore/operating-doctrine',
    name: 'operating-doctrine',
    description:
      'READ FIRST — governs HOW you must behave: the approval boundary (nothing mutates without an approved proposal), the decision tree (capture vs process vs ritual), the kind discipline, the initiative asymmetry (invite rituals proactively, NEVER commit one unasked), MIT rules and prohibitions. If a ritual prompt and this doctrine conflict, the doctrine wins.',
    path: 'lore/operating-doctrine.md'
  },
  {
    uri: 'huygens://lore/data-model',
    name: 'data-model',
    description:
      'The two-plane data model (raw_capture as evidence vs note+block+edges as interpretation), the proposal lifecycle, the tools surface and the audit layer. The WHAT; the HOW-to-behave is operating-doctrine.',
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
  },
  {
    name: 'review_day',
    description:
      'Ritual de cierre del día: repasar los MITs de hoy y los vencidos y darles disposición (hecho / mover / soltar) como informe-block retrospectivo + mutaciones state/mit_for propuestas y aprobadas.',
    path: 'prompts/review-day.md'
  },
  {
    name: 'decompose_project',
    description:
      'Coaching: convertir un proyecto vivo sin tareas accionables en su próxima acción física concreta (una task ACTIVE colgada del proyecto). Desbloquea plan_day, que muere sin candidatas. Enseña a descomponer; no descompone por el usuario.',
    path: 'prompts/decompose-project.md'
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
