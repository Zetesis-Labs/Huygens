"""Domain literals — must match apps/mcp/src/domain.ts exactly.

KEEP IN SYNC with apps/mcp/src/domain.ts. A future iteration will add a
test that fails if the two diverge; for now this comment is the only
guardrail.
"""

from __future__ import annotations

from typing import Final, Literal, get_args

NoteState = Literal["CLARIFIED", "ACTIVE", "WAITING", "SOMEDAY", "DONE", "ARCHIVED"]
NOTE_STATES: Final[tuple[str, ...]] = get_args(NoteState)

NoteTypeSlug = Literal[
    "task",
    "project",
    "area",
    "routine",
    "note",
    "report",
    "person",
    "reference",
    "objetivo",
    "idea",
]
NOTE_TYPE_SLUGS: Final[tuple[str, ...]] = get_args(NoteTypeSlug)

EdgeKind = Literal[
    "mentions",
    "supports",
    "refutes",
    "part_of",
    "blocked_by",
    "about",
    "authored_by",
]
EDGE_KINDS: Final[tuple[str, ...]] = get_args(EdgeKind)

Transformation = Literal["verbatim", "extracted", "summarized", "inferred"]
TRANSFORMATIONS: Final[tuple[str, ...]] = get_args(Transformation)

SourceKind = Literal["chat", "voice", "manual", "import", "agent-self"]
SOURCE_KINDS: Final[tuple[str, ...]] = get_args(SourceKind)

EventKind = Literal[
    "raw_received",
    "raw_claimed",
    "analysis_started",
    "related_context_fetched",
    "decomposition_proposed",
    "human_review_requested",
    "commit_attempted",
    "commit_succeeded",
    "commit_failed",
    "worker_yielded",
]
EVENT_KINDS: Final[tuple[str, ...]] = get_args(EventKind)

Actor = Literal["worker", "conversational", "user", "system"]
ACTORS: Final[tuple[str, ...]] = get_args(Actor)
