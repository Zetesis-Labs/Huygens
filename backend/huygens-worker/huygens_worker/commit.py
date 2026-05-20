"""Python port of apps/mcp/src/tools/commit-clarify.ts (iter 1).

Will be extracted into the shared MCP HTTP service in iter 2 so worker
and conversational agents share a single implementation. For now it
exists here to keep the worker self-contained.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, cast

from surrealdb import RecordID

from .clarify import Decomposition, NoteProposal
from .events import EmitInput, emit_event
from .settings import settings
from .surreal_client import DB, execute, query_rows

log = logging.getLogger(__name__)


class CommitClarifyResult(dict):
    pass


def _ensure_record_id(value: Any) -> RecordID:
    if isinstance(value, RecordID):
        return value
    if isinstance(value, str):
        if ":" not in value:
            raise ValueError(f"not a record id: {value!r}")
        table, ident = value.split(":", 1)
        return RecordID(table, ident)
    raise TypeError(f"cannot coerce {type(value)} to RecordID")


async def _assert_raw_not_processed(db: DB, raw_ref: RecordID) -> None:
    rows = await query_rows(
        db, "SELECT processed_at FROM raw_capture WHERE id = $id", {"id": raw_ref}
    )
    if not rows:
        raise RuntimeError(f"raw_capture not found: {raw_ref}")
    if rows[0].get("processed_at") is not None:
        raise RuntimeError(f"raw_capture already processed: {raw_ref}")


def _build_note_data(proposal: NoteProposal) -> dict[str, Any]:
    data: dict[str, Any] = {"title": proposal.title, "state": proposal.state}
    if proposal.type_slug:
        data["type"] = RecordID("note_type", proposal.type_slug)
    if proposal.mit_for:
        data["mit_for"] = datetime.fromisoformat(proposal.mit_for.replace("Z", "+00:00"))
    return data


async def _create_note(db: DB, proposal: NoteProposal) -> RecordID:
    rows = await query_rows(
        db, "CREATE note CONTENT $data RETURN AFTER", {"data": _build_note_data(proposal)}
    )
    if not rows:
        raise RuntimeError(f"failed to create note: {proposal.title}")
    return cast("RecordID", rows[0]["id"])


async def _create_blocks(db: DB, note_id: RecordID, proposal: NoteProposal) -> list[RecordID]:
    rows_to_insert = [{"note": note_id, "content": b.content} for b in proposal.blocks]
    block_rows = await query_rows(
        db, "INSERT INTO block $rows RETURN AFTER", {"rows": rows_to_insert}
    )
    block_ids: list[RecordID] = [cast("RecordID", r["id"]) for r in block_rows]
    await execute(db, "UPDATE $note SET block_order = $order", {"note": note_id, "order": block_ids})
    return block_ids


async def _link_derived_from(
    db: DB, note_id: RecordID, raw_ref: RecordID, transformation: str
) -> None:
    await execute(
        db,
        "RELATE $note->derived_from->$raw CONTENT { transformation: $transformation }",
        {"note": note_id, "raw": raw_ref, "transformation": transformation},
    )


async def _create_internal_refs(
    db: DB, proposals: list[NoteProposal], notes_created: list[RecordID]
) -> int:
    edges = 0
    for i, proposal in enumerate(proposals):
        from_id = notes_created[i]
        for ref in proposal.internal_refs:
            if ref.to_note_index >= len(notes_created):
                raise RuntimeError(f"internal_ref to_note_index out of bounds: {ref.to_note_index}")
            to_id = notes_created[ref.to_note_index]
            await execute(db, f"RELATE $from->{ref.kind}->$to", {"from": from_id, "to": to_id})
            edges += 1
    return edges


async def _mark_raw_processed(db: DB, raw_ref: RecordID) -> None:
    await execute(db, "UPDATE $id SET processed_at = time::now()", {"id": raw_ref})


async def commit_clarify(
    db: DB,
    raw_id: str | RecordID,
    decomposition: Decomposition,
    session_id: str,
    *,
    model: str | None = None,
    reasoning_summary: str | None = None,
) -> CommitClarifyResult:
    raw_ref = _ensure_record_id(raw_id)
    t0 = time.monotonic()

    await emit_event(
        db,
        {
            "kind": "commit_attempted",
            "actor": settings.actor,
            "session_id": session_id,
            "subject": raw_ref,
            "payload": {"notes_count": len(decomposition.notes)},
        },
    )

    try:
        await _assert_raw_not_processed(db, raw_ref)

        notes_created: list[RecordID] = []
        blocks_created: list[RecordID] = []
        edges_created = 0

        for proposal in decomposition.notes:
            note_id = await _create_note(db, proposal)
            block_ids = await _create_blocks(db, note_id, proposal)
            await _link_derived_from(db, note_id, raw_ref, proposal.transformation)
            notes_created.append(note_id)
            blocks_created.extend(block_ids)
            edges_created += 1

        edges_created += await _create_internal_refs(db, decomposition.notes, notes_created)
        await _mark_raw_processed(db, raw_ref)

        duration_ms = int((time.monotonic() - t0) * 1000)
        result = CommitClarifyResult(
            raw_id=str(raw_ref),
            notes_created=[str(n) for n in notes_created],
            blocks_created=[str(b) for b in blocks_created],
            edges_created=edges_created,
            session_id=session_id,
        )

        event: EmitInput = {
            "kind": "commit_succeeded",
            "actor": settings.actor,
            "session_id": session_id,
            "subject": raw_ref,
            "payload": result,
            "duration_ms": duration_ms,
        }
        if model is not None:
            event["model"] = model
        if reasoning_summary is not None:
            event["reasoning_summary"] = reasoning_summary
        await emit_event(db, event)

        return result

    except Exception as err:
        duration_ms = int((time.monotonic() - t0) * 1000)
        await emit_event(
            db,
            {
                "kind": "commit_failed",
                "actor": settings.actor,
                "session_id": session_id,
                "subject": raw_ref,
                "payload": {"error": str(err)},
                "duration_ms": duration_ms,
            },
        )
        raise
