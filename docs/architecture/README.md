# Architecture Decision Records (ADRs)

> Decisiones técnicas tomadas en Huygens, registradas siguiendo el formato de **Michael Nygard (2011)**. Cada ADR es un fichero independiente: cristaliza una decisión, sus alternativas y sus consecuencias en el momento en que se tomó.

## Diferencia con `docs/research/`

- **`docs/research/`** → la conversación de diseño que dio lugar a las decisiones. Narrativo, exploratorio, ~100k palabras.
- **`docs/architecture/`** (este directorio) → decisiones cristalizadas, una por fichero, referenciables. Cada ADR es ~200-500 palabras.

## Cómo se lee un ADR

1. **Status** te dice si sigue vigente
2. **Context** te explica qué se estaba decidiendo y por qué
3. **Decision** te dice qué se eligió
4. **Consequences** te avisa de los trade-offs aceptados
5. **Alternatives** te muestra qué se descartó (esto es lo más valioso para futuras reconsideraciones)

## Cuándo añadir un ADR

Cualquier decisión que:
- Cambie el stack (lenguaje, BBDD, framework)
- Cambie el modelo de datos (entidades, relaciones, validaciones)
- Cambie la arquitectura (servicios, capas, integraciones)
- Cambie convenciones operativas estables (idioma de commits, estilo de código, etc.)

NO se añade ADR para:
- Bugfixes
- Refactors menores
- Cambios cosméticos
- Decisiones que se toman y se revierten en la misma sesión

## Cómo añadir un ADR

1. Copia [`0000-template.md`](./0000-template.md) → `NNNN-titulo-corto.md`
2. Asigna número correlativo (el siguiente libre)
3. Rellena: Status, Date, Decision-makers, Tags, Context, Decision, Consequences, Alternatives, Related, Notes
4. Añade entrada en este README (tabla más abajo)
5. Si un ADR previo queda obsoleto, marca su Status como `Superseded by ADR-NNNN`

## Índice

| # | Título | Status | Tags |
|---|---|---|---|
| [0001](./0001-bun-as-runtime-and-package-manager.md) | Bun como runtime y package manager | Accepted | stack |
| [0002](./0002-typescript-strict-with-biome.md) | TypeScript estricto con Biome | Accepted | stack |
| [0003](./0003-devcontainer-first-development.md) | Devcontainer-first development | Accepted | infra |
| [0004](./0004-streamable-http-mcp-transport.md) | Streamable HTTP como transporte MCP | Accepted | architecture |
| [0005](./0005-surrealdb-over-mongodb.md) | SurrealDB sobre MongoDB+Prisma | Accepted | database |
| [0006](./0006-rootless-surrealdb-via-init-container.md) | SurrealDB rootless vía init container | Accepted | infra |
| [0007](./0007-hnsw-production-params-and-unique-edges.md) | HNSW con parámetros explícitos + UNIQUE en edges | Accepted | database |
| [0008](./0008-topology-as-primary.md) | Topología como primaria | Accepted | data-model |
| [0009](./0009-block-composed-notes.md) | Notes compuestas de Blocks markdown | Accepted | data-model |
| [0010](./0010-pillars-and-state-as-enums.md) | Pillars y NoteState como enums | Superseded in part by ADR-0021 | data-model |
| [0011](./0011-schemafull-edges-with-note-or-block.md) | Edges schemafull con `note \| block` | Accepted | data-model |
| [0013](./0013-eight-seed-notetypes.md) | 8 NoteType genéricos como seed inicial | Superseded by ADR-0022 | data-model |
| [0014](./0014-three-layer-mcp-architecture.md) | Arquitectura MCP de tres capas | Accepted | architecture |
| [0015](./0015-bge-m3-via-deepinfra.md) | BGE-M3 vía DeepInfra para embeddings | Accepted | architecture |
| [0016](./0016-agent-knowledge-in-docs-agents.md) | Conocimiento del agente en `docs/agents/` | Accepted | agent |
| [0017](./0017-raw-capture-separation-and-derived-from.md) | Separación raw_capture / Notes + edge derived_from | Accepted | data-model |
| [0018](./0018-autonomous-worker-with-agno.md) | Worker autónomo con Agno + LIVE query | Accepted | architecture, agent |
| [0019](./0019-event-sourcing-of-agent-decisions.md) | Event sourcing de decisiones agénticas (agent_event) | Accepted | architecture, agent, data-model |
| [0020](./0020-changefeed-for-state-diff-audit.md) | CHANGEFEED para state-diff audit | Accepted | data-model, database, agent |
| [0021](./0021-adopt-ztd-drop-pillars.md) | Adopción de ZTD + drop de Pilares | Accepted | vision, data-model |
| [0022](./0022-objetivo-and-idea-types.md) | Tipos Objetivo e Idea | Accepted | data-model |
| [0023](./0023-mit-field-on-note.md) | Campo MIT en note (Most Important Task) | Accepted | data-model |
| [0024](./0024-surrealkv-versioned-storage.md) | SurrealKV con `?versioned=true` como motor de almacenamiento | Accepted | database, infra |

## Status legend

- **Accepted**: decisión vigente
- **Superseded by ADR-NNNN**: reemplazada por una decisión posterior
- **Superseded in part by ADR-NNNN**: parte de la decisión sigue vigente, otra parte queda obsoleta
- **Deprecated**: ya no aplica, pero no fue reemplazada formalmente
- **Proposed**: en discusión, no se ha aplicado todavía
