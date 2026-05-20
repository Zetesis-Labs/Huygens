"""Local error types for the worker process itself.

Domain errors raised by the MCP server (raw_not_found, already_processed,
edge-bounds, etc.) live in apps/mcp/src/errors.ts and reach us as MCP
protocol errors — the mcp_client wrapper rethrows them as RuntimeError
today. When we need to discriminate on them in Python, mirror the codes
here.
"""

from __future__ import annotations

from typing import Any


class HuygensError(Exception):
    code: str

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details: dict[str, Any] = details or {}


class ConfigMissingError(HuygensError):
    code: str = "CONFIG_MISSING"

    def __init__(self, name: str) -> None:
        super().__init__(f"required config missing: {name}", {"name": name})
