from __future__ import annotations

import asyncio
import logging

from .inbox_watcher import InboxWatcher
from .settings import settings
from .surreal_client import open_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("huygens_worker")


async def run() -> None:
    log.info(
        "huygens-worker booting (url=%s ns=%s db=%s actor=%s)",
        settings.surreal_url,
        settings.surreal_ns,
        settings.surreal_db,
        settings.actor,
    )
    async with open_db() as db:
        watcher = InboxWatcher(db=db)
        await watcher.run_forever()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
