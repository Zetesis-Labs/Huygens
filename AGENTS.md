# AGENTS.md

Entry point para agentes que operen sobre este repositorio. Si eres Codex, un agente Hermes (Nous Research), Claude Code, o cualquier otro que lea `AGENTS.md` por convención, **empieza aquí**.

## Qué es Huygens

Memoria estructurada personal para Rubén — un MCP server basado en SurrealDB que sirve como capa de memoria para un agente de IA en flujo GTD. Una sola persona (Rubén) lo usa. No es multi-tenant. No es producto.

## Lecturas obligatorias para el agente

Lee estos tres documentos **al inicio de cada sesión nueva**, en este orden:

1. **[`docs/agents/huygens-domain.md`](./docs/agents/huygens-domain.md)** — conocimiento del dominio (entidades, pilares, edges, flujos de captura/clarificación/report)
2. **[`docs/agents/surrealql-patterns.md`](./docs/agents/surrealql-patterns.md)** — queries SurrealQL copy-pasteables para Huygens
3. **[`docs/agents/conventions.md`](./docs/agents/conventions.md)** — reglas operativas obligatorias (idempotencia, trazabilidad, tono, etc.)

## Mapa del repo

```
.
├── apps/mcp/                  ← MCP server (Bun + TypeScript)
│   ├── surreal/               ← schema.surql + seed.surql
│   ├── src/                   ← server, cliente SurrealDB
│   └── scripts/               ← apply-schema, smoke test
├── docs/
│   ├── agents/                ← Conocimiento operativo del agente (LÉEME)
│   └── research/              ← Investigación + diseño (40+ docs, contexto profundo)
├── .devcontainer/             ← Docker Compose (app + SurrealDB + init)
├── CLAUDE.md                  ← Entry point específico para Claude Code
├── AGENTS.md                  ← Este fichero (Codex / Hermes / general)
└── README.md                  ← Para humanos
```

## Convenciones del proyecto

- **Idioma**: español en conversación con el usuario, inglés en commits y código.
- **Stack**: Bun + TypeScript estricto + Biome + SurrealDB v3 (multi-modelo: grafo + documento + vector).
- **Devcontainer obligatorio**: nunca ejecutes comandos fuera del contenedor. Usa `docker exec devcontainer-app-1 ...` desde el host.
- **Sin git por iniciativa propia**: no commits, no branches, no PRs sin que el usuario lo pida explícitamente.

## Comandos clave (dentro del devcontainer)

```bash
bun install                        # raíz: instala todas las workspaces
bun lint                           # raíz: biome check
bun typecheck                      # raíz: tsc --noEmit en cada workspace

cd apps/mcp
bun run db:apply                   # aplica schema.surql + seed.surql
bun run db:smoke                   # smoke test end-to-end
bun dev                            # arranca el MCP server en :3030
```

Variables de entorno relevantes (ya configuradas en compose):

```bash
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_NS=huygens
SURREAL_DB=main
SURREAL_USER=root
SURREAL_PASS=root
```

## Estado actual del proyecto

- **Schema + BBDD**: implementado y aplicable (commit `c09b067` + `76a569b`)
- **MCP server**: scaffolding vacío. No hay tools registradas todavía.
- **Lo siguiente**: implementar las tools del Huygens MCP (`capture_inbox`, `list_inbox`, `set_state`, `add_block`, `relate`, eventualmente embedding + vector_search)

Detalle del roadmap en `docs/research/07-roadmap/`.

## Para profundizar conceptualmente

`docs/research/` contiene ~100k palabras de discusión de diseño organizadas temáticamente. Si quieres entender por qué se tomó alguna decisión, busca ahí. Notable:

- `01-vision/` — motivación y perfil del usuario
- `03-data-model/topology-as-primary.md` — el principio fundacional
- `04-database/mongodb-pivot.md` — por qué SurrealDB y no Mongo/Neo4j/Falkor
- `06-theory/` — fundamentos teóricos (declarative DB as ontology, hypergraphs, Wolfram, etc.)
- `06-theory/wolfram-and-the-substrate-of-information.md` — modelo mental del proyecto

No necesitas leer todo. Pero referencia desde aquí cuando una duda específica aparezca.

## En caso de duda

Pregunta al usuario antes de comprometer cambios estructurales (schema, edge types nuevos, transitions de estado sin razón clara). Es mejor un mensaje extra que basura silenciosa en la BBDD.
