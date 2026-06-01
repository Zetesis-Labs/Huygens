import type { APIRoute } from 'astro'

export const prerender = false

// Same-origin proxy to the worker's AG-UI endpoint (ADR-0026). The browser's
// HttpAgent posts RunAgentInput here; we forward it to the worker on the
// internal network and stream the SSE response straight back — so there's no
// new public port and no CORS. The worker URL never reaches the browser.
const AGUI_URL = process.env.HUYGENS_AGUI_URL ?? 'http://huygens-worker:7777'

export const POST: APIRoute = async ({ request }) => {
  let upstream: Response
  try {
    upstream = await fetch(`${AGUI_URL}/agui`, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/json',
        accept: request.headers.get('accept') ?? 'text/event-stream'
      },
      body: await request.text()
    })
  } catch (e) {
    return new Response(`AG-UI upstream unreachable: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }
  // Stream the upstream body through untouched (SSE event stream).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  })
}
