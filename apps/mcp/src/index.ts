import { createServer as createHttpServer, type IncomingMessage } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadSchemaSnapshot } from './schema-snapshot'
import { createServer } from './server'
import { assertSchemaReady } from './surreal'

const PORT = Number(process.env.MCP_PORT ?? 3030)

// Computed once at startup (see main) and injected as the MCP server's
// `instructions`, so every connecting agent sees the live DB schema.
let schemaInstructions: string | undefined

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const httpServer = createHttpServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (!req.url?.startsWith('/mcp')) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined
    const mcp = createServer(schemaInstructions)
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
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'internal_error' }))
    }
  }
})

async function main(): Promise<void> {
  // Fail fast and legibly if the schema isn't applied, instead of opaque errors
  // surfacing later inside a tool.
  await assertSchemaReady()
  try {
    schemaInstructions = await loadSchemaSnapshot()
  } catch (err) {
    // The schema snapshot is best-effort context for agents; never let it block
    // startup. Tools still work without it.
    console.error('[huygens-mcp] could not load schema snapshot:', err instanceof Error ? err.message : err)
  }
  httpServer.listen(PORT, () => {
    console.error(`[huygens-mcp] listening on http://0.0.0.0:${PORT}/mcp`)
  })
}

main().catch(err => {
  console.error('[huygens-mcp] startup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
