# Huygens 2 Operational Graph Implementation Plan

> **For Hermes:** Execute this plan task-by-task with strict TDD. Keep commands inside the devcontainer (`docker exec huygens-app-1 sh -lc 'cd /workspace && …'`).

**Goal:** Align the MCP/database/dashboard code with `docs/HUYGENS-2-FUNCTIONAL-SPEC.md`: a small operational graph with canonical types, states, relations, minimal metadata, and proposals used as controlled mutation machinery rather than operational memory.

**Architecture:** Keep the existing Bun/TypeScript MCP and SurrealDB projection, but replace the operational vocabulary end-to-end. `raw_capture`, `proposal`, narrative `block`s and technical trace tables can remain as mutation/event plumbing, but operational tools, schemas, views and graph rendering must prefer the Huygens 2 vocabulary: `Area`, `Objective`, `Project`, `Task`, `Idea`, `Reference`, `Agent`, `Tool`; states without `CLARIFIED`; and relations `part_of`, `blocked_by`, `depends_on`, `owned_by`, `relates_to`, `duplicates`.

**Tech Stack:** Bun, TypeScript strict, Zod, SurrealDB schema/seed, Biome, Astro dashboard, `@huygens/graph` shared package.

---

## Discovery Summary

Current codebase state found during discovery:

- `apps/mcp/src/domain.ts` still exposes old state/type/edge constants:
  - state includes `CLARIFIED`;
  - types include `routine`, `person`, `objetivo`;
  - canonical edges are only `part_of`, `blocked_by`, `mentions`.
- `apps/mcp/surreal/schema.surql` still persists old operational shape:
  - `note.state` defaults to `CLARIFIED`;
  - `last_reviewed_at` is a top-level note field;
  - edge tables include `mentions` and trace/provenance tables `about`, `affects`, `derived_from` in the hot edge list;
  - missing relation tables: `depends_on`, `owned_by`, `relates_to`, `duplicates`.
- `apps/mcp/surreal/seed.surql` still seeds `routine`, `person`, `objetivo` and lacks `objective`, `agent`, `tool`.
- Proposal flow is mature and should be adapted, not deleted blindly:
  - `create_proposal` preassigns real IDs;
  - `commit_proposal` is atomic;
  - `part_of` requires `anchored: true` and is checked acyclic;
  - proposal result is already a minimal anchor, which fits Huygens 2 better than older materialized histories.
- Operational read surfaces to update:
  - `views.ts`, `neighborhood.ts`, `expand-context.ts`, `check-claim.ts`, `collection-stats.ts`, `proposal-render.ts`, `serialize.ts`;
  - dashboard graph styles in `apps/dashboard/src/components/graph/styles.ts`;
  - shared proposal graph in `packages/graph/src/index.ts`.
- Tests already encode schema/domain drift and are the right TDD hooks:
  - `data-model-drift.test.ts`;
  - `schema-constraints.test.ts`;
  - proposal lifecycle/render tests;
  - neighborhood/check-claim/collection-stats tests.

## Huygens 2 Target Invariants

### Canonical note types

Use lowercase slugs in code/schema/API:

```text
area, objective, project, task, idea, reference, agent, tool
```

Seed display names remain title case: `Area`, `Objective`, `Project`, `Task`, `Idea`, `Reference`, `Agent`, `Tool`.

### Canonical states

```text
ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
```

`CLARIFIED` must disappear from:

- domain constants;
- Zod tool schemas;
- SurrealDB assertion/default;
- docs/lore;
- dashboard legend;
- tests.

Default state for newly created notes becomes `ACTIVE`.

### Type/state matrix

Enforce at application boundary and test it:

```text
area       ACTIVE, ARCHIVED
objective  ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
project    ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
task       ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
idea       ACTIVE, SOMEDAY, ARCHIVED
reference  ACTIVE, ARCHIVED
agent      ACTIVE, ARCHIVED
tool       ACTIVE, ARCHIVED
```

### Metadata guardrails

Allowed by type:

```text
task:      due_at, defer_until as top-level fields only
reference: metadata.source, metadata.url
agent:     metadata.agent_kind in friend|family|client|contact|team|ai_agent|institution
others:    no required metadata
```

Reject at proposal input boundary:

- temporal fields hidden in metadata (`deadline`, `dueDate`, etc.) — existing guard remains;
- `last_reviewed_at`, `reviewed_by`, `planning_status`, `priority`, scores, provenance-like metadata;
- invalid `agent_kind` when `type_slug='agent'`;
- state/type combinations outside the matrix.

### Canonical operational edges

```text
part_of, blocked_by, depends_on, owned_by, relates_to, duplicates
```

Rules:

- `part_of`: note → note, single parent, `anchored: true`, acyclic.
- `blocked_by`: note → note; optional reason.
- `depends_on`: note → note.
- `owned_by`: note → note, but target should be an `agent` note when enforceable.
- `relates_to`: note → note, sparse weak link replacing `mentions`.
- `duplicates`: note → note.

`mentions` is legacy-only and should not appear in new tool schemas, generated proposals, dashboard styling, claim predicates, operational neighborhood expansion, or active stats.

### Technical trace tables

Do not treat `about`, `affects`, `derived_from` as hot graph relations. Keep them only as technical proposal plumbing while this implementation still has raw/proposal/narrative tools. The important Huygens 2 behavioral change is that operational views and graph tools do not present them as the domain topology.

---

## Tasks

### Task 1: Add Huygens 2 drift tests

**Objective:** Create failing tests that lock the canonical Huygens 2 vocabulary before touching implementation.

**Files:**

- Modify: `apps/mcp/test/data-model-drift.test.ts`
- Modify: `apps/mcp/test/schema-constraints.test.ts`
- Modify: `apps/mcp/test/proposal.test.ts`

**Steps:**

1. Add assertions that the server/domain/schema mention all Huygens 2 types and edges.
2. Change note state tests to reject `CLARIFIED` and accept only `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`.
3. Add proposal schema tests that reject:
   - `type_slug: 'objetivo'`;
   - `kind: 'mentions'`;
   - invalid state/type combinations;
   - forbidden metadata (`priority`, `last_reviewed_at`, `planning_status`).
4. Run:

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace/apps/mcp && bun test --timeout 20000 test/schema-constraints.test.ts test/proposal.test.ts test/data-model-drift.test.ts'
```

Expected: FAIL for Huygens 2 assertions not yet implemented.

### Task 2: Replace domain constants and proposal schemas

**Objective:** Make TypeScript/Zod input boundaries use the Huygens 2 operational vocabulary.

**Files:**

- Modify: `apps/mcp/src/domain.ts`
- Modify: `apps/mcp/src/tools/proposal/schemas.ts`
- Modify: `apps/mcp/src/tools/proposal/validation.ts`

**Steps:**

1. In `domain.ts`:
   - `NOTE_STATES = ['ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED']`;
   - `NOTE_TYPE_SLUGS = ['area','objective','project','task','idea','reference','agent','tool']`;
   - `EDGE_KINDS = ['part_of','blocked_by','depends_on','owned_by','relates_to','duplicates']`;
   - add `AGENT_KINDS` and `AGENT_KIND_SCHEMA`.
2. In `schemas.ts`:
   - default `NoteCreateSchema.state` to `ACTIVE`;
   - keep `mit_for`, `due_at`, `defer_until` top-level while accepting only canonical note types/states/edges.
3. In `validation.ts`:
   - add `assertStateAllowedForType(payload)`;
   - add `assertOperationalMetadata(payload)`;
   - keep `assertPartOfAnchored` and `assertPartOfAcyclic`;
   - allow every Huygens 2 edge to use note refs; only `blocked_by` persists `reason`.
4. Run the targeted proposal tests again and fix type errors.

### Task 3: Update SurrealDB schema and seed

**Objective:** Make the database enforce the Huygens 2 state and relation vocabulary.

**Files:**

- Modify: `apps/mcp/surreal/schema.surql`
- Modify: `apps/mcp/surreal/seed.surql`

**Steps:**

1. Update `note.state` default/assertion to Huygens 2 states only.
2. Remove the `last_reviewed_at` field/index from the live note schema.
3. Define relation tables for:
   - `depends_on` note→note;
   - `owned_by` note→note;
   - `relates_to` note→note;
   - `duplicates` note→note.
4. Keep `part_of` single-parent and `blocked_by` note→note.
5. Remove or legacy-hide `mentions` from the operational schema path. If the table remains for old data compatibility, remove it from canonical docs/tests and do not query it from hot graph tools.
6. Keep technical `about`, `affects`, `derived_from` tables only for proposal plumbing.
7. Replace seed rows:
   - create/update `note_type:area`, `objective`, `project`, `task`, `idea`, `reference`, `agent`, `tool`;
   - delete old `note_type:routine`, `person`, `objetivo`, `note`, `report`.
8. Run:

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace/apps/mcp && bun run db:apply'
```

Expected: schema applies idempotently.

### Task 4: Update proposal commit/render/change graph

**Objective:** Ensure commits materialize new edge kinds and proposal previews speak Huygens 2.

**Files:**

- Modify: `apps/mcp/src/tools/proposal/commit.ts`
- Modify: `apps/mcp/src/tools/proposal/changes.ts`
- Modify: `apps/mcp/src/tools/proposal-render.ts`
- Modify: `apps/mcp/src/tools/proposal/context-labels.ts`
- Modify: `packages/graph/src/index.ts`

**Steps:**

1. Make `CommitTx.edges()` handle all canonical edge tables.
2. Persist `reason` only on `blocked_by` because only that relation has the schema field.
3. Make graph folding treat all canonical operational edges as note↔note topology.
4. Replace labels/descriptions from `mentions` to `relates_to`.
5. Ensure previews and `get_proposal_changes` no longer describe `mentions` as canonical.
6. Run:

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace && bun --filter @huygens/graph typecheck && cd apps/mcp && bun test --timeout 20000 test/proposal-render.test.ts test/proposal.test.ts test/proposal-lifecycle.test.ts'
```

### Task 5: Update operational read tools

**Objective:** Make read surfaces expose the operational graph, not legacy provenance topology.

**Files:**

- Modify: `apps/mcp/src/tools/views.ts`
- Modify: `apps/mcp/src/tools/neighborhood.ts`
- Modify: `apps/mcp/src/tools/expand-context.ts`
- Modify: `apps/mcp/src/tools/check-claim.ts`
- Modify: `apps/mcp/src/tools/collection-stats.ts`
- Modify: `apps/mcp/src/serialize.ts`

**Steps:**

1. `daily_radar` should filter live states as `ACTIVE`, `WAITING`; include `SOMEDAY` only where intentionally shown; never use `CLARIFIED`.
2. `get_hierarchy` remains `part_of` only.
3. `neighborhood`/`expand_context` should expand operational edges: `part_of`, `blocked_by`, `depends_on`, `owned_by`, `relates_to`, `duplicates`.
4. `check_claim` predicate enum should be the same canonical operational edges plus `state` and `type`.
5. `collection_stats` should report counts for canonical operational edges and keep technical trace counts clearly separated or omit them from `edges`.
6. Serialization labels should render canonical note types and operational relations.
7. Run targeted tests:

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace/apps/mcp && bun test --timeout 20000 test/neighborhood.test.ts test/expand-context.test.ts test/check-claim.test.ts test/collection-stats.test.ts test/schema-constraints.test.ts'
```

### Task 6: Update docs/lore and dashboard presentation

**Objective:** Make visible docs and dashboard agree with Huygens 2.

**Files:**

- Modify: `docs/MODEL.md`
- Modify: `apps/mcp/src/lore/data-model.md`
- Modify: `apps/mcp/src/lore/operating-doctrine.md`
- Modify: `apps/dashboard/src/components/graph/styles.ts`
- Modify: any dashboard query/types that list old types/edges/states.

**Steps:**

1. Rewrite model docs around the operational graph spec, not v2.1-lite provenance.
2. Document proposal machinery as mutation/event sourcing, not memory/navigation.
3. Dashboard type icons:
   - remove `routine`, `person`, `objetivo`;
   - add `objective`, `agent`, `tool`.
4. Dashboard edge styling:
   - remove `mentions`;
   - add `depends_on`, `owned_by`, `relates_to`, `duplicates`.
5. Dashboard state legend: remove `CLARIFIED`.
6. Run drift/type tests:

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace && bun lint && bun typecheck'
```

### Task 7: Full validation in devcontainer

**Objective:** Prove the repo works after migration.

**Commands:**

```bash
docker exec huygens-app-1 sh -lc 'cd /workspace && bun lint'
docker exec huygens-app-1 sh -lc 'cd /workspace && bun typecheck'
docker exec huygens-app-1 sh -lc 'cd /workspace && bun test'
docker exec huygens-app-1 sh -lc 'cd /workspace/apps/mcp && bun run db:apply && bun run db:smoke'
```

Expected: all pass. If not, fix and rerun the failing command until clean.

### Task 8: Git commit, push, PR

**Objective:** Deliver one reviewable PR.

**Files:** all modified implementation/docs/tests.

**Steps:**

1. Inspect status:

```bash
cd /home/fiser/Huygens && git status --porcelain=v1 -b && git diff --stat
```

2. Commit with a conventional message, e.g.:

```bash
git add implementación.md docs/MODEL.md apps/mcp apps/dashboard packages/graph
git commit -m "feat: align Huygens with operational graph model"
```

3. Push:

```bash
git push -u origin HEAD
```

4. Open PR with `gh pr create` if authenticated, otherwise use the GitHub MCP tools or REST fallback.

PR body must include:

- Summary of canonical type/state/edge changes;
- Notes on proposal machinery retained as technical event sourcing;
- Test plan with exact devcontainer commands and pass/fail status.
