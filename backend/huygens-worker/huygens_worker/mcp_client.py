"""MCP client wrapper — the worker's contract with the TS-side tools.

Iter D replaced the in-process Python port of commit_clarify with a
real MCP call so worker and conversational agents share the same
implementation. This module is the only place that knows MCP
protocol details; everything else just calls `commit_clarify_via_mcp`.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.exceptions import McpError

from .errors import HuygensError, huygens_error_from_mcp, huygens_error_from_structured
from .schemas import Decomposition
from .settings import settings

log = logging.getLogger(__name__)


def _decomposition_to_payload(decomposition: Decomposition) -> dict[str, Any]:
    """Serialize the Pydantic decomposition to the JSON-friendly shape the
    MCP tool expects. We strip pydantic's defaults to keep the wire format
    minimal and to match the optional-field semantics the TS Zod schema
    accepts."""
    notes: list[dict[str, Any]] = []
    for note in decomposition.notes:
        entry: dict[str, Any] = {
            "title": note.title,
            "type_slug": note.type_slug,
            "state": note.state,
            "blocks": [{"content": b.content} for b in note.blocks],
            "transformation": note.transformation,
            "internal_refs": [
                {"kind": r.kind, "to_note_index": r.to_note_index} for r in note.internal_refs
            ],
        }
        if note.mit_for is not None:
            entry["mit_for"] = note.mit_for
        notes.append(entry)
    external_refs = [
        {
            "from_note_index": ref.from_note_index,
            "kind": ref.kind,
            "to_external_id": ref.to_external_id,
        }
        for ref in decomposition.external_refs
    ]
    return {"notes": notes, "external_refs": external_refs}


def _extract_json_block(text_blocks: list[str]) -> Any:
    """MCP tools include a trailing `\\n[raw JSON]\\n…` block as the
    machine-readable payload. Returns whatever was JSON-parsed there —
    dict for commit_clarify/index_block, list for find_related."""
    for block in text_blocks:
        if "[raw JSON]" in block:
            _, _, body = block.partition("[raw JSON]")
            return json.loads(body.strip())
    raise RuntimeError(f"MCP tool: no [raw JSON] block in response: {text_blocks!r}")


async def commit_clarify_via_mcp(
    raw_id: str,
    decomposition: Decomposition,
    session_id: str,
    *,
    reasoning_summary: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    arguments: dict[str, Any] = {
        "raw_id": raw_id,
        "decomposition": _decomposition_to_payload(decomposition),
        "session_id": session_id,
    }
    if reasoning_summary is not None:
        arguments["reasoning_summary"] = reasoning_summary
    if model is not None:
        arguments["model"] = model
    return await _call_mcp_tool("commit_clarify", arguments)


async def index_block_via_mcp(block_ids: list[str]) -> dict[str, Any]:
    """Embed the blocks just produced by a clarify and persist their vectors.

    The MCP enforces a max of 64 ids per call. The worker chunks larger
    batches before calling.
    """
    if not block_ids:
        return {"indexed": [], "dimensions": 0, "input_tokens": 0}
    return await _call_mcp_tool("index_block", {"block_ids": block_ids})


async def find_related_via_mcp(
    query: str, *, k: int = 5, threshold: float = 0.5
) -> list[dict[str, Any]]:
    """Pre-fetch RAG: retrieve existing notes related to a concept.

    Returns an empty list (not an error) when the corpus has no matches
    above threshold — the clarify prompt treats that as "this raw
    introduces new ideas".
    """
    result = await _call_mcp_tool(
        "find_related", {"query": query, "k": k, "threshold": threshold}
    )
    # find_related's [raw JSON] block is the hits list, not an object.
    if isinstance(result, list):
        return result
    return []


async def get_prompt_via_mcp(name: str) -> str:
    """Fetch a canonical prompt the MCP advertises (e.g. 'clarify-system').

    The prompt text is the single source of truth shared by the autonomous
    worker and any conversational client. The MCP returns a list of messages;
    we concatenate the text content of the user-role messages (the LORE +
    workflow live there) and use the result as the agent's system prompt.
    """
    try:
        async with (
            streamablehttp_client(settings.mcp_url) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.get_prompt(name)
            chunks: list[str] = []
            for message in result.messages:
                content = message.content
                text = getattr(content, "text", None)
                if isinstance(text, str):
                    chunks.append(text)
            if not chunks:
                raise RuntimeError(f"MCP prompt {name!r}: no text content in messages")
            return "\n\n".join(chunks)
    except BaseExceptionGroup as eg:
        for leaf in _flatten_exception_group(eg):
            if isinstance(leaf, McpError):
                raise huygens_error_from_mcp(leaf) from eg
            if isinstance(leaf, HuygensError):
                raise leaf from eg
        raise


async def _call_mcp_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    try:
        async with (
            streamablehttp_client(settings.mcp_url) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.call_tool(name, arguments=arguments)
            if result.isError:
                typed = huygens_error_from_structured(result.structuredContent)
                if typed is not None:
                    raise typed
                detail = " | ".join(getattr(b, "text", str(b)) for b in result.content)
                raise HuygensError(f"MCP {name}: {detail}")
            text_blocks = [getattr(b, "text", "") for b in result.content if hasattr(b, "text")]
            return _extract_json_block(text_blocks)
    except BaseExceptionGroup as eg:
        for leaf in _flatten_exception_group(eg):
            if isinstance(leaf, McpError):
                raise huygens_error_from_mcp(leaf) from eg
            if isinstance(leaf, HuygensError):
                raise leaf from eg
        raise


def _flatten_exception_group(eg: BaseException) -> list[BaseException]:
    out: list[BaseException] = []
    if isinstance(eg, BaseExceptionGroup):
        for exc in eg.exceptions:
            out.extend(_flatten_exception_group(exc))
    else:
        out.append(eg)
    return out
