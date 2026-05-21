# Huygens Data Model

Two ontological planes.

## Plane 1 — Evidence

`raw_capture` is the immutable record of what the user actually said. The real inbox.

```
raw_capture {
  id, content, source_kind, source_ref?, created_at, processed_at
}
```

`processed_at IS NONE` means the worker hasn't clarified it yet. Capture is **not interpretation** — never split, summarise or guess at this stage.

## Plane 2 — Interpretation

`note` + `block` + edges. Produced by clarify (autonomous or conversational).

```
note {
  id, title, type (→ note_type), state, mit_for?, metadata?,
  block_order: [→block, ...]
}

block {
  id, note (→ note), content (markdown),
  embedding (1024 f32, BGE-M3, HNSW indexed)
}
```

Every note has at least one block. The `block_order` defines render sequence. Each block is the **vectorizable unit** — search hits a block, then surfaces its parent note.

## Cross-plane edge

Every committed note has at least one `derived_from` edge to its source `raw_capture`, carrying a `transformation` tag (`verbatim` | `extracted` | `summarized` | `inferred`). Provenance is not optional.

## Audit

- `agent_event` records every agent decision (kind, actor, session_id, subject, payload, reasoning_summary, model, tokens_used, duration_ms). Append-only.
- CHANGEFEED 10y on every critical table → time-travel via `SHOW CHANGES FOR TABLE x SINCE $vs`.

The system never silently mutates. Either an event was emitted (intent), or CHANGEFEED has the diff (state), or both.
