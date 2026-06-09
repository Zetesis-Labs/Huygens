import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * The operating doctrine is the SSOT of agent behaviour and it has copies:
 * pointers in CLAUDE.md/AGENTS.md, a hardcoded summary in the worker's
 * agent.py, and the ritual prompts. Those copies drifted before (DOCT-003 /
 * DOCT-006, docs/issues/2026-06-09). This test pins the cross-references and
 * — for every rule the doctrine claims is a "muro" — the code marker that
 * actually enforces it, so the enforcement map can't silently start lying.
 */

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

const DOCTRINE = read('../src/lore/operating-doctrine.md')

describe('operating-doctrine — enforcement map', () => {
  test('the doctrine carries the muro/barandilla map', () => {
    expect(DOCTRINE).toContain('Muro o barandilla')
    expect(DOCTRINE).toContain('barandilla')
    // load-bearing rows of the map
    expect(DOCTRINE).toContain('VIEWER')
    expect(DOCTRINE).toContain('approved: true')
    expect(DOCTRINE).toContain('part_of')
  })

  test('every "muro (servidor)" claim points at real enforcement code', () => {
    const commit = read('../src/tools/proposal/commit.ts')
    expect(commit).toContain('assertRitualCommitAllowed') // approved + one-ritual-per-day
    expect(commit).toContain('approved')
    const retract = read('../src/tools/retract.ts')
    expect(retract).toContain('dry_run')
  })

  test('every "muro (motor)" claim points at real schema enforcement', () => {
    const schema = read('../surreal/schema.surql')
    expect(schema).toContain('part_of_single_parent') // padre único
    expect(schema).toMatch(/INSIDE \['CLARIFIED'/) // state enum ASSERT
    const reader = read('../scripts/define-reader.ts')
    expect(reader).toContain('VIEWER') // query_query read-only via RBAC
  })

  test('the MCP instructions lead with the doctrine, in full', () => {
    const instructions = read('../src/instructions.ts')
    expect(instructions).toContain('lore/operating-doctrine.md')
  })
})

describe('doctrine copies — cross-references intact', () => {
  test('CLAUDE.md and AGENTS.md point at the SSOT instead of duplicating it', () => {
    for (const file of ['../../../CLAUDE.md', '../../../AGENTS.md']) {
      const text = read(file)
      expect(text).toContain('operating-doctrine.md')
      expect(text).toContain('data-model.md')
    }
  })

  test('the worker keeps its doctrine injection and its commit exclusion', () => {
    const agent = read('../../../backend/huygens-worker/huygens_worker/agent.py')
    // the mechanism that injects the full doctrine (Agno drops MCP instructions)
    expect(agent).toContain('get_server_instructions_via_mcp')
    expect(agent).toContain('huygens://lore/operating-doctrine')
    // fail-fast: no silent degraded start (DOCT-004)
    expect(agent).toContain('allow_degraded_doctrine')
    // the worker-side muro: committing stays human
    expect(agent).toContain('exclude_tools=["commit_proposal"]')
  })

  test('every ritual prompt defers to the doctrine', () => {
    for (const prompt of ['inbox-processing.md', 'day.md', 'week.md']) {
      expect(read(`../src/prompts/${prompt}`)).toContain('operating-doctrine')
    }
  })
})
