import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildInstructions } from './instructions'
import { createServer } from './server'
import { assertSchemaReady } from './surreal'

const PORT = Number(process.env.MCP_PORT ?? 3030)

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

type Route = 'health' | 'mcp' | 'not_found'

// Pure routing decision: which kind of request this is, derived only from the
// URL. Testable without touching `res` or standing up an HTTP server.
function routeRequest(url: string | undefined): Route {
  if (url === '/healthz') return 'health'
  if (url?.startsWith('/mcp')) return 'mcp'
  return 'not_found'
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

// The `instructions` (SurrealQL cookbook + live DB schema) are computed once at
// startup and closed over here, so every connecting agent sees them without the
// handler reading mutable module state.
function createRequestHandler(instructions: string | undefined) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const route = routeRequest(req.url)

    if (route === 'health') {
      writeJson(res, 200, { ok: true })
      return
    }

    if (route === 'not_found') {
      writeJson(res, 404, { error: 'not_found' })
      return
    }

    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : undefined
      const mcp = createServer(instructions)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

      res.on('close', () => {
        transport.close().catch(err => console.error('[huygens-mcp] transport close error:', err))
        mcp.close().catch(err => console.error('[huygens-mcp] server close error:', err))
      })

      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      console.error('[huygens-mcp] request error:', err)
      if (!res.headersSent) {
        writeJson(res, 500, { error: 'internal_error' })
      }
    }
  }
}

async function buildServerInstructions(): Promise<string | undefined> {
  try {
    return await buildInstructions()
  } catch (err) {
    // Instructions (cookbook + schema) are best-effort context for agents;
    // never let them block startup. Tools still work without them.
    console.error('[huygens-mcp] could not build server instructions:', err instanceof Error ? err.message : err)
    return undefined
  }
}

async function main(): Promise<void> {
  // Fail fast and legibly if the schema isn't applied, instead of opaque errors
  // surfacing later inside a tool.
  await assertSchemaReady()
  const serverInstructions = await buildServerInstructions()
  const httpServer = createHttpServer(createRequestHandler(serverInstructions))
  httpServer.listen(PORT, () => {
    console.error(`[huygens-mcp] listening on http://0.0.0.0:${PORT}/mcp`)
  })
}

main().catch(err => {
  console.error('[huygens-mcp] startup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
