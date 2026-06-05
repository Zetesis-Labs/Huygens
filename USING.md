# Using Huygens

Huygens is a personal memory MCP. The conceptual model lives in
[`docs/MODEL.md`](./docs/MODEL.md); agent operating rules live in the **operating
doctrine**, served by the MCP as the `huygens://lore/operating-doctrine` resource
([`apps/mcp/src/lore/operating-doctrine.md`](./apps/mcp/src/lore/operating-doctrine.md)).
(`docs/CONVENTIONS.md` is now a stub redirecting there.)

Target direction:

```text
capture during the day
  -> raw_capture inbox
  -> deliberate processing session
  -> one or more approved narrative blocks
  -> visible mutation proposal
  -> graph commit
```

## Current State

The v2.1-lite path is implemented in schema and MCP tools:

- `raw_capture.status` drives the inbox.
- `proposal` stores visible drafts.
- `commit_proposal` is the approval/commit boundary.
- `block.block_kind='narrative'` represents the approved informe-block.

The legacy `raw -> clarify -> notes` path has been removed. There is no
`commit_clarify`, no persistent `generate_report`, and no autonomous inbox
worker.

## Boot

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

The compose stack includes:

| Service | What |
|---|---|
| `surrealdb` | SurrealDB with graph/document/vector storage |
| `huygens-mcp` | TS MCP server at `http://localhost:3030/mcp` |
| `huygens-worker` | Python MCP shell for future specialized workers, excluded by default via profile |
| `surrealdb-init` | One-shot volume preparation |
| `app` | Devcontainer shell/runtime |

First-time setup needs API keys:

```text
apps/mcp/.env                 DEEPINFRA_API_KEY
backend/huygens-worker/.env   optional MCP worker shell config
```

Verify:

```bash
docker compose -f .devcontainer/docker-compose.yml ps
```

## Connecting An Agent

Add Huygens to an MCP-capable client such as Claude Code, Codex, Hermes,
Cursor or Claude Desktop.

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

The user talks to the agent. The agent uses the MCP. The MCP persists in
SurrealDB.

## Intended Day-To-Day Flow

### Capture

User:

```text
Guarda que Govoy sigue bloqueado por Stripe y mañana tengo que escribirles.
```

Agent action:

```text
capture(content, source_kind="chat")
```

Result: a `raw_capture` exists with `status='pending'`. No topology decision
has been made yet.

### Process Inbox

When the user says:

```text
Procesemos el inbox.
```

The agent should inspect pending raws, usually via `list_inbox`, then discuss
them with the user. Several raws can become one narrative block if they are
about the same matter.

Example inbox:

```text
raw 1: Govoy sigue bloqueado por Stripe.
raw 2: Mañana tengo que escribirles.
raw 3: No quiero que Govoy se quede parado por esto.
```

### Propose

The agent proposes:

```text
Raws:
- raw 1
- raw 2
- raw 3

Narrative block:
Govoy esta bloqueado por Stripe; Rubén quiere convertir el seguimiento a
Stripe en una task explicita.

Notes:
- Project "Govoy"
- Task "Escribir a Stripe"

Edges:
- block derived_from raw 1
- block derived_from raw 2
- block derived_from raw 3
- block about Project "Govoy"
- block affects Task "Escribir a Stripe"
- Task "Escribir a Stripe" part_of Project "Govoy"
```

The agent persists the visible draft with `create_proposal` or updates it with
`update_proposal`. The user approves, edits or discards the proposal.

`mit_for` is a first-class field in `note_creates` and `note_updates` inside
the proposal payload. It accepts a calendar date (`YYYY-MM-DD`) or a full ISO
datetime; a date-only value lands at that day's UTC midnight. On commit the
value is written to the top-level indexed `note.mit_for` field, queryable with
`mit_for >= start AND mit_for < end`.

### Commit

Only after approval should the agent call `commit_proposal`. The operation
runs as a single atomic SurrealDB transaction (`BEGIN…COMMIT`): if anything
fails the whole commit is rolled back. On success it:

- Creates the narrative block(s), note creates/updates, `derived_from`,
  `about`, `affects`, and minimal semantic edges.
- Marks the raws as `processed`.
- Stores just the anchor on the proposal `result`: `versionstamp` and
  `committed_at`. The stored payload already speaks real ids (assigned at
  create_proposal), so it IS the set of mutations — no `temp_ids` map, no
  materialized id-lists. The changefeed is the history.

After commit, call `get_proposal_changes` to see the full delta, read straight
from the proposal payload (`source: 'payload'`, no changefeed dependency).
Graphical visualization of the change lives in the dashboard.

Raws that should not become topology can be handled with `set_raw_status`:

```text
ignored   no action needed
deferred  keep for a later processing session
processed manually closed as handled
```

## Worker Shell

The worker is disabled by default. If explicitly enabled with `--profile worker`
and `WORKER_ENABLED=true`, it connects to the MCP, logs available tools, and
idles. It does not poll the inbox or topologize autonomously.

```bash
WORKER_ENABLED=true docker compose -f .devcontainer/docker-compose.yml --profile worker up -d huygens-worker
docker compose -f .devcontainer/docker-compose.yml --profile worker logs -f huygens-worker
```

## Useful MCP Interactions Today

```text
capture              persist a raw_capture
list_inbox           list raws by status, default pending
set_raw_status       mark raws ignored/deferred/processed without topology
create_proposal      persist a visible draft without graph mutation
update_proposal      update a draft proposal
get_proposal         human-readable preview of the commit + raw JSON
get_proposal_changes exact changes a committed proposal produced: JSON read from the proposal payload (SSOT, source:'payload', no changefeed); graphical view in the dashboard
discard_proposal     discard a draft proposal
commit_proposal      atomic graph commit (BEGIN…COMMIT, all-or-nothing); returns real ids + counts. Ritual informes (kind plan_day/review_day) require approved:true and reject a 2nd of the day
find_related         find existing notes related to a concept (vector, deduped by note)
vector_search        search indexed blocks via HNSW (BGE-M3, cosine)
lexical_search       BM25 full-text over block content (exact terms, names, IDs, acronyms)
hybrid_search        fuse semantic + lexical retrieval via Reciprocal Rank Fusion (highest recall)
index_block          embed 1..64 blocks and persist embeddings for vector search
query_query          read-only SurrealQL against the graph (VIEWER role)
retract              auditably delete records + their edges (atomic; dry_run previews by default)
collection_stats     graph health: counts by status/state + embedded vs unembedded blocks
chunk_markdown       split markdown into heading-aware chunks (pure, no DB)
embed_text           embed 1..64 strings with BGE-M3 (1024 dims)
```

## Troubleshooting

**MCP unhealthy**: check `docker compose logs huygens-mcp`.

**Vector search misses fresh content**: call `index_block` on blocks that should
participate in vector search. `commit_proposal` persists graph changes; indexing
is still explicit.

**Wipe dev data**:

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```
