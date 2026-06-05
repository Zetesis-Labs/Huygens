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
  mit_for?: datetime,  ← top-level field (indexed); YYYY-MM-DD → UTC midnight
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

### mit_for

`mit_for` is a **top-level datetime field on `note`** (indexed as `note_mit_for`). Set it as `YYYY-MM-DD` (interpreted as UTC midnight) or full ISO datetime. **Never put it inside `metadata`.** Query it with `mit_for >= start AND mit_for < end`.

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

In the proposal payload, `edges` covers `part_of`, `blocked_by`, `mentions`. `about` and `affects` have their own dedicated arrays.

Structural mutation must go through persisted proposals. `commit_proposal` is the approval boundary.

## Proposal lifecycle

```
create_proposal (status=draft)
  → update_proposal (replaces payload; draft only)
  → get_proposal (readable diff + JSON)
  → discard_proposal (status=discarded; no graph mutation)
  → commit_proposal (atomic tx: status=committed; creates blocks, notes, edges; marks raws processed)
  → get_proposal_changes (reads proposal.result + changefeed delta)
```

**`commit_proposal`** returns `CommitProposalResult`:
```
{
  proposal_id, raw_ids_processed,
  narrative_blocks_created: string[],
  notes_created: string[], notes_updated: string[],
  descriptive_blocks_created: string[],
  derived_from_created, about_created, affects_created, semantic_edges_created,
  temp_ids: { notes: {temp_id → real_id}, blocks: {temp_id → real_id} }
}
```
Use `temp_ids` to act on a just-created record without re-querying.

**`get_proposal_changes`** (read-only, committed proposals only): JSON with two
views — `materialized` (real record ids resolved to records) and `changefeed`
(the transaction delta at the commit versionstamp). Visual rendering of the
change graph lives in the dashboard (React Flow), not in the MCP.

## Proposal payload schema

```typescript
{
  raw_ids: string[],              // raw_capture record ids (≥ 1)
  narrative_blocks: [{            // ≥ 1 required
    temp_id: string,              // local name used to cross-reference below
    content: string,
    raw_ids: string[],            // raws this block summarizes (≥ 1)
    kind?: plan_day|review_day|plan_week|review_week  // ritual tag → Bitácora.
                                  // Set ONLY by the plan_day/review_day rituals.
                                  // A normal process informe has NO kind.
  }],
  note_creates: [{
    temp_id: string,
    type_slug: NoteTypeSlug,
    title: string,
    state?: NoteState,            // default CLARIFIED
    mit_for?: string,             // YYYY-MM-DD or ISO datetime → top-level field
    metadata?: object,
    descriptive_blocks?: [{ content }]
  }],
  note_updates: [{
    id: string,                   // real note record id
    title?, state?,
    mit_for?: string | null,      // null clears it; YYYY-MM-DD or ISO to set
    metadata_merge?: object,
    descriptive_blocks_append?: [{ content }]
  }],
  edges: [{ kind: part_of|blocked_by|mentions, from, to, reason? }],
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
| `index_block` | Embed 1..64 blocks with BGE-M3 and persist embedding on each block. |
| `chunk_markdown` | Split markdown into heading-aware chunks. Pure function, no DB. |
| `embed_text` | Embed 1..64 strings with BGE-M3 (1024 dims, normalized). No DB. |
| `query_query` | Read-only SurrealQL. Executes as `huygens_reader` (VIEWER); writes rejected. |
| `retract` | Auditable delete of records + incident edges (atomic, `dry_run` default). The only delete path: mistaken ingest, correction, "forget this". Note→owned blocks cascade; emits a `retracted` agent_event. |
| `collection_stats` | Graph health: counts of raw_captures/notes/blocks/edges/proposals, and embedded vs unembedded blocks (the index-coverage signal). Read-only. |

## Audit

- `agent_event` records every agent decision (kind, actor, session_id, subject, payload, reasoning_summary, model, tokens_used, duration_ms). Append-only.
- CHANGEFEED 10y on every critical table (`raw_capture`, `note`, `block`, all edge tables, `proposal`) → time-travel via `SHOW CHANGES FOR TABLE x SINCE $vs`.

The system never silently mutates. Either an agent_event was emitted (intent), or CHANGEFEED has the diff (state), or both.
