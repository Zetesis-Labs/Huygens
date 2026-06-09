# AGENTS.md

Entry point para agentes que operen sobre este repositorio. Si eres Codex, un agente Hermes (Nous Research), Claude Code, o cualquier otro que lea `AGENTS.md` por convención, **empieza aquí**.

## Qué es Huygens

Memoria estructurada personal para Rubén — un MCP server basado en SurrealDB que sirve como capa de memoria para un agente de IA. Una sola persona (Rubén) lo usa. No es multi-tenant. No es producto.

## Lectura obligatoria

1. **[`docs/MODEL.md`](./docs/MODEL.md)** — modelo conceptual canónico (el porqué). Léelo al inicio de cada sesión nueva.
2. **[`apps/mcp/src/lore/operating-doctrine.md`](./apps/mcp/src/lore/operating-doctrine.md)** — doctrina operativa (cómo comportarte); servida por el MCP como recurso `huygens://lore/operating-doctrine`. SSOT del comportamiento. (`docs/CONVENTIONS.md` es ahora un stub que redirige aquí.)

El objetivo actual es conservar el **informe-block** (`block_kind='narrative'`)
pero en una versión mínima, manual y trazable. El código todavía contiene piezas
legacy del modelo anterior; si contradicen `docs/MODEL.md`, son transicionales.

## Mapa del repo

```
.
├── apps/mcp/                  ← MCP server (Bun + TypeScript)
│   ├── surreal/               ← schema.surql + seed.surql
│   ├── src/                   ← server, cliente SurrealDB
│   └── scripts/               ← apply-schema, smoke test
├── backend/huygens-worker/    ← Agente conversacional del dashboard (Agno + OpenAI, AG-UI); sin commit_proposal
├── docs/
│   ├── MODEL.md               ← Modelo canónico (LÉEME)
│   ├── CONVENTIONS.md         ← Stub; sus reglas viven en la doctrina operativa
│   └── research/              ← Investigación + diseño (contexto profundo)
├── .devcontainer/             ← Docker Compose (app + SurrealDB + init)
├── CLAUDE.md                  ← Entry point específico para Claude Code
├── AGENTS.md                  ← Este fichero (Codex / Hermes / general)
└── README.md                  ← Para humanos
```

## Convenciones del proyecto

- **Idioma**: español en conversación con el usuario, inglés en commits y código.
- **Stack**: Bun + TypeScript estricto + Biome + SurrealDB v3 (multi-modelo: grafo + documento + vector).
- **Devcontainer obligatorio**: nunca ejecutes comandos fuera del contenedor. Usa `docker exec <container-app> ...` desde el host; el nombre puede ser `devcontainer-app-1` o `huygens_devcontainer-app-1` según el project name de Docker Compose.
- **Sin git por iniciativa propia**: no commits, no branches, no PRs sin que el usuario lo pida explícitamente.
- **No implementar schema por impulso**: antes de cambiar tipos, edges o flujo de topologización, validar contra `docs/MODEL.md` y preguntar al usuario.

## Flujo objetivo v2.1-lite

```
captura durante el día
  → inbox de raw_capture
  → sesión deliberada de procesamiento
  → uno o varios informe-blocks aprobados
  → propuesta visible de mutaciones
  → commit al grafo
```

El usuario habla con Claude Code, Codex, Hermes u otro agente conversacional. El
agente usa el MCP; el MCP persiste en SurrealDB. El worker Python actual es el
agente del dashboard (Agno + OpenAI, AG-UI); **excluye `commit_proposal`** — el
commit es siempre humano.

**Superficie de tools, entidades, edges y ciclo de proposal**: la fuente de
verdad es [`apps/mcp/src/lore/data-model.md`](./apps/mcp/src/lore/data-model.md)
(servida en runtime como recurso `huygens://lore/data-model`, con el schema vivo
en `huygens://lore/schema`). No se duplica aquí: las copias drifteaban
(`docs/issues/2026-06-09`, DOCT-006).

## Limpieza legacy

El flujo antiguo `raw -> clarify -> notes` fue retirado. No existen tools MCP
`commit_clarify` ni `generate_report`, el seed ya no incluye `note`/`report`, y
no hay worker autónomo que procese el inbox por polling (el worker actual es el
agente del dashboard, sin capacidad de commit).

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

## Para profundizar conceptualmente

`docs/research/` contiene ~100k palabras de discusión de diseño organizadas temáticamente. Si quieres entender por qué se tomó alguna decisión, busca ahí. Notable:

- `01-vision/` — motivación y perfil del usuario
- `03-data-model/topology-as-primary.md` — el principio fundacional
- `04-database/mongodb-pivot.md` — por qué SurrealDB y no Mongo/Neo4j/Falkor
- `06-theory/` — fundamentos teóricos (declarative DB as ontology, hypergraphs, Wolfram, etc.)

No necesitas leer todo. Pero referencia desde aquí cuando una duda específica aparezca.

## En caso de duda

Pregunta al usuario antes de comprometer cambios estructurales (schema, edge types nuevos, transitions de estado sin razón clara). Es mejor un mensaje extra que basura silenciosa en la BBDD.
