# Clarify Spec

> **In transition.** The canonical model is in `docs/MODEL.md` (report-centered: raw → report → worker topologizes the graph). This file is kept as transitional reference for the worker until `topologize-spec` is written.

Authoritative reference for note types, transformations and edge taxonomy in Huygens.

## Note Types (`type_slug`)

Pick the most specific that fits. One type per note.

| slug        | when to use |
|-------------|-------------|
| `task`      | concrete actionable item — verb + object + (optional) deadline |
| `project`   | outcome with multiple tasks; produces something |
| `area`      | ongoing area of responsibility, never finishes (health, finance, oss-side-projects) |
| `routine`   | recurring habit / ritual (cadence handled outside schema) |
| `note`      | free-form observation, fact, idea-fragment |
| `report`    | narrative report — central artifact, see `docs/MODEL.md` |
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
