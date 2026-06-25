---
name: reversed-functional-design
description: Create or update functional specifications by reverse-engineering an already implemented project. Use when you must inspect code, tests, docs, configuration, routes, UI, APIs, or runtime behavior to produce specs/{app-name}/{initiative-name}/functional-specs.md following the functional-designer document structure, instead of deriving requirements from user-provided specifications.
---

# Reversed Functional Design

## Purpose

Use this skill to build a functional specification document for an **existing** project from the project itself.

This is the reverse of `functional-designer`:

- `functional-designer` derives the functional document from user requirements and discovery.
- `reversed-functional-design` derives the functional document from an implemented codebase, existing docs, tests, configuration, assets, UI, APIs, and observed runtime behavior.

The result must describe the **real product behavior as implemented**, not an idealized or proposed version.

## Required reference

Before producing the document, read the companion **`functional-designer`** skill (`.claude/skills/functional-designer/SKILL.md`) and follow its **Document structure (canonical)**, especially:

- The primary output path: `specs/{app-name}/{initiative-name}/functional-specs.md`.
- The spec is scoped to **one app and one initiative**; ask for or infer the initiative name before writing.
- Always apply the **smallest documentation change set** that accurately reflects the implementation.
- The focus on **functional behavior**: users, rules, restrictions, workflows, and visible interaction points.
- The rule to **avoid technical architecture** unless the user explicitly requests it.
- The **Graphical Representation** section when the product has an important UI.

Use `functional-designer` for the **shape and intent** of the document, but replace its Socratic discovery workflow with **evidence-based project investigation**.

## Workflow

1. **Identify** the target project, `app-name`, and `initiative-name`.
   - If the user names a project path, use it. Otherwise use the current workspace.
   - Infer `app-name` from the project directory or project metadata when possible.

2. **Inspect the project as the source of truth.**
   - Read existing README, docs, specs, changelogs, examples, and product notes.
   - Inspect source that defines user-facing behavior: routes, controllers, views, pages, components, commands, workflows, services, forms, validators, permissions, state machines, domain models, fixtures, seeds, and integration boundaries.
   - Inspect **tests** — they often encode expected functional behavior.
   - Inspect configuration when it changes product behavior.
   - Run the app, tests, CLI commands, or focused smoke checks when practical and useful.
   - For UI-heavy products, inspect screens directly when possible and derive the interaction model from the real UI.
   - Prefer the dedicated navigation tools (Read / Grep / Glob, and CodeGraph when available) over blind grepping.

3. **Build an evidence-based behavior map.**
   - Actors, roles, personas, or external systems.
   - Product goals and main user jobs.
   - Entry points: UI screens, API endpoints, CLI commands, scheduled jobs, imports, exports, integrations.
   - Core workflows and their start/end conditions.
   - Functional rules, validations, permissions, state transitions, defaults, limits, and error states.
   - Data concepts visible at the product level, without turning the document into a database or architecture spec.
   - Important tradeoffs or restrictions observable in the project.
   - UI panels, controls, states, and interactions to represent graphically when applicable.

4. **Write** `specs/{app-name}/{initiative-name}/functional-specs.md`.
   - Follow the `functional-designer` document style and sections.
   - Be detailed enough that the document corresponds **exactly** to the implemented product.
   - Prefer precise, concrete behavior over broad summaries.
   - **Do not invent missing requirements.** If something cannot be proven from the project, omit it or mark it **Not evidenced**.
   - Keep technical details out unless they are necessary to explain functional behavior.

## Existing document: research and synchronization

If `specs/{app-name}/{initiative-name}/functional-specs.md` already exists, **update** it instead of replacing it blindly:

1. Read the current document completely.
2. Investigate the current implementation again as the source of truth.
3. Compare the document against the implemented behavior.
4. Preserve accurate existing content.
5. Update outdated, incomplete, or underspecified sections.
6. Remove or rewrite claims that no longer match the implementation.
7. Add newly discovered workflows, rules, UI behavior, constraints, and edge cases.
8. Keep the final document internally consistent and aligned with the current project.

The final document must represent the implemented project after synchronization, not the historical intent of the old document.

## Interaction with the user

Do not run a Socratic discovery process by default. Ask the user only when:

- The target project cannot be identified.
- Multiple plausible apps or output locations exist and choosing one would be risky.
- The implementation contradicts itself and the correct functional interpretation cannot be resolved from code, tests, docs, or runtime behavior.
- The user explicitly wants functional assumptions or future desired behavior included.

When assumptions are unavoidable, label them clearly and keep them separate from behavior evidenced by the project.

---

## Project-specific scope (Nixon)

> Delete this section if you copy this skill to another repository.

Nixon is a monorepo (Python/FastAPI backend + React/TypeScript frontend). Evidence sources, in priority order:

- **API behavior** — `backend/server/app/presentation/` (routers, schemas, helpers) and `backend/server/app/services/auth/`.
- **Domain rules & workflows** — `backend/packages/nixon-server-core/` (entities, events, value objects, application layer). The split processing pipeline (transcription → analysis → indexing; email → email_analysis → indexing) is core functional behavior.
- **UI** — `frontend/apps/konect-web/` only.
- **Tests** — `backend/server/tests/e2e/` and `tests/unit/` encode expected behavior and business rules.
- **Existing architecture docs** — `docs/architecture/*` are **technical** references; use them to corroborate behavior, but the functional spec stays non-technical.
- **Config that changes behavior** — `k8s/` overlays, `WORKER_TASKS`, file-size/format limits.

**Scope conventions for Nixon:**

- `app-name` → **`konect`** (the Konect product; frontend app `konect-web`).
- `initiative-name` → a functional module or a Jira epic (e.g. `transcription`, `email`, `search`, `reports`). Confirm with the user if ambiguous.
- **`reagan` (`nixon-reagan`) is OUT OF SCOPE — do not document it.**
- `@nixon/docs` is documentation tooling, not a user-facing product — do not treat it as an app to spec.
- "Run the app" means inside the **devcontainer** (Node/uv); local runs are unsupported per the repo's `CLAUDE.md`.

### Deployment, environments & tenants — read as functional evidence

Kubernetes, the Helm chart and the `nixon-ci` GitOps repo are **technical infrastructure**, so they never appear in the spec as topology or manifests. They are, however, strong evidence for **functional** facts — extract these and fold them into the normal sections (Actors, Entry Points, Rules, Restrictions). Never add a "deployment architecture" section unless the user explicitly asks.

- **Environments & tenants** → `k8s/overlays/` reveals the delivered environments and per-client tenants: `dev`, `demo`, `omnia-dev`, `omnia-demo`, `reta-demo` ⇒ tenants **omnia** and **reta** plus generic demo/dev. Treat each tenant as an actor/audience and capture any **functional differences** between them (e.g. the prod `omnia` variant runs its own worker `workers.omnia_worker.app.broker:broker`). → *Actors & Roles*, *Restrictions & Tradeoffs*.
- **External systems & integrations** → `k8s/base/` components and the ExternalSecrets reveal the systems the product depends on: Keycloak (auth), MinIO (object storage), Typesense (search), Redis (queue/streams), Postgres (data), the **`nixon-mcp`** server (an MCP entry point for agents), and the STT/LLM providers wired via secrets (Deepgram, OpenAI, Google Cloud, Trebe, Groq). → *Actors & Roles (external systems)*, *Entry Points (integrations)*.
- **Behavior-changing config** → `WORKER_TASKS` (which pipelines a worker runs), worker variants, the 500 MB file-size limit and supported formats (wav/mp3/m4a/flac), and Helm `values*.yaml` toggles. → *Functional Rules & Constraints*.
- **Scheduled work** → there are currently **no CronJobs** in `k8s/` or `helm/konect-nixon/`; do not invent scheduled entry points.
- **`nixon-ci` is a separate repo** (`irontec-comms/nixon-ci`), usually **not** present in this workspace. Its functionally-relevant behavior (which environments exist, the prod `omnia` variant, which secrets→external services are wired) is documented in `frontend/apps/docs/docs/reference/deployment.md` — use that as the source. If `nixon-ci` is cloned locally, inspect its `envs/*/env.json` and `helm/konect-nixon/values-*.yaml` for per-environment functional differences.
