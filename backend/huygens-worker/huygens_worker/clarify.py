"""Agno agent that turns a raw_capture into a structured Decomposition.

Iteration 1: pure LLM call, no RAG. The agent receives the literal raw
content and emits a JSON-validated Pydantic Decomposition that mirrors
the shape commitClarifyImpl expects on the TS side.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field

from .settings import settings

log = logging.getLogger(__name__)

NoteState = Literal["CLARIFIED", "ACTIVE", "WAITING", "SOMEDAY", "DONE", "ARCHIVED"]
NoteTypeSlug = Literal[
    "task", "project", "area", "routine", "note", "report", "person", "reference", "objetivo", "idea"
]
EdgeKind = Literal["mentions", "supports", "refutes", "part_of", "blocked_by", "about", "authored_by"]
Transformation = Literal["verbatim", "extracted", "summarized", "inferred"]


class BlockProposal(BaseModel):
    content: str = Field(description="Markdown content for this block. One coherent chunk.")


class InternalRef(BaseModel):
    kind: EdgeKind = Field(description="Edge semantic kind")
    to_note_index: int = Field(ge=0, description="Index of the target note within the `notes` array")


class NoteProposal(BaseModel):
    title: str = Field(description="Concise title in the original language of the raw")
    type_slug: NoteTypeSlug = Field(description="Note type slug. Choose the most specific one that fits.")
    state: NoteState = Field(default="CLARIFIED", description="ZTD state. Default CLARIFIED.")
    mit_for: str | None = Field(
        default=None,
        description="ISO 8601 datetime if this is a Most Important Task for a specific day, else null"
    )
    blocks: list[BlockProposal] = Field(
        min_length=1,
        description="Markdown blocks composing this note, in order"
    )
    transformation: Transformation = Field(
        description=(
            "How this note relates to the raw source. "
            "verbatim = literal quote; extracted = directly stated; "
            "summarized = condensed; inferred = your interpretation, not stated"
        )
    )
    internal_refs: list[InternalRef] = Field(
        default_factory=list,
        description="Edges from this note to other notes being created in the same decomposition"
    )


class Decomposition(BaseModel):
    notes: list[NoteProposal] = Field(min_length=1)
    reasoning_summary: str = Field(description="One short paragraph: why this decomposition and not another")


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

PRINCIPLES:
1. **Plural by default.** A raw usually contains 2-5 distinct ideas. Split aggressively but don't fragment a single coherent thought.
2. **Title is action-oriented for tasks**, descriptive for notes/ideas. Match the user's language (Spanish or English) from the raw.
3. **mit_for ONLY** if the raw mentions a specific day or deadline.
   - "tomorrow", "today at X" → the absolute ISO date of that day.
   - "before Friday" / "antes del viernes" → set mit_for = that Friday (the **deadline**, not an arbitrary earlier date).
   - "next Monday" → that Monday.
   - Never pick a date in the past. If your computation lands before today, you've miscounted — recompute.
4. **internal_refs**: if two notes you produce relate to each other (one is `part_of` another, or one `mentions` another), declare the edge. Use sparingly — only when clearly justified.
5. **transformation = inferred is fine** for ideas you're surfacing, but mark it as such.
6. **No external_refs** in this iteration — you have no access to existing notes yet.

OUTPUT: a Decomposition Pydantic instance with notes[] + a short reasoning_summary.
"""


_agent: Agent | None = None


def get_agent() -> Agent:
    global _agent
    if _agent is not None:
        return _agent
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY not set — clarify agent cannot run")
    _agent = Agent(
        model=OpenAIChat(id=settings.clarify_model, api_key=settings.openai_api_key),
        instructions=SYSTEM_PROMPT,
        output_schema=Decomposition,
        markdown=False,
        telemetry=False,
    )
    return _agent


async def clarify(raw_content: str, source_kind: str) -> Decomposition:
    agent = get_agent()
    now = datetime.now(timezone.utc)
    prompt = (
        f"TODAY is {now.strftime('%Y-%m-%d (%A)')} (UTC). "
        "Use this to resolve relative dates like 'mañana', 'hoy', 'el viernes'.\n\n"
        f"RAW CAPTURE (source_kind={source_kind}):\n\n{raw_content}\n\n"
        "Produce the Decomposition now."
    )
    log.info("clarify: calling %s (len=%d)", settings.clarify_model, len(raw_content))
    run = await agent.arun(prompt)
    content = run.content
    if not isinstance(content, Decomposition):
        raise RuntimeError(f"clarify: agent returned non-Decomposition: {type(content)}")
    return content
