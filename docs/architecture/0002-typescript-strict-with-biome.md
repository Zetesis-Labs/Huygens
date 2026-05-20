# ADR-0002: TypeScript estricto con Biome

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: stack

## Context

Huygens necesita linter + formatter + type-checking estricto desde el día uno. El autor mantiene ZetesisPortal, que en su día migró de ESLint+Prettier a Biome y consolidó una config consistente (2 espacios, 120 columnas, sin punto y coma, comillas simples). Replicarla en Huygens reduce coste cognitivo entre proyectos y evita re-discutir el bikeshed.

## Decision

Adoptar **Biome** como única herramienta de formato y lint, y **TypeScript en modo estricto** con flags adicionales. La config replica la de ZetesisPortal salvo divergencia justificada.

Flags de TypeScript activos: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Regla operativa: `as any` está prohibido, igual que silenciar errores con `biome-ignore` o equivalentes — si hace falta, se discute el caso, no se suprime.

## Consequences

- **Positivas**:
  - Un único binario en Rust para format + lint (Prettier+ESLint eran dos procesos)
  - Velocidad: Biome es órdenes de magnitud más rápido en monorepos
  - `noUncheckedIndexedAccess` obliga a manejar `undefined` en acceso por índice — captura clase entera de bugs
  - Coherencia visual con ZetesisPortal, menor fricción al saltar entre repos
- **Negativas**:
  - Biome aún no cubre 100% de reglas de ESLint; algunas reglas específicas no tienen equivalente
  - Ecosistema de plugins más limitado que ESLint
  - `noUncheckedIndexedAccess` aumenta verbosidad en código que indexa arrays/maps
- **Neutrales**:
  - Cambio de extensión recomendada en IDE (`biomejs.biome` en lugar de `dbaeumer.vscode-eslint`)

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| ESLint + Prettier | Maduro, ecosistema enorme, reglas para casi todo | Dos herramientas, lento en monorepo, config split | ZetesisPortal ya migró fuera; replicar el viejo stack sería un retroceso |
| dprint | Plugin-based, rápido | Solo formato — sigue haciendo falta linter aparte | No resuelve el problema completo |
| TSLint | Histórico de TS | Deprecated desde 2019 | No es opción |

## Related

- ADRs: `ADR-0001` (Bun)
- Research: [docs/research/02-architecture/stack-decisions.md](../research/02-architecture/stack-decisions.md)
- Código afectado: `biome.json`, `tsconfig.json`, `tsconfig.base.json`

## Notes

`as any` prohibido no significa "el tipo siempre sale a la primera". Si una API externa devuelve algo difícil de tipar, la salida es escribir el tipo correcto (aunque sea con `unknown` + narrow), no escapar el sistema. La regla existe porque la deuda de tipos compone.
