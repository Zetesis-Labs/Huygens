"""Best-effort agent_event emitter — never raises.

Mirrors apps/mcp/src/events.ts. Observability must not break the parent op.
"""

from __future__ import annotations

import logging
from typing import Any, Literal, TypedDict

from surrealdb import AsyncSurreal
from uuid_extensions import uuid7

log = logging.getLogger(__name__)

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

Actor = Literal["worker", "conversational", "user", "system"]


class EmitInput(TypedDict, total=False):
    kind: EventKind
    actor: Actor
    session_id: str
    subject: Any
    payload: dict[str, Any]
    confidence: float
    reasoning_summary: str
    model: str
    tokens_used: dict[str, int]
    duration_ms: int


async def emit_event(db: AsyncSurreal, event: EmitInput) -> None:
    try:
        content: dict[str, Any] = {
            "kind": event["kind"],
            "actor": event["actor"],
            "session_id": event["session_id"],
        }
        for key in (
            "subject",
            "payload",
            "confidence",
            "reasoning_summary",
            "model",
            "tokens_used",
            "duration_ms",
        ):
            if event.get(key) is not None:
                content[key] = event[key]
        await db.query("CREATE agent_event CONTENT $content", {"content": content})
    except Exception as err:  # noqa: BLE001
        log.error("[agent_event] emit failed: %s", err)


def new_session_id() -> str:
    return str(uuid7())
