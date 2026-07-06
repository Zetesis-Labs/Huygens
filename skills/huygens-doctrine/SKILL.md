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
ships at least one broken recursion recipe, see Part I §3), and
`huygens://lore/schema` (the live physical schema).

> **Why this matters:** Hermes does **not** receive the MCP server `instructions`
> field automatically — fetch the `operating-doctrine` resource explicitly. The
> rules below restate the high-frequency ones; the resource is authoritative.

The doctrine's load-bearing rules:

- **Approval boundary** — nothing structural mutates outside an approved/authorized
  proposal. A correction/order stated explicitly by the user authorizes a minimal
  faithful proposal + commit without re-asking; interpretation, new topology, MITs
  and rituals require preview/approval, and rituals specifically require
  `approved: true`. Every commit requires the proposal to have been previewed
  (`get_proposal` stamps it; `update_proposal` invalidates it; server-enforced).
  SurrealQL is read-only (the reader is a VIEWER; writes are rejected by the DB).
- **Respect task modality overrides** — if the user redirects away from Huygens/MCP
  toward a git/project investigation, or explicitly says not to use the Huygens MCP,
  stop the capture/proposal/report path immediately. Use the appropriate class tool
  (filesystem/git/GitHub) instead; do not create proposals, reports, or skill edits
  unless the user explicitly asks for those persistent changes.
- **Promotion boundary for exploratory chat** — ordinary conversation,
  brainstorming, critique, abduction, and "thinking aloud" are **ephemeral by
  default**. Do not capture/propose/commit just because the content is important.
  Use Huygens only on a literal mandate: "usa Huygens", "mira el grafo",
  "guárdalo", "asienta esto", "haz una proposal", "commitéalo", "actualiza X",
  or "procesa la inbox". If unsure whether to use Huygens, do not use it.
- **Decision tree** — consult vs promoted intake vs graph mutation. Default for
  exploratory conversation is **no MCP**. If the user explicitly promotes material,
  use a normal informe with **no `kind`** unless they explicitly invoke a ritual.
- **Kind discipline** — tag `kind: day`/`week` **only** inside that explicit
  ritual; a normal process informe carries no kind. Ante la duda, **no pongas
  kind**. (`plan_day`/`review_day` are legacy kinds, readable in historical data
  only — never write them.)
- **No periodic corset by default** — do not frame the user in daily/weekly/routine
  concepts unless they explicitly ask. Prefer fluid, situated "pasadas" or
  orientation conversations that may produce zero proposals.
- **Initiative asymmetry** — *invite* support, but **never commit a `day`/`week`
  or any other durable review artifact the user did not ask for**. The phantom
  ritual/proposal is the error to avoid.
- **One `day` per day; one `week` per ISO week** (Madrid) and the **MIT rules**
  apply only when the user explicitly chooses that mode (the user decides MITs;
  1–3/day; at least one tied to an Objetivo).

## When to Use

Use Huygens tools only when the user explicitly asks to consult or mutate the
graph, or when the task itself is a Huygens operation. Strong triggers:

- The user asks to *see* graph state: tasks, ideas, a hierarchy, a project's neighborhood, the daily radar.
- Reporting **counts** from the graph ("¿cuántas pendientes hay?").
- Capturing, processing the inbox, or any graph mutation/correction **when the
  user explicitly promotes it to Huygens**.
- Producing an operational report or running a `day`/`week` ritual **only on explicit request**.
- Auditing provenance, retrieval quality, topology, or schema/tool behaviour.
- Deciding whether the graph is worth it vs native memory, **when the user asks for graph inspection**.

Do **not** use Huygens merely because the discussion is about Huygens. Do not use
it during exploratory chat, critique, brainstorming, abduction, or product
thinking unless the user says to record/consult/update it. Do not use for:
ordinary note editing in another vault; generic vector-DB advice with no
graph/provenance; protected Hermes-agent config (load `hermes-agent`).

## Operating Principles

0. **Doctrine first, but honor explicit user boundary corrections.** If the user
   says Huygens/MCP is being overused, stop using it immediately; do not "save a
   note" about the complaint unless explicitly told to.
1. **Ephemeral by default.** Conversation is not intake. Important exploratory
   thinking can remain outside the graph; only promoted material enters Huygens.
2. **Evidence before interpretation when you are actually operating the graph.**
   Pull raws, notes, neighborhoods, provenance, and query outputs before asserting graph state.
3. **Proposal boundary.** For mutations, keep promoted evidence → proposal → commit → index → verify; never bypass with direct writes.
4. **Proposal is not a report.** Proposals are rare mutation envelopes, not the
   unit of thought, review, or conversation cleanup.
5. **Topology over derived flags.** Compute operational status from current graph structure, not from stale metadata.
6. **Verify after mutating.** Use `check_claim`, `neighborhood`, `get_proposal_changes`, or read-only SurrealQL before reporting success.
7. **Honest reads.** Never present `[]`/`0`/a guess as fact; see the Read Discipline below.

---

# Coaching — teach ZTD, build the habit ("Andamia, no sustituyas")

Huygens is not just a memory + task tool. With Rubén it is a **coach that teaches
him the ZTD habit using his own graph as the material.** The structure (areas,
projects, capture) is alive and healthy; the *daily discipline* (MITs, planning,
closing the day, objectives) is **dormant — wanted but not yet adopted**, because
nobody has onboarded him into it. Activating it is your job, and you do it by
**teaching, never by doing it for him.**

**The founding rule — `Andamia, no sustituyas` (scaffold, don't substitute).**
- **Initiative is HIGH in teaching, NULL in mutating.** Teaching with words is free
  and desirable; it never touches the graph. *Choosing/justifying his MITs for him*
  — even as a proposal he just rubber-stamps — builds dependency and is the failure
  to avoid. You're VIEWER: you literally can't mutate by initiative, so your only
  real failure mode is **overwhelming him**. Transfer the judgment to Rubén; don't
  exercise it for him.
- This is a *second* boundary, parallel to the commit boundary: the commit boundary
  (approved/anchored/VIEWER) stays exactly as is.

**The real bottleneck (verified): projects without next-actions.** Many ACTIVE
projects, almost no ACTIVE tasks; ideas captured and parked, never promoted. He has
the *capture* habit, not the *plan/execute* habit. So the highest-leverage coaching
move is **decomposing a project into its next physical action** (the `decompose_project`
prompt) — without that, the `day` ritual has no candidates and dies.

**The activation ramp — one habit at a time** (read the graph to gauge where he is):
1. **Recognize the win**, don't lecture: "your world is mapped — that's the hard half
   of ZTD, and you already do it. We just need to land it into daily action."
2. **Decompose a project** → its next physical action (model it aloud, leave it as a proposal).
3. **ONE MIT a day** (not 1-3) when there's no planning streak yet; raise to 2-3 once it sticks.
4. **Settling the day** (yesterday's dispositions inside the next `day` ritual)
   only after ≥3 days of marked MITs; add learning questions.
5. **First objective**: once daily planning is stable, attack the parked ideas — "of the
   things you're chasing, which is a real Objetivo? let's hang a MIT off it."
6. **due/defer + weekly, then wean** — explain less, ask more, until he runs the rituals himself.

**Teach the "why" in the flow** (not as a manual): when you surface MITs, say *why*
1-3 ("if everything is priority, nothing is"); at the close, *why* conscious disposition.
**Max ONE micro-lesson per turn, and only the first time each concept appears** — after
that assume it's learned (re-teach only on relapse). In messaging, lecturing = spam.

**Anti-nagging:** after a couple of ignored invitations, **lower the volume, don't raise
it.** On relapse, recover warmly and **lower the bar** ("you had a streak and it broke —
restarting is part of the method, not a failure. one MIT today?"). He's an advanced user,
not a linear novice — let him skip levels when he asks.

> Track maturity by **reading the graph** (`day`/`week` ritual streaks, `last_reviewed_at`),
> never by persisting an agent-state note — that's telemetry, and it would dirty the domain
> graph + violate the mutation boundary.

---

# Part I — Read & Query Discipline

## 1. Prefer the typed read tools — they obsolete most hand-written queries
For the three things agents kept getting wrong by hand, use the tool: it returns a
**structured result and never the ambiguous bare `[]`**.
- **Hierarchy** (areas → projects → tasks) → **`get_hierarchy(root?)`** → `{nodes, edges}`.
  Never build a tree from `neighborhood`/`expand_context` — they fuse all edge types
  and drown `part_of` in semantic noise.
- **Counts** → **`count_notes(type_slug?, state_in?)`** → from `count()`, with a breakdown.
- **The live surface** → **`daily_radar()`** → active, non-deferred notes + parent + axes.

Drop to raw `query_query` only for **ad-hoc** exploration — then §3's gotchas apply.

## 2. Always-on read discipline (each rule = a verified Hermes failure)
- **Never present an empty result as truth.** `[]`/`0` for something you just saw
  populated is a malformed query, not an absence — re-check with a direct `count()`
  before asserting. *(conv:7y9mfvh1a1qtzau5ad73: `[]` reported as "no children";
  Irontec had 3.)*
- **Fix and re-run; never ask the user for a query you already have.** A read task
  ending with a question and **zero tool calls** is almost always a failure.
  *(conv:7y9mfvh1a1qtzau5ad73, final turn.)*
- **Count from `count()`, never by eye.** *(conv:00gszgur…: reported "17" over 16 rows.)*
- **`save_query`: omit `id` to create** (it's only for updating); **never hide a tool
  error** — surface failures. *(save_query failed 4/4 by inventing an `id`.)*

## 3. Raw-query gotchas (only when you bypass the typed tools)
- **Recursion: project fields OUTSIDE the gate.** `@.{..+collect}<-part_of<-note.title`
  throws (`Expected a record ID`) / collapses to `[]`; collect ids, `array::flatten`,
  *then* resolve fields. (This broken cookbook recipe caused the Irontec `[]`.)
- **`ORDER BY` a field you didn't project** fails ("Missing order idiom") → project it:
  `SELECT id, updated_at … ORDER BY updated_at`.
- **`SELECT field FROM $ids`** (bound array) fails ("Specify a database") → use
  `SELECT * FROM block WHERE id IN $ids` or `SELECT VALUE field FROM $ids`.
- **Record-id parameters may arrive as strings.** If `WHERE id IN $ids` unexpectedly
  returns `[]` for known ids, do not report absence. Re-run with literal record ids
  (`[block:..., note:...]`) or use typed tools / saved queries instead of hand-casting
  record ids. If a casting recipe is genuinely needed, it belongs in the runtime
  `huygens://lore/surrealql-cookbook`, not as a local skill-only rule.
- **Diagrams**: the Hermes client drops `type:image` → use `format_d2: "code"`.

---

# Part II — Mutation Workflow

Use when the user asks to create, update, reparent, archive, regularize, or correct
graph state.

1. **Require explicit promotion.** Do not capture exploratory conversation by
   default. The user must explicitly ask to persist, consult, or mutate Huygens
   ("guárdalo", "asienta esto", "usa Huygens", "haz una proposal", etc.). When
   promoted, capture the literal user input with `capture` (no interpretation, no
   segmentation). Capture is evidence, not commitment.
   - **Do not auto-capture user friction/corrections during brainstorming.** If the
     user complains that MCP/proposals are saturating the graph, stop using MCP;
     do not prove the complaint by capturing it. Record it only if explicitly told.
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
   (`day`/`week`) requires `approved: true` and is rejected if one already
   exists for that day / ISO week (Madrid) — retract the prior one before
   re-committing.
7. **Indexing expectation** — `commit_proposal` normally attempts best-effort
   indexing for newly created narrative/descriptive blocks when the server has
   `DEEPINFRA_API_KEY`. Embedding failure does not roll back the commit. Still
   verify embedding coverage after important commits and use `index_block` only
   as a backfill step when blocks remain unembedded.
8. **Verify** with `check_claim`, `neighborhood`, `get_proposal_changes`, or
   read-only SurrealQL **before** reporting success.

### Topology rules (from the doctrine)

- **`part_of` is single-parent, and ENFORCED.** A `part_of` edge in a proposal
  **requires `anchored: true`** — set it ONLY when the user explicitly stated the
  parent. **Never assume the parent from recent conversation context** (people and
  tasks cross areas); if the user didn't anchor it, leave the note parentless or
  ask. A `part_of` without `anchored:true` is **rejected** by the server.
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

### Huygens 2 topology direction

The live schema may still expose legacy `mentions`, `about`, and `affects` edges.
For the operational-graph refactor, treat `mentions` as a legacy fallback only:
Huygens 2 prefers `relates_to` for sparse, explicitly useful soft links, and does
not use `about`/`affects` as everyday navigation. When promoting a note/idea/task
into the graph, make topology part of the proposal: if the parent area/project or
objective is clear from the user's mandate, create the `part_of` link; if it is
not clear, ask or leave the item in an explicit inbox/pending state rather than
creating lazy orphans.

---

# Part III — Daily Reports & Operational Radar

Use this section only when the user explicitly asks for a report, radar, ritual,
or graph review. Do not impose daily/weekly/MIT framing during ordinary
exploration or rescue/autopsy conversations.

- **Start from the complete radar, not tactical filters.** A report built only
  from `mit_for`/deadlines/recent-updates is locally useful but globally blind.
  Run the pinned backbone `Informe diario → radar operativo completo`
  (`saved_query:ebrk9y01h58jicz7svhv`), confirm every root branch is represented,
  and render the full hierarchy before recommending focus.
- **Include the ritual layer.** Check committed narrative blocks with
  `kind: day` (and `kind: week`; legacy `plan_day`/`review_day` appear only in
  historical data), and query live MITs via the top-level `note.mit_for` field,
  before answering "what remains today?".
- **Render hierarchically.** Don't stop at flat counts by state — query `part_of`
  and render projects under areas/subareas, with state labels inline (use `get_hierarchy`).
- **Calendar + Huygens morning reports:** anchor the date with the calendar
  current-time tool in the user's timezone, list all calendars before fetching
  today's events, keep the output compact/mobile-friendly.
- **The day ritual (`kind: day`):** do not require the user to write it. Capture
  their spoken/chat disposition as evidence, then synthesize the narrative
  yourself — settle what was left hanging (overdue MITs and deadlines: done /
  continues / move / drop) and orient the day (MITs if the user chooses them),
  without separating close from plan. Create the `kind: day` block, link
  `about`/`affects`, commit (`approved: true`), index, verify the day's `day`
  block exists.
- **Midday status corrections are NOT a day ritual.** Even if they close tasks or
  move items to `WAITING`, use a plain narrative block with **no `kind`**; leave
  `kind: day` for the explicit ritual. If you committed a premature `day`, repair
  it: capture the correction, retract the ritual block and its
  `derived_from`/`about`/`affects`, recommit as a non-ritual narrative, verify no
  `day` block exists for the date.

## Review rescue / autopsy mode

If the user says Huygens feels useless, irrescatable, or that reviews became
irresoluble, treat this as a first-class structural incident — not as a prompt to
add product architecture and not as a reason to create more proposals. **Do not
lead with Baúles, OKF, exports, dashboards, or more schema.** Lead with the
abductive question: what design assumption is producing the failure?

Structural failure signs observed in real use:

- The agent emits proposals "como churros" during conversation.
- The graph accumulates narrative/provenance/proposal machinery faster than domain
  semantics.
- Reviews become irresoluble because captured material creates obligations to
  process, close, dedupe, or review.
- The user experiences daily/weekly/routine/MIT language as a corset around chaos.

Switch to rescue/autopsy mode:

- Stop MCP unless explicitly asked; continue the conversation outside the graph.
- Do not run full weekly/daily reviews unless explicitly requested; prefer tiny,
  value-proving review slices over totalizing sweeps. Keep a local
  `reviewed_this_session` set, do not re-ask about items already reviewed, and
  drive each reviewed item toward a concrete disposition (`keep`, `drop`,
  `someday`, `next action`, `waiting`, `archive`).
- Do not pivot to Baúles/product-layer expansion during rescue unless the user
  explicitly asks; first prove Huygens can produce operational clarity.
- Prefer a fluid, situated "pasada" of orientation over a ritual: it may produce
  zero graph changes.
- If graph inspection is requested, measure the ratio of domain semantics to
  machinery: notes by type/state, narrative vs descriptive blocks, proposals, and
  `part_of`/`blocked_by`/`mentions` vs `derived_from`/`about`/`affects`.
- Treat the success condition as orientation, not graph cleanup.
- If any mutation is needed, generate small promoted proposals only after the user
  asks to promote a conclusion.

The `reviewed_this_session` set is agent discipline, not graph state. Persist it
only if the user explicitly mandates a durable review artifact.

### Operational-graph refactor mode

When the user is debating a Huygens reset/refactor, keep the exchange
**conversational and short**. Do not bury them in a full design document unless
they explicitly ask for an informe/markdown file. Treat frustration with text
volume ("me estás enterrando a texto", "no me lapides a papel") as a task-level
signal: switch to one decision at a time, remember the settled conclusions, and
save the long structure for the requested final report.

If the user chooses **operational graph** over epistemological/auditable graph,
optimize for what helps act, decide, coordinate, or retain stable context. Strong
refactor defaults from the Huygens 2 discussion:

- Canonical hot-graph types: **Area, Objective, Project, Task, Idea, Reference,
  Agent, Tool**.
- **Agent** is an actor/counterparty, with `agent_kind`: `friend`, `family`,
  `client`, `contact`, `team`, `ai_agent`, `institution`. Do not use Agent as the
  bucket for software/infrastructure.
- **Tool** is a GTD-style instrument/system/software/service concept, with no
  required subtype: Hermes, Huygens, GitHub, Calendar, Telegram, PostgreSQL, etc.
- Operational states:
  - `Task`, `Project`, `Objective`: `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`.
  - `Area`, `Agent`, `Tool`, `Reference`: `ACTIVE`, `ARCHIVED` only.
  - `Idea`: `ACTIVE`, `SOMEDAY`, `ARCHIVED`.
  - `CLARIFIED` is not an operational state; map it to active/waiting/someday/archive or leave the item in inbox.
- Minimal Jira-inspired operational relations: `part_of`, `blocked_by`,
  `depends_on`, `owned_by`, `relates_to`, `duplicates`. Avoid reviving `mentions`
  as an infinite junk drawer; use `relates_to` only when it has operational value.
- For Huygens 2, prefer a **new clean database/schema** over in-place purging when
  the user accepts loss: it avoids dragging legacy types, edges, raws, narratives,
  and proposal machinery into the operational graph.
- Do **not** create a living cold archive. If the user rejects even a snapshot,
  accept real data loss and do not keep proposing markdown/JSON safety exports.
- Migration target is **only compact structural nodes + operational edges**:
  current title/name, type, state, minimal metadata, and useful topology. Do not
  migrate semantic/history payloads by default: old blocks, narrative history,
  raws, full proposals, `about`/`affects`/`derived_from`, provenance chains, or
  historical summaries.
- Proposals are the controlled mutation / event-sourcing mechanism, not
  operational memory. Keep draft proposals while pending; after commit, the useful
  durable artifact is a minimal commit log. Default minimum: `commit_id`,
  `timestamp`, `summary`, `affected_ids`. `submitted_by`/`approved_by` are optional
  implementation details, not conceptual requirements.
- Survivorship rule: **KEEP if it operates; DROP if it only explains history.** A
  survivor must be live, actionable, blocking something live, stable reusable
  context, a relevant Agent/Tool, or a strong Idea linked to an Area/Project/Objective.
- An `ACTIVE` project with no live tasks is not automatically stale or archival;
  interpret it as "no next action / needs planning" until other evidence shows it
  is dead.
- Reports/informes belong outside the hot graph (markdown/file layer unless
  explicitly promoted); processed raws, narrative history, `about`/`affects`
  machinery, and full proposals should not shape everyday navigation.

See `references/huygens-promotion-boundary-and-report-layer.md` for the session
that established this correction and for the OKF-report hypothesis.

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

Run these to find real hygiene problems (adapt field names to the live schema). For complete whole-graph/topology study requests, use the expanded sequence in `references/graph-health-audit-playbook.md` before interpreting the graph.

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

1. **Building a tree from `neighborhood`/`expand_context`** instead of `get_hierarchy` — hierarchy is `part_of` only.
2. **Projecting fields inside the recursion gate**, or reporting the nested `[]` as an absence.
3. **Ending a read task with a question + zero tool calls.**
4. **Counting rendered rows by eye** instead of `count_notes` / `count()`.
5. **Inventing an `id` for `save_query` create**, or hiding tool errors.
6. **`ORDER BY` an unprojected field; `SELECT field FROM $ids`.**
7. **Assuming a `part_of` parent from context, or omitting `anchored: true`** — single-parent + the server rejects un-anchored part_of.
8. **Counting objects but not testing retrieval** — many notes are useless if
   embeddings are incomplete or topology is sparse.
9. **`affects` as a substitute for `about`** — `affects` explains mutation, `about`
   explains subject; many narratives need both.
10. **Proposal preview ≠ persisted truth** — check committed records for `reason`,
    `transformation`, edge metadata.
11. **Flattening provenance to "summarized"/"inferred"** — transformation labels
    are epistemic claims; keep unknown as unknown.
12. **Phantom ritual/proposal** — committing a `day`/`week` or any proposal the
    user did not explicitly promote; midday corrections are not a day ritual.
13. **Using Huygens while discussing whether Huygens overuses Huygens** — if the
    user is critiquing MCP/proposal saturation, stop MCP. Do not capture the
    critique unless explicitly told.
14. **Letting archived structure pollute live reports**; **persisting derived state**
    (e.g. `metadata.planning_status`) instead of computing from topology.
15. **New ontology before hygiene** — backfill embeddings, fix provenance, clean
    orphans first.

## Verification Checklist

- [ ] Hierarchy queried `part_of` explicitly; recursion flattened + projected outside the gate.
- [ ] No `[]`/`0` reported as absence without a confirming direct `count()`.
- [ ] No read task ended by asking the user for a query already in context.
- [ ] Every reported number came from `count()`/`array::len`.
- [ ] `save_query` create omitted `id`; tool errors surfaced, not hidden.
- [ ] Huygens was used only after explicit request/promotion; exploratory chat was not captured.
- [ ] Mutations went through promoted evidence → proposal → commit → verify; embedding coverage checked and `index_block` used only if auto-index/backfill left blocks unembedded.
- [ ] No `part_of` parent assumed from context; orphans invited/captured, not auto-mutated.
- [ ] Rituals only on explicit request, with `approved: true`, one `day` per day / one `week` per ISO week (Madrid); no phantom ritual.
- [ ] Daily reports began with the complete radar before tactical filtering.
- [ ] Provenance/edge metadata (`reason`, `transformation`) checked against persisted records.
- [ ] After mutation, state/topology verified before reporting success.
