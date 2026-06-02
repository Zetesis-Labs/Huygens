"""Domain literals — must match apps/mcp/src/domain.ts exactly.

KEEP IN SYNC with apps/mcp/src/domain.ts. A future iteration will add a
test that fails if the two diverge; for now this comment is the only
guardrail.
"""

from __future__ import annotations

from typing import Final, Literal, get_args

NoteState = Literal["CLARIFIED", "ACTIVE", "WAITING", "SOMEDAY", "DONE", "ARCHIVED"]
NOTE_STATES: Final[tuple[str, ...]] = get_args(NoteState)

RawStatus = Literal["pending", "processed", "ignored", "deferred"]
RAW_STATUSES: Final[tuple[str, ...]] = get_args(RawStatus)

BlockKind = Literal["descriptive", "narrative"]
BLOCK_KINDS: Final[tuple[str, ...]] = get_args(BlockKind)

ProposalStatus = Literal["draft", "committed", "discarded"]
PROPOSAL_STATUSES: Final[tuple[str, ...]] = get_args(ProposalStatus)

NoteTypeSlug = Literal[
    "task",
    "project",
    "area",
    "routine",
    "idea",
    "reference",
    "person",
    "objetivo",
]
NOTE_TYPE_SLUGS: Final[tuple[str, ...]] = get_args(NoteTypeSlug)

EdgeKind = Literal["part_of", "blocked_by", "mentions"]
EDGE_KINDS: Final[tuple[str, ...]] = get_args(EdgeKind)

TraceEdgeKind = Literal["derived_from", "about", "affects"]
TRACE_EDGE_KINDS: Final[tuple[str, ...]] = get_args(TraceEdgeKind)

Transformation = Literal["verbatim", "extracted", "summarized", "inferred"]
TRANSFORMATIONS: Final[tuple[str, ...]] = get_args(Transformation)

SourceKind = Literal["chat", "voice", "manual", "import", "agent-self"]
SOURCE_KINDS: Final[tuple[str, ...]] = get_args(SourceKind)

EventKind = Literal[
    "raw_received",
    "raw_status_changed",
    "proposal_created",
    "proposal_updated",
    "proposal_discarded",
    "proposal_committed",
]
EVENT_KINDS: Final[tuple[str, ...]] = get_args(EventKind)

Actor = Literal["worker", "conversational", "user", "system"]
ACTORS: Final[tuple[str, ...]] = get_args(Actor)
