import type { APIRoute } from 'astro'
import { getConversation, listConversations, saveConversation } from '../../lib/queries'

export const prerender = false

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// GET /api/conversation        → list summaries
// GET /api/conversation?id=…   → full thread (messages + state)
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id')
  try {
    const data = id ? await getConversation(id) : await listConversations()
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(`load failed: ${msg(e)}`, { status: 502 })
  }
}

// POST /api/conversation { messages, title?, state?, id? } → { id, updated }
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; title?: string; messages?: unknown[]; state?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return new Response('invalid JSON', { status: 400 })
  }
  if (!Array.isArray(body.messages)) return new Response('messages[] required', { status: 400 })
  try {
    const res = await saveConversation({ messages: body.messages, title: body.title, state: body.state, id: body.id })
    return new Response(JSON.stringify(res), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(`save failed: ${msg(e)}`, { status: 502 })
  }
}
