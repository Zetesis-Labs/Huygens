import { getDb } from './surreal'

/**
 * One MCP tool invocation, as a debugging trace record. Captured at the single
 * choke-point (`defineTool`) so EVERY tool is logged uniformly — name, timing,
 * ok/error, plus the full args and result (the user opted into a complete dump).
 *
 * Two sinks, both best-effort and non-blocking so logging never changes a tool's
 * behaviour or latency:
 *   1. stderr as a JSON-line (`[tool] {...}`) → greppable via `docker logs`.
 *   2. the `mcp_tool_call` table → queryable history that survives restarts.
 */
export type ToolCallLog = {
  tool: string
  ok: boolean
  duration_ms: number
  args: unknown
  result?: unknown
  error?: string
  code?: string
}

/** Persist to DB unless explicitly disabled (`MCP_TOOL_LOG_DB=0`). stderr is
 * always on — it's the cheap, can't-fail half of the trace. */
const DB_SINK_ON = process.env.MCP_TOOL_LOG_DB !== '0'

/** JSON.stringify that can't throw (circular refs, BigInt, …) and won't dump
 * megabytes — caps any single string field so a huge query result doesn't drown
 * the log. The DB sink keeps the full objects; only the stderr line is capped. */
function safeJson(value: unknown, maxLen = 4000): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'string' && v.length > maxLen) return `${v.slice(0, maxLen)}…[+${v.length - maxLen}]`
      return v
    })
  } catch {
    return '"[unserializable]"'
  }
}

/**
 * Log one tool call. NEVER throws — a logging failure must not break the tool.
 * The DB write is fire-and-forget (not awaited) so it adds no latency to the
 * tool response; it rides the shared SurrealDB connection, independent of the
 * per-request MCP transport.
 */
/** Pure shape of the greppable `[tool] {...}` stderr line. `ts` is injected so
 * the builder stays pure (no `new Date()` inside) and the line is assertable. */
function buildStderrRecord(entry: ToolCallLog, ts: string): Record<string, unknown> {
  return {
    ts,
    tool: entry.tool,
    ok: entry.ok,
    ms: entry.duration_ms,
    ...(entry.code ? { code: entry.code } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    args: entry.args,
    ...(entry.result !== undefined ? { result: entry.result } : {})
  }
}

export function logToolCall(entry: ToolCallLog): void {
  const ts = new Date().toISOString()
  // 1. stderr — immediate, greppable, can't fail.
  console.error(`[tool] ${safeJson(buildStderrRecord(entry, ts))}`)

  // 2. DB — best-effort, fire-and-forget.
  if (!DB_SINK_ON) return
  void persist(entry).catch(err => console.error('[tool] db log failed:', err instanceof Error ? err.message : err))
}

/** Pure record stored in `mcp_tool_call`. Mirrors the stderr line's
 * field-selection but keeps the FULL objects (toPlain, no length cap): result is
 * present only when defined; error/code only when truthy. */
function buildToolCallContent(entry: ToolCallLog): Record<string, unknown> {
  return {
    tool: entry.tool,
    ok: entry.ok,
    duration_ms: entry.duration_ms,
    args: toPlain(entry.args),
    ...(entry.result !== undefined ? { result: toPlain(entry.result) } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.code ? { code: entry.code } : {})
  }
}

async function persist(entry: ToolCallLog): Promise<void> {
  const db = await getDb()
  await db.query('CREATE mcp_tool_call CONTENT $content', { content: buildToolCallContent(entry) })
}

/** Round-trip through JSON so the value stored is a plain, serializable object
 * (no RecordId / class instances that the driver might choke on). On failure,
 * fall back to a string marker rather than dropping the whole record. */
function toPlain(value: unknown): unknown {
  if (value === undefined || value === null) return null
  try {
    return JSON.parse(safeJson(value, Number.MAX_SAFE_INTEGER))
  } catch {
    return '[unserializable]'
  }
}
