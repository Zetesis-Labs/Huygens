# ADR-0001: Bun como runtime y package manager

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: stack, infra

## Context

Huygens es un monorepo TypeScript con workspaces (`apps/*`) que necesita un runtime JS/TS y un gestor de paquetes. El proyecto hermano ZetesisPortal usa `pnpm + Node 25`; Huygens no hereda esa elección automáticamente. Hay que decidir runtime + gestor para un proyecto greenfield, single-user, donde la velocidad del ciclo de feedback en dev pesa más que la madurez del ecosistema.

## Decision

Usar **Bun 1.x** como runtime y como package manager. Versión pineada en `.bun-version`. Imagen base del devcontainer: `oven/bun:1-debian`.

Consecuencias inmediatas: cero transpile step para TypeScript, `bun --watch` en lugar de `nodemon`/`tsx`, workspaces declarados como `"workspaces": ["apps/*"]` en el `package.json` raíz, y `bun install`/`bun dev`/`bun lint` como comandos de primer nivel.

## Consequences

- **Positivas**:
  - TypeScript ejecuta nativo, sin tsconfig "paths"/loaders ni pasos de build en dev
  - Watch mode notablemente más rápido que `nodemon`+`tsx`
  - Workspaces de primera clase, sin plugin externo
  - Un único binario para runtime + lockfile + test runner reduce superficie de tooling
- **Negativas**:
  - Ecosistema más joven que Node; algunos paquetes del mundo Node aún requieren shims o configuración extra
  - Documentación y respuestas de comunidad menos abundantes
  - Divergencia con ZetesisPortal: dos stacks que mantener mentalmente
- **Neutrales**:
  - Lockfile `bun.lockb` (binario) en vez de `pnpm-lock.yaml`
  - Cambio de hábito en CI/CD respecto a otros proyectos del autor

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| pnpm + Node 25 | Maduro, igual que ZetesisPortal, gran ecosistema | Requiere transpile (tsx/ts-node), watch más lento, más config | Penaliza el ciclo de feedback en un proyecto donde la velocidad pesa más que la familiaridad |
| npm + Node | Default universal | Workspaces flojos, sin store global eficiente | Sin ventajas sobre pnpm; mismos contras que Node |
| Deno | TS nativo, seguridad por permisos, runtime moderno | Ecosistema npm con fricción, MCP SDK no pensado para Deno | Compatibilidad con `@modelcontextprotocol/sdk` no garantizada |

## Related

- ADRs: `ADR-0002` (TypeScript + Biome), `ADR-0003` (devcontainer-first)
- Research: [docs/research/02-architecture/stack-decisions.md](../research/02-architecture/stack-decisions.md)
- Código afectado: `package.json` raíz, `.bun-version`, `.devcontainer/`

## Notes

La decisión es reversible: si Bun introdujera una regresión bloqueante, migrar a pnpm+Node es mecánico (cambiar imagen base + reescribir scripts). Lo no-reversible sería atarse a APIs `Bun.*` específicas — política: usar solo APIs estándar (`fetch`, `process.env`, `node:*`) salvo justificación documentada.
