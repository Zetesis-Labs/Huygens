"""Watch raw_capture and drive the clarify pipeline end-to-end.

Per raw seen:
  1. emit raw_claimed
  2. emit analysis_started
  3. call clarify() (Agno + OpenAI)
  4. emit decomposition_proposed
  5. call commit_clarify() (emits its own commit_* events + marks raw processed)

Failures inside clarify don't crash the watcher — the raw stays in
the inbox (processed_at still NONE) and we will reattempt next tick
unless we've already added it to `seen`. For iter 1 we add to seen
on success only, so transient errors are retried.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from .clarify import clarify
from .errors import HuygensError, RawAlreadyProcessedError
from .events import emit_event, new_session_id
from .mcp_client import commit_clarify_via_mcp, index_block_via_mcp
from .settings import settings
from .surreal_client import DB, Row, query_rows

MCP_INDEX_BLOCK_MAX_BATCH = 64

log = logging.getLogger(__name__)


@dataclass
class InboxWatcher:
    db: DB
    seen_processed: set[str] = field(default_factory=set)
    in_flight: set[str] = field(default_factory=set)

    async def fetch_pending(self) -> list[Row]:
        return await query_rows(
            self.db,
            "SELECT id, content, source_kind, created_at "
            "FROM raw_capture WHERE processed_at IS NONE ORDER BY created_at ASC",
        )

    async def process_one(self, row: Row) -> bool:
        raw_id = str(row["id"])
        if raw_id in self.in_flight or raw_id in self.seen_processed:
            return False
        self.in_flight.add(raw_id)
        session_id = new_session_id()
        t0 = time.monotonic()
        try:
            await emit_event(
                self.db,
                {
                    "kind": "raw_claimed",
                    "actor": settings.actor,
                    "session_id": session_id,
                    "subject": row["id"],
                    "payload": {
                        "source_kind": row.get("source_kind"),
                        "content_length": len(row.get("content") or ""),
                    },
                },
            )

            await emit_event(
                self.db,
                {
                    "kind": "analysis_started",
                    "actor": settings.actor,
                    "session_id": session_id,
                    "subject": row["id"],
                    "model": settings.clarify_model,
                },
            )

            decomposition = await clarify(
                raw_content=row.get("content") or "",
                source_kind=row.get("source_kind") or "unknown",
            )
            log.info(
                "decomposition proposed for %s — %d notes, reasoning=%r",
                raw_id,
                len(decomposition.notes),
                decomposition.reasoning_summary[:80],
            )

            await emit_event(
                self.db,
                {
                    "kind": "decomposition_proposed",
                    "actor": settings.actor,
                    "session_id": session_id,
                    "subject": row["id"],
                    "payload": {
                        "notes_count": len(decomposition.notes),
                        "note_titles": [n.title for n in decomposition.notes],
                    },
                    "reasoning_summary": decomposition.reasoning_summary,
                    "model": settings.clarify_model,
                    "duration_ms": int((time.monotonic() - t0) * 1000),
                },
            )

            result = await commit_clarify_via_mcp(
                raw_id,
                decomposition,
                session_id=session_id,
                model=settings.clarify_model,
                reasoning_summary=decomposition.reasoning_summary,
            )
            log.info(
                "committed %s → %d notes / %d blocks / %d edges",
                raw_id,
                len(result["notes_created"]),
                len(result["blocks_created"]),
                result["edges_created"],
            )

            await self._index_blocks(result["blocks_created"], raw_id)

            self.seen_processed.add(raw_id)
            return True

        except RawAlreadyProcessedError:
            # Another worker (or a previous run after a restart) already
            # committed this raw. Nothing to do — mark it seen so we stop
            # re-attempting on every tick.
            log.info("raw %s already processed — treating as done", raw_id)
            self.seen_processed.add(raw_id)
            return True
        except HuygensError as err:
            log.error("process %s failed: code=%s details=%s", raw_id, err.code, err.details)
            return False
        except Exception as err:
            log.exception("process %s failed unexpectedly: %s", raw_id, err)
            return False
        finally:
            self.in_flight.discard(raw_id)

    async def _index_blocks(self, block_ids: list[str], raw_id: str) -> None:
        """Embed the blocks the commit just produced so they become searchable.

        Failures don't roll back the commit — the notes are already on disk,
        the audit trail records the attempt, and a later iteration can
        re-index missing embeddings. We just log and move on.
        """
        if not block_ids:
            return
        try:
            for start in range(0, len(block_ids), MCP_INDEX_BLOCK_MAX_BATCH):
                batch = block_ids[start : start + MCP_INDEX_BLOCK_MAX_BATCH]
                await index_block_via_mcp(batch)
            log.info("indexed %d block(s) from %s", len(block_ids), raw_id)
        except HuygensError as err:
            log.error(
                "index_block failed for %s: code=%s details=%s — leaving blocks un-embedded",
                raw_id,
                err.code,
                err.details,
            )

    async def tick(self) -> int:
        rows = await self.fetch_pending()
        committed = 0
        for row in rows:
            if await self.process_one(row):
                committed += 1
        return committed

    async def run_forever(self) -> None:
        log.info("watcher started — polling every %.1fs", settings.poll_interval_seconds)
        while True:
            try:
                committed = await self.tick()
                if committed:
                    log.info("tick: committed %d raw(s)", committed)
            except Exception as err:
                log.error("tick failed: %s", err)
            await asyncio.sleep(settings.poll_interval_seconds)
