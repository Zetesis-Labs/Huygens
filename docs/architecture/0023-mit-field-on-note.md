# ADR-0023: Campo `mit_for` en `note` para marcar Most Important Tasks

**Status**: Accepted — campo reservado en schema, no driven en esta fase (planning diferido, ver `docs/MODEL.md`)
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

ZTD (ADR-0021) prescribe 1-3 **Most Important Tasks (MITs)** por día. Son las tareas que el usuario se compromete a ejecutar primera hora, antes de email, mensajes o distracciones. Conceptualmente: _"hoy importa esto sobre todo lo demás"_. Es uno de los pilares prácticos del marco: convierte la fricción "tengo veinte tasks ACTIVE, ¿por dónde empiezo?" en una declaración explícita y costosa de incumplir.

Al cristalizar el paquete ZTD en el modelo de datos hay que decidir cómo representar el atributo "esta task es MIT para tal día". Dos opciones se evaluaron:

- **Opción A — Campo dedicado** (elegido): `note.mit_for: option<datetime>` con índice directo.
- **Opción B — Convención en `metadata`**: `note.metadata.mit_for: datetime` opcional, sin schema change.

La pregunta de fondo: ¿es MIT un atributo central del modelo operativo (merece ciudadanía de primera clase) o una etiqueta más entre muchas (basta convención)?

## Decision

**Añadir un campo dedicado `mit_for: option<datetime>` a `note`, con índice directo.**

Implementación en schema:

```surql
DEFINE FIELD OVERWRITE mit_for ON note TYPE option<datetime>;
DEFINE INDEX OVERWRITE note_mit_for ON note FIELDS mit_for;
```

Razones del campo dedicado sobre la convención en `metadata`:

- **Query frecuente y central**: `SELECT * FROM note WHERE mit_for = $today` es la consulta más usada del ciclo diario ZTD. Merece un índice directo, no un filtro por `metadata.x` que requiere full scan.
- **Concepto operativo de primera clase**, no metadata-grade. El uso es diario, no opcional.
- **Self-documenting**: el campo aparece en el shape de `note` sin necesidad de convención no enforced. `metadata.mit_for` sería frágil — fácil escribir mal el key, sin validación de tipo.
- **Performance**: el índice ordena "MITs de hoy" en O(log n) y permite analítica histórica eficiente.

### Semántica

- `mit_for = NONE` → la note no es MIT (caso por defecto).
- `mit_for = datetime` → la note es MIT para ese **día**. La parte de hora es secundaria; la convención es usar `00:00:00 UTC` del día.
- Una note puede dejar de ser "MIT de hoy" al pasar el día — su `mit_for` queda como **rastro histórico** ("fue MIT el día X"), no se borra automáticamente.
- No hay validación de motor sobre cuántas MITs por día existen — la convención "1-3 por día" es convención agéntica, no enforced.

### Convenciones del agente

- El usuario decide los MITs cada mañana (o el agente propone y el usuario aprueba).
- El agente **NO** marca MITs autónomamente sin confirmación humana — son decisión estratégica del usuario.
- En general 1-3 MITs por día, no más.
- Al menos 1 MIT debería estar relacionado con un Objetivo activo (convención agéntica, no enforced en schema).

### Queries útiles

```surql
-- MITs de hoy
SELECT * FROM note
WHERE mit_for >= time::group(time::now(), 'day')
  AND mit_for < time::group(time::now() + 1d, 'day');

-- Histórico de MITs no completados (deuda ZTD)
SELECT * FROM note
WHERE mit_for IS NOT NONE
  AND state IN ['CLARIFIED', 'ACTIVE', 'WAITING'];

-- ¿Cuántos MITs por día en el último mes?
SELECT
  time::format(mit_for, '%Y-%m-%d') AS day,
  count() AS n_mits
FROM note
WHERE mit_for IS NOT NONE
  AND mit_for > time::now() - 30d
GROUP BY day;

-- Tasa de completado: MITs done vs no-done en el último mes
SELECT state, count() AS n
FROM note
WHERE mit_for IS NOT NONE
  AND mit_for > time::now() - 30d
GROUP BY state;
```

## Consequences

- **Positivas**:
  - El concepto MIT es ciudadano de primera clase del modelo, queryable directo, sin convención frágil.
  - Analítica clara del hábito ZTD: tasa de cumplimiento, distribución, deuda acumulada.
  - El índice acelera "MITs de hoy" — la query más usada del ciclo diario.
- **Negativas**:
  - Un campo más en `note`. Coste mínimo: `option<datetime>` = `NONE` por defecto.
- **Neutrales**:
  - La convención "1-3 por día" no se enforce en motor. Aceptable: pasarse de 3 es un signo a observar, no un error que romper.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| `metadata.mit_for` (convención) | Sin schema change | Convención frágil, sin índice eficiente, sin tipo enforced | Concepto demasiado central para esconder en `metadata` |
| Campo booleano `is_mit` | Más simple | Pierdes la dimensión temporal (¿MIT cuándo?), no permite histórico | No captura la semántica completa |
| Tabla separada `daily_mit` | Strict sobre 1-3/día | Sobreingeniería para concepto simple, rompe uniformidad "todo es Note" | Innecesariamente complejo |
| `mit_for: option<datetime>` (elegido) | Self-documenting, queryable, histórico preservado, índice eficiente | Un campo más | Trade-off óptimo |

## Related

- [ADR-0021](./0021-adopt-ztd-drop-pillars.md) — adopt ZTD; esto es parte del paquete
- [ADR-0022](./0022-objetivo-and-idea-types.md) — Objetivo + Idea (otra pieza del paquete)
- [ADR-0010](./0010-pillars-and-state-as-enums.md) — `state` enum sigue siendo válido; las MITs son tasks en estados normales (`CLARIFIED`/`ACTIVE`/`DONE`)

## Notes

`mit_for` no implica nada sobre el `state` de la note: una MIT puede estar `CLARIFIED` (definida pero aún no empezada), `ACTIVE` (en curso) o `DONE` (cumplida). El cruce de `mit_for` con `state` es lo que da la analítica de cumplimiento.

La parte de hora del datetime es convención `00:00:00 UTC`. Si en el futuro se necesita zona horaria del usuario, se documentará aparte — por ahora un solo usuario, una sola zona efectiva.

El campo permanece tras el día: una task que fue MIT el martes y se completó el miércoles conserva `mit_for = martes` como rastro. Esto permite preguntas como "¿qué MIT dejé sin hacer la semana pasada?" sin necesidad de tabla histórica separada.
