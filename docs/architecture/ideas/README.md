# Parked ideas

This folder is for **strategic options we've thought through but deliberately deferred**. Each doc names an idea, why it matters, what it requires, the cheapest way to validate it, and the signal that says "now's the time". None of them are decisions or roadmap items — they're the design space we've already mapped so future-me doesn't re-think it from scratch.

If you're about to build something here, read the doc first and update the "When to revisit" section with the trigger you actually hit. If you decide an idea is wrong, replace it with a `## Killed` section explaining why — same way ADRs are amended.

## Why this folder exists

A conversation about [learned classifier heads on frozen embeddings](https://blog.evidentlyai.com/text-classification-with-embeddings/) opened a meta-question for Huygens: today the system is *the LLM applied to my data*. The interesting frontier is *a system calibrated to my criterion that the LLM only assists*. The five "what could we build" ideas below explore that frontier; the sixth ("Feedback Infrastructure") is the substrate they all share.

None of them is buildable today — the system has no notes captured in real use yet, so any learning idea cold-starts on zero data. They're parked precisely because the gating constraint is volume + usage signal, not engineering.

## Index

### Substrate (build first when the time comes)

- **[Feedback Infrastructure](feedback-infrastructure.md)** — extend the audit layer to capture what was *useful / corrected / ignored*, not just what the agent decided. Prerequisite for everything below. Revisit when: any of the dependent ideas becomes attractive and the answer to "do we have data?" is no.

### Learning ideas that depend on the substrate

- **[Soft Pilares](soft-pilares.md)** — bring back PATHOS_SOMA / ETHOS / TELOS / SOPHIA (dropped in ADR-0021) as continuous probabilistic membership, not as a hard schema field. Each note has `{P(pathos): 0.7, P(ethos): 0.2, …}` computed from its block embeddings via a learned head trained on ~50 hand-labels. Revisit when: ≥200 captured notes and the question "what's my pathos-side been like this week?" recurs.

- **[Custom Personal Lenses](custom-lenses.md)** — user-defined classifiers ("procrastinating", "Govoy-strategic", "draining"). Each lens is a small learned head; the MCP exposes `lens_score(lens_id, …)`. Editorial cognition that lives outside any chat session. Revisit when: a specific recurring lens question that the LLM keeps half-answering.

- **[Predicted State Transitions](predicted-state-transitions.md)** — system suggests (not auto-applies) ACTIVE→WAITING/SOMEDAY/DONE based on patterns in the user's past transitions. Surfaces stale notes during weekly review. Revisit when: ≥100 logged transitions and the inbox/active set feels unmanageable.

- **[Find_related Re-ranking](find-related-reranking.md)** — learned re-ranker over HNSW top-K, trained on observed usage (which hits were consumed vs ignored). Beats cosine for "useful to *me*" once there's signal. Note: depends on Feedback Infrastructure landing first. Revisit when: months of real usage and "search keeps showing me the same boring matches" or the corpus is past where pure cosine ranks well.

- **[Confidence-scored Auto-clarify](confidence-scored-clarify.md)** — gate the worker's auto-commits with a learned "would Rubén have accepted this?" classifier. High confidence → auto-commit (today's default). Low confidence → queue for human review. Trains from observed corrections. Revisit when: ≥30 manual corrections to past clarifies, or a specific recurring failure mode that the worker keeps repeating.

## Cross-cutting note

These ideas are not exclusive. Several share the same substrate (feedback events), the same technique (small learned head on frozen BGE-M3), and the same data shape (per-note or per-block scoring). A well-designed Feedback Infrastructure layer would enable any subset of them to be built independently. Pick one, validate cheaply (each doc has a "Cheapest validation path"), and expand.

What they share strategically: **moving Huygens from "the LLM's general criterion applied to my data" toward "my own editorial criterion, learned over time, that the LLM serves rather than replaces"**. That's the bigger product idea hidden behind any one of these.

## What this folder is NOT

- A roadmap. Nothing here is committed to.
- ADRs. ADRs document decisions made; these document decisions deferred.
- Backlog tickets. No estimates, no priority, no assignees. Single-user system — no need.
- A complete map of the design space. We'll add more docs as new ideas surface. Each new idea: copy the template structure (TL;DR, Why it matters, What it requires, Cheapest validation path, Risks, When to revisit, Open questions), drop in `ideas/`, link from this index.
