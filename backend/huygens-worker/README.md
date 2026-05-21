# huygens-worker

Python service that runs alongside the Huygens MCP. Today it operates in its
legacy form: polls `raw_capture` and clarifies raws directly into typed notes
via the MCP's `commit_clarify` + `index_block` tools.

Per [`docs/MODEL.md`](../../docs/MODEL.md), the target is a **topologizer**:
read new `note(type=report)`s with `metadata.topologized_at IS NONE`,
translate their narrative into graph mutations (create/update tasks,
projects, ideas, ...), and emit `affects` edges. The clarify-from-raw path
will be retired once that rewrite lands.

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
