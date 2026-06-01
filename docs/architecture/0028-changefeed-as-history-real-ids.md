# ADR-0028: El changefeed como historia; payload con ids reales; sin `result`

**Status**: Proposed (en rama `feat/changefeed-traceability`, pendiente de prueba)
**Date**: 2026-06-01
**Decision-makers**: Rubén, Claude (sesión de diseño)
**Tags**: database, mcp, dashboard, time-travel, traceability
**Supersedes**: ADR-0020, ADR-0025 · **Amends**: ADR-0024

## Context

ADR-0024/0025 aterrizaron en un diseño dual: `proposal.result` materializaba las listas
de ids de todo lo que un commit producía (la "verdad" engine-independiente) y el changefeed
era una lente de lectura. Una iteración posterior (P2) fue más lejos y reconstruía la
topología histórica plegando `proposal.result` (sin changefeed), quitando incluso la captura
del versionstamp.

Verificamos empíricamente (instancia desechable `surrealkv ?versioned=true`, v3.0.5, 2026-06-01)
que el camino del changefeed **es fiable** cuando se usa bien: captura del versionstamp 8/8 al
primer intento (`SHOW CHANGES … SINCE d"<fecha>"`), y replay reconstruye la topología exacta
incluyendo borrados y reparent (8/8). Los footguns son acotados: `LIMIT` y `SINCE`
bajo/versionstamp están rotos; `VERSION`-scan sigue roto (#7245).

Decisión del usuario, con el trade asumido conscientemente: **priorizar simplicidad de código
confiando en el changefeed para la historia**, aceptando que la historia detallada vive dentro
de la retención del changefeed y no sobrevive a migraciones `EXPORT/IMPORT` (la historia
pre-migración no está; ya era así).

## Decision

1. **El `payload` se persiste con ids reales** ("máximo-limpio"). El agente sigue llamando
   `create_proposal` con `temp_id` (alias ergonómico de entrada), pero al persistir el draft
   se *realiza*: cada nota/narrative-block nueva recibe `note:⟨uuidv7⟩` / `block:⟨uuidv7⟩` y
   **toda** referencia (edges/edges_remove/about/affects) se reescribe temp→real. El `temp_id`
   **no se persiste**.
2. **`commit_proposal` crea con id explícito** (`CREATE note:⟨id⟩ …`) y `RELATE` con ids reales
   directos — sin remapeo. Estampa el proposal con solo el **ancla**:
   `result = { versionstamp, committed_at }`. **No hay listas de ids materializadas ni temp_ids.**
3. **La historia se lee del changefeed** por el versionstamp del commit
   (`get_proposal_changes`); el dashboard reconstruye el contexto histórico por **replay**
   (ADR-0025: `replayEdgesAmong` + `labelsAtVersion`).
4. **Responsabilidades** (lo permanente en filas, lo efímero en el changefeed):
   - `payload` (ids reales) = la intención.
   - `result` = la ancla (`versionstamp` + `committed_at`).
   - changefeed = el diff valor-a-valor (la historia rica), dentro de retención.
   - `agent_event` = la intención/actividad.
5. **P1 se conserva**: `edges_remove` + replace implícito de `part_of` (corrección de escritura,
   ortogonal a esto).

## Consequences

- **Positivo**: el commit es notablemente más limpio (sin acumular `out.*` ni serializar
  listas); el `payload` con ids reales es auto-suficiente para "qué propuso"; Diario y
  `changes_between` fusionan por id real directo (sin `tempMap`). Menos conceptos: `payload`
  + changefeed.
- **Trade asumido**: la historia detallada (before→after) depende del changefeed → no sobrevive
  a `EXPORT/IMPORT`/cambio de motor ni más allá de la retención. La **trazabilidad mínima**
  (qué proposal, cuándo) sí perdura: `payload` + `committed_at` son filas planas.
- **Compatibilidad**: los proposals legacy (con `result` lleno / `temp_ids`) se toleran en
  lectura; los lectores nuevos solo usan `{versionstamp, committed_at}`. Los 2 commits
  correctivos de 2026-06-01 (`4i9q`, `dtujl`) tienen `versionstamp: null` → no anclables.

## Verification (pendiente)

En rama, sin desplegar. typecheck verde en los 3 workspaces. Tests unitarios adaptados a los
shapes nuevos. La prueba en vivo (crear → commit → ver historia por changefeed) la hace el
usuario antes de fusionar.
