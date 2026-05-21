# Using Huygens

Personal memory MCP. You capture raws (chat, voice, free text) and synthesize
them into **reports** that document what changed in your thinking; a worker
applies those reports to the typed graph.

The conceptual model lives in [`docs/MODEL.md`](./docs/MODEL.md) — read it
first. This doc is the minimum to get from a clean clone to "I just talked to
my memory".

> **Note on current state**: the worker still runs in its legacy form
> (clarifies raws directly into notes). The target per `docs/MODEL.md` is a
> topologizer that reads reports and applies them to the graph. Until that
> rewrite lands, the operational flow below describes what actually works
> today; treat `docs/MODEL.md` as the direction of travel.

## Boot

```bash
# From the repo root, with the devcontainer running:
docker compose -f .devcontainer/docker-compose.yml up -d
```

The compose brings up four containers:

| Service          | What                                                                |
|------------------|---------------------------------------------------------------------|
| `surrealdb`      | SurrealDB v3 with HNSW vectors + 10y CHANGEFEED                     |
| `huygens-mcp`    | The TS MCP server on `http://localhost:3030/mcp` + `/healthz`       |
| `huygens-worker` | Python service (legacy clarify; topologizer is the next rewrite)    |
| `surrealdb-init` | One-shot chown so SurrealDB can write its rocksdb volume            |

First-time setup needs API keys. `apps/mcp/.env` needs `DEEPINFRA_API_KEY`
(for BGE-M3 embeddings); `backend/huygens-worker/.env` needs
`OPENAI_API_KEY`. Both files are gitignored; `.env.example` ships as the
template.

Verify the stack is healthy:

```bash
docker compose -f .devcontainer/docker-compose.yml ps
# All four containers should be Up; huygens-mcp + surrealdb should be (healthy)
```

## Connecting your agent

Add Huygens to your MCP client config (`~/.claude.json` for Claude Code,
similar for Cursor / Claude Desktop):

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

Restart the client. The MCP advertises tools for capture, raw inspection,
report generation, chunking/embedding, indexing, and vector search.
`generate_report` is the canonical path for turning a raw into a report
(see `docs/MODEL.md` Fase 2).

## The day-to-day flow

### Capture

Anywhere in a chat with your MCP-connected agent:

> "Capture this: mañana cita con el dentista a las 11, y revisar la
> propuesta del cliente antes del viernes."

The agent calls `capture` with `source_kind: "chat"`. A `raw_capture` row
lands in the inbox.

### Synthesize a report

When you've got enough material in a raw, ask your agent to generate a
report from it. The agent calls `generate_report(raw_id, k_nearby=5)`: the
MCP vector-searches the closest prior reports, prompts the LLM with the raw
plus that context, and writes a new `note(type=report)` with `derived_from`
to the raw and `based_on` to each prior report it used. Read it, accept it,
regenerate if you don't like it.

### Apply to the graph (legacy worker behavior)

Today the worker still polls `raw_capture WHERE processed_at IS NONE` and
clarifies raws directly into notes via `commit_clarify` + `index_block`.
This pre-dates the report-centric model in `docs/MODEL.md` and will be
replaced by the topologizer (which reads reports, not raws, and emits
`affects` edges).

Watch it live:

```bash
docker compose -f .devcontainer/docker-compose.yml logs -f huygens-worker
```

### Query

Ask your agent:

> "¿Qué tengo sobre functores aplicativos?"

It calls `vector_search` with the query. Result is a ranked list of blocks
with their parent note title + state + cosine similarity score. Filters
available: parent note `state_in`, `type_slugs`, `updated_since`,
`threshold`.

### Inspect the raw inbox

> "What's in the inbox?"

→ agent calls `list_inbox` (returns raw_captures with `processed_at IS NONE`,
ordered ASC).

> "Show me raw_capture:abc"

→ agent calls `get_raw` (returns full content, source, processed_at, and the
note ids derived from it).

## What's where in SurrealDB

See `docs/MODEL.md` for the canonical entity model (`raw_capture`, `note`,
`block`, the 10 `note_type`s, and the edge families: procedencia,
cadenas de informes, mutaciones de topología, semánticos).

Observability:

- `agent_event` — every decision the worker (or the conversational agent)
  makes, with `kind`, `actor`, `session_id` (UUIDv7), `subject`, `payload`,
  `confidence`, `reasoning_summary`, `model`, `tokens_used`, `duration_ms`.
- CHANGEFEED 10y on every critical table — `SHOW CHANGES FOR TABLE x SINCE
  $vs` gives full state-diff replay.

## Troubleshooting

**Worker logs "error: code=RAW_ALREADY_PROCESSED"** — concurrent worker or
restart replay. Already silently handled (treated as success).

**`vector_search` returns nothing for content you just captured** — the
worker may not have processed it yet (wait 2-10s). If the worker has logs
"committed X" but search still empty, check that `index_block` ran (search
the worker log for "indexed N block(s)").

**Worker can't reach OpenAI** — check `backend/huygens-worker/.env` has a
valid `OPENAI_API_KEY`. Worker logs "ConfigMissingError" if it's missing
entirely.

**MCP unhealthy** — usually means it can't reach SurrealDB. Check
`docker compose logs huygens-mcp`. The healthcheck only verifies the HTTP
listener is up, not that DB queries work.

**Stop & wipe everything** (dev only — destroys all your captured notes):

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```
