"""Discriminated error hierarchy.

Mirrors apps/mcp/src/errors.ts. Stable `code` field is the contract;
message text is for humans and may change.

Errors raised by the MCP server arrive here as ``mcp.shared.exceptions.McpError``
with structured ``error.data = {"code": "RAW_ALREADY_PROCESSED", "details": {...}}``.
``huygens_error_from_mcp`` rebuilds the right subclass so callers can match on
typed exceptions instead of parsing strings.

KEEP IN SYNC with apps/mcp/src/errors.ts.
"""

from __future__ import annotations

from typing import Any, ClassVar

from mcp.shared.exceptions import McpError as RemoteMcpError


class HuygensError(Exception):
    code: ClassVar[str] = "HUYGENS_ERROR"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details: dict[str, Any] = details or {}


class RawNotFoundError(HuygensError):
    code: ClassVar[str] = "RAW_NOT_FOUND"


class BlockNotFoundError(HuygensError):
    code: ClassVar[str] = "BLOCK_NOT_FOUND"


class EmbeddingDimensionMismatchError(HuygensError):
    code: ClassVar[str] = "EMBEDDING_DIMENSION_MISMATCH"


class EmbeddingProviderError(HuygensError):
    code: ClassVar[str] = "EMBEDDING_PROVIDER_ERROR"


class ConfigMissingError(HuygensError):
    code: ClassVar[str] = "CONFIG_MISSING"


class QueryError(HuygensError):
    code: ClassVar[str] = "QUERY_ERROR"


_CODE_TO_CLASS: dict[str, type[HuygensError]] = {
    cls.code: cls
    for cls in (
        RawNotFoundError,
        BlockNotFoundError,
        EmbeddingDimensionMismatchError,
        EmbeddingProviderError,
        ConfigMissingError,
        QueryError,
    )
}


def huygens_error_from_mcp(err: RemoteMcpError) -> HuygensError:
    """Rebuild a typed HuygensError from a JSON-RPC McpError.

    Used when the server raises a protocol-level error (rare for tool
    failures — see ``huygens_error_from_structured`` for the common path).
    """
    data = err.error.data if isinstance(err.error.data, dict) else {}
    code = data.get("code")
    details = data.get("details") if isinstance(data.get("details"), dict) else None
    cls = _CODE_TO_CLASS.get(code) if isinstance(code, str) else None
    if cls is None:
        return HuygensError(err.error.message, details)
    return cls(err.error.message, details)


def huygens_error_from_structured(structured: Any) -> HuygensError | None:
    """Rebuild a typed HuygensError from a CallToolResult.structuredContent.

    The TS tool handlers catch HuygensError and return
    ``{isError: true, structuredContent: {error: {code, message, details}}}``
    so we recover the type even though the SDK flattens tool failures into
    isError content rather than JSON-RPC errors.
    """
    if not isinstance(structured, dict):
        return None
    error = structured.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code")
    message = error.get("message") or ""
    details = error.get("details") if isinstance(error.get("details"), dict) else None
    cls = _CODE_TO_CLASS.get(code) if isinstance(code, str) else None
    if cls is None:
        return HuygensError(message, details)
    return cls(message, details)
