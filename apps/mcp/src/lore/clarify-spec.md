# Clarify Spec

Authoritative reference for how a raw_capture becomes typed notes in Huygens. Both the autonomous worker and any conversational agent operate under this spec.

> **Current scope** — capture + processing + reports + navigate. The planning, doing and review phases are intentionally deferred. Fields and tools that belong to those phases (`mit_for`, `state` beyond `CLARIFIED`, the `update_note_state` tool) **exist in schema for forward compatibility but are not driven in this phase**. When clarifying a raw, default `state = CLARIFIED` and skip `mit_for` unless the raw is unambiguously about a deadline.

## Note Types (`type_slug`)

Pick the most specific that fits. One type per note.

| slug        | when to use |
|-------------|-------------|
| `task`      | concrete actionable item — verb + object + (optional) deadline |
| `project`   | outcome with multiple tasks; produces something |
| `area`      | ongoing area of responsibility, never finishes (health, finance, oss-side-projects) |
| `routine`   | recurring habit / ritual (cadence handled outside schema) |
| `note`      | free-form observation, fact, idea-fragment |
| `report`    | narrative report covering N notes for a period |
| `person`    | a person worth referencing — use sparingly, only when content is *about* the person |
| `reference` | external material (URL, book, paper, video) without action attached |
| `objetivo`  | strategic goal with optional target window |
| `idea`      | generative, unfinished concept worth exploring later |

## Transformations (`transformation`)

Declare how each note relates to the source raw:

| value        | meaning |
|--------------|---------|
| `verbatim`   | the block IS what the user said, literally |
| `extracted`  | directly stated in the raw |
| `summarized` | condensed from the raw |
| `inferred`   | YOUR interpretation, not explicitly in the raw — be honest about this |

## States — only `CLARIFIED` is in use this phase

The schema accepts the full ZTD machine `CLARIFIED → ACTIVE → WAITING / SOMEDAY → DONE → ARCHIVED`, but **in the current scope every new note is created with `state = CLARIFIED`** and stays there until a future phase activates state transitions. Don't pick anything else when clarifying.

## `mit_for` — deferred (do not set)

`mit_for` belongs to the planning phase, which is out of current scope. Leave it `NONE` when clarifying. Even if the raw mentions a deadline, capture the intent in the block text but do not populate `mit_for`. The field is reserved for forward compatibility.

## Edges

| edge          | from        | to          | meaning |
|---------------|-------------|-------------|---------|
| `mentions`    | note\|block | note\|block | references, relates to |
| `supports`    | note\|block | note\|block | reinforces, evidence for |
| `refutes`    | note\|block | note\|block | contradicts |
| `part_of`     | note        | note        | hierarchical (Area → Project → Task) |
| `blocked_by`  | note        | note\|block | dependency |
| `about`       | note        | note\|block | a Report is `about` the notes it covers |
| `authored_by` | note\|block | note        | a Person note is the author |
| `derived_from` | note\|block | raw_capture | provenance — every committed note points to its raw |

`internal_refs` = edges between notes created in the SAME clarify decomposition.
`external_refs` = edges from a new note to an EXISTING note discovered via `find_related`.
