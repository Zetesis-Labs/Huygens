import type { APIRoute } from 'astro'
import { buildProposalView } from '../../lib/proposalView'

export const prerender = false

// Returns the laid-out change graph for a single proposal, so the descriptive
// modal can render the history of a node inline (its detail pane) without
// navigating away. Reuses buildProposalView — the same builder the home view
// uses for ?proposal=<id> — so the graph is identical to the full view.
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id')
  if (!id) return new Response('missing ?id', { status: 400 })
  try {
    const view = await buildProposalView(id)
    if (!view.proposal) return new Response('proposal not found', { status: 404 })
    return new Response(
      JSON.stringify({
        nodes: view.laidOut.nodes,
        edges: view.laidOut.edges,
        legacy: view.legacy,
        narratives: view.narratives
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  } catch (e) {
    return new Response(`graph build failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
