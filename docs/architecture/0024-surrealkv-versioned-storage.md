# ADR-0024: SurrealKV con `?versioned=true` como motor de almacenamiento

**Status**: Accepted
**Date**: 2026-05-26
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: database, infra

## Context

Huygens arrancó con **RocksDB** como motor de almacenamiento persistente de SurrealDB (el
default cuando se arranca con `rocksdb:/data/db`). Hasta este punto el motor era suficiente:
las queries eran sobre el estado actual y no había necesidad de time-travel ni de auditoría de
diffs de estado.

Con ADR-0020 se activó `CHANGEFEED` sobre todas las tablas críticas y se definió `SHOW CHANGES`
como la herramienta para cruzar el reasoning del agente (capa `agent_event`) con el state diff
real de la BBDD. El problema: **RocksDB no soporta ni time-travel queries (`SELECT … VERSION`)
ni changefeed funcional**. En RocksDB, `SHOW CHANGES` devuelve siempre vacío — el motor
simplemente no implementa el mecanismo de versionado que ambas features requieren. ADR-0020
quedaba vacío de implementación.

La única opción disponible en SurrealDB 3.x que hace funcionar estas características es
**SurrealKV con versionado explícito** (`surrealkv:/data/db?versioned=true`). El motor
`memory` también las soporta pero no persiste entre reinicios. Migrar a SurrealKV era el
prerrequisito bloqueante para materializar lo que ADR-0020 prometía.

## Decision

Cambiar el argumento de arranque de SurrealDB de `rocksdb:/data/db` a
**`surrealkv:/data/db?versioned=true`** y montar un volumen Docker nuevo (`surrealkv_data`)
sin tocar el volumen legacy (`surrealdb_data`), que se conserva intacto para rollback.

Consecuencias inmediatas:

- La imagen usada es `surrealdb/surrealdb:v3.0.5`; se decide permanecer siempre en la última
  versión 3.x conforme evolucione (nunca bajar a 2.x).
- `SHOW CHANGES FOR TABLE … SINCE …` y `SELECT … VERSION d'…'` pasan a funcionar.
- El código en `commit.ts` que ya usaba `SHOW CHANGES` para capturar el versionstamp de la
  transacción (`maxVersionstamp` / `versionstampSince`) queda operativo.
- `proposal.result.versionstamp` se puede rellenar de forma fiable.

## Consequences

- **Positivas**:
  - Time-travel queries (`SELECT * FROM note:abc VERSION d'…'`) funcionan desde el momento
    del arranque con SurrealKV.
  - `SHOW CHANGES` devuelve deltas reales; `commit_proposal` puede capturar el versionstamp
    de la transacción y materializarlo en `proposal.result`.
  - La fuente de verdad de "qué cambió un commit" es `proposal.result` (ids reales +
    `versionstamp`), consultable sin changefeed, incluso si el changefeed falla o es vaciado.
  - El volumen legacy (`surrealdb_data`) queda intacto: rollback a RocksDB es posible sin
    pérdida de datos, con solo cambiar el argumento de arranque.
- **Negativas**:
  - El changefeed tiene un **bug upstream en SurrealDB 3.0.5** (issues #6832 / fix PR #6851):
    el GC elimina las entradas del changefeed en cada ciclo, por lo que `SHOW CHANGES` puede
    devolver vacío poco después de la escritura. La correlación proposal↔changefeed es
    **best-effort**, no garantizada. La fuente de verdad auditada es `proposal.result`, no
    el changefeed.
  - SurrealKV es un motor más joven que RocksDB; su madurez en cargas de escritura intensiva
    está menos probada (irrelevante a escala personal, pero registrable).
  - La migración de datos RocksDB → SurrealKV no es automática: requirió un paso manual
    (backup previo, `EXPORT` desde el volumen RocksDB e `IMPORT` en el nuevo volumen SurrealKV),
    con verificación de los conteos de registros post-migración. No hubo pérdida de datos, pero
    es un paso operativo a repetir si se cambia de volumen de nuevo.
- **Neutrales**:
  - El volumen Docker pasa de `surrealdb_data` a `surrealkv_data`; el compose mantiene ambos
    declarados.
  - El `surrealdb-init` (BusyBox + chown) de ADR-0006 aplica ahora al volumen `surrealkv_data`
    sin cambios conceptuales.
  - La elección de versión (`v3.0.5`) queda fijada en el compose; actualizar a versiones 3.x
    posteriores es el camino esperado, no un cambio arquitectural.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Mantener RocksDB | Sin cambio operacional | `SHOW CHANGES` devuelve vacío; time-travel inoperativo; ADR-0020 sin efecto real | No cumple el prerrequisito de changefeed y time-travel |
| Motor `memory` | También soporta versionado y changefeed | No persiste entre reinicios; inútil como almacenamiento de producción | Solo útil para tests unitarios herméticos |
| Bajar a SurrealDB 2.x | Mayor madurez acumulada; RocksDB funcional allí | Pierde mejoras de 3.x; bloquea el camino hacia funcionalidades futuras del motor | El proyecto ya está en 3.x; retroceder es más costoso que asumir el bug de GC |
| SurrealKV sin `?versioned=true` | Mismo motor, arranque más simple | Sin versionado no hay time-travel ni changefeed funcional | El parámetro `?versioned=true` es el requisito mínimo para ambas features |

## Related

- `ADR-0020`: CHANGEFEED para state-diff audit — esta decisión es el prerrequisito de
  implementación que ADR-0020 asumía; sin SurrealKV+versioned, ADR-0020 no tenía efecto real
- `ADR-0006`: SurrealDB rootless vía init container — el servicio `surrealdb-init` (chown
  del volumen) se aplica ahora a `surrealkv_data` sin cambios de diseño
- `ADR-0005`: SurrealDB sobre MongoDB — establece la elección del motor; este ADR refina el
  backend de almacenamiento dentro de esa elección
- Código afectado: `.devcontainer/docker-compose.yml`, `apps/mcp/src/tools/proposal/commit.ts`
- Bug upstream: SurrealDB #6832 / fix PR #6851

## Notes

La función `versionstampSince` en `commit.ts` implementa un retry con backoff (5 intentos,
150 ms de espera) precisamente porque el changefeed puede tardar en reflejar la escritura
o no hacerlo en absoluto por el bug de GC. Si devuelve `null`, el `versionstamp` queda como
`NONE` en `proposal.result`, pero los ids reales de todos los records creados/modificados
están ya materializados en `result` por la propia transacción atómica — la auditoría no
depende del changefeed para ser funcional.

Cuando el bug #6832 quede cerrado en una versión 3.x posterior, `versionstampSince` pasará a
ser fiable de forma consistente y la correlación proposal↔changefeed podrá completarse sin
retries defensivos.
