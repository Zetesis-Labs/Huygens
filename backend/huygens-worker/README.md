# huygens-worker

Autonomous inbox processor for Huygens. Watches `raw_capture` and (eventually)
drives the clarify loop via Agno + LLM.

Iteration 0: poll-and-log. Subscribes nothing yet, just confirms the
plumbing end-to-end.

## Run

Inside the devcontainer compose:

```bash
docker compose -f .devcontainer/docker-compose.yml logs -f huygens-worker
```

Capture a `raw_capture` from the TS side and within `POLL_INTERVAL_SECONDS`
you should see a `raw_claimed` agent_event appear in SurrealDB.

## Env

| Var | Default | Notes |
|---|---|---|
| `SURREAL_URL` | `ws://surrealdb:8000/rpc` | WebSocket endpoint |
| `SURREAL_NS` | `huygens` | namespace |
| `SURREAL_DB` | `main` | database |
| `SURREAL_USER` | `root` | |
| `SURREAL_PASS` | `root` | |
| `POLL_INTERVAL_SECONDS` | `2` | watcher tick |
| `ACTOR` | `worker` | value written to `agent_event.actor` |
