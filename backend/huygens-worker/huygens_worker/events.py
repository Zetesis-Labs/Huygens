"""Best-effort agent_event emitter — never raises.

Mirrors apps/mcp/src/events.ts. Observability must not break the parent op.
"""

from __future__ import annotations

import logging
from typing import Any, Literal, NotRequired, TypedDict

from uuid_extensions import uuid7

from .settings import Actor
from .surreal_client import DB, execute

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


class EmitInput(TypedDict):
    kind: EventKind
    actor: Actor
    session_id: str
    subject: NotRequired[Any]
    payload: NotRequired[dict[str, Any]]
    confidence: NotRequired[float]
    reasoning_summary: NotRequired[str]
    model: NotRequired[str]
    tokens_used: NotRequired[dict[str, int]]
    duration_ms: NotRequired[int]


async def emit_event(db: DB, event: EmitInput) -> None:
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
            value = event.get(key)
            if value is not None:
                content[key] = value
        await execute(db, "CREATE agent_event CONTENT $content", {"content": content})
    except Exception as err:
        log.error("[agent_event] emit failed: %s", err)


def new_session_id() -> str:
    return str(uuid7())
