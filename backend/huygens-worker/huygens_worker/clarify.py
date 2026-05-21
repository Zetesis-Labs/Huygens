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
from .mcp_client import find_related_via_mcp, get_prompt_via_mcp
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


CLARIFY_PROMPT_NAME = "clarify-system"

_system_prompt_cache: str | None = None


async def _system_prompt() -> str:
    """Fetch the clarify system prompt from the MCP once per process.

    Single source of truth lives in apps/mcp/src/prompts/clarify-system.md —
    served as an MCP prompt that any consumer (this worker, the conversational
    agent in Claude Code) loads. Cached so we don't pay an HTTP round-trip
    per clarify; restart the worker to pick up prompt edits.
    """
    global _system_prompt_cache
    if _system_prompt_cache is None:
        _system_prompt_cache = await get_prompt_via_mcp(CLARIFY_PROMPT_NAME)
        log.info("clarify: loaded system prompt %r (%d chars)", CLARIFY_PROMPT_NAME, len(_system_prompt_cache))
    return _system_prompt_cache


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

    system_prompt = await _system_prompt()
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
        instructions=system_prompt,
        output_schema=Decomposition,
        markdown=False,
        telemetry=False,
    )
    run = await agent.arun(prompt)

    content = run.content
    if not isinstance(content, Decomposition):
        raise RuntimeError(f"clarify: agent returned non-Decomposition: {type(content)}")
    return content
