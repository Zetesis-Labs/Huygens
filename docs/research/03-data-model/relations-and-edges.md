# Relaciones y edges

Este fichero documenta cómo se modelan las relaciones entre nodos en Huygens, especialmente después del pivote de MongoDB a SurrealDB. Es el contrapunto técnico al principio expuesto en [topology-as-primary.md](./topology-as-primary.md): si las relaciones son primarias, ¿qué forma concreta toman?

## El cambio fundamental: Mongo → SurrealDB

En la v1 (MongoDB + Prisma) las relaciones entre Notes vivían como:

- `parentNoteId: String?` — relación jerárquica self-referencial.
- `relatedNoteIds: String[]` — array opaco de IDs **sin tipo y sin dirección semántica**.

Ese `relatedNoteIds[]` fue la pieza que disparó el pivote. Era inevitable: si quieres distinguir "esta nota **bloquea** a esa otra" de "esta nota **menciona** a esa otra" de "esta nota **respalda** a esa otra", no puedes vivir con un array plano de ObjectIds.

En la v2 (SurrealDB) cada tipo de relación es un **edge tipado** con `FROM` y `TO` schemafull. La validación de qué nodos pueden estar conectados con qué edges la enforza el motor, no código TypeScript.

## Comparativa rápida

| Aspecto | Mongo (v1) | SurrealDB (v2) |
|---|---|---|
| Tipo de relación | implícito en el nombre del field | explícito en el `TABLE` de la relación |
| Validación FROM/TO | en código TS (~80 líneas estimadas) | en motor BBDD (declarativa) |
| Properties en el edge | en otra colección o JSON aparte | en la propia tabla del edge |
| Bidireccionalidad | manual (escribes a ambos lados) | automática (queries `<-edge<-source`) |
| Multi-hop traversal | `$graphLookup` (lento, awkward) | `->edge->target->edge2->...` (nativo) |
| Indexación de relaciones | sobre arrays de IDs | índices nativos sobre las tablas edge |
| Vista declarativa del schema | dispersa entre modelos | concentrada en `DEFINE TABLE` |

El salto cualitativo está en las dos últimas filas: en Mongo, **el grafo es algo que se simula sobre un store documental**. En SurrealDB, el grafo es el motor — no es una capa por encima.

## Edges tipados planeados (lista inicial)

```surql
DEFINE TABLE of_type        TYPE RELATION FROM note TO note_type SCHEMAFULL;
DEFINE TABLE touches_pillar TYPE RELATION FROM note TO pillar    SCHEMAFULL;
DEFINE TABLE part_of        TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE blocked_by     TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE mentions       TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE supports       TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE refutes        TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE about          TYPE RELATION FROM note TO note      SCHEMAFULL;
DEFINE TABLE authored_by    TYPE RELATION FROM note TO note      SCHEMAFULL;
```

Notas sobre esta lista:

- **`of_type` y `touches_pillar`** son edges hacia entidades fijas. En la v1 esos eran fields directos sobre `Note` (`typeId`, `pillars[]`). En la v2 hay flexibilidad: o se mantienen como fields, o se promueven a edges. Promoverlos da uniformidad ("todo es grafo") pero añade overhead de creación/lectura. Decisión pendiente; ver "Discusión: fields vs edges para Type y Pillar" más abajo.

- **`part_of`** sustituye a `parentNoteId` de Mongo. Es importante: ahora una `Task` puede ser `PART_OF` un `Project`, un `Project` puede ser `PART_OF` un `Area`, y todo eso se traversa en una query (`->part_of->note->part_of->note`).

- **`blocked_by`, `mentions`, `supports`, `refutes`, `about`** son los edges argumentativos / operativos. Son los que matan el `relatedNoteIds[]` de la v1.

- **`authored_by`** apunta a un nodo de tipo `person` — que técnicamente sigue siendo un `Note` con `type=person`. La distinción `FROM note TO note` se mantiene a nivel SurrealDB; el "tipo" Person lo aporta la propiedad del nodo, no la tabla.

## Edge con properties (ejemplo `blocked_by`)

```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD since   ON blocked_by TYPE datetime DEFAULT time::now();
DEFINE FIELD reason  ON blocked_by TYPE option<string>;
DEFINE FIELD blocker ON blocked_by TYPE option<record<person>>;
```

Lectura: una relación `blocked_by` entre dos `Note` puede llevar consigo:

- `since`: cuándo se bloqueó (default = ahora).
- `reason`: texto libre explicando por qué.
- `blocker`: opcionalmente, un puntero a una `Person` (record-link a la tabla `person`, que en nuestro caso es la subset de `note` con `type=person`).

Cuando se crea:

```surql
RELATE note:task_a -> blocked_by -> note:task_b SET
  reason  = 'esperando aprobación de presupuesto',
  blocker = person:juan;
```

El motor:

1. Verifica que `note:task_a` existe y es del tipo `note` (FROM permitido).
2. Verifica que `note:task_b` existe y es del tipo `note` (TO permitido).
3. Aplica los defaults (`since = time::now()`).
4. Valida tipos de los fields opcionales.
5. Crea la fila en la tabla `blocked_by`.

**Si tratas de crear `blocked_by` FROM `pillar:ethos`, la BBDD rechaza la operación**. No es validación en código del cliente — es enforcement del schema. Eso es lo que MongoDB no podía dar limpiamente.

## Aclaración importante sobre la aridad de los edges

Hay una afirmación que conviene precisar (corrige una imprecisión anterior).

**Un edge en SurrealDB conecta exactamente 2 nodos: un `FROM` y un `TO`**. Es binario por construcción.

**Pero** un edge puede tener **properties** que sean `record<otra_tabla>` apuntando a otros nodos. Como en el ejemplo de `blocked_by.blocker`: la property `blocker` apunta a un nodo `person`, pero **esa persona no es un participante simétrico de la relación**. La relación sigue siendo `(task_a, task_b)`. La `Person` es información cargada por el edge, no un extremo de la arista.

**Topológicamente, el edge sigue siendo binario**. Si necesitas una relación N-aria genuina — es decir, una relación donde N nodos son **participantes simétricos** — la solución estándar es la **reificación**.

## Reificación: cuando necesitas relaciones N-arias genuinas

**Reificar** una relación significa **convertir la relación misma en un nodo** y conectar a cada participante con un edge binario al nuevo nodo.

### Ejemplo concreto

Pongamos que queremos modelar: "una reunión donde **Alice fue hostess**, **Bob y Carlos asistieron**, **sobre el Project Mileto**".

Esto es una relación cuaternaria: cuatro nodos (Alice, Bob, Carlos, Mileto) participan en algo conjunto (la reunión). No se puede expresar limpiamente con edges binarios sin "una de las cuatro" hacer de pivote.

Reificación: hacemos de la reunión un nodo.

```surql
CREATE meeting:m1 SET
  topic = 'review semanal Mileto',
  date  = d'2026-05-15';

RELATE person:alice  -> hosted   -> meeting:m1;
RELATE person:bob    -> attended -> meeting:m1;
RELATE person:carlos -> attended -> meeting:m1;
RELATE meeting:m1    -> about    -> project:mileto;
```

Ahora cada participante (Alice como hostess, Bob/Carlos como attendees, Mileto como tema) tiene su propio edge al nodo central `meeting:m1`. Ese nodo central es la "cosa" que los reúne. Cada edge tiene su propio tipo (`hosted`, `attended`, `about`), lo cual da semántica clara a cada participación.

### Por qué reificar es elegante

- **Es equivalente matemático a una hyperedge**. Una hyperedge `(alice, bob, carlos, mileto)` con etiquetas `(hosted, attended, attended, about)` se factoriza en cuatro edges binarios apuntando al nodo reificado.

- **El nodo reificado puede tener properties propias** (fecha, lugar, duración) — lo cual no podría tener una hyperedge "pura" sin meterse en complicaciones.

- **El nodo reificado puede ser sujeto de otras relaciones**: una `meeting:m1` puede a su vez ser `BLOCKED_BY` otra meeting, `MENTIONS` algunas Notes, etc.

- **Es legible**: cuando alguien lee el schema, "meeting" es claramente una entidad. El hecho de que sea una relación reificada se infiere del patrón ("muchos edges entran aquí, ninguno sale"), pero no necesita explicación especial.

### Cuándo conviene reificar

- Cuando hay **más de dos participantes** en una relación.
- Cuando la relación misma tiene **muchas properties** o estructura compleja.
- Cuando la relación va a ser **referenciada por otras relaciones**.

Cuándo **no** conviene reificar (mantener edge binario):

- Relaciones simples 1-a-1 o 1-a-N con poca metadata (e.g., `MENTIONS`).
- Cuando solo necesitas saber "A se relaciona con B con tal tipo".

Más sobre la teoría de hyperedges y por qué los grafos binarios son suficientes vía reificación: [../06-theory/hypergraphs-foundations.md](../06-theory/hypergraphs-foundations.md).

## Discusión: fields vs edges para Type y Pillar

Decisión abierta para el pivote a SurrealDB: `OF_TYPE` y `TOUCHES_PILLAR` ¿deben ser edges, o deben quedarse como fields directos sobre `Note`?

**Como field** (heredado de v1):

```surql
DEFINE FIELD type    ON note TYPE option<record<note_type>>;
DEFINE FIELD pillars ON note TYPE array<string> ASSERT $value INSIDE ['PATHOS_SOMA', 'ETHOS', 'TELOS', 'SOPHIA'];
```

**Como edge**:

```surql
DEFINE TABLE of_type        TYPE RELATION FROM note TO note_type SCHEMAFULL;
DEFINE TABLE touches_pillar TYPE RELATION FROM note TO pillar    SCHEMAFULL;
```

| Aspecto | Como field | Como edge |
|---|---|---|
| Lectura barata | sí (acceso directo) | requiere traversal |
| Escritura | una sola operación | tantas operaciones como tipos/pilares |
| Uniformidad con resto del grafo | rompe el patrón | encaja |
| Queries de grafo (`->of_type->note_type`) | no aplica | natural |
| Properties en el edge (e.g., `assignedAt`, `confidence`) | imposible | trivial |

**Posición provisional**: `type` como **field** (porque es 0..1, lectura constante, y el `note_type` es un árbol que casi nunca cambia para una Note dada). `pillars` también como **field** (porque son enum + array, no entidad real con identidad). Si en algún momento hace falta capturar "cuándo se asignó este pilar" o "con qué confianza", entonces se promueve a edge.

Esa decisión se confirma cuando se cierre el deep-dive de SurrealDB: ver [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md).

## Diagrama de un subgrafo típico

Pongamos: tenemos un Project Mileto (`project:mileto`), con dos Tasks (`note:task-a`, `note:task-b`), una de las cuales está bloqueada, y una Idea (`note:idea-x`) que respalda la dirección. La estructura:

```
project:mileto ←─[part_of]── note:task-a
                              ↑
                              │ [blocked_by]
                              │ {since, reason}
                              │
note:idea-x ──[supports]→ note:task-b
                              ↓
                              [touches_pillar]
                              ↓
                          pillar:telos
```

Cada flecha es un edge tipado. Cada edge tiene `FROM` y `TO` validados. Algunas tienen properties (e.g., `blocked_by` lleva `since` y `reason`). Una query de "qué bloquea a las tasks del Project Mileto" recorre `project:mileto <-part_of<- note <-blocked_by<- note` y devuelve los bloqueadores.

## Queries de ejemplo

### Notas activas que tocan el pilar Éthos

```surql
SELECT * FROM note
WHERE state = 'ACTIVE'
  AND 'ETHOS' INSIDE pillars;
```

(si `pillars` es field) o:

```surql
SELECT * FROM note
WHERE state = 'ACTIVE'
  AND ->touches_pillar->pillar.slug = 'ETHOS';
```

(si `touches_pillar` es edge).

### Tasks de un Project, bloqueadas

```surql
SELECT * FROM note
WHERE state = 'WAITING'
  AND ->part_of->note.id = project:mileto;
```

Lectura: "selecciona notas con estado WAITING tales que su edge `part_of` apunta a `project:mileto`".

Alternativa para obtenerlas desde el Project:

```surql
SELECT <-part_of<-note.*
FROM project:mileto;
```

"Devuelve las Notes que tienen un edge `part_of` apuntando a este Project".

### Notas que mencionan o son mencionadas por X

```surql
SELECT array::union(
  ->mentions->note,
  <-mentions<-note
) AS mentioned_with
FROM note:abc;
```

Esto devuelve la unión de "lo que `note:abc` menciona" y "lo que menciona a `note:abc`". El operador `array::union` deduplica.

### Subgrafo conexo desde un Project, hasta 2 saltos

```surql
SELECT id, ->?->note.* AS hop1, ->?->?->note.* AS hop2
FROM project:mileto;
```

`?` matchea cualquier tipo de edge. Útil para "vecindario" de un nodo en un report narrativo.

### Cadena de bloqueos

```surql
SELECT id, ->blocked_by->note.id AS blocker
FROM note
WHERE state = 'WAITING';
```

Devuelve para cada nota waiting, qué la bloquea. Si quisieras la **cadena completa** (waiting → blocker → blocker → ...) usas recursión, que SurrealDB soporta vía `RELATE` recursive o vía paths con repetición.

### Report semanal por Pillar

```surql
SELECT
  pillar,
  count() AS total,
  count(state = 'ACTIVE')  AS active,
  count(state = 'WAITING') AS waiting,
  count(state = 'DONE')    AS done
FROM (
  SELECT *, array::flatten(pillars) AS pillar FROM note
  WHERE updatedAt > time::now() - 7d
)
GROUP BY pillar;
```

(asumiendo `pillars` como field array). Esto genera la base numérica del informe semanal: cuántas notas tocan cada pilar y en qué estado están.

## La propiedad invisible: el motor te protege

Vale la pena re-enfatizar lo central: con SurrealDB y schemafull edges, **el motor te impide** crear relaciones semánticamente erradas.

Si un agente intenta `RELATE pillar:ethos -> blocked_by -> note:task_x`, la BBDD rechaza. Si intenta `RELATE note:task_a -> touches_pillar -> note:task_b`, la BBDD rechaza (porque `TO` debe ser `pillar`, no `note`).

Esto es lo que justifica la fricción de redefinir el schema cada vez que aparece un edge type nuevo. La fricción **paga** porque cada agente futuro, cada script de import, cada query exploratoria, vive dentro de las garantías que el motor enforza. No hay que confiar en que el código lo haga bien — el motor lo hace bien.

## Bidireccionalidad y la sintaxis `<-edge<-`

Una de las propiedades más útiles de los edges en SurrealDB es que **las queries son bidireccionales por construcción**. La sintaxis:

- `->edge->target` — sigue el edge en su dirección natural (de FROM a TO).
- `<-edge<-source` — sigue el edge en reversa (de TO a FROM).

Esto significa que **no hace falta escribir a ambos lados de la relación**. En Mongo, si querías "todas las notas que mencionan a X" era una query con `relatedNoteIds: { $in: [...] }` que escaneaba todas las notas. En SurrealDB, `SELECT <-mentions<-note FROM note:x` recorre el índice de la tabla `mentions` apuntando a `x` — coste proporcional al fan-in, no al tamaño de la colección.

## Cuándo borrar edges vs marcarlos como históricos

Una pregunta de diseño que aparecerá: cuando una `Note` pasa de `WAITING` a `ACTIVE` (se desbloquea), ¿qué hacemos con el `BLOCKED_BY` que la tenía bloqueada?

Dos opciones:

1. **Borrar el edge**. El grafo refleja solo el estado actual. Histórico se pierde.
2. **Marcarlo como histórico**, e.g., añadir `resolvedAt: datetime` al schema y filtrar `WHERE resolvedAt IS NULL` en queries de "qué está bloqueado ahora".

Sin decisión cerrada todavía. La opción 2 cuesta poco y permite reports tipo "esta semana se desbloquearon estas 3 tasks, que estuvieron bloqueadas N días en promedio". La opción 1 es más limpia pero pierde audit. La política puede ser: por defecto borrar, salvo para edges `BLOCKED_BY` y `REFUTES` donde sí guardamos histórico.

Esta es una de las áreas donde el changefeed nativo de SurrealDB también puede aportar (cambios atómicos sobre cualquier tabla quedan registrados). Ver [self-critique.md](./self-critique.md#6-sin-noterevision-audit-trail).

## Resumen

1. El pivote de Mongo a SurrealDB convierte `relatedNoteIds[]` plano en **edges tipados** con `FROM` y `TO` schemafull.
2. Las relaciones tienen **properties tipadas** propias (e.g., `blocked_by.since`, `blocked_by.reason`).
3. Cada edge sigue siendo **binario por construcción**. Las properties pueden ser record-links a otros nodos, pero no son participantes simétricos.
4. Para relaciones **N-arias genuinas**, se **reifica**: la relación se convierte en un nodo conectado a sus N participantes con edges binarios.
5. El motor **enforza** qué relaciones están autorizadas. No es validación en código.
6. Queries de grafo son **bidireccionales por construcción**: `->edge->` y `<-edge<-` son ambas baratas.
7. Decisiones pendientes: `Type` y `Pillar` como fields vs edges. Política de borrado vs marcado histórico para edges resueltos.

## Cross-references

- [topology-as-primary.md](./topology-as-primary.md) — el principio que justifica este diseño
- [note-model.md](./note-model.md) — la entidad nodo
- [pillars-and-states.md](./pillars-and-states.md) — los enums
- [self-critique.md](./self-critique.md) — trade-offs vivos
- [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md) — por qué se pivotó
- [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md) — detalle del motor
- [../06-theory/hypergraphs-foundations.md](../06-theory/hypergraphs-foundations.md) — teoría de hyperedges
- [../06-theory/declarative-db-as-ontology.md](../06-theory/declarative-db-as-ontology.md) — el schema como ontología
