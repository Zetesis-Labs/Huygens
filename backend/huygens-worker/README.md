# huygens-worker

Python service that can run alongside the Huygens MCP. It is disabled by
default. It no longer polls `raw_capture`, calls Agno/OpenAI, or writes to
SurrealDB directly.

Per [`docs/MODEL.md`](../../docs/MODEL.md), the target is v2.1-lite: captures
accumulate in a `raw_capture` inbox, then a deliberate processing session
produces approved narrative blocks and visible mutation proposals before graph
commit. A future worker may become a narrow specialist, but it must use MCP
tools and must not topologize autonomously without the review rules in
[`docs/CONVENTIONS.md`](../../docs/CONVENTIONS.md).

The old clarify-from-raw path has been removed. This package is now just a
worker shell with a generic MCP client.

## Run

The compose service is behind the `worker` profile and also requires
`WORKER_ENABLED=true`. When enabled today it verifies MCP connectivity and then
idles; there is no autonomous task runner yet.

```bash
WORKER_ENABLED=true docker compose -f .devcontainer/docker-compose.yml --profile worker up -d huygens-worker
docker compose -f .devcontainer/docker-compose.yml --profile worker logs -f huygens-worker
```

## Env

| Var | Default | Notes |
|---|---|---|
| `WORKER_ENABLED` | `false` | must be `true` to start the MCP shell |
| `MCP_URL` | `http://huygens-mcp:3030/mcp` | MCP endpoint |
| `ACTOR` | `worker` | value written to `agent_event.actor` |
