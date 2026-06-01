from __future__ import annotations

import logging
import time

from .settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("huygens_worker")


def main() -> None:
    log.info(
        "huygens-worker booting (mcp_url=%s actor=%s enabled=%s)",
        settings.mcp_url,
        settings.actor,
        settings.worker_enabled,
    )
    if not settings.worker_enabled:
        log.info("huygens-worker disabled; set WORKER_ENABLED=true to serve the AG-UI agent")
        while True:
            time.sleep(3600)

    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY is required to serve the AG-UI agent")

    # Import here so the disabled path doesn't require the agent deps at boot.
    from .agent import agent_os

    log.info("serving Huygens AG-UI agent on %s:%s", settings.agui_host, settings.agui_port)
    agent_os.serve(
        app="huygens_worker.agent:app",
        host=settings.agui_host,
        port=settings.agui_port,
    )


if __name__ == "__main__":
    main()
