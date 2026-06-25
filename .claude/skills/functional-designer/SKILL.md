---
name: functional-designer
description: Create or update a functional specification for one app + initiative by deriving requirements through guided discovery (Socratic Q&A) with the user. Produces specs/{app-name}/{initiative-name}/functional-specs.md focused on actors, user jobs, workflows, rules, restrictions and UI — never technical architecture unless explicitly requested. Use when starting from requirements, ideas or a brief rather than from an existing implementation. This is the forward counterpart of reversed-functional-design.
---

# Functional Designer

## Purpose

Build a **functional specification** for a single app and a single initiative from requirements, ideas, and guided discovery with the user.

The document describes **what** the product does for its users — actors, jobs, workflows, rules, restrictions, and visible interaction points — and deliberately leaves out **how** it is built.

This skill owns the canonical document structure used by both:

- `functional-designer` (this skill) — sources the spec from the **user** via discovery.
- `reversed-functional-design` — sources the same document shape from an **implemented codebase**.

Both produce the same `functional-specs.md` shape. Keep them consistent: if you change the structure here, the reverse skill inherits it by reference.

## Output

- **Path**: `specs/{app-name}/{initiative-name}/functional-specs.md`
- **Scope**: exactly **one app and one initiative** per document. Ask for or infer both before writing.
- When **updating** an existing document, apply the **smallest change set** that makes it accurate. Preserve correct content; rewrite only what is wrong, outdated, or underspecified.

## Rules

- Focus on **functional behavior**: users/actors, goals, user jobs, workflows, validations, permissions, states, defaults, limits, restrictions, and visible interaction points.
- Keep **technical architecture OUT** unless the user explicitly asks for it — no frameworks, schemas, deployment topology, class design, or library choices.
- Prefer **concrete, testable behavior** over vague summaries ("the user can export a transcription as `.txt` or `.zip`", not "the system supports exports").
- **Do not invent requirements.** Mark unresolved items as open questions or clearly-labeled assumptions.

## Document structure (canonical)

`functional-specs.md` uses these sections, in this order. Omit a section only when it is genuinely not applicable.

1. **Summary** — one or two paragraphs: what the product/initiative is, the problem it solves, and the scope boundary of this initiative.
2. **Actors & Roles** — human users, personas, roles/permission levels, and external systems that interact with the product.
3. **Goals & User Jobs** — product goals and the primary jobs-to-be-done / outcomes each actor pursues.
4. **Entry Points** — every way work enters or leaves the product: UI screens, API endpoints, CLI commands, scheduled jobs, imports/exports, webhooks, and integrations.
5. **Workflows** — each core workflow described as: **start/trigger condition → steps → end condition**, plus alternate paths and error/abort paths. Number them for reference.
6. **Functional Rules & Constraints** — validations, authorization/permission rules, state transitions (state machine), defaults, limits/quotas, and error states with their user-visible effects.
7. **Data Concepts** — product-level entities, their meaningful fields, and their states. This is a glossary of concepts the user perceives, **not** a database schema.
8. **Graphical Representation** — *(only when the product has an important UI)* screens, panels, controls, their states, and the interaction model. Include lightweight diagrams (Mermaid) or ASCII mockups. Skip entirely for headless / backend-only initiatives.
9. **Restrictions & Tradeoffs** — known functional limitations and deliberate scope cuts.
10. **Open Questions & Assumptions** — unresolved decisions and any assumptions made, each clearly labeled.

## Discovery workflow (Socratic)

1. **Frame the spec.** Identify `app-name` and `initiative-name`. If either is unclear, ask before proceeding.
2. **Discover one cluster at a time**, reflecting answers back as draft bullets before moving on:
   actors → goals/jobs → entry points → workflows → rules & constraints → data concepts → UI.
3. Ask **focused, concrete questions** ("What happens if the upload exceeds the size limit?"), not open-ended ones ("Tell me about uploads").
4. **Confirm** the reflected bullets with the user before expanding them into prose.
5. **Write/Update** `specs/{app-name}/{initiative-name}/functional-specs.md` following the canonical structure.
6. End by listing the **Open Questions** that still block a complete spec.

## When to ask vs. proceed

Ask the user when: the app or initiative is ambiguous, two readings of a requirement materially differ, or the user wants future/desired behavior (not just current intent) captured. Otherwise proceed with sensible, clearly-labeled assumptions and surface them in section 10.
