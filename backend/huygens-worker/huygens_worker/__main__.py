from __future__ import annotations

import asyncio
import logging

from .mcp_client import list_tools_via_mcp
from .settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("huygens_worker")


async def run() -> None:
    log.info(
        "huygens-worker booting (mcp_url=%s actor=%s enabled=%s)",
        settings.mcp_url,
        settings.actor,
        settings.worker_enabled,
    )
    if not settings.worker_enabled:
        log.info("huygens-worker disabled; set WORKER_ENABLED=true to start the MCP agent shell")
        while True:
            await asyncio.sleep(3600)

    tools = await list_tools_via_mcp()
    log.info("huygens-worker MCP agent shell ready; %d tool(s) available", len(tools))
    while True:
        await asyncio.sleep(3600)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
