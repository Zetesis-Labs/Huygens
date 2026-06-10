# Using Huygens

Huygens is a personal structured memory: you talk to a conversational agent,
the agent uses the MCP, the MCP persists in SurrealDB. **If you are the user
(not the operator), start with the user guide: [`docs/GUIDE.md`](./docs/GUIDE.md)**
— how to talk to the agent and the organizational methodology, no tooling
knowledge required. The conceptual model
lives in [`docs/MODEL.md`](./docs/MODEL.md); how an agent must behave lives in
the **operating doctrine** ([`apps/mcp/src/lore/operating-doctrine.md`](./apps/mcp/src/lore/operating-doctrine.md),
served as the `huygens://lore/operating-doctrine` resource); the physical
contract (entities, edges, proposal lifecycle, **tools surface**) lives in
[`apps/mcp/src/lore/data-model.md`](./apps/mcp/src/lore/data-model.md). This
file is the human-facing *how to run and use it* — it does not duplicate those
contracts (copies drift; see `docs/issues/2026-06-09`).

## Boot

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

| Service | What |
|---|---|
| `surrealdb` | SurrealDB (graph/document/vector storage) |
| `huygens-mcp` | TS MCP server at `http://localhost:3030/mcp` |
| `huygens-dashboard` | Astro+React dashboard at `http://localhost:4321` — graph canvas, MITs, Bitácora, inbox, proposal commit UI. SSR reads SurrealDB as the read-only reader |
| `huygens-worker` | Dashboard chat agent (Agno + OpenAI) over AG-UI on the internal network; **starts by default** (`WORKER_ENABLED:-true`). Its toolset **excludes `commit_proposal`** — committing stays human |
| `surrealdb-init` | One-shot volume preparation |
| `app` | Devcontainer shell/runtime |

First-time setup needs API keys:

```text
apps/mcp/.env                 DEEPINFRA_API_KEY   (embeddings, BGE-M3)
backend/huygens-worker/.env   OPENAI_API_KEY      (dashboard chat agent)
```

Verify with `docker compose -f .devcontainer/docker-compose.yml ps`.

## Connecting an agent

Add Huygens to any MCP-capable client (Claude Code, Codex, Hermes, Cursor,
Claude Desktop):

```json
{
  "mcpServers": {
    "huygens": {
      "transport": "streamable-http",
      "url": "http://localhost:3030/mcp"
    }
  }
}
```

The MCP injects the doctrine + SurrealQL cookbook + live schema as server
`instructions` on connect, and serves the same content as `huygens://lore/*`
resources for clients that ignore instructions.

## Two conversational surfaces

| | Full MCP client (Claude Code, …) | Dashboard chat (worker) |
|---|---|---|
| Can commit proposals | yes (after your approval) | **no** — it drafts; you commit from the proposal UI |
| Best for | processing sessions, rituals, anything end-to-end | consulting the graph, visual exploration (canvas), quick captures and corrections |
| Doctrine delivery | MCP `instructions` / resources | fetched from the MCP at startup; the worker **refuses to start** without it (`ALLOW_DEGRADED_DOCTRINE=true` to override) |

## The daily loop (the primary usage pattern)

Huygens is not just an archive — the day-to-day surface is a loop around **one
daily ritual, la jornada** (`day` prompt). There is deliberately no plan/review
split: a jornada **settles what was left pending and orients the day** in a
single narrative, usually at the start of the day. If yesterday wasn't
concluded, it gets concluded at the start of the next one.

1. **La jornada** (usually morning): overdue MITs and deadlines get a
   disposition (done / still on / move / drop), then you optionally pick MITs
   for today (1–3 by convention — a convention, not a wall). The whole thing is
   committed as ONE `kind: day` informe-block, shown in the **Bitácora**. The
   narrative can be as chaotic as you like — the structure lives in the
   accompanying mutations, not in the text.
2. **During the day**: capture freely (`capture` — cheap, no ceremony, no
   interpretation), and apply corrections as they happen ("eso ya está hecho",
   "X pasa a WAITING") — those are *normal* minimal proposals, no `kind`, no
   re-asking. Deadlines and snoozes live on the note: `due_at` (hard
   commitment) and `defer_until` (tickler — hidden from the radar until that
   day). The agent may *suggest* them; you decide.
3. **La semana** (`week` prompt, weekly): the maintenance review — WAITING,
   resurfacing deferred tasks, incoming deadlines, SOMEDAY promotions, never-
   reviewed notes, the deferred inbox. One `kind: week` informe per ISO week.

Rituals require your explicit OK (`approved: true` is only passed after it),
are unique per Madrid day / ISO week (server-enforced, DST-correct), and the
dashboard nudges you when today has no jornada. A mid-afternoon status change
is **not** a jornada — it's a normal correction. The old `plan_day`/`review_day`
kinds are legacy: historic entries keep rendering, new ones are rejected.

## Processing the inbox (the deliberate session)

Capture and interpretation are decoupled on purpose: raws pile up in the inbox
(`status='pending'`) and you process them when you decide to — typically a few
times a week, via the `process_inbox` prompt:

```text
Procesemos el inbox.
```

The agent lists pending raws, groups the ones that belong to the same matter,
and discusses an interpretation with you. Several raws can become one
narrative informe-block. Raws that should not become topology are dispatched
with `set_raw_status` (`ignored` / `deferred` / `processed`).

## Propose → commit

The agent persists a **visible draft** with `create_proposal` (real record ids
are assigned at create time; the stored payload is the SSOT of the change).
You review the diff (`get_proposal`), ask for edits (`update_proposal`),
discard (`discard_proposal`) or approve.

Only after approval does `commit_proposal` run — one atomic SurrealDB
transaction (all-or-nothing) that creates the narrative block(s), notes,
edges, marks the raws `processed`, and stamps the proposal with the
changefeed `versionstamp`. New blocks are **auto-embedded post-commit**
(best-effort; a failed embed never rolls back the commit — `db:reindex`
backfills). `get_proposal_changes` returns the exact delta, read from the
stored payload; the graphical view lives in the dashboard.

## Asking questions (grounding)

Use Huygens as the source the agent *cites*, not only the place it writes to.
The doctrine instructs agents to answer from the graph: retrieve connected
context (`expand_context` / `neighborhood`), verify claims against the graph
before asserting them (`check_claim`), and cite the literal evidence behind an
interpretation (`trace_provenance`). If an answer about your projects doesn't
survive `check_claim`, it's a guess — and the agent must say so.

## Tools

The complete, current tools surface (with one-line purposes) is the
**Tools surface** table in
[`apps/mcp/src/lore/data-model.md`](./apps/mcp/src/lore/data-model.md) —
kept in sync by `apps/mcp/test/data-model-drift.test.ts`. Not duplicated here.

## Troubleshooting

**MCP unhealthy**: `docker compose -f .devcontainer/docker-compose.yml logs huygens-mcp`.

**Worker won't start**: it fails fast if it can't fetch the doctrine from the
MCP (by design). Check `huygens-mcp` is healthy; `ALLOW_DEGRADED_DOCTRINE=true`
only as a conscious override.

**Vector search misses fresh content**: commit auto-embeds new blocks when
`DEEPINFRA_API_KEY` is set; if embedding failed (no key / provider down), run
`bun run db:reindex` in `apps/mcp` to backfill, or `index_block` on specific
blocks.

**Wipe dev data** (destroys the graph — there is no backup strategy yet, see
`docs/issues/2026-06-09`):

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```
