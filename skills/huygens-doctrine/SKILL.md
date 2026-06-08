---
name: huygens-doctrine
description: "Use when operating Huygens, the personal knowledge-graph memory MCP — reading and querying the graph (hierarchies, neighborhoods, counts, daily radar), capturing, proposing and committing mutations, tracing provenance, producing operational reports, correcting drift/staleness, and judging when the graph beats native memory. Covers BOTH the read side (query craft, honest presentation) and the write side (capture → proposal → commit → index → verify). Read huygens://lore/operating-doctrine FIRST; it governs behaviour and overrides this skill on conflict. Derived from the live schema, the doctrine, and verified failures in real Hermes sessions."
version: 2.0.0
author: Hermes Agent + Fiser
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [huygens, knowledge-graph, rag, surrealql, provenance, operations, query, read-discipline, gtd, ztd]
    related_skills: [native-mcp]
    supersedes: [knowledge-graph-memory-operations, huygens-query-discipline]
---

# Huygens Operations

## Overview

Huygens is a **trust memory**: every fact in the graph is auditable and citable
(traceable to literal evidence) and **nothing structural mutates without the
user's mandate**. Operating it well has two halves, and this skill covers both:

- **Read side** — query the graph and *answer honestly*: build hierarchies from
  the right edges, never present an empty result as truth, count from `count()`,
  reuse query context instead of asking the user.
- **Write side** — change the graph *through provenance*: capture evidence,
  classify the intent, propose a minimal faithful change, commit only on mandate,
  index, and verify.

Most graph-memory systems fail first from **hygiene and read-craft**, not from
ontology. Fix queries, provenance, embeddings, orphan tasks and honest
presentation before inventing new edge types or UI.

## Authoritative source first

Read **`huygens://lore/operating-doctrine`** before operating. It is the single
source of truth for *how to behave* and **governs over this skill on conflict**.
Companion resources: `huygens://lore/data-model` (the WHAT — entities, edges,
proposal lifecycle), `huygens://lore/surrealql-cookbook` (read recipes — note it
ships at least one broken recursion recipe, see Read Recipe 2), and
`huygens://lore/schema` (the live physical schema).

> **Why this matters:** Hermes does **not** receive the MCP server `instructions`
> field automatically — fetch the `operating-doctrine` resource explicitly. The
> rules below restate the high-frequency ones; the resource is authoritative.

The doctrine's load-bearing rules:

- **Approval boundary** — nothing structural mutates outside an approved proposal;
  `commit_proposal` only with the user's explicit OK. SurrealQL is read-only (the
  reader is a VIEWER; writes are rejected by the DB).
- **Decision tree** — capture vs process-inbox vs ritual; default to a normal
  informe with **no `kind`**.
- **Kind discipline** — tag `kind: plan_day`/`review_day` **only** inside that
  explicit ritual; a normal process informe carries no kind. Ante la duda, **no
  pongas kind**.
- **Initiative asymmetry** — *invite* rituals proactively (be a coach: morning
  without MITs → propose planning; day's end with open MITs → propose closing) but
  **never commit a plan_day/review_day the user did not ask for**. The phantom
  close is the error to avoid.
- **One ritual per day** (Madrid) and the **MIT rules** (the user decides MITs;
  1–3/day; at least one tied to an Objetivo).

## When to Use

- The user asks to *see* graph state: tasks, ideas, a hierarchy, a project's neighborhood, the daily radar.
- Reporting **counts** ("¿cuántas pendientes hay?").
- Capturing, processing the inbox, or any graph mutation/correction.
- Producing daily/operational reports or closing the day.
- Auditing provenance, retrieval quality, topology, or schema/tool behaviour.
- Deciding whether the graph is worth it vs native memory.
- The user corrects drift, marks something stale, or pushes back on a result.

Do not use for: ordinary note editing in another vault; generic vector-DB advice
with no graph/provenance; protected Hermes-agent config (load `hermes-agent`).

## Operating Principles

0. **Doctrine first.** It governs and overrides this skill on conflict.
1. **Evidence before interpretation.** Pull raws, notes, neighborhoods, provenance, and query outputs before asserting graph state.
2. **Proposal boundary.** For mutations, keep capture → proposal → commit → index → verify; never bypass with direct writes.
3. **Topology over derived flags.** Compute operational status from current graph structure, not from stale metadata.
4. **Verify after mutating.** Use `check_claim`, `neighborhood`, `get_proposal_changes`, or read-only SurrealQL before reporting success.
5. **Honest reads.** Never present `[]`/`0`/a guess as fact; see the Read Discipline below.

---

# Part I — Read & Query Discipline

Every rule here comes from a **verified failure in a real persisted Hermes
session** (conversation ids cited). These are the specific ways the agent has
given wrong, empty, or abandoned answers while operating correctly at the tool
level.

### Read Recipe 1 — Hierarchy comes from `part_of`, not the semantic graph tools

For any *hierarchical* view (areas → projects → tasks), query `part_of` explicitly
with `query_query`. `neighborhood`/`expand_context` **fuse all edge types**; in the
live graph ~598 semantic edges drown the ~95 `part_of` edges, so the "tree" comes
back as noise — and they expose no `edge_types` filter. *(Evidence:
conv:lcdl4c3gpf0xxj3wdln4 — the agent admitted "lo ideal sería casi solo part_of"
and used `neighborhood` anyway; conv:50zax4rpktfwkxmve6m1.)*

Proven pattern (renders the real forest — nodes **and** edges):

```surql
LET $edges = (SELECT id, in, out FROM part_of LIMIT 400);
LET $nodes = array::distinct(array::flatten([$edges.*.in, $edges.*.out]));
SELECT id, title, type.slug AS type, state FROM note WHERE id IN $nodes;
SELECT id, in, out FROM part_of WHERE in IN $nodes AND out IN $nodes;
```

A graph/canvas view needs **real edge rows** (`in`/`out`), not flat columns like
`->part_of->note.title AS parent` — those render as a table, nothing to draw.

### Read Recipe 2 — Project fields OUTSIDE the recursion gate, then flatten

The recursion operator returns **record ids in a nested structure**. Never project
a field (`.title`, `.state`) *inside* the `{..+collect}` gate — it throws
`Expected a record ID`, and the nested result can reduce to `[]`. The agent once
ran `@.{..+collect}<-part_of<-note` on Irontec, got `[]`, and told the user it had
**no children** — it has 3. This broken recipe is copied from the cookbook.
*(Evidence: conv:7y9mfvh1a1qtzau5ad73; Irontec = note:159yz12k3mocht8hmssy.)*

```surql
LET $root = note:159yz12k3mocht8hmssy;
LET $desc = (SELECT VALUE @.{..+collect}<-part_of<-note FROM ONLY $root);
LET $nodes = array::distinct(array::flatten([$root, $desc]));   -- flatten first
SELECT id, title, type.slug AS type, state FROM note WHERE id IN $nodes;
SELECT id, in, out FROM part_of WHERE in IN $nodes AND out IN $nodes;
```

If unsure of the exact recursion idiom, fall back to Recipe 1 ("whole forest then
filter") — slower, but it never silently returns `[]`.

### Read Recipe 3 — Never present an empty result as truth

`[]` for a node you **just saw populated** is a **malformed query, not an
absence**. Before asserting emptiness, re-count directly:

```surql
SELECT count() FROM part_of WHERE out = $root GROUP ALL;
```

Only say "no relations" after a direct edge count confirms zero. *(Evidence:
conv:7y9mfvh1a1qtzau5ad73, conv:50zax4rpktfwkxmve6m1 — `[]` reported as "no
children", blame put on the canvas.)*

### Read Recipe 4 — Fix and re-run; never ask the user for a query you already have

On read-only pushback, **re-execute a corrected, scoped query yourself**; reuse
the edge-selection pattern that worked a turn ago. Debugging a read query is your
job. A turn that ends a read task with a question and **zero tool calls** is almost
always a failure. *(Evidence: conv:7y9mfvh1a1qtzau5ad73, final turn: "pásame el
query nuevo" with both queries already in context.)*

### Read Recipe 5 — Count from `count()`, never by eye

Any number you report comes from `count()`/`array::len`, computed in the query —
never from counting a rendered list. *(Evidence: conv:00gszgur5ff88itfpynn,
conv:zyvsjo9qqv262721kle3 — reported "17" over 16 rows.)*

```surql
SELECT count() FROM note
WHERE type.slug IN ['task','idea']
  AND state IN ['CLARIFIED','ACTIVE','WAITING','SOMEDAY']
GROUP ALL;
```

### Read Recipe 6 — `save_query`: omit `id` to create; never silence the error

To **create** a saved query, **omit `id`** (it is optional, only for *updating* an
existing one). And **never hide a tool error** — surface failures to the user.
*(Evidence: save_query failed 4/4 by inventing an `id`, error hidden each time —
conv:lcdl4c3gpf0xxj3wdln4 ×3, conv:p0vvhf7le0ynkkee5mok ×1.)*

### Read Recipe 7 — `ORDER BY` a field you did not project

Ordering by a field requires projecting it (or not using the `VALUE`-narrowed
form). Applies to **any** field, including plain `SELECT VALUE id`. *(Evidence:
"Missing order idiom updated_at", right on the 3rd try — conv:p0vvhf7le0ynkkee5mok.)*

```surql
-- mal:  SELECT VALUE id FROM note ORDER BY updated_at
-- bien: SELECT id, updated_at FROM note ORDER BY updated_at DESC;
```

### Read Recipe 8 — Projecting a field over a bound `$ids` array

`SELECT content FROM $ids` (array of record links) fails with *"Specify a database
to use"*. Use instead:

```surql
SELECT * FROM block WHERE id IN $ids;          -- preferred, explicit table
SELECT VALUE content FROM $ids;                -- VALUE-narrowed works
SELECT string::slice(content,0,200) FROM $ids; -- a function wrapper works
```

### Read Recipe 9 — Diagrams: the client drops `type:image`

The Hermes client serializes MCP `type:image` as `""`, so `format_d2` as
`svg`/`png`/`jpeg` arrives empty (client adapter limitation, not an MCP bug). Use
`format_d2: "code"` and render separately if the user needs the image.

---

# Part II — Mutation Workflow

Use when the user asks to create, update, reparent, archive, regularize, or correct
graph state.

1. **Capture** the literal user input with `capture` (no interpretation, no
   segmentation). Capture is evidence, not commitment — do it without ceremony.
   **Capture the user's friction/corrections too** ("no veo nada", "está mal") —
   it is first-class operability signal. *(Across 9 sessions the agent captured 0
   friction signals; don't repeat that.)*
2. **Classify the output shape** before creating topology:
   - **Narrative-only / informe narrativo** — create only a narrative block from
     the raw(s). Do **not** add notes, descriptive blocks, `about`, `affects`,
     `part_of`, or `mentions` unless the user explicitly asks for structure after
     seeing the narrative.
   - **Graph mutation / correction** — proceed with note updates/creates and
     semantic links, but keep the proposal minimal and faithful to the order.
   - **Ambiguous** — prefer a plain narrative block, or ask before adding topology.
3. **`find_related` before creating** a new note; if the top hit is strong, update
   or link the existing note instead of duplicating.
4. **Inspect the neighborhood/provenance** so the proposal has the right parent,
   mentions, and affected nodes.
5. **`create_proposal`** — narrative block(s) (no `kind` unless it is an explicit
   ritual), `about`, `affects`, and minimal note/edge mutations. For
   narrative-only, the payload is just `narrative_blocks` + `raw_ids`.
6. **`commit_proposal`** the approved/authorized proposal. A ritual
   (`plan_day`/`review_day`) requires `approved: true` and is rejected if one
   already exists for the day — retract the prior one before re-committing.
7. **Indexing expectation** — `commit_proposal` normally attempts best-effort
   indexing for newly created narrative/descriptive blocks when the server has
   `DEEPINFRA_API_KEY`. Embedding failure does not roll back the commit. Still
   verify embedding coverage after important commits and use `index_block` only
   as a backfill step when blocks remain unembedded.
8. **Verify** with `check_claim`, `neighborhood`, `get_proposal_changes`, or
   read-only SurrealQL **before** reporting success.

### Topology rules (from the doctrine)

- **`part_of` is single-parent.** **Never assume the parent from recent
  conversation context** — people and tasks cross areas. Invite the user to anchor
  it, or leave it without a parent; do **not** auto-create the edge.
- When you spot an **orphan** and *infer* a parent: **invite or capture** the
  signal — never mutate on your own initiative. *(Evidence: conv:z7w9hwsiljdrof5hkqi2
  — agent self-declared a relation, did nothing, user created the edge by hand 3
  days later.)*
- `mentions` is the deliberate fallback for ambiguous relations — prefer it over
  inventing a new edge type. Do not add edge types without a concrete query need
  and the user's approval.
- For voice-originated corrections, brainstorming, or meeting-prep dictation,
  preserve uncertainty and corrected wording as first-class provenance; if the
  user calls it an "informe narrativo" or starts a meeting-prep note, keep it
  narrative — do not turn it into an idea/task/reference by default.

---

# Part III — Daily Reports & Operational Radar

- **Start from the complete radar, not tactical filters.** A report built only
  from `mit_for`/deadlines/recent-updates is locally useful but globally blind.
  Run the pinned backbone `Informe diario → radar operativo completo`
  (`saved_query:ebrk9y01h58jicz7svhv`), confirm every root branch is represented,
  and render the full hierarchy before recommending focus.
- **Include the ritual layer.** Check committed narrative blocks with
  `kind: plan_day` / `kind: review_day`, and query live MITs via the top-level
  `note.mit_for` field, before answering "what remains today?".
- **Render hierarchically.** Don't stop at flat counts by state — query `part_of`
  and render projects under areas/subareas, with state labels inline (Read Recipe 1).
- **Calendar + Huygens morning reports:** anchor the date with the calendar
  current-time tool in the user's timezone, list all calendars before fetching
  today's events, keep the output compact/mobile-friendly.
- **Closing the day (`review_day`):** do not require the user to write the review.
  Capture their spoken/chat disposition as evidence, synthesize the retrospective
  yourself, create the `kind: review_day` block, link `about`/`affects`, commit
  (`approved: true`), index, verify both the day's `plan_day` and `review_day` exist.
- **Midday status corrections are NOT a day review.** Even if they close tasks or
  move items to `WAITING`, use a plain narrative block with **no `kind`**; leave
  `review_day` for an explicit end-of-day close. If you committed a premature
  `review_day`, repair it: capture the correction, retract the ritual block and its
  `derived_from`/`about`/`affects`, recommit as a non-ritual narrative, verify no
  `review_day` exists for the date.

---

# Part IV — Staleness Cleanup & Drift Correction

When the user says content is stale/superseded/“chapuza”, or points out drift
(wrong state, misleading title, completed feature still live):

**Do not mutate immediately.** Inspect the relevant project/area neighborhood,
then present candidates grouped by confidence + proposed action:

1. **Already discarded / no action** — already `ARCHIVED`/removed.
2. **Strong archive candidates** — historical ideas/plans superseded by an active
   canonical reference or explicit decision.
3. **Close as DONE, not ARCHIVED** — tasks whose deliverable now exists (leave the
   queue without hiding completion).
4. **Review before discarding** — looks stale but may encode valid rationale.
5. **Keep live** — canonical references, active strategy, current projects, cheap
   `SOMEDAY` ideas.

Ask before applying; prefer a small conservative proposal over an aggressive sweep.
Corrections like "está a la espera" usually become `WAITING`, preserving
parent/project/person topology. For a mistaken recent proposal, inspect its
*materialized* changes first, retract only what it created, reset raw statuses only
if needed for the replacement, and verify the intended artifact is the only one
remaining. When a voice capture is corrected as a transversal report, repair the
classification (retract the narrow note, reset the raw, create/​update a
`reference`/informe linked to areas/projects with conservative `mentions` rather
than a single forced `part_of`).

---

# Part V — Health Queries

Run these to find real hygiene problems (adapt field names to the live schema).

### Embedding coverage
```surql
SELECT id, block_kind, string::slice(content,0,120) AS snip, created_at
FROM block WHERE embedding IS NONE ORDER BY created_at DESC;
```

### Narrative blocks with weak semantic links
Do **not** triage by `count(->about) = 0` alone; that overstates the problem
because many narrative blocks are still operationally connected through `affects`.
The high-signal check is narratives with **neither** `about` nor `affects`:

```surql
SELECT id, string::slice(content,0,120) AS snip, created_at
FROM block
WHERE block_kind = 'narrative'
  AND count(->about) = 0
  AND count(->affects) = 0
ORDER BY created_at DESC;
```

Substantive informes with neither are topologically invisible — surface them in
`process_inbox` so the user can anchor them through the proposal flow. Use the
about-only count only as a loose smell, never as the headline metric.

### Live tasks without parent
```surql
SELECT id, title, state, created_at FROM note
WHERE type.slug = 'task'
  AND state IN ['ACTIVE','WAITING','CLARIFIED']
  AND count(->part_of) = 0
ORDER BY updated_at DESC;
```

### Open blockers
Return source state, target state, and `reason`. First separate **zombie blockers**
(where the target is `DONE`/`ARCHIVED`) from live blockers. If every missing
`reason` belongs to a zombie blocker, do **not** present this as a reason-backfill
problem; the correct cleanup is to release/remove the dead blocker relation through
the proposal/retract flow. Only report a commit-path `reason` defect when live
blockers are missing reasons.

### Temporal axes / MIT hygiene
The three axes are top-level indexed fields, **never** inside `metadata`:
`mit_for` (priority), `due_at` (hard deadline), `defer_until` (tickler/snooze).
Watch for deadlines leaked into `metadata` (e.g. `metadata.deadline`) — they are
invisible to the overdue radar. Query MITs as a datetime range, not a `YYYY-MM-DD`
string.

### Pinned saved-query hygiene
Pinned saved queries are operational affordances. A pinned row with `query: NONE`
or `query: null` is a false affordance: it looks callable but cannot run. When
auditing Huygens operations, list pinned queries and either fill the query body or
unpin/archive the placeholder through the appropriate saved-query tool; do not
leave empty pinned entries in the daily/reporting backbone.

---

# Part VI — Is the graph worth it vs native memory?

KGRAG earns its keep when it answers grounded, inspectable questions native memory
should not own: "where did this claim come from?", "which raw supports this note?",
"what changed when this proposal committed?", "what is live/blocked/parentless/
overdue/unreviewed?", "what related notes exist (avoid duplicates)?", "what was
inferred vs explicitly said?". Native memory is better for compact, durable
preferences (name, tone, conventions). Do **not** overload native memory with task
graphs, transient deadlines, or proposal ids — and do **not** overload Huygens with
stable preferences. The graph's advantage is real **only with hygiene discipline**:
complete embeddings, faithful provenance, topology checks, pinned saved queries,
periodic review.

---

## Common Pitfalls

1. **Tree from `neighborhood`/`expand_context`.** Hierarchy is `part_of` only (R1).
2. **Projecting inside the recursion gate**, or reporting the nested `[]` (R2/R3).
3. **Ending a read task with a question + zero tool calls** (R4).
4. **Counting rendered rows by eye** (R5).
5. **Inventing an `id` for `save_query` create**, or hiding tool errors (R6).
6. **`ORDER BY` an unprojected field; `SELECT field FROM $ids`** (R7/R8).
7. **Assuming a `part_of` parent from recent context**, or auto-creating it.
8. **Counting objects but not testing retrieval** — many notes are useless if
   embeddings are incomplete or topology is sparse.
9. **`affects` as a substitute for `about`** — `affects` explains mutation, `about`
   explains subject; many narratives need both.
10. **Proposal preview ≠ persisted truth** — check committed records for `reason`,
    `transformation`, edge metadata.
11. **Flattening provenance to "summarized"/"inferred"** — transformation labels
    are epistemic claims; keep unknown as unknown.
12. **Phantom close** — committing a `review_day` the user did not ask for; midday
    corrections are not a day review.
13. **Letting archived structure pollute live reports**; **persisting derived state**
    (e.g. `metadata.planning_status`) instead of computing from topology.
14. **New ontology before hygiene** — backfill embeddings, fix provenance, clean
    orphans first.

## Verification Checklist

- [ ] Hierarchy queried `part_of` explicitly; recursion flattened + projected outside the gate.
- [ ] No `[]`/`0` reported as absence without a confirming direct `count()`.
- [ ] No read task ended by asking the user for a query already in context.
- [ ] Every reported number came from `count()`/`array::len`.
- [ ] `save_query` create omitted `id`; tool errors surfaced, not hidden.
- [ ] User friction/corrections were `capture`d.
- [ ] Mutations went through capture → proposal → commit → verify; embedding coverage checked and `index_block` used only if auto-index/backfill left blocks unembedded.
- [ ] No `part_of` parent assumed from context; orphans invited/captured, not auto-mutated.
- [ ] Rituals only on explicit request, with `approved: true`, one per day; no phantom close.
- [ ] Daily reports began with the complete radar before tactical filtering.
- [ ] Provenance/edge metadata (`reason`, `transformation`) checked against persisted records.
- [ ] After mutation, state/topology verified before reporting success.
