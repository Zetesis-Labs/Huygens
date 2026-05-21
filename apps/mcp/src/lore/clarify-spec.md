# Clarify Spec

Authoritative reference for how a raw_capture becomes typed notes in Huygens. Both the autonomous worker and any conversational agent operate under this spec.

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

## States (ZTD state machine)

`CLARIFIED → ACTIVE → WAITING / SOMEDAY → DONE → ARCHIVED`

Default for a new note: `CLARIFIED`. The state machine is not strictly enforced by the schema — you can move to any state — but the canonical flow above is what reviews assume.

## `mit_for` (Most Important Task)

Only set if the raw mentions a specific day or deadline. ISO 8601 with `Z` suffix, UTC.

| user says                          | mit_for                  |
|------------------------------------|--------------------------|
| "tomorrow", "mañana"               | next-day midnight UTC    |
| "today at 10am"                    | today 10:00 UTC          |
| "before Friday", "antes del viernes" | that Friday (deadline)   |
| "next Monday"                      | that Monday              |

**Never pick a date in the past.** If your computation lands before today, recompute.

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
