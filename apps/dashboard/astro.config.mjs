import node from '@astrojs/node'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

// SSR: pages and endpoints run server-side so the SurrealDB read (reader role)
// stays on the server and never reaches the browser. Bound to 0.0.0.0 so the
// dev/preview server is reachable from outside the container.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  server: { host: '0.0.0.0', port: 4321 },
  // Reachable behind the reverse-proxied domain (Vite dev host-check).
  vite: { server: { allowedHosts: ['huygens.nexolabs.dev'] } }
})
