import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

export const READ_ONLY_UPSTREAM_TOOLS = new Set(['query', 'select', 'info'])

export interface SurrealMcpProxyOptions {
  url: string
  prefix?: string
  connectTimeoutMs?: number
  retryIntervalMs?: number
  /**
   * Optional SurrealDB endpoint that the proxy will pin via the upstream's
   * `connect_endpoint` tool right after handshake. Required for surrealmcp
   * v0.4.x: that release does not auto-connect from env vars; every session
   * starts unbound and refuses query/select until connect_endpoint runs.
   */
  endpoint?: {
    url: string
    namespace?: string
    database?: string
    username?: string
    password?: string
  }
}

type ResolvedProxyOptions = Required<Omit<SurrealMcpProxyOptions, 'endpoint'>> & {
  endpoint: SurrealMcpProxyOptions['endpoint']
}

interface ProxyState {
  client: Client | null
  tools: Tool[]
  prefix: string
  degraded: boolean
  lastError: string | null
}

type DynamicToolConfig = {
  title?: string
  description?: string
  inputSchema?: Record<string, z.ZodType>
  annotations?: Tool['annotations']
  _meta?: Record<string, unknown>
}

let state: ProxyState | null = null
let retryHandle: ReturnType<typeof setInterval> | null = null
let currentOptions: ResolvedProxyOptions | null = null

export function filterSurrealmcpTools(tools: Tool[]): Tool[] {
  return tools.filter(tool => READ_ONLY_UPSTREAM_TOOLS.has(tool.name))
}

export function proxiedSurrealmcpToolName(upstreamName: string, prefix = 'query_'): string {
  return `${prefix}${upstreamName}`
}

export function getSurrealmcpProxyState(): {
  connected: boolean
  degraded: boolean
  lastError: string | null
  tools: string[]
} {
  return {
    connected: state?.client != null && state.degraded === false,
    degraded: state?.degraded ?? false,
    lastError: state?.lastError ?? null,
    tools: state?.tools.map(tool => tool.name) ?? []
  }
}

export async function initSurrealmcpProxy(
  opts: SurrealMcpProxyOptions
): Promise<{ degraded: boolean; toolsRegistered: number }> {
  const resolved = resolveOptions(opts)
  currentOptions = resolved

  try {
    const { client, tools } = await connectAndListTools(resolved)
    await replaceClient(client, tools, resolved.prefix, false, null)
    stopReconnectLoop()
    return { degraded: false, toolsRegistered: tools.length }
  } catch (err) {
    const msg = errorMessage(err)
    console.error('[surrealmcp-proxy] connect failed, entering degraded mode:', msg)
    state = {
      client: null,
      tools: [],
      prefix: resolved.prefix,
      degraded: true,
      lastError: msg
    }
    startReconnectLoop(resolved)
    return { degraded: true, toolsRegistered: 0 }
  }
}

export function registerSurrealmcpProxy(server: McpServer): void {
  if (!state || state.tools.length === 0) return

  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: DynamicToolConfig,
    cb: (args: unknown) => Promise<CallToolResult>
  ) => void

  for (const tool of state.tools) {
    const upstreamName = tool.name
    registerTool(
      proxiedSurrealmcpToolName(upstreamName, state.prefix),
      {
        title: tool.title,
        description: describeProxiedTool(tool),
        inputSchema: jsonSchemaToZodRawShape(tool.inputSchema),
        annotations: {
          ...tool.annotations,
          readOnlyHint: true,
          destructiveHint: false
        },
        _meta: tool._meta
      },
      async (args: unknown) => {
        const client = state?.client
        if (!client || state?.degraded) {
          return toolError(`surrealmcp upstream unavailable${state?.lastError ? `: ${state.lastError}` : ''}`)
        }

        try {
          return (await client.callTool({
            name: upstreamName,
            arguments: toToolArguments(args)
          })) as CallToolResult
        } catch (err) {
          const msg = errorMessage(err)
          if (currentOptions) void markDegraded(msg, currentOptions)
          return toolError(`surrealmcp upstream error: ${msg}`)
        }
      }
    )
  }
}

function resolveOptions(opts: SurrealMcpProxyOptions): ResolvedProxyOptions {
  return {
    url: opts.url,
    prefix: opts.prefix ?? 'query_',
    connectTimeoutMs: opts.connectTimeoutMs ?? 5000,
    retryIntervalMs: opts.retryIntervalMs ?? 30_000,
    endpoint: opts.endpoint
  }
}

async function connectAndListTools(opts: ResolvedProxyOptions): Promise<{ client: Client; tools: Tool[] }> {
  const client = new Client({ name: 'huygens-mcp/surrealmcp-proxy', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(opts.url))

  try {
    await withTimeout(client.connect(transport), opts.connectTimeoutMs)
    const { tools } = await withTimeout(client.listTools(), opts.connectTimeoutMs)
    if (opts.endpoint) await pinUpstreamEndpoint(client, opts)
    return { client, tools: filterSurrealmcpTools(tools) }
  } catch (err) {
    await client.close().catch(() => {})
    throw err
  }
}

async function pinUpstreamEndpoint(client: Client, opts: ResolvedProxyOptions): Promise<void> {
  if (!opts.endpoint) return
  const args: Record<string, unknown> = { endpoint: opts.endpoint.url }
  if (opts.endpoint.namespace) args.namespace = opts.endpoint.namespace
  if (opts.endpoint.database) args.database = opts.endpoint.database
  if (opts.endpoint.username) args.username = opts.endpoint.username
  if (opts.endpoint.password) args.password = opts.endpoint.password

  const result = (await withTimeout(
    client.callTool({ name: 'connect_endpoint', arguments: args }),
    opts.connectTimeoutMs
  )) as CallToolResult
  if (result.isError) {
    const text = result.content?.find(c => c.type === 'text')?.text ?? 'unknown error'
    throw new Error(`connect_endpoint failed: ${text}`)
  }
}

async function replaceClient(
  client: Client,
  tools: Tool[],
  prefix: string,
  degraded: boolean,
  lastError: string | null
): Promise<void> {
  const previousClient = state?.client
  state = { client, tools, prefix, degraded, lastError }
  if (previousClient && previousClient !== client) await previousClient.close().catch(() => {})
}

async function markDegraded(lastError: string, opts: ResolvedProxyOptions): Promise<void> {
  const previousClient = state?.client
  if (state) state = { ...state, client: null, degraded: true, lastError }
  if (previousClient) await previousClient.close().catch(() => {})
  startReconnectLoop(opts)
}

function startReconnectLoop(opts: ResolvedProxyOptions): void {
  if (retryHandle) return

  retryHandle = setInterval(async () => {
    try {
      const { client, tools } = await connectAndListTools(opts)
      await replaceClient(client, tools, opts.prefix, false, null)
      console.error(`[surrealmcp-proxy] recovered: ${tools.length} read-only tools available`)
      stopReconnectLoop()
    } catch (err) {
      const msg = errorMessage(err)
      if (state) state = { ...state, degraded: true, lastError: msg }
      console.error('[surrealmcp-proxy] reconnect attempt failed:', msg)
    }
  }, opts.retryIntervalMs)
}

function stopReconnectLoop(): void {
  if (!retryHandle) return
  clearInterval(retryHandle)
  retryHandle = null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle)
  })
}

function toToolArguments(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>
  return {}
}

function jsonSchemaToZodRawShape(schema: Tool['inputSchema']): Record<string, z.ZodType> {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const shape: Record<string, z.ZodType> = {}

  for (const key of Object.keys(properties)) {
    const value = z.unknown()
    shape[key] = required.has(key) ? value : value.optional()
  }

  return shape
}

function describeProxiedTool(tool: Tool): string {
  const description = tool.description ? `${tool.description}\n\n` : ''
  return `${description}Proxied from SurrealMCP as a read-only Huygens query tool. Write/infra upstream tools are hidden; writes attempted through query fail via SurrealDB VIEWER permissions.`
}

function toolError(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
