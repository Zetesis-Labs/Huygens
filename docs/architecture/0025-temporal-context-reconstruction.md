# ADR-0025: Reconstrucción del contexto temporal de un proposal (changefeed-replay, no `VERSION`)

**Status**: Accepted
**Date**: 2026-05-26
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: database, dashboard, time-travel

## Context

El dashboard (Astro + React Flow) renderiza el change-graph de un proposal. Para los nodos de
contexto (notas pre-existentes que el proposal solo referencia) y las relaciones hidratadas, hoy
se resuelve el estado **en vivo** del grafo. Para un proposal **antiguo ya commiteado** esto
deriva: los títulos cambian, las relaciones se crean o se borran, y el grafo que se ve ya no es
el que había cuando se commiteó. Queríamos ver el proposal **en su contexto temporal exacto**.

ADR-0024 dejó el motor en **SurrealKV `?versioned=true`**, que habilita time-travel
(`SELECT … VERSION d"…"`) y changefeed (`SHOW CHANGES`). La pregunta era si podíamos apoyarnos en
esas features para reconstruir el grafo en el instante del commit — y, de paso, si convenía
replantear cómo se guardan los proposals (derivar el efecto del changefeed en vez de materializar
`proposal.result`).

## Hallazgos empíricos (verificados en namespaces aislados, 2026-05-26)

Se midió, no se asumió. Resultados:

- **Changefeed durable.** `SHOW CHANGES FOR TABLE x SINCE d"<fecha>"` (sin `LIMIT`) devuelve las
  mutaciones con el registro completo y **sobrevive al GC** (entradas de un commit siguen tras
  120s/~12 ciclos de GC con `CHANGEFEED 10y`, y +17h observado en prod). La premisa de ADR-0024
  ("el GC vacía el changefeed") **no se sostiene** en el despliegue actual.
- **Un único versionstamp por transacción**, global a todas las tablas: el changeset completo de
  un commit son las entradas con ese versionstamp.
- **`VERSION` por record id es correcto** (incluye respetar borrados → vacío).
- **`VERSION` no reconstruye topología por ninguna vía:**
  - *full-scan* (tabla sin índice que cubra el filtro) → **falsos positivos**: devuelve edges/nodos
    ya borrados (ignora tombstones).
  - *index-backed* (nuestro `WHERE in IN $ids AND out IN $ids`, cubierto por los índices UNIQUE
    `(in,out)` / `(in)`) → **falsos negativos**: el índice solo contiene registros actuales, así que
    los edges borrados-desde-entonces ni se encuentran, aunque existieran en la fecha consultada.
  - Es el bug upstream [#7245](https://github.com/surrealdb/surrealdb/issues/7245) (familia). El fix
    (PR #7198) arregla **traversals de grafo**, no scans, y **no está en v3.0.5 ni en ninguna release
    publicada** (solo en `main`/nightly). Verificado: el scan sigue roto también en `3.1.0-nightly`.
    `VERSION` es además oficialmente *alpha, "not recommended for production"*.
- **Trampas de consulta** (falsos vacíos): `SHOW CHANGES … LIMIT` (roto), `SINCE 1`/versionstamp bajo,
  y leer `SHOW CHANGES` en la misma transacción que la escritura.

Conclusión de los hallazgos: **el modelo de storage del proposal NO se cambia.** `proposal.result`
(materializado en la transacción atómica del commit) sigue siendo la fuente de verdad robusta e
independiente del motor; el changefeed/time-travel es una *lente de lectura*, no la verdad
(coherente con el espíritu de ADR-0019/0020). Lo único que se arregla del commit es la **captura
fiable del versionstamp**.

## Decision

1. **Reconstruir el contexto histórico de un proposal commiteado** así:
   - **Etiquetas de nodos** (título/tipo a la fecha del commit): `VERSION` **por record id** (fiable).
   - **Topología pre-existente** (edges entre esos nodos): **replay del changefeed** de las tablas de
     edges hasta el versionstamp del commit (create → añade, delete → quita). NUNCA `VERSION`-scan.
   - **Drafts** (y commits pre-migración sin versionstamp): estado **en vivo** (es lo correcto; aún
     no hay commit, o no hay ancla).
2. **Costura `TemporalEdgeReader`** (`apps/dashboard/src/lib/temporal.ts`) con dos implementaciones
   tras una interfaz: `ReplayReader` (default, correcto en el motor actual) y `NativeReader`
   (`VERSION`-scan, incorrecto hoy). Flag `HUYGENS_TEMPORAL=replay|native`. El día que el motor gane
   scans temporales reales se cambia el flag, no el viewer.
3. **Fix de la captura del versionstamp** en `commit_proposal`: en vez de `SHOW CHANGES … SINCE 0`
   (roto → `versionstamp` quedaba `null` en 30/31 commits), capturar la marca de tiempo de reloj de
   BBDD antes del commit y recuperar el versionstamp de la **propia entrada de changefeed del
   proposal** con `SINCE d"<fecha>"`. Es el ancla del replay (hoy) y del `VERSION` nativo (mañana).
4. **`proposal.result` permanece como SSOT** del efecto. No se deriva el efecto del changefeed.

## Implementation

- `apps/mcp/src/tools/proposal/commit.ts` — `versionstampForProposal` (datetime `SINCE` sobre la
  tabla `proposal`).
- `apps/dashboard/src/lib/surreal.ts` — `labelsAtVersion` (VERSION por-id), `replayEdgesAmong`
  (replay), `scanEdgesAmongAt` (nativo, para el futuro); `getProposal` ahora trae `result`.
- `apps/dashboard/src/lib/temporal.ts` — `commitAnchor`, interfaz `TemporalEdgeReader`, factory por flag.
- `apps/dashboard/src/pages/proposals/[id].astro` — committed con ancla → histórico; resto → vivo.
- `apps/mcp/test/temporal-edges.test.ts` — (1) guarda la **corrección del replay** (re-parenting);
  (2) **tripwire**: afirma que `VERSION` nativo aún NO puede reconstruir la topología histórica.
  Cuando el tripwire se ponga rojo, el motor ya tiene scans temporales → pasar a `native`.

## Consequences

- **Positivo**: proposals antiguos se ven en su contexto real sin cambiar el modelo; el cambio es
  aditivo y aislado; `proposal.result` sigue siendo auditoría robusta; el relevo a motor-nativo es
  un flag.
- **Limitación**: los ~30 proposals commiteados **antes** de la migración (sin `versionstamp`) caen
  a vista en vivo. El replay solo es completo desde el génesis del changefeed (el import de la
  migración), suficiente para todo commit posterior.
- **Acoplamiento**: el viewer histórico depende del changefeed de SurrealKV. Es aceptable
  (proyecto comprometido con SurrealDB) y degrada con elegancia (sin ancla → vivo).
- **Permisos**: el replay usa `SHOW CHANGES`; el rol de lectura del dashboard debe poder ejecutarlo
  (verificar en el rol VIEWER de prod; en este despliegue funciona).

## Relación con otros ADRs

- **ADR-0020** (changefeed para audit): este ADR confirma empíricamente que el changefeed SÍ
  funciona y es durable en SurrealKV; corrige la sintaxis (`VERSION`, no `AT`) y acota que `VERSION`
  solo es fiable por-id, no por scan/traversal.
- **ADR-0024** (SurrealKV): este ADR matiza su premisa de "changefeed best-effort por GC" — el GC no
  lo vacía en el despliegue actual — pero **mantiene su decisión central**: `proposal.result` es la
  SSOT, el changefeed es conveniencia/lente de lectura.
- **ADR-0019** (event sourcing de `agent_event`): el "por qué" sigue en `agent_event`; el changefeed
  solo aporta el "qué" físico.
