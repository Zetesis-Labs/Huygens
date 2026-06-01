"""MCP client boundary for the worker.

The worker reaches the graph only through the MCP tools (wired via Agno's
MCPTools). The one thing Agno drops is the server `instructions` (the SurrealQL
cookbook + live schema) returned by `initialize`, so the agent fetches them here
to inject into its own instructions.
"""

from __future__ import annotations

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.exceptions import McpError

from .errors import HuygensError, huygens_error_from_mcp
from .settings import settings


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


def _flatten_exception_group(eg: BaseException) -> list[BaseException]:
    out: list[BaseException] = []
    if isinstance(eg, BaseExceptionGroup):
        for exc in eg.exceptions:
            out.extend(_flatten_exception_group(exc))
    else:
        out.append(eg)
    return out
