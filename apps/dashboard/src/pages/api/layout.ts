import type { APIRoute } from 'astro'
import type { FlowGraph } from '../../lib/graph'
import { layoutGraph } from '../../lib/layout'

export const prerender = false

// Lay out a {nodes, edges} graph server-side and return positioned nodes/edges.
// The chat canvas turns a tool result into a FlowGraph in the browser, posts it
// here, and renders GraphCanvas with the result — reusing the same ELK layout
// the explorer/proposal views use (which only runs under Node SSR).
export const POST: APIRoute = async ({ request }) => {
  let graph: FlowGraph
  try {
    graph = (await request.json()) as FlowGraph
  } catch {
    return new Response('invalid JSON body', { status: 400 })
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return new Response('expected { nodes: [], edges: [] }', { status: 400 })
  }
  try {
    const laid = await layoutGraph(graph)
    return new Response(JSON.stringify(laid), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(`layout failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
