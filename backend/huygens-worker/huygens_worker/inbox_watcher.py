"""Iteration 0: poll raw_capture for unprocessed rows and emit raw_claimed.

Tracks seen ids in memory. A future iteration persists the last
CHANGEFEED versionstamp so restarts don't replay.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from surrealdb import AsyncSurreal

from .events import emit_event, new_session_id
from .settings import settings

log = logging.getLogger(__name__)


@dataclass
class InboxWatcher:
    db: AsyncSurreal
    seen: set[str] = field(default_factory=set)

    async def fetch_pending(self) -> list[dict]:
        rows = await self.db.query(
            "SELECT id, content, source_kind, created_at "
            "FROM raw_capture WHERE processed_at IS NONE ORDER BY created_at ASC"
        )
        return rows or []

    async def claim_one(self, row: dict) -> None:
        raw_id = str(row["id"])
        if raw_id in self.seen:
            return
        self.seen.add(raw_id)
        session_id = new_session_id()
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
        log.info(
            "claimed raw=%s source=%s len=%d session=%s",
            raw_id,
            row.get("source_kind"),
            len(row.get("content") or ""),
            session_id,
        )

    async def tick(self) -> int:
        rows = await self.fetch_pending()
        new = 0
        for row in rows:
            if str(row["id"]) not in self.seen:
                new += 1
            await self.claim_one(row)
        return new

    async def run_forever(self) -> None:
        log.info("watcher started — polling every %.1fs", settings.poll_interval_seconds)
        while True:
            try:
                claimed = await self.tick()
                if claimed:
                    log.info("tick: claimed %d new raw(s) (seen=%d total)", claimed, len(self.seen))
            except Exception as err:  # noqa: BLE001
                log.error("tick failed: %s", err)
            await asyncio.sleep(settings.poll_interval_seconds)
