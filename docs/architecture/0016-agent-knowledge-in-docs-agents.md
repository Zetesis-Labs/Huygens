# ADR-0016: Conocimiento del agente en `docs/agents/`

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: agent

## Context

Sobre el repo pueden operar varios agentes — **Claude Code**, **Codex**, **Hermes** (Nous Research), y previsiblemente más. Cada uno tiene su propio fichero de entrada en la raíz: `CLAUDE.md`, `AGENTS.md`, flexible para Hermes.

El conocimiento que necesita un agente para operar (dominio GTD, pilares, edges autorizados, patrones SurrealQL, convenciones operativas) **no puede vivir duplicado** en cada entry point — diverge al primer cambio. Tampoco queremos enterrarlo en prompts de tools del MCP (no versionable, no compartible entre agentes).

Inspiración: **kaig** (https://github.com/surrealdb/kaig) tiene `.cursor/rules/*.mdc` como source of truth, pero Rubén no usa Cursor.

## Decision

El conocimiento operativo del agente vive en **`docs/agents/`** como markdown versionado. Los entry points por agente son **punteros cortos** que listan lecturas obligatorias y delegan el contenido.

```
docs/agents/
├── huygens-domain.md       ← entidades, pilares, edges, flujos GTD
├── surrealql-patterns.md   ← queries SurrealQL copy-paste
└── conventions.md          ← reglas operativas (idempotencia, trazabilidad, tono)

AGENTS.md      ← entry point para Codex / Hermes / generales
CLAUDE.md      ← entry point para Claude Code
```

Cada entry point empieza con "lecturas obligatorias al inicio de sesión" y lista los tres ficheros en orden. El resto cubre convenciones del repo (build, comandos, devcontainer) — no dominio.

Separación con el resto de `docs/`:

- **`docs/research/`** → conversación de diseño narrativa
- **`docs/agents/`** → conocimiento operativo prescriptivo (lo que el agente **debe** saber)
- **`docs/architecture/`** → decisiones cristalizadas (este directorio)

## Consequences

- **Positivas**:
  - **Una verdad, múltiples índices**: el dominio se edita en un único sitio
  - **Versionado como código**: evoluciona en git, no en prompts opacos
  - **Onboarding limpio**: cualquier agente nuevo lee tres ficheros y opera
  - **Inspeccionable**: el conocimiento es texto plano revisable en PR
  - **Multi-agente sin coste**: añadir soporte a un agente nuevo es crear un puntero corto en la raíz
- **Negativas**:
  - Disciplina necesaria: si alguien edita `CLAUDE.md` con contenido en lugar de pointer, se rompe la separación
  - Mantener `AGENTS.md` y `CLAUDE.md` sincronizados (mismas lecturas obligatorias)
- **Neutrales**:
  - No replicamos `.cursor/rules/` de kaig porque Rubén no usa Cursor; si llega, basta con un `.cursor/rules/*.mdc` apuntando al mismo contenido

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Conocimiento monolítico en `CLAUDE.md` | Un único fichero | Crece sin límite; no reutilizable con Codex/Hermes; mezcla repo-conventions con dominio | Acaba duplicado al añadir el segundo agente |
| Embebido en prompts de tools del MCP | Co-localizado con la tool | Duplicación entre tools, divergencia inevitable, no versionable | El dominio es transversal a las tools |
| `.cursor/rules/*.mdc` siguiendo kaig | Encaja con Cursor | Rubén no usa Cursor | No aplica |
| `docs/agents/` (elegido) | Punto único, multi-agente, versionado, inspeccionable | Requiere disciplina para no engordar los entry points | Estructura limpia y barata de mantener |

## Related

- ADRs: `ADR-0014` (los agentes hablan con MCPs; este ADR define **cómo aprenden** a hacerlo)
- Ficheros mismos: [docs/agents/huygens-domain.md](../agents/huygens-domain.md), [docs/agents/surrealql-patterns.md](../agents/surrealql-patterns.md), [docs/agents/conventions.md](../agents/conventions.md)
- Inspiración: [surrealdb/kaig](https://github.com/surrealdb/kaig) — patrón `.cursor/rules/*.mdc`

## Notes

Regla práctica: **"el entry point es índice, no contenido"**. Si la información es transferible al siguiente agente que aterrice, va a `docs/agents/`. Si es estrictamente de repo (comandos, devcontainer, build), puede quedarse en `CLAUDE.md`/`AGENTS.md`.
