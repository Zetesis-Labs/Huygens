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
      'Authoritative spec for how raw_captures become typed notes: note types, transformations, mit_for rules, state machine, edge semantics.',
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
      'System prompt for an agent acting as the clarify worker — decomposes a raw_capture into a Decomposition using retrieve-then-generate RAG.',
    path: 'prompts/clarify-system.md'
  },
  {
    name: 'morning-planning',
    description:
      'Conversational flow: surface MITs + inbox + active work, decide the one thing that would make today not-wasted.',
    path: 'prompts/morning-planning.md'
  },
  {
    name: 'weekly-review',
    description:
      'Conversational flow: inventory open work, triage WAITING/SOMEDAY/old-ideas, generate the period report.',
    path: 'prompts/weekly-review.md'
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
