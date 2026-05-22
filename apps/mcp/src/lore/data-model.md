# Huygens Data Model

> **Note for consuming agents:** the canonical model of how Huygens flows is described in `docs/MODEL.md` at the repo root, in Spanish. This document is only the compact physical-schema summary exposed by the MCP.

Two ontological planes (current schema).

## Plane 1 — Evidence

`raw_capture` is the immutable record of what the user actually said. The real inbox.

```
raw_capture {
  id, content, source_kind, source_ref?, status, processed_at?, created_at
}
```

Capture is **not interpretation** — never split, summarise or guess at this stage.

## Plane 2 — Interpretation

`note` + `block` + edges.

```
note {
  id, title, type (→ note_type), state, mit_for?, metadata?,
  block_order: [→block, ...]
}

block {
  id, note? (→ note), block_kind, content (markdown),
  embedding (1024 f32, BGE-M3, HNSW indexed)
}
```

Descriptive blocks belong to notes. Narrative blocks may stand alone and connect to notes through `about` and `affects`. Each block is the vectorizable unit.

## Cross-plane and graph edges

- `derived_from`: `block -> raw_capture`
- `about`: `block -> note`
- `affects`: `block -> note`
- `part_of`: `note -> note`
- `blocked_by`: `note -> note`
- `mentions`: `note|block -> note|block`

Structural mutation should go through persisted proposals. `commit_proposal` is the approval boundary.

## Audit

- `agent_event` records every agent decision (kind, actor, session_id, subject, payload, reasoning_summary, model, tokens_used, duration_ms). Append-only.
- CHANGEFEED 10y on every critical table → time-travel via `SHOW CHANGES FOR TABLE x SINCE $vs`.

The system never silently mutates. Either an event was emitted (intent), or CHANGEFEED has the diff (state), or both.
