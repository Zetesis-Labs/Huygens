# Huygens Data Model

> **Note for consuming agents:** this is the compact physical-schema summary the MCP exposes at runtime — the **WHAT** (entities, edges, proposal lifecycle, tools). Keep it in sync with `schema.surql` and the tool contracts.
>
> - **How you must BEHAVE** → `huygens://lore/operating-doctrine` (read it: the approval boundary, the initiative asymmetry, the kind discipline). It governs; if a prompt conflicts with it, the doctrine wins.
> - **The conceptual WHY** → `docs/MODEL.md` at the repo root (Spanish).

Two ontological planes (current schema).

## Plane 1 — Evidence

`raw_capture` is the immutable record of what the user actually said. The real inbox.

```
raw_capture {
  id, content,
  source_kind: chat | voice | manual | import | agent-self,
  source_ref?,
  status: pending | processed | ignored | deferred,  ← source of truth for inbox
  processed_at?,   ← legacy compat; do not use as primary signal
  created_at (readonly)
}
```

Capture is **not interpretation** — never split, summarise or guess at this stage. Provenance from raw to structured lives in the `derived_from` edge, not in any field of `raw_capture`.

## Plane 2 — Interpretation

`note` + `block` + edges.

```
note {
  id, title,
  type → note_type,   slug: task|project|area|routine|idea|reference|person|objetivo
  state: CLARIFIED | ACTIVE | WAITING | SOMEDAY | DONE | ARCHIVED,
  mit_for?: datetime,      ← PRIORITY axis (indexed); YYYY-MM-DD → UTC midnight
  due_at?: datetime,       ← COMMITMENT axis: hard deadline (indexed)
  defer_until?: datetime,  ← TICKLER axis: hidden from the active radar until this day (indexed)
  metadata?: object (flexible),
  block_order: [→block, ...],
  source_kind?, source_ref?,
  last_reviewed_at?,
  created_at (readonly), updated_at (auto)
}

block {
  id,
  note? → note,
  block_kind: descriptive | narrative,
  kind?: day | week,         ← ritual tag (la jornada / weekly review) → Bitácora;
                               legacy values on historic blocks only
  content: string (markdown),
  embedding?: float[1024],   ← BGE-M3, HNSW cosine indexed (EFC=150 M=12 M0=24)
  embedding_model?, dimensions?,
  topologized_at?,
  created_at (readonly), updated_at (auto)
}
```

**`block_kind` semantics:**
- `descriptive` — belongs to a note, rendered via `note.block_order`.
- `narrative` — approved interpretation block; may stand alone; connected to notes via `about` and `affects`; linked to its source raws via `derived_from`.

Each block is the vectorizable unit. `index_block` writes `embedding`/`embedding_model`/`dimensions` and the HNSW index updates automatically.

### Three temporal axes (don't conflate them)

`note` has three day-granular datetime fields, all top-level, all indexed, all
normalized to **UTC midnight of the date written** on commit (date-only or ISO
both land on the day). **Never put any of them inside `metadata`.**

| Field | Axis | Meaning | Drives |
|---|---|---|---|
| `mit_for` | priority | "the focus for *that* day" (1–3/day) | the MITs view |
| `due_at` | commitment | hard deadline: "must be done by X" | overdue-by-deadline |
| `defer_until` | tickler | "don't show me until X" | hidden from the active radar until the day, then resurfaces |

Distinct: a task can be MIT today, due Friday, and have no defer — or be deferred
to next week (invisible until then). Querying:
- today's MITs: `mit_for >= d'<day>' AND mit_for < d'<day+1>'`
- overdue by deadline: `due_at < <today> AND state NOT IN ['DONE','ARCHIVED']`
- dormant (deferred): `defer_until > <today>`
- **active radar** (the live surface) must now exclude dormant ones:
  `(defer_until IS NONE OR defer_until <= <today>)`

## Cross-plane and graph edges

All edges are schemafull with CHANGEFEED 10y. Each pair (in, out) is UNIQUE.

| Edge | From | To | Extra fields |
|---|---|---|---|
| `derived_from` | `block` | `raw_capture` | `transformation`: verbatim\|extracted\|summarized\|inferred |
| `about` | `block` | `note` | — |
| `affects` | `block` | `note` | `action`: created\|updated\|state_changed\|linked\|archived; `summary?` |
| `part_of` | `note` | `note` | — |
| `blocked_by` | `note` | `note\|block` | `reason?`, `since` |
| `mentions` | `note\|block` | `note\|block` | — |

Every edge carries **`via_proposal`** (`option<record<proposal>>`): the proposal whose commit
materialized it. New commits stamp it in `RELATE`; legacy edges (created before the field
existed) were backfilled one-shot to the committed proposal whose payload declared them —
`proposal:genesis` for the bootstrap snapshot, the real post-genesis commit otherwise. Live
coverage is 100% (0 NONE). `created_at` / `since` are the edge timestamps.

> **Fold invariant — VERIFIED.** `the live graph == fold(log)` is now proven, not aspirational:
> `bun run db:verify-fold` (scripts/verify-fold.ts) replays the committed proposals (creates) +
> the `agent_event:retracted` events (deletes) into a throwaway shadow DB and structurally diffs
> it against the live graph — every field (entities, content, topology, **via_proposal**,
> metadata, block_order, edge reason/action/transformation) → **DIFF = 0**. Timestamps/embeddings
> are excluded as derived cache. This is the *reproducibility* half of "auditable y citable"; the
> *trust* half (nothing enters without an approved commit) is the VIEWER write boundary. It is a
> point-in-time check — re-run it after anything unusual.
>
> **Two honest caveats remain.** (1) `via_proposal` presence is not *yet* a commit-layer hard
> assert, so a future code path could reintroduce NONE (tracked — M2a). (2) The **production**
> `rebuildGraph` is still **guarded off**: it does not yet apply retraction events and is
> destructive (no shadow swap / re-embed) — `db:verify-fold` proves a *correct* rebuild is
> achievable, but the production button is not that path yet (Option A).

In the proposal payload, `edges` covers `part_of`, `blocked_by`, `mentions`. `about` and `affects` have their own dedicated arrays.

Structural mutation must go through persisted proposals. `commit_proposal` is the approval boundary.

## Proposal lifecycle

```
create_proposal (status=draft)
  → update_proposal (replaces payload; draft only; clears previewed_at)
  → get_proposal (readable diff + JSON; stamps previewed_at on a draft)
  → discard_proposal (status=discarded; no graph mutation)
  → commit_proposal (atomic tx: status=committed; creates blocks, notes, edges; marks raws processed)
  → get_proposal_changes (reads proposal.result + changefeed delta)
```

`status` also has a fourth value, **`superseded`**: a legacy proposal flattened into the
**genesis** commit (see `genesis.ts`). Superseded proposals fall outside the fold/rebuild
window (which only replays `committed`); their payloads are kept for audit but are not part of
the live projection. It is currently the most common status by count (a one-off migration
artifact), so a reader of the lifecycle should expect it even though no tool transitions *into*
it at runtime.

Server-enforced gates on `commit_proposal`: the proposal must have been
**previewed** (`get_proposal` after the last payload change — nothing structural
is committed sight-unseen); `part_of` must stay **acyclic**; a ritual informe
(kind `day`/`week`) requires `approved: true` and is unique per Madrid day /
ISO week (DST-correct).

**`commit_proposal`** returns `CommitProposalResult`:
```
{
  proposal_id, raw_ids_processed,
  narrative_blocks_created: string[],
  notes_created: string[], notes_updated: string[],
  descriptive_blocks_created: string[],
  derived_from_created, about_created, affects_created,
  semantic_edges_created, semantic_edges_removed
}
```
No temp_ids map: real record ids are assigned at `create_proposal` (the stored
payload speaks real ids — ADR-0028), so the id lists above ARE the real ids.
The proposal's stored `result` keeps only the anchor (`versionstamp`,
`committed_at`). Post-commit, the new blocks are auto-embedded best-effort
(when an embedding key is configured); a failed embed never rolls back the
commit — `db:reindex` backfills.

**`get_proposal_changes`** (read-only, committed proposals only): the delta read
straight from the proposal's stored `payload` (the SSOT, real ids) — `source:
'payload'`, **no changefeed dependency**, so it's durable. Lists notes
created/updated, narrative/descriptive blocks, edges added/removed, about/affects
and raws processed. Visual rendering of the change graph lives in the dashboard
(React Flow), not in the MCP.

## Proposal payload schema

```typescript
{
  raw_ids: string[],              // raw_capture record ids (≥ 1)
  narrative_blocks: [{            // ≥ 1 required
    temp_id: string,              // local name used to cross-reference below
    content: string,
    raw_ids: string[],            // raws this block summarizes (≥ 1)
    kind?: day|week               // ritual tag → Bitácora. `day` = la jornada (the
                                  // single daily ritual: settle pending + orient the
                                  // day, no plan/review split); `week` = weekly
                                  // maintenance review. Set ONLY inside those rituals;
                                  // a normal process informe has NO kind. Legacy kinds
                                  // (plan_day|review_day|plan_week|review_week) remain
                                  // valid on historic blocks, rejected in new proposals.
  }],
  note_creates: [{
    temp_id: string,
    type_slug: NoteTypeSlug,
    title: string,
    state?: NoteState,            // default CLARIFIED
    mit_for?: string,             // YYYY-MM-DD or ISO → top-level field (priority)
    due_at?: string,              // YYYY-MM-DD or ISO → hard deadline
    defer_until?: string,         // YYYY-MM-DD or ISO → tickler (hide until)
    metadata?: object,
    descriptive_blocks?: [{ content }]
  }],
  note_updates: [{
    id: string,                   // real note record id
    title?, state?,
    mit_for?: string | null,      // null clears it; YYYY-MM-DD or ISO to set
    due_at?: string | null,       // null clears the deadline
    defer_until?: string | null,  // null clears the defer (resurfaces now)
    metadata_merge?: object,
    descriptive_blocks_append?: [{ content }]
  }],
  edges: [{ kind: part_of|blocked_by|mentions, from, to, reason?, anchored? }],
                                  // part_of REQUIRES anchored:true — assert the user
                                  // explicitly stated this parent (rejected otherwise).
  about: [{ block_temp_id, note_ref }],
  affects: [{ block_temp_id, note_ref, action, summary? }]
}
```

`from`/`to`/`block_temp_id`/`note_ref` accept either a `temp_id` defined above or a real record id (`note:xxx`, `block:xxx`).

## Tools surface

| Tool | Purpose |
|---|---|
| `capture` | Persist raw user input as pending raw_capture (Plane 1). No interpretation. |
| `list_inbox` | List raw_captures by status (default: pending). |
| `set_raw_status` | Change status for 1..100 raws without creating topology. |
| `create_proposal` | Persist a visible draft proposal. Does not mutate graph. |
| `update_proposal` | Replace payload of a draft proposal. |
| `get_proposal` | Human-readable diff preview + raw JSON. |
| `discard_proposal` | Mark draft as discarded. No graph mutation. |
| `commit_proposal` | Atomic: create blocks/notes/edges, mark raws processed, store result. |
| `get_proposal_changes` | Read exact changes of a committed proposal (materialized + changefeed, optional D2 diagram). |
| `find_related` | Semantic search returning up to K distinct notes (deduped). Use before creating a new note to avoid duplicates. |
| `vector_search` | K-nearest blocks via HNSW (cosine, BGE-M3). Optional filters by note state, type slug, updated-since. |
| `lexical_search` | BM25 full-text over block content (analyzer `huygens_text`). For literal terms — names, IDs, acronyms — that semantic search misses. Score is BM25, not cosine. |
| `hybrid_search` | Fuse `vector_search` (semantic) + `lexical_search` (BM25) via Reciprocal Rank Fusion. Highest-recall default search; same parent-note filters. |
| `expand_context` | Hybrid retrieval: vector-match notes for a free-form query, then expand their connected subgraph into subject—predicate→object triples (with node legend). Default way to pull relevant context as text. |
| `get_hierarchy` | The `part_of` hierarchy as structured { nodes, edges } — areas → projects → tasks. Pass `root` for a subtree; omit for the whole forest. Read-only. |
| `daily_radar` | The live operational radar: ACTIVE/WAITING/CLARIFIED notes not deferred (the active surface), with parent and temporal axes. Read-only. |
| `count_notes` | Count notes from count() (never eyeballed), filterable by type/states, with a by-(type,state) breakdown. Read-only. |
| `mit_history` | The MIT timeline derived from the commit log (assigned → moved → cleared per note, with proposal + timestamp). Survives `mit_for: null`. Source of truth for streaks. Read-only. |
| `neighborhood` | Expand the graph around a note/block/raw N hops; returns the connected subgraph as triples plus a node legend. |
| `trace_provenance` | Trace where a note/block comes from: its `derived_from` raws (with transformation) and `about`/`affects` links. Use to cite sources and separate what the user said from what was inferred. |
| `check_claim` | Faithfulness check: decompose a claim into triples and verify each as supported/contradicted/unsupported against the graph. Use before asserting topology or status to the user. |
| `changes_between` | Aggregated change graph of everything committed between two dates (fuses committed proposals; per-day tally). Read-only. |
| `save_query` / `list_queries` / `run_query` / `delete_query` | Persist, list, run and delete named read-only SurrealQL queries (stable ids; `run_query` executes as VIEWER). |
| `save_conversation` / `get_conversation` / `list_conversations` / `delete_conversation` | Persist and manage dashboard chat threads (messages + canvas state). |
| `index_block` | Embed 1..64 blocks with BGE-M3 and persist embedding on each block. |
| `chunk_markdown` | Split markdown into heading-aware chunks. Pure function, no DB. |
| `embed_text` | Embed 1..64 strings with BGE-M3 (1024 dims, normalized). No DB. |
| `query_query` | Read-only SurrealQL. Executes as `huygens_reader` (VIEWER); writes rejected. |
| `retract` | Auditable delete of records + incident edges (atomic, `dry_run` default). The only delete path: mistaken ingest, correction, "forget this". Note→owned blocks cascade; emits a `retracted` agent_event. |
| `collection_stats` | Graph health: counts of raw_captures/notes/blocks/edges/proposals, and embedded vs unembedded blocks (the index-coverage signal). Read-only. |

Perimeter note: `capture`/`set_raw_status` mutate Plane 1 directly by design;
`save_query` and the `*_conversation` tools write auxiliary dashboard state
outside the proposal cycle (not graph topology). Everything structural goes
through `commit_proposal`. This file is guarded against drift by
`test/data-model-drift.test.ts` (live schema + registered tools ⊆ this doc).

## Audit

- `agent_event` records every agent decision (kind, actor, session_id, subject, payload, reasoning_summary, model, tokens_used, duration_ms). Append-only.
- `mcp_tool_call` logs every MCP tool invocation (tool, ok, duration, args, result). Append-only.
- Auxiliary (schemaless, dashboard state, outside the proposal cycle): `saved_query`, `conversation`. Seed table: `note_type`.
- CHANGEFEED 10y on every critical table (`raw_capture`, `note`, `block`, all edge tables, `proposal`) → time-travel via `SHOW CHANGES FOR TABLE x SINCE $vs`.

The system never silently mutates. Either an agent_event was emitted (intent), or CHANGEFEED has the diff (state), or both.
