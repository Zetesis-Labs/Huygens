# Anatomía de una `Note`

`Note` es la entidad central de Huygens. **Casi todo es una Note de algún tipo**: tasks, projects, areas, routines, reports, persons, references, e incluso las "notas" en el sentido coloquial. Este fichero describe el modelo campo a campo, las decisiones de diseño que lo llevaron a esta forma, y los matices que cambian al migrar de MongoDB (v1) a SurrealDB (v2).

## Schema actual (Prisma sobre MongoDB)

El schema vivo en el repo está en `apps/mcp/prisma/schema.prisma`. Resumido:

```prisma
model Note {
  id             String     @id @default(auto()) @map("_id") @db.ObjectId
  title          String
  content        String                       // markdown completo
  typeId         String?    @db.ObjectId      // opcional — captura sin tipo
  type           NoteType?  @relation(...)
  pillars        Pillar[]                     // dimensiones ortogonales
  state          NoteState  @default(INBOX)
  parentNoteId   String?    @db.ObjectId
  parent         Note?      @relation("NoteHierarchy", ...)
  children       Note[]     @relation("NoteHierarchy")
  relatedNoteIds String[]   @db.ObjectId      // se eliminará en SurrealDB
  metadata       Json?
  sourceKind     String?
  sourceRef      String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  lastReviewedAt DateTime?
  chunks         NoteChunk[]
}
```

Y la tabla complementaria de chunks (para búsqueda vectorial):

```prisma
model NoteChunk {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  noteId         String   @db.ObjectId
  note           Note     @relation(...)
  chunkIndex     Int
  content        String
  embedding      Float[]
  embeddingModel String
  dimensions     Int
  createdAt      DateTime @default(now())
}
```

Las secciones siguientes describen cada campo y por qué está como está.

## Por campo

### `id`

`ObjectId` de Mongo. Va a cambiar a `record<note>` en SurrealDB (un identificador con prefijo de tabla, `note:abc123`). El comportamiento conceptual es el mismo: identificador opaco, no significativo. No se reusa, no se reordena.

### `title`

String corto. Por convención, **una sola línea**, no markdown. El agente puede generar el title a partir del contenido cuando la captura llega sin él (a menudo lo hará: notas de voz transcritas no traen título).

Sin constraint de longitud en el schema; en la práctica el agente apuntará a <100 chars. Hacer un title-de-tochos es trabajo del agente, no del modelo.

### `content`

Markdown completo. Es el **payload textual** principal de la nota. Aquí van los tochos, las reflexiones, los snippets, el detalle del project, el meeting note, etc.

Sin tamaño máximo. Para notas muy largas, la búsqueda vectorial **no** se hace sobre `content` directamente — se hace sobre los `NoteChunk` derivados. Ver más abajo.

### `typeId` y `type`

Relación opcional al árbol `NoteType`. **Opcional es deliberado**: una nota recién capturada todavía no está categorizada. La transición de "capturé esto" a "esto es un task / project / reference / ..." la hace el agente o el usuario al clarificar.

En SurrealDB esta relación se mantendrá conceptualmente; la implementación concreta (campo `type: record<note_type>` o edge `OF_TYPE`) se discute en [relations-and-edges.md](./relations-and-edges.md).

### `pillars`

`Pillar[]`: array de uno o varios pilares estratégicos. Detalle en [pillars-and-states.md](./pillars-and-states.md).

Array porque los pilares son **ejes ortogonales**, no categorías excluyentes. Una nota sobre "programación funcional aplicada a meditación" toca `SOPHIA` y `PATHOS_SOMA`. Permitir array vacío para las notas que honestamente no tocan ningún pilar (lista de la compra, recordatorio operativo trivial).

### `state`

`NoteState`: el estado GTD de la nota. Default `INBOX`. Las transiciones canónicas están en [pillars-and-states.md](./pillars-and-states.md).

Indexado: `@@index([state])` permite filtrar el inbox o las waiting en una sola query.

### `parentNoteId` / `parent` / `children`

Relación jerárquica self-referencial. Sirve para árboles de tipo Project → Tasks, Area → Projects, Report → sub-secciones.

Esta relación se modela en Mongo como FK auto-referencial. En SurrealDB pasará a ser un edge tipado `PART_OF` (FROM note TO note). La razón: "parent" es ambigua semánticamente. Si una Task tiene un parent Project pero también `MENTIONS` otro Project ¿cuál de los dos es "padre"? El edge `PART_OF` deja claro qué relación es de composición vs cuáles son de otro tipo.

### `relatedNoteIds`

Array de `ObjectId` de Mongo, sin tipo ni dirección. **Este campo se elimina en SurrealDB**. Toda relación entre Notes se expresa como un edge tipado (`MENTIONS`, `SUPPORTS`, `REFUTES`, `BLOCKED_BY`, ...).

Este fue probablemente el campo que disparó el pivote completo de BBDD: al implementarlo en Mongo se hizo evidente que las "relaciones cruzadas" sin tipo no aguantarían los informes que se quieren generar. Detalle en [self-critique.md](./self-critique.md#3-relatednotids-unidireccional-sin-semántica-resuelto).

### `metadata` (Json)

**Bag tipo-específico**. La estrategia del modelo es: una única entidad `Note`, y los campos que varían por type (Report tiene fechas de periodo, Person tiene email, Reference tiene url) viven en `metadata Json` en vez de columnas separadas por tipo.

Ejemplos:

```jsonc
// Report
{
  "periodStart": "2026-05-13T00:00:00Z",
  "periodEnd":   "2026-05-19T23:59:59Z",
  "coversNoteIds": ["note:abc", "note:def"]
}

// Person
{
  "email":   "x@y.com",
  "role":    "CTO Cliente A",
  "contact": "+34 600 ..."
}

// Reference
{
  "url":        "https://...",
  "sourceKind": "yt"   // "yt" | "article" | "pdf" | "book"
}

// Routine (futuro)
{
  "rrule":       "FREQ=WEEKLY;BYDAY=MO",
  "streakCount": 12
}
```

**Trade-off honesto**: sin validación de schema. El agente podría meter basura aquí sin que la BBDD lo detecte (clave mal escrita, valor de tipo equivocado). Esto se acepta a cambio de **flexibilidad** y **uniformidad**. La mitigación es que las tools del MCP que escriben `metadata` aplican validación con Zod, parametrizada por `type-slug` (las Reports validan `periodStart`, los Persons validan `email`, etc.).

La alternativa rechazada era hacer modelos separados (`Report`, `Person`, `Reference`, ...) con cada uno sus columnas. Eso devolvería type-safety, pero rompe la uniformidad: cada modelo necesitaría su propio pipeline de embeddings, su propio mecanismo de relación, su propia tabla en el grafo. La unicidad de `Note` es lo que permite que el grafo tenga un solo tipo de nodo principal.

### `sourceKind` y `sourceRef`

Trazabilidad: de dónde salió esta nota.

```
sourceKind: 'chat' | 'voice' | 'agent' | 'manual' | 'import'
sourceRef:  id de sesión, path de fichero, url, ...
```

`sourceKind` es `String` y no `enum` por anticipar nuevos source kinds futuros sin migración. Es una inconsistencia honesta con el resto de los enums (`Pillar`, `NoteState`); ver [self-critique.md](./self-critique.md#9-sourcekind-como-string-no-enum).

### Timestamps

- `createdAt`: auto, no se modifica.
- `updatedAt`: auto, Prisma lo actualiza en cada save.
- `lastReviewedAt`: cuándo el agente o el usuario "miró" esta nota conscientemente. **No es lo mismo que `updatedAt`**: una nota se puede actualizar mecánicamente (regeneración de chunks, retag de pilares) sin que nadie la haya "revisado". `lastReviewedAt` lo escribe el agente cuando trata la nota como input de un workflow de review (weekly review, inbox processing, etc.).

Este campo es crítico para el weekly review: "dame todas las notas activas que no he revisado en > 7 días" se traduce a:

```ts
WHERE state IN ('ACTIVE', 'WAITING') AND lastReviewedAt < NOW() - 7d
```

### `chunks`

Relación a `NoteChunk[]`. La búsqueda vectorial vive aquí, no en `Note`. Detalle en la sección dedicada más abajo.

## Por qué uniformidad: todo es Note

Esta es probablemente la decisión más fuerte del modelo, y conviene defenderla explícitamente.

**Las alternativas posibles** eran:

| Estrategia | Pros | Contras |
|---|---|---|
| Una tabla `Note` única con `type` y `metadata Json` (la elegida) | Una sola colección, queries uniformes, un único pipeline de embeddings, un mismo grafo | Pierdes type-safety en `metadata` |
| Tablas separadas (`Task`, `Project`, `Report`, `Person`, `Reference`) | Type-safety estricta, columnas dedicadas | N colecciones, N pipelines, edges entre tablas distintas, queries con `UNION` |
| Tablas con herencia (STI) | Type-safety + uniformidad parcial | Complica el ORM, no funciona limpio en Mongo |

Se eligió la primera por una razón concreta: **el grafo es el ciudadano de primer orden**. Si tienes tablas separadas, cada edge entre `Project` y `Task` tiene que saber que ambos son "Notes" en cierto sentido — y lo termina sabiendo via discriminator o via tabla `Note` superior, que es lo que se eligió de entrada.

**Casos concretos donde la uniformidad paga**:

- Un `Report` es una `Note` con `type=report`. Puedes embedder su contenido, buscar por similitud semántica, y conectarlo con edges como cualquier otra Note. Si fuese una tabla aparte, tendrías que duplicar el pipeline de embeddings.
- Una `Person` es una `Note` con `type=person`. Su `content` puede ser un perfil markdown ("Juan, CTO de Cliente A. Le interesa la arquitectura distribuida. Última conversación: ..."). Si quieres buscar "esa persona del fintech que hablaba de DDD", la búsqueda vectorial funciona porque el embedding existe.
- Un `Project` es una `Note` con `type=project`. Tiene tasks como `children` o como `PART_OF`. Tiene un brief en `content`. Tiene una sección de "decisiones tomadas". Todo eso es markdown, todo eso es embedable.

**El trade-off conocido**: la "shape" de un Project, un Report y una Person solo varía por `metadata`. No hay validación a nivel BBDD de qué claves debe tener un Report. Esa validación vive en las tools del MCP. Es un compromiso aceptado.

## Captura sin tipo (decisión importante)

`typeId` es **opcional**. Una nota recién capturada vive con:

```
{ typeId: null, state: INBOX }
```

**"Inbox" NO es un Type, es un State**. Lo capturado es "algo sin categorizar". El acto de llegar al sistema no implica saber qué es. Eso se decide después, cuando el agente o el usuario clarifica.

El agente, al clarificar, asigna `typeId` y cambia state a `CLARIFIED`. A partir de ahí la nota ya pertenece a una categoría editable del árbol `NoteType` y puede ir progresando por estados.

Esta decisión vino **después** de inicialmente seedear "inbox" como Type. El v1 del seed incluía un `NoteType { slug: 'inbox' }`, y al pensarlo se reconoció que era redundancia: ya hay `state=INBOX`, no hace falta `type=inbox`. Tener ambos confundía: ¿una nota clarificada sigue siendo "tipo inbox"? Obviamente no. Se eliminó del seed.

Ver [self-critique.md](./self-critique.md#2-typeinbox-vs-stateinbox-redundancia-resuelto) para la discusión.

## Estados — el ciclo GTD

`NoteState` tiene 7 valores: `INBOX, CLARIFIED, ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED`. Detalle del ciclo, transiciones y queries típicas en [pillars-and-states.md](./pillars-and-states.md).

Aquí solo el resumen:

- **`INBOX`** — capturada, sin procesar.
- **`CLARIFIED`** — procesada, sabemos qué es y qué hacer.
- **`ACTIVE`** — en marcha.
- **`WAITING`** — bloqueada por algo externo.
- **`SOMEDAY`** — no ahora, quizá luego.
- **`DONE`** — completada.
- **`ARCHIVED`** — fuera de circulación.

## Pillars — qué dimensiones toca

`Pillar[]` (no single): una nota puede tocar varios pilares ortogonales. Detalle en [pillars-and-states.md](./pillars-and-states.md) y conceptualmente en [../01-vision/strategic-pillars.md](../01-vision/strategic-pillars.md).

## `NoteType` — árbol editable

Tabla aparte. Cada `NoteType` tiene:

- `slug` (único, e.g. `task`, `project`, `report`)
- `name` (label legible)
- `description` (opcional, texto que explica qué es ese tipo)
- `parentId` (opcional, para anidar — e.g. `project` podría tener un sub-tipo `client-project`)

El árbol es **editable en runtime**. Es decir, el agente o el usuario pueden añadir nuevos types sin necesidad de migración. Esto es importante: el dominio de Rubén va a evolucionar, y forzar migraciones de schema para añadir un tipo nuevo de note es exactamente lo que se quiere evitar.

Seeds iniciales (8): `task, project, area, routine, note, report, person, reference`.

Ver [self-critique.md](./self-critique.md#4-el-type-note-en-el-seed) para una nota crítica sobre por qué tener `note` en el seed es semi-redundante.

## `NoteChunk` — payload de búsqueda vectorial

Tabla aparte. Una Note se chunkea en N pedazos para vector search. Cada chunk:

- `noteId` — apunta al Note origen
- `chunkIndex` — 0, 1, 2, ... ordinal dentro de la Note
- `content` — texto del chunk (la porción del markdown)
- `embedding` — `Float[]` (vector denso)
- `embeddingModel` — string, e.g. `'BAAI/bge-m3'`
- `dimensions` — int, e.g. `1024`

**Por qué chunks y no embeddings sobre Note entera**: las notas largas (tochos, transcripciones, reports) no caben en una sola pasada de embedding (límite de contexto del modelo). Y aunque cupieran, perderías precisión: un embedding sobre 8000 tokens es un promedio sobre todo, lo cual diluye señales locales relevantes.

El chunkeo permite **búsqueda precisa**: buscar "esa frase concreta sobre rendimiento en notas de hace meses" devuelve el chunk específico, no toda la Note de 5000 palabras.

**Regeneración**: el schema asume que los chunks se regeneran cuando `Note.content` cambia. **El pipeline que dispara esa regeneración aún no está implementado**; es un gap conocido. Mitigaciones posibles:

- Hook en el cliente Prisma para v1 Mongo (no se aplicará tras el pivote)
- Trigger `DEFINE EVENT` de SurrealDB para v2
- Cola asíncrona (BullMQ, Bun job runner) que escucha cambios

Ver [self-critique.md](./self-critique.md#7-pipeline-de-regeneración-de-notechunk).

El índice vectorial `$vectorSearch` (Mongo Atlas) o `DEFINE INDEX ... MTREE / HNSW` (SurrealDB) se crea aparte. Prisma no lo gestiona.

## Migración a SurrealDB — qué cambia

El **modelo conceptual no cambia**. Una `Note` sigue siendo `Note`. Los pilares siguen siendo pilares. Los estados siguen siendo estados. Lo que cambia es **cómo se expresa el modelo en el motor**.

| Aspecto | Mongo (v1) | SurrealDB (v2) |
|---|---|---|
| `parentNoteId` | FK self-referencial | edge `PART_OF` con FROM/TO schemafull |
| `relatedNoteIds[]` | array de ObjectIds sin tipo | múltiples edges tipados (`MENTIONS`, `SUPPORTS`, ...) |
| `typeId` | FK opcional | campo `type: option<record<note_type>>` o edge `OF_TYPE` |
| `pillars[]` | array enum | campo `array<string>` o edges `TOUCHES_PILLAR` |
| `metadata` | `Json?` | `option<object>` (sigue siendo schemaless por elección) |
| Búsqueda vectorial | `$vectorSearch` sobre `NoteChunk` | `DEFINE INDEX ... MTREE` sobre `note_chunk.embedding` |
| Timestamps | Prisma auto | `time::now()` con `DEFAULT` y `VALUE` clauses |
| Validación de FROM/TO en relaciones | en código TS | en el motor (schemafull) |

Para el detalle de cómo se modelan las relaciones en SurrealDB, ver [relations-and-edges.md](./relations-and-edges.md). Para el detalle de por qué se pivotó, ver [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md).

## Resumen

1. `Note` es la entidad central. Casi todo en Huygens es una Note de algún tipo.
2. **Uniformidad** es la decisión clave: una sola tabla, una columna `type` opcional, `metadata Json` para campos tipo-específicos.
3. **Captura sin tipo** es deliberada: `typeId=null + state=INBOX` modela "algo sin categorizar".
4. `NoteState` y `Pillar[]` son las clasificaciones primarias. `Pillar` es array porque son ejes ortogonales.
5. La búsqueda vectorial vive en `NoteChunk`, no en `Note`. Chunks regenerados desde `content`.
6. La migración a SurrealDB no cambia el modelo conceptual; cambia cómo se expresan las relaciones — pasan de FKs/arrays a edges tipados schemafull.
