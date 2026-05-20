# Using Huygens

Personal memory MCP. You capture raws (chat, voice, free text), an autonomous
worker decomposes them into typed notes with semantic search, and you query
that memory from any MCP-aware agent.

This doc is the minimum to get from a clean clone to "I just talked to my
memory".

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
| `huygens-worker` | Python service that auto-processes the inbox via OpenAI gpt-4o-mini |
| `surrealdb-init` | One-shot chown so SurrealDB can write its rocksdb volume            |

First-time setup needs API keys. `apps/mcp/.env` needs `DEEPINFRA_API_KEY`
(for BGE-M3 embeddings); `backend/huygens-worker/.env` needs
`OPENAI_API_KEY` (for the clarify agent). Both files are gitignored;
`.env.example` ships as the template.

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

Restart the client. You should see 8 tools advertised:
`capture`, `list_inbox`, `get_raw`, `commit_clarify`, `chunk_markdown`,
`embed_text`, `index_block`, `vector_search`.

## The day-to-day flow

### Capture

Anywhere in a chat with your MCP-connected agent:

> "Capture this: mañana cita con el dentista a las 11, y revisar la
> propuesta del cliente antes del viernes."

The agent calls `capture` with `source_kind: "chat"`. A `raw_capture` row
lands in the inbox. The autonomous worker sees it within ~2s.

### What the worker does autonomously

1. Polls `raw_capture WHERE processed_at IS NONE` every 2 seconds.
2. For each new raw it emits `raw_claimed` → `analysis_started`, then calls
   gpt-4o-mini with the ZTD clarify prompt.
3. The LLM returns a typed `Decomposition` (notes + blocks + `mit_for` +
   transformation tags + internal refs).
4. The worker calls the MCP `commit_clarify` — that writes notes, blocks,
   block_order, `derived_from` edges, marks the raw processed, emits
   `commit_attempted` / `commit_succeeded`.
5. The worker calls `index_block` for the new block ids — BGE-M3 (1024 dims)
   embeddings persist on each block. The HNSW index updates transparently.

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

Two ontological planes:

- **Plane 1 — `raw_capture`**: the literal user input. Evidence. Immutable
  in practice. The real inbox.
- **Plane 2 — `note` + `block` + edges**: the worker's interpretation.
  Each note is a composition of markdown `block`s (via `block_order`); each
  block carries its own BGE-M3 embedding for vector search.

Edges (all schemafull with FROM/TO + UNIQUE(in,out)):

`derived_from` (cross-plane, transformation=verbatim/extracted/summarized/inferred),
`part_of`, `blocked_by`, `mentions`, `supports`, `refutes`, `about`,
`authored_by`.

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

## What's not done yet

- `find_related` tool — wrapper over `vector_search` that the clarify agent
  could call mid-flow to enrich the prompt with related existing notes
  (today every clarify is context-free)
- Retry/backoff if OpenAI hiccups (today: log and try again next tick)
- Persisted worker state — `seen_processed` is in-memory; on restart the
  worker re-claims raws it had already processed (functionally OK since
  `commit_clarify` is idempotent via `RAW_ALREADY_PROCESSED`, but it
  pollutes the audit trail with duplicate `raw_claimed` events)
- Generated reports — narratives that aggregate N notes for a period
