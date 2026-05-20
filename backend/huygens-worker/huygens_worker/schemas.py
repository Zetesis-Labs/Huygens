"""Pydantic schemas shared by clarify (LLM output) and mcp_client (wire format).

Living here instead of clarify.py to avoid a circular import: mcp_client
references Decomposition for the commit_clarify wrapper, and clarify
calls find_related_via_mcp from mcp_client.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from .domain import EdgeKind, NoteState, NoteTypeSlug, Transformation


def _normalize_iso_datetime(value: str) -> str:
    """Accept the loose forms the LLM tends to emit and normalize to a Z-suffixed
    UTC ISO 8601 string that Zod's strict `.datetime()` will accept."""
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        value = f"{value}T00:00:00Z"
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class BlockProposal(BaseModel):
    content: str = Field(description="Markdown content for this block. One coherent chunk.")


class InternalRef(BaseModel):
    kind: EdgeKind = Field(description="Edge semantic kind")
    to_note_index: int = Field(ge=0, description="Index of the target note within `notes`")


class ExternalRef(BaseModel):
    from_note_index: int = Field(
        ge=0, description="Index of the source note within `notes`"
    )
    kind: EdgeKind = Field(description="Edge semantic kind")
    to_external_id: str = Field(
        pattern=r"^[a-z_]+:[A-Za-z0-9_-]+$",
        description="Existing record id discovered via find_related (e.g. 'note:abc')",
    )


class NoteProposal(BaseModel):
    title: str = Field(description="Concise title in the original language of the raw")
    type_slug: NoteTypeSlug = Field(
        description="Note type slug. Choose the most specific one that fits."
    )
    state: NoteState = Field(default="CLARIFIED", description="ZTD state. Default CLARIFIED.")
    mit_for: str | None = Field(
        default=None,
        description=(
            "ISO 8601 datetime with Z suffix (UTC) if this is a Most Important Task "
            "for a specific day, else null. Example: 2026-05-21T00:00:00Z"
        ),
    )
    blocks: list[BlockProposal] = Field(
        min_length=1, description="Markdown blocks composing this note, in order"
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
        description="Edges from this note to other NEW notes in this same decomposition",
    )

    @field_validator("mit_for", mode="before")
    @classmethod
    def _normalize(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        try:
            return _normalize_iso_datetime(value)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"invalid mit_for {value!r}: {exc}") from exc


class Decomposition(BaseModel):
    notes: list[NoteProposal] = Field(min_length=1)
    external_refs: list[ExternalRef] = Field(
        default_factory=list,
        description="Edges from notes in this decomposition to EXISTING notes found via find_related",
    )
    reasoning_summary: str = Field(
        description="One short paragraph: why this decomposition and what got linked"
    )
