# Idea: Predicted State Transitions

## TL;DR

Train a small model on the user's own transition history (CHANGEFEED) plus per-note features (block embeddings, time-since-edit, edge counts, `type_slug`) to predict, for every ACTIVE note, what state it *should* probably be in. The system **suggests, never auto-applies**. Its real job is to rank notes by divergence-from-current-state so a weekly review opens on "these 12 are likely stale" instead of an undifferentiated list of 400.

## Why it matters for Huygens

ZTD survives or dies on the weekly review (ADR-0021), and I'm explicitly weak on that discipline. "No review" means notes rot in ACTIVE for months: tasks already done in my head, projects I silently abandoned, ideas that should have moved to SOMEDAY. The ACTIVE pool stops being commitments and becomes noise — precisely the failure mode ZTD was supposed to prevent.

The system already has every signal it needs. CHANGEFEED has every state change (ADR-0020). Block embeddings know what notes are about. Edges know what's still being talked about. None of it points at the right notes. The gap is "the data exists, the surfacing doesn't".

## What it requires

- **Data**:
  - Historical transitions (CHANGEFEED on `note`, retained 10y)
  - Block embeddings (already there, BGE-M3 1024-dim)
  - Engineered features: time-since-last-edit, time-since-last-viewed (needs a new event), outgoing/incoming edge counts by type, `type_slug`, age, presence of `mit_for`
- **Infrastructure**:
  - Offline training script, weekly (cron in the worker container)
  - Model artifact in a flat `model/` dir on the worker filesystem, versioned by date. Serialized sklearn pipeline; no MLflow.
  - New MCP tool `suggested_state_transitions(limit, min_divergence)` returning notes ordered by `|P(predicted) - I(current)|`, with the predicted state, probability, and top contributing features (explainability: "no edits in 47 days, 0 incoming edges, type=task")
  - Optionally emit `agent_event` of kind `suggestion.state_transition` for traceability (ADR-0019)
- **Prerequisites**: ~50 transitions per direction that matters (ACTIVE→DONE, ACTIVE→SOMEDAY, ACTIVE→ARCHIVED). Below that, hand-written rules beat any model.

## Cheapest validation path

Wait until CHANGEFEED has ~200 transitions. Then in a notebook:

1. Extract the 200 transitions + the feature snapshot at transition-time
2. Train `sklearn.GradientBoostingClassifier` on `[mean(block_embeddings), time_since_edit, edge_counts, type_slug_onehot]` → final state
3. Hold out 20%, compare macro-F1 against "always predict ACTIVE"
4. Decision: if F1 doesn't beat baseline by ≥0.15 absolute, drop the idea — or fall back to features-only without embeddings

No MCP tool, no worker integration, no serving. One notebook, one afternoon, answers "is there learnable structure here?".

## Risks

- **Cold start** — week 1 there are zero transitions. Mitigation: ship a heuristic fallback (`age > 30d AND last_edit > 30d AND outgoing_edges == 0` → suggest SOMEDAY) until N transitions exist.
- **Distribution shift** — my habits will evolve. Mitigation: retrain weekly on a sliding 12-month window so old patterns decay.
- **Suggestion-induced laziness** — "the system said archive, so I archived without reading". Mitigation: surface contributing features, not just a verdict; no one-click action. Acceptance is a manual transition I had to type.
- **Reinforcing bad habits** — if I let tasks rot, the model learns "tasks tend to be archived" and accelerates it. Mitigation: periodically inspect per-`type_slug` precision and recalibrate priors by hand.
- **Overconfidence on edge cases** — sparse notes get extreme predictions. Mitigation: clamp `P` to `[0.05, 0.95]` for display.
- **The whole idea fails the real test** — even with perfect ranking, I still don't open the review. Then it changes nothing. Honest about that below.

## When to revisit

Trigger any of:

- ≥100 total state transitions in CHANGEFEED (statistical floor)
- I've skipped 3 consecutive weekly reviews AND the ACTIVE pool is over ~80 notes (felt-pain floor)
- A pure-heuristic version of `suggested_state_transitions` has been live for a month and demonstrably helps — i.e. it's worth replacing heuristics with a learned model

Until then: build the heuristic version, ship it, see if I actually look at it.

## Open questions

- Predict the **state** directly, or predict a "staleness" score and threshold per state? Staleness is more interpretable and dodges multi-class imbalance.
- Multi-step lookahead — predict transitions on notes already in WAITING/SOMEDAY too (e.g. SOMEDAY with new `mentions` → promote to ACTIVE)? Probably yes, but only after ACTIVE→* works.
- Surface where? (a) chat nudge at session start, (b) explicit `review_session()` tool, (c) quiet ranking the agent uses when I ask "what's open?". Instinct: (b)+(c), avoid (a) — push-style nudges about my own todos are the fastest way to make me ignore the tool.
- Does this actually drive more reviews, or just make the tool feel smarter while I keep skipping it? Only answerable by shipping the heuristic v0 and watching my own behavior for a month. That's the real experiment.
