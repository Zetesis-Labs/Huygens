"""Discriminated error hierarchy.

Mirrors apps/mcp/src/errors.ts. Stable `code` field is the contract;
message text is for humans and may change.

KEEP IN SYNC with apps/mcp/src/errors.ts.
"""

from __future__ import annotations

from typing import Any, Literal

ErrorCode = Literal[
    "RAW_NOT_FOUND",
    "RAW_ALREADY_PROCESSED",
    "BLOCK_NOT_FOUND",
    "NOTE_TYPE_NOT_FOUND",
    "INTERNAL_REF_OUT_OF_BOUNDS",
    "EXTERNAL_REF_OUT_OF_BOUNDS",
    "EMBEDDING_DIMENSION_MISMATCH",
    "EMBEDDING_PROVIDER_ERROR",
    "CONFIG_MISSING",
]


class HuygensError(Exception):
    """Abstract base — subclasses pin `code`."""

    code: ErrorCode

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details: dict[str, Any] = details or {}


class RawNotFoundError(HuygensError):
    code: ErrorCode = "RAW_NOT_FOUND"

    def __init__(self, raw_id: str) -> None:
        super().__init__(f"raw_capture not found: {raw_id}", {"raw_id": raw_id})


class RawAlreadyProcessedError(HuygensError):
    code: ErrorCode = "RAW_ALREADY_PROCESSED"

    def __init__(self, raw_id: str) -> None:
        super().__init__(f"raw_capture already processed: {raw_id}", {"raw_id": raw_id})


class InternalRefOutOfBoundsError(HuygensError):
    code: ErrorCode = "INTERNAL_REF_OUT_OF_BOUNDS"

    def __init__(self, to_note_index: int, notes_count: int) -> None:
        super().__init__(
            f"internal_ref to_note_index {to_note_index} >= notes.length ({notes_count})",
            {"to_note_index": to_note_index, "notes_count": notes_count},
        )


class ExternalRefOutOfBoundsError(HuygensError):
    code: ErrorCode = "EXTERNAL_REF_OUT_OF_BOUNDS"

    def __init__(self, from_note_index: int, notes_count: int) -> None:
        super().__init__(
            f"external_ref from_note_index {from_note_index} >= notes.length ({notes_count})",
            {"from_note_index": from_note_index, "notes_count": notes_count},
        )


class ConfigMissingError(HuygensError):
    code: ErrorCode = "CONFIG_MISSING"

    def __init__(self, name: str) -> None:
        super().__init__(f"required config missing: {name}", {"name": name})
