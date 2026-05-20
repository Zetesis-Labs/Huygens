"""Agno agent that turns a raw_capture into a structured Decomposition.

Iter 2: **retrieve-then-generate** RAG. Before calling the LLM, the
worker pre-fetches related existing notes via the MCP `find_related`
tool and injects them into the prompt. The LLM sees those candidates
and decides per-note whether to link via `external_refs` instead of
creating a duplicate.

We chose pre-fetch over LLM-driven tool calling because Agno's
`output_schema` + `tools=` combination produced indefinite retry loops
on empty corpora — the LLM kept reformulating queries instead of
finalising the Decomposition. Pre-fetch is deterministic, one LLM
call, and good enough for the autonomous worker. The `find_related`
MCP tool stays exposed for the conversational agent (Claude Code),
which handles tool loops well.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat

from .errors import ConfigMissingError
from .mcp_client import find_related_via_mcp
from .schemas import (
    BlockProposal,
    Decomposition,
    ExternalRef,
    InternalRef,
    NoteProposal,
)
from .settings import settings

__all__ = [
    "BlockProposal",
    "Decomposition",
    "ExternalRef",
    "InternalRef",
    "NoteProposal",
    "clarify",
]

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the **clarify agent** of Huygens — a personal memory and knowledge system for Rubén García.

Your job: turn one raw capture (transcript, note, voice memo, free text) into a structured DECOMPOSITION ready to commit.

CONTEXT — Huygens runs Zen To Done (ZTD): the user captures everything raw into an inbox; you process those raws into typed notes that flow through states (CLARIFIED → ACTIVE → DONE).

NOTE TYPES — pick the most specific one:
- task        — concrete actionable item
- project     — outcome with multiple tasks
- area        — ongoing area of responsibility
- routine     — recurring habit
- note        — free-form note / observation
- report      — narrative report
- person      — a person (use sparingly, only if the raw is really about a person)
- reference   — external material (URL, book, paper)
- objetivo    — strategic goal with optional target date
- idea        — generative / unfinished concept

TRANSFORMATION — declare how each note relates to the raw:
- verbatim   — the block is literally what the user said
- extracted  — directly stated in the raw
- summarized — condensed from the raw
- inferred   — your interpretation, NOT explicitly stated

WORKFLOW:

You are given the raw text PLUS a `RELATED CANDIDATES` block — existing notes the system pre-retrieved that may be relevant. For each candidate, decide:

- score >= 0.65 AND the candidate is genuinely the same thing the raw is about → link the matching new note to it via `external_refs` (`mentions` for "relates to", `supports` for "reinforces", `about` if your new note is *about* the existing one).
- score < 0.65, or the candidate covers a different scope → ignore.

Then produce the decomposition:
- `notes` = new notes you're creating (deduped via the rule above — if a candidate already covers it, link instead of duplicate).
- `external_refs` = edges from those new notes to candidate ids you decided to link.
- `internal_refs` = edges between notes within `notes` (NOT to existing notes).
- `reasoning_summary` = one short paragraph: what candidates were relevant, what got linked vs. created.

If `RELATED CANDIDATES` is empty, this raw introduces new ideas — proceed without external_refs.

PRINCIPLES:
1. **Plural by default.** A raw usually contains 2-5 distinct ideas. Split aggressively but don't fragment a single coherent thought.
2. **Don't duplicate.** If find_related surfaces the same idea, link instead of creating.
3. **Title is action-oriented for tasks**, descriptive for notes/ideas. Match the user's language (Spanish or English) from the raw.
4. **mit_for ONLY** if the raw mentions a specific day or deadline.
   - "tomorrow", "today at X" → the absolute ISO date.
   - "before Friday" / "antes del viernes" → set mit_for = that Friday (the **deadline**).
   - "next Monday" → that Monday.
   - Never pick a date in the past. If your computation lands before today, you've miscounted — recompute.
5. **transformation = inferred is fine** for ideas you're surfacing, but mark it as such.

OUTPUT: a Decomposition Pydantic instance with notes[], external_refs[], reasoning_summary.
"""


def _format_candidates(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return "RELATED CANDIDATES: (empty — no existing notes scored above threshold)"
    lines = ["RELATED CANDIDATES (already exist in the system — link via external_refs if appropriate):"]
    for h in hits:
        lines.append(
            f"- {h.get('note_id')} score={h.get('score', 0):.3f} "
            f"type={h.get('type_slug') or 'untyped'} state={h.get('state')}\n"
            f"  title: {h.get('title')}\n"
            f"  snippet: {h.get('snippet')}"
        )
    return "\n".join(lines)


async def clarify(raw_content: str, source_kind: str) -> Decomposition:
    if not settings.openai_api_key:
        raise ConfigMissingError("OPENAI_API_KEY env var not set", {"name": "OPENAI_API_KEY"})

    candidates = await find_related_via_mcp(raw_content, k=5, threshold=0.5)
    log.info("clarify: pre-fetched %d related candidate(s)", len(candidates))

    now = datetime.now(UTC)
    prompt = (
        f"TODAY is {now.strftime('%Y-%m-%d (%A)')} (UTC). "
        "Use this to resolve relative dates like 'mañana', 'hoy', 'el viernes'.\n\n"
        f"RAW CAPTURE (source_kind={source_kind}):\n\n{raw_content}\n\n"
        f"{_format_candidates(candidates)}\n\n"
        "Produce the Decomposition now per the WORKFLOW."
    )
    log.info("clarify: calling %s (len=%d)", settings.clarify_model, len(raw_content))

    agent = Agent(
        model=OpenAIChat(id=settings.clarify_model, api_key=settings.openai_api_key),
        instructions=SYSTEM_PROMPT,
        output_schema=Decomposition,
        markdown=False,
        telemetry=False,
    )
    run = await agent.arun(prompt)

    content = run.content
    if not isinstance(content, Decomposition):
        raise RuntimeError(f"clarify: agent returned non-Decomposition: {type(content)}")
    return content
