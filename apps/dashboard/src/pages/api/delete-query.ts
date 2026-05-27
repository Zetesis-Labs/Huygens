import type { APIRoute } from 'astro'
import { deleteQuery } from '../../lib/queries'

export const prerender = false

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData()
  const id = String(form.get('id') ?? '').trim()
  if (!id) return new Response('missing id', { status: 400 })
  try {
    await deleteQuery(id)
    return redirect('/explorer', 303)
  } catch (e) {
    return new Response(`delete failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }
}
