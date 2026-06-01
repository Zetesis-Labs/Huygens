"""Small MCP client wrapper for future specialized worker agents.

The worker no longer owns inbox polling, interpretation, or direct database writes.
Any future worker behavior must go through the MCP tools exposed by the TS
server, using this module as the boundary.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.exceptions import McpError

from .errors import HuygensError, huygens_error_from_mcp, huygens_error_from_structured
from .settings import settings

log = logging.getLogger(__name__)


def _extract_json_block(text_blocks: list[str]) -> Any:
    """MCP tools include a trailing `\\n[raw JSON]\\n…` block as the
    machine-readable payload. Returns whatever was JSON-parsed there —
    dict for object-returning tools, list for find_related."""
    for block in text_blocks:
        if "[raw JSON]" in block:
            _, _, body = block.partition("[raw JSON]")
            return json.loads(body.strip())
    raise RuntimeError(f"MCP tool: no [raw JSON] block in response: {text_blocks!r}")


async def index_block_via_mcp(block_ids: list[str]) -> dict[str, Any]:
    """Embed blocks and persist their vectors.

    The MCP enforces a max of 64 ids per call.
    """
    if not block_ids:
        return {"indexed": [], "dimensions": 0, "input_tokens": 0}
    return await _call_mcp_tool("index_block", {"block_ids": block_ids})


async def find_related_via_mcp(
    query: str, *, k: int = 5, threshold: float = 0.5
) -> list[dict[str, Any]]:
    """Pre-fetch RAG: retrieve existing notes related to a concept.

    Returns an empty list (not an error) when the corpus has no matches
    above threshold.
    """
    result = await _call_mcp_tool(
        "find_related", {"query": query, "k": k, "threshold": threshold}
    )
    # find_related's [raw JSON] block is the hits list, not an object.
    if isinstance(result, list):
        return result
    return []


async def get_server_instructions_via_mcp() -> str:
    """The MCP returns its `instructions` (the SurrealQL cookbook + live schema)
    in the initialize result. Agno's MCPTools only wires up the tools and drops
    this, so the agent never sees it — we fetch it explicitly to inject into the
    agent's own instructions. Returns "" when the server sends none."""
    try:
        async with (
            streamablehttp_client(settings.mcp_url) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            result = await session.initialize()
            return result.instructions or ""
    except BaseExceptionGroup as eg:
        for leaf in _flatten_exception_group(eg):
            if isinstance(leaf, McpError):
                raise huygens_error_from_mcp(leaf) from eg
            if isinstance(leaf, HuygensError):
                raise leaf from eg
        raise


async def list_tools_via_mcp() -> list[str]:
    try:
        async with (
            streamablehttp_client(settings.mcp_url) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.list_tools()
            return [tool.name for tool in result.tools]
    except BaseExceptionGroup as eg:
        for leaf in _flatten_exception_group(eg):
            if isinstance(leaf, McpError):
                raise huygens_error_from_mcp(leaf) from eg
            if isinstance(leaf, HuygensError):
                raise leaf from eg
        raise


async def get_prompt_via_mcp(name: str) -> str:
    """Fetch a canonical prompt the MCP advertises.

    The MCP returns a list of messages; we concatenate text content from the
    user-role messages and use the result as the worker prompt.
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


async def call_tool_via_mcp(name: str, arguments: dict[str, Any]) -> Any:
    return await _call_mcp_tool(name, arguments)


async def _call_mcp_tool(name: str, arguments: dict[str, Any]) -> Any:
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
