# huygens-worker

Python service that serves the **dashboard chat agent** over the AG-UI protocol
(see [ADR-0026](../../docs/architecture/0026-dashboard-agent-via-ag-ui.md)). The
agent (Agno + OpenAI) drives Rubén's structured memory through the Huygens MCP
tools — process the inbox, explore the graph, build narrative informe-blocks and
visible mutation proposals.

It is **conversational, not autonomous**: it reacts to the user in the dashboard
chat, not to database changes. It talks to the graph through the MCP (not the
SurrealDB driver), and it **never commits** — `commit_proposal` is excluded from
its toolset, so committing a proposal stays a human action in the UI.

The old autonomous clarify-from-raw path remains removed. `mcp_client.py` stays
as a thin MCP boundary for any future non-agent helper.

## Run

The compose service runs by default. It needs `OPENAI_API_KEY` (in `.env`, loaded
via `env_file`) and `WORKER_ENABLED=true` (the compose default).

```bash
docker compose -f .devcontainer/docker-compose.yml up -d huygens-worker
docker compose -f .devcontainer/docker-compose.yml logs -f huygens-worker
```

The AG-UI endpoint is `POST /agui` on port `7777`. The port is exposed on the
internal network (not published); the dashboard SSR proxies to it.

## Env

| Var | Default | Notes |
|---|---|---|
| `WORKER_ENABLED` | `false` (compose sets `true`) | must be `true` to serve the agent |
| `OPENAI_API_KEY` | — | required; read from `.env` |
| `OPENAI_MODEL` | `gpt-5.5` | OpenAI model id |
| `MCP_URL` | `http://huygens-mcp:3030/mcp` | MCP endpoint the agent's tools call |
| `AGUI_HOST` | `0.0.0.0` | AG-UI bind host |
| `AGUI_PORT` | `7777` | AG-UI port |
| `ACTOR` | `worker` | value written to `agent_event.actor` |
