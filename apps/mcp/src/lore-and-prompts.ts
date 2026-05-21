import { readFileSync } from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Self-describing layer: the MCP serves both the LORE (how Huygens
 * understands itself) and the canonical PROMPTS (how an agent should
 * operate in different modes). Any consumer — the autonomous worker,
 * a conversational client like Claude Code, future agents — fetches
 * these from here and stays in sync with us.
 */

type LoreEntry = { uri: string; name: string; description: string; path: string }
type PromptEntry = { name: string; description: string; path: string }

const LORE_ENTRIES: LoreEntry[] = [
  {
    uri: 'huygens://lore/clarify-spec',
    name: 'clarify-spec',
    description:
      'Transitional spec: note types, transformations and edge taxonomy. Canonical flow lives in docs/MODEL.md.',
    path: 'lore/clarify-spec.md'
  },
  {
    uri: 'huygens://lore/data-model',
    name: 'data-model',
    description:
      'The two-plane data model (raw_capture as evidence vs note+block+edges as interpretation) and the audit layer.',
    path: 'lore/data-model.md'
  }
]

const PROMPT_ENTRIES: PromptEntry[] = [
  {
    name: 'clarify-system',
    description:
      'Transitional system prompt for the clarify worker. PROMPT_ENTRIES will gain topologize-system when the topologizer worker is implemented.',
    path: 'prompts/clarify-system.md'
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

  for (const entry of PROMPT_ENTRIES) {
    server.prompt(entry.name, entry.description, async () => ({
      messages: [{ role: 'user', content: { type: 'text', text: readDoc(entry.path) } }]
    }))
  }
}

export { LORE_ENTRIES, PROMPT_ENTRIES }
