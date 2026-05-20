# ADR-0004: Streamable HTTP como transporte MCP

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture

## Context

El SDK oficial de MCP (`@modelcontextprotocol/sdk`) ofrece varios transportes: **stdio** (el cliente lanza el server como subproceso local y se comunica por pipes), **Streamable HTTP** (servidor HTTP standalone), y el legado **SSE** (Server-Sent Events, ya deprecated en favor de Streamable HTTP). El MCP de Huygens debe ser consumido tanto por un agente desktop (Claude Code) como, potencialmente, por workers de ingesta y otros procesos. También necesita poder vivir en Docker/Kubernetes con la misma forma que tiene cualquier otro servicio del stack.

## Decision

El MCP server usa **Streamable HTTP** (`StreamableHTTPServerTransport` del SDK oficial), no stdio. Endpoint único: `POST /mcp` en el puerto `MCP_PORT` (default `3030`).

Modo **stateless**: `sessionIdGenerator: undefined`. Cada request HTTP crea un transport efímero, lo conecta al `McpServer`, despacha el JSON-RPC, y lo cierra. Sin estado de sesión en el servidor.

## Consequences

- **Positivas**:
  - Funciona detrás de proxies, en Docker, en K8s — sin asumir ejecución local
  - Debuggeable con `curl` y herramientas HTTP estándar
  - Múltiples clientes simultáneos pueden hablar con el mismo MCP (agente + worker)
  - Stateless evita el coste de gestión de sesiones, locks y limpieza
  - Coherente con cómo se despliegan los MCPs en ZetesisPortal (servicios K8s)
- **Negativas**:
  - Requiere un puerto expuesto (`:3030`) — más superficie que un pipe stdio local
  - Setup mínimo en Claude Desktop es un paso más respecto a stdio (config con URL)
  - Cualquier estado por sesión, si en el futuro hiciera falta, exige reintroducir `sessionIdGenerator`
- **Neutrales**:
  - El cliente debe gestionar reintentos a nivel HTTP en lugar de confiar en un proceso supervisado

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| stdio | Setup trivial en Claude Desktop, sin red expuesta | Cliente debe poder lanzar el binario localmente; mal encaje con Docker/K8s; un cliente por proceso | Limita el modelo de despliegue y el consumo concurrente |
| SSE (legacy) | Streaming nativo | Deprecated en el SDK en favor de Streamable HTTP | No es opción a futuro |
| WebSocket custom | Bidireccional, latencia baja | Fuera del estándar MCP, perdemos compatibilidad con clientes | El estándar gana |

## Related

- ADRs: `ADR-0014` (arquitectura MCP de tres capas)
- Research: [docs/research/02-architecture/mcp-three-layer-architecture.md](../research/02-architecture/mcp-three-layer-architecture.md)
- Código afectado: `apps/mcp/src/index.ts` (HTTP server + setup del transport), `apps/mcp/src/server.ts` (factory `McpServer`)

## Notes

Si en algún momento aparece un caso de uso con estado (por ejemplo, una herramienta que requiera streaming progresivo de tokens a lo largo de varios mensajes JSON-RPC), bastará con cambiar `sessionIdGenerator` a una función que devuelva un id por sesión y mantener un mapa `sessionId → transport` en memoria — el SDK soporta ambos modos sin reescribir herramientas.
