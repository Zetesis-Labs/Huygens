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
    name: 'day',
    description:
      'La jornada — ritual diario único: asentar lo pendiente (disposiciones de MITs vencidas y deadlines) y orientar el día (1-3 MITs sugeridas, el usuario elige), en UN informe-block kind:day. Cierra y planifica sin distinguirlos. Sustituye a los antiguos plan_day/review_day.',
    path: 'prompts/day.md'
  },
  {
    name: 'week',
    description:
      'La semana — revisión semanal de mantenimiento: WAITING, dormidas que resurgen, deadlines entrantes, SOMEDAY, lo nunca revisado y el inbox diferido, en UN informe-block kind:week. Uno por semana ISO (Madrid).',
    path: 'prompts/week.md'
  },
  {
    name: 'decompose_project',
    description:
      'Coaching: convertir un proyecto vivo sin tareas accionables en su próxima acción física concreta (una task ACTIVE colgada del proyecto). Desbloquea la jornada (day), que muere sin candidatas a MIT. Enseña a descomponer; no descompone por el usuario.',
    path: 'prompts/decompose-project.md'
  }
]

function readDoc(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), 'utf8')
}

function registerLoreResource(server: McpServer, entry: LoreEntry): void {
  server.resource(entry.name, entry.uri, { description: entry.description, mimeType: 'text/markdown' }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readDoc(entry.path) }]
  }))
}

// Live schema, introspected on each read (INFO FOR DB + INFO FOR TABLE). Exposed
// as a resource — not only in the server `instructions` — so clients that consume
// resources but ignore `instructions` (e.g. hermes) still get the real schema.
function registerSchemaResource(server: McpServer): void {
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
}

function registerPromptEntry(server: McpServer, entry: PromptEntry): void {
  server.prompt(entry.name, entry.description, async () => ({
    messages: [{ role: 'user', content: { type: 'text', text: readDoc(entry.path) } }]
  }))
}

function registerLoreResources(server: McpServer): void {
  LORE_ENTRIES.map(entry => registerLoreResource(server, entry))
}

function registerPrompts(server: McpServer): void {
  PROMPT_ENTRIES.map(entry => registerPromptEntry(server, entry))
}

export function registerLoreAndPrompts(server: McpServer): void {
  registerLoreResources(server)
  registerSchemaResource(server)
  registerPrompts(server)
}

export { LORE_ENTRIES, PROMPT_ENTRIES }
