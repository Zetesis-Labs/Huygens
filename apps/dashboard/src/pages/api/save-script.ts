import type { APIRoute } from 'astro'
import { saveScript } from '../../lib/queries'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { name?: string; script?: string; pinned?: boolean }
    if (!body.name || !body.script) {
      return new Response(JSON.stringify({ error: 'missing name/script' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
    const { id } = await saveScript(body.name, body.script, Boolean(body.pinned))
    return new Response(JSON.stringify({ id }), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    })
  }
}
