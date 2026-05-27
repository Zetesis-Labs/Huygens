import type { APIRoute } from 'astro'
import { saveQuery } from '../../lib/queries'

export const prerender = false

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData()
  const name = String(form.get('name') ?? '').trim()
  const query = String(form.get('query') ?? '').trim()
  if (!name || !query) return new Response('missing name/query', { status: 400 })
  try {
    const { id } = await saveQuery(name, query, form.get('pinned') === 'on')
    return redirect(`/explorer?saved=${encodeURIComponent(id)}`, 303)
  } catch (e) {
    return new Response(`save failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }
}
