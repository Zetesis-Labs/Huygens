# ADR-0020: CHANGEFEED para auditoría de state diffs

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model, database, agent

## Context

Con la introducción del worker autónomo (ADR-0018) y el event sourcing de decisiones del agente (ADR-0019), el sistema empieza a actuar sobre la BBDD de forma no-interactiva. `agent_event` registra el **reasoning** del agente — por qué tomó cada decisión, con qué confidence, sobre qué subject — pero NO captura el **state diff** que esa decisión produjo en la BBDD: qué fila exactamente se creó, con qué valores, qué edges aparecieron, qué cambió.

Para auditoría completa hacen falta **dos capas independientes**:

- **Capa semántica** (`agent_event`): "el worker decidió clasificar `raw_capture:abc` como Task con confidence 0.88 porque..."
- **Capa de estado** (audit del dato real): "se creó `note:xyz` con `title='...'`, `type=task`, `pillars=['ETHOS']` en `2026-05-20T10:14:23Z`"

Sin la capa de estado no es posible:

- Reconstruir el estado de la BBDD en cualquier instante del pasado
- Detectar drifts o cambios inesperados (alguien o algo modificó algo sin dejar `agent_event`)
- Time-travel queries ("¿cómo era esta nota la semana pasada, antes de que el agente la re-clasificara?")
- Comparar la decisión declarada del agente (reasoning) con el resultado real materializado en la BBDD (state)

SurrealDB ofrece **CHANGEFEED nativo**: el motor mantiene un log incremental de deltas por tabla, queryable con `SHOW CHANGES` y por timestamp con `SELECT ... AT $t`. No hay que reinventar nada.

## Decision

Activar **CHANGEFEED de SurrealDB** sobre todas las tablas críticas con retention efectivamente ilimitado para uso personal (`10y`):

```surql
DEFINE TABLE raw_capture CHANGEFEED 10y;
DEFINE TABLE note        CHANGEFEED 10y;
DEFINE TABLE block       CHANGEFEED 10y;

-- Edges también: creación/borrado de relaciones es estado auditable
DEFINE TABLE derived_from CHANGEFEED 10y;
DEFINE TABLE part_of      CHANGEFEED 10y;
DEFINE TABLE blocked_by   CHANGEFEED 10y;
DEFINE TABLE mentions     CHANGEFEED 10y;
DEFINE TABLE supports     CHANGEFEED 10y;
DEFINE TABLE refutes      CHANGEFEED 10y;
DEFINE TABLE about        CHANGEFEED 10y;
DEFINE TABLE authored_by  CHANGEFEED 10y;
```

**Patrones de uso**:

```surql
-- Todos los cambios en raw_capture desde una fecha
SHOW CHANGES FOR TABLE raw_capture SINCE d'2026-05-15';

-- Estado de una nota en un instante histórico
SELECT * FROM note:abc AT d'2026-05-13T10:00:00Z';

-- Historia de una nota concreta
SHOW CHANGES FOR TABLE note SINCE d'2026-05-01' WHERE id = note:abc;
```

**Capas combinadas — reasoning + state**:

```surql
LET $events = (SELECT * FROM agent_event WHERE subject = $raw ORDER BY created_at);
LET $diff   = (SHOW CHANGES FOR TABLE note SINCE $events[0].created_at);
RETURN { reasoning: $events, state_changes: $diff };
```

Sobre el retention `10y` en lugar de `1y`: es uso personal, el volumen está acotado; CHANGEFEED solo guarda deltas (no snapshots completos) y es barato en storage; el valor de poder mirar "cómo organizaba mi vida hace cinco años" es alto y asimétrico — descartarlo ahora es irreversible. Si el volumen crece y se vuelve un problema medible, se ajusta entonces. No antes.

## Consequences

- **Positivas**:
  - Audit trail de estado completo, complementario al reasoning de `agent_event` (ADR-0019)
  - Time-travel queries nativas (`AT $timestamp`) sin tablas de versión propias
  - Debugging multi-capa: ante un comportamiento extraño, se cruza la decisión declarada con el delta real
  - Detección de drift: cambios sin `agent_event` asociado son sospechosos por construcción
  - Edges auditados igual que entities — coherente con ADR-0008 (topología es primaria)
- **Negativas**:
  - Overhead de storage adicional (mínimo a escala personal, pero no nulo)
  - Queries `AT $timestamp` pueden ser más lentas que las queries del estado actual
- **Neutrales**:
  - Parte del motor SurrealDB — no añade servicio externo ni complejidad operativa
  - El esquema de migración es un único `DEFINE TABLE ... CHANGEFEED 10y` por tabla; idempotente

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Sin CHANGEFEED, solo `agent_event` | Cero coste de storage extra | Pierdes el state diff real; no puedes reconstruir el pasado de la BBDD | Auditoría incompleta — sabes la decisión pero no el resultado |
| Tabla de audit propia con triggers | Control total del schema del audit log | Reinventa lo que el motor ya hace mejor; mantenimiento eterno | Sobreingeniería frente a feature nativa |
| Snapshots completos periódicos | Conceptualmente simple | 100x más caro en storage; granularidad pobre; queries temporales lentas | No escala incluso a personal scale |
| OpenTelemetry / Logfire | Buena observabilidad operativa | Capa de telemetría, no de datos — no permite query temporal nativa sobre el grafo | Resuelve otro problema (latencia, errors), no este |

## Related

- `ADR-0018`: Worker autónomo — sus efectos sobre la BBDD quedan trazados por CHANGEFEED
- `ADR-0019`: Event sourcing del agente — la capa de reasoning, complementaria a esta de state
- `ADR-0017`: `raw_capture` / `derived_from` — las tablas auditadas son justamente las que crean estos dos planos
- `ADR-0008`: Topology as primary — los cambios topológicos (edges) están auditados igual que las entities
- Documentación oficial: [SurrealDB CHANGEFEED](https://surrealdb.com/docs/surrealdb/reference-guide/changefeeds)
- Código afectado: `apps/mcp/surreal/schema.surql`

## Notes

Las queries `AT $timestamp` solo funcionan **desde el momento en que CHANGEFEED se activó**. Si se activa en `T` y se pide el estado en `T - 1d`, no hay datos: el motor solo guarda deltas a partir del `DEFINE TABLE ... CHANGEFEED`. Por eso conviene activarlo cuanto antes — el coste de tenerlo y no usarlo es bajo, el coste de querer mirar atrás y no haberlo activado es infinito.

Los edges tienen su propio CHANGEFEED independiente del de las entities. Borrar una `note` **no** cascadea el borrado de sus edges relacionados automáticamente — habría que añadir `DEFINE EVENT` triggers para eso, paso evolutivo separado. Mientras tanto, los edges huérfanos son detectables por query y el audit los recoge igualmente.
