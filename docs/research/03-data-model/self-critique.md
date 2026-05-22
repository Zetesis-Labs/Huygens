# Autocrítica del modelo de datos

Durante el diseño del modelo de datos de Huygens se identificaron varias decisiones que **merecen cuestionamiento**. Algunas se resolvieron antes de llegar a este punto. Otras siguen siendo **trade-offs vivos**: compromisos aceptados conscientemente, no errores. Otras son **gaps reconocidos**: cosas que sabemos que faltan o que están a medio resolver.

Este fichero las lista todas, honestamente. La razón de documentarlas es doble:

1. **Honestidad de diseño**: el modelo no es perfecto y es importante reconocerlo. Vender certezas que no se tienen daña la confianza en el resto de la documentación.
2. **Memoria operativa para el futuro**: si en seis meses algo duele, hay un registro de "lo sabíamos, lo asumimos por estas razones".

Cada punto incluye: **problema**, **trade-off o razón**, **mitigación si la hay**, **estado** (resuelto / trade-off vivo / gap reconocido).

---

## 1. `metadata Json` como saco tipo-específico

**Problema**. El modelo elegido es una única tabla `Note` con un campo `metadata Json?` para las propiedades específicas de cada tipo (Person tiene `email`, Reference tiene `url`, Objective puede tener `target_date`). Ese campo es **schemaless**: no hay validación a nivel de BBDD de qué claves debe tener una Reference ni de qué tipo deben ser sus valores. Un agente podría meter `metadata = { urll: '...' }` (con typo) o `metadata = { email: 12345 }` (tipo equivocado) y la BBDD no se inmutaría.

**Trade-off**. Flexibilidad y uniformidad vs validación estricta. La alternativa estricta sería tablas separadas (`Person`, `Reference`, `Objective`, ...) con columnas dedicadas — type-safety total, pero rompe la uniformidad central del modelo: ya no habría una sola colección `Note`, ya no habría un único pipeline de embeddings, los edges del grafo tendrían que conocer más de un tipo de nodo.

**Mitigación**. Validación en las **tools del MCP** con Zod. Cada tool que escribe `metadata` valida la shape contra un schema parametrizado por `type-slug`: `notes.create.type=reference` valida `{ url, source }`. `notes.create.type=person` valida `{ email, role, contact }`. Esto centraliza la validación en el ingreso (las tools) en vez de descentralizarla por toda la BBDD.

**Honestidad adicional**. La validación en tools NO cubre 100% de casos: scripts de seed, imports manuales vía la consola de Surreal, mutaciones de mantenimiento — todo eso puede escribir directo y saltarse Zod. Es un riesgo asumido. La política sugerida es: **canal único de escritura = MCP tools**. Si en algún momento alguien quiere modificar metadata fuera de eso, asume el riesgo de invariantes rotos.

**Estado**. **Trade-off vivo**, aceptado por ahora.

---

## 2. `relatedNoteIds[]` unidireccional sin semántica (RESUELTO)

**Problema**. En la v1 (Mongo + Prisma), las relaciones cruzadas entre Notes vivían como `relatedNoteIds: ObjectId[]` — un array plano de IDs. **Sin tipo de relación, sin dirección semántica**. La relación "Note A menciona a Note B" y "Note A está bloqueada por Note B" eran indistinguibles a nivel de schema.

**Síntomas**:

- Para distinguir tipos de relación había que meterlos en `metadata.relations: { mentions: [...], blockedBy: [...], supports: [...] }`. Eso convertía `metadata` en doble responsabilidad: tipo-específica + relaciones.
- Las queries de grafo (e.g., "qué notas mencionan o son mencionadas por X") requerían `$graphLookup` lento y poco expresivo.
- La validación FROM/TO (qué entidades pueden estar conectadas con qué edge) tenía que vivir en código TypeScript, ~80 líneas de helpers de validación previa a escritura.

**Resolución**. **Pivote completo de BBDD**: de MongoDB a SurrealDB. Las relaciones cruzadas pasan a ser edges tipados con `FROM` y `TO` schemafull, validados por el motor. Detalle del pivote: [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md). Detalle del nuevo modelo: [relations-and-edges.md](./relations-and-edges.md).

**Lección**. Este fue probablemente el momento del proyecto en que se reconoció con claridad: **lo que estamos modelando es una topología, no una base de datos documental**. Esa frase del usuario disparó toda la reorganización del schema, los nodos, los edges, y la documentación entera. Ver [topology-as-primary.md](./topology-as-primary.md).

**Estado**. **Resuelto** vía pivote a SurrealDB.

---

## 3. El Type `note` en el seed

**Problema**. El seed inicial de NoteTypes incluye 8 valores: `task, project, area, routine, note, report, person, reference`. El cuarto valor — **`note`** — es semánticamente extraño. **Toda fila de la colección ya es una Note**. Tener un Type llamado "note" es como una etiqueta "cosa": no clasifica, no aporta información distintiva.

**Síntomas**:

- ¿Una idea suelta capturada y clarificada cuál es su Type? Si pensamos "es una nota", caemos en la tautología.
- Un agente que ve `type=note` no sabe nada que no supiera ya por el hecho de que esté en la tabla `note`.

**Alternativas**:

- Renombrar a algo más específico: `idea`, `reflection`, `free-form`, `journal-entry`.
- Eliminar `note` del seed y dejar que las notas sin un tipo más específico vivan con `typeId=null` o con un fallback como `reference`.
- Mantenerlo como **semi-fallback consciente**: el Type al que el agente asigna cuando "es algo, pero no es claramente un task/project/report/etc.".

**Posición provisional**. Mantenerlo como semi-fallback. La razón pragmática: hay momentos en los que una nota clarificada no es nada más específico que "es un texto que aporta valor". Forzar al agente a elegir entre `reference` (cuando no tiene URL externa) o `task` (cuando no hay acción) generaría peor clasificación.

**Trade-off**. La tautología "nota de tipo nota" persiste, pero contenida. Si en algún momento aparece un naming mejor, se renombra (cambiar el slug es trivial).

**Estado**. **Trade-off vivo**, queda como semi-fallback consciente.

---

## 4. Sin `NoteRevision` (audit trail)

**Problema**. Cuando el agente reescribe una `Note.content` (porque clarifica una transcripción de voz, mejora la redacción, fusiona dos notas), el **texto original desaparece**. Solo queda la última versión.

**Por qué duele**:

- Las notas de voz transcritas son **input bruto** valioso: pueden contener matices que el agente "limpia" pero que en realidad importaban.
- Una "memoria del agente" debería poder volver atrás a la captura original y reinterpretar.
- Si el agente comete un error de reescritura (cambia el sentido), no hay forma de detectarlo después.

**Mitigación posible (no implementada)**:

1. **`CHANGEFEED` de SurrealDB**: SurrealDB tiene una feature nativa de changefeed que registra todas las mutaciones sobre una tabla, con timestamps. Habilitarlo para `note` (especialmente para `content`) permitiría reconstruir history.

   ```surql
   DEFINE TABLE note CHANGEFEED 30d;
   ```

   30 días retención sería un mínimo razonable. Para audit completo, retention indefinida (con coste de almacenamiento).

2. **Tabla `note_revision` explícita** con `noteId, content, createdAt, kind`. Más sencilla de razonar pero requiere hooks en cada escritura.

3. **Append-only sobre `content`**: en vez de sobreescribir, mantener un array de revisiones en `metadata`. Menos elegante.

**Estado**. **Gap reconocido**, candidato a v2. Mientras tanto, si Rubén ve perderse texto importante, se asume el coste. La política provisional: el agente no debería reescribir `content` salvo en clarificación explícita pedida por el usuario.

---

## 5. Pipeline de regeneración de blocks

**Problema**. Los `block` se generan a partir del contenido de un `note` (típicamente un informe), y se asume que **se regeneran** cuando el contenido cambia. Pero **no hay nada en el schema ni en el código que dispare esa regeneración** automáticamente. Si los blocks de un informe se editan a mano vía MCP tools, los embeddings pueden quedar desfasados respecto al texto.

**Síntomas previsibles**:

- Vector search devuelve un block con texto que ya no se corresponde con el contenido actual del informe (porque alguien lo reescribió sin re-embedear).
- Notas modificadas hace tiempo, con embeddings stale, contaminan resultados de búsqueda.

**Mitigación posible (no implementada)**:

1. **Hook en cliente Prisma** (para v1 Mongo): un `$use` middleware que dispare la regeneración asíncrona tras `update`. **No se aplicará tras el pivote** a SurrealDB.

2. **Trigger nativo de SurrealDB**: `DEFINE EVENT` sobre `UPDATE note WHERE $before.content != $after.content` que invoca una función de regeneración. SurrealDB soporta eventos, queda comprobar el detalle (sincronía, capacidad de invocar HTTP externo para el embedding).

3. **Cola asíncrona** (BullMQ, Bun job runner, NATS): el writer publica un mensaje "chunks-regen needed for note:X", un worker lo consume y regenera. Más robusto, más infraestructura.

4. **Marca de dirty**: campo `chunksStale: bool` en `Note`. El cliente que lee chunks comprueba; si stale, fuerza regeneración antes. Pesa cada lectura pero es robusto.

**Política provisional**. En v1 Mongo, los chunks se generan **manualmente** vía script (`apps/mcp/scripts/regenerate-chunks.ts` o similar, a crear) ejecutado periódicamente o tras lotes grandes de actualización. No óptimo, pero acotado.

**Estado**. **Gap reconocido**, candidato a v1 final / v2.

---

## 6. Compound indexes vs single-column

**Problema**. El schema actual tiene `@@index([state])`, `@@index([typeId])`, `@@index([updatedAt])`, `@@index([lastReviewedAt])` — todos single-column. Para un enum de 7 valores como `state`, el índice no aporta mucho: cada bucket contiene ~1/7 de la colección.

**Queries reales** que se beneficiarían de compound indexes:

- `WHERE state = 'WAITING' AND updatedAt < ...` → necesita `@@index([state, updatedAt])`
- `WHERE typeId = 'task' AND state = 'ACTIVE'` → necesita `@@index([typeId, state])`
- Weekly review: `WHERE state IN [...] AND lastReviewedAt < ...` → `@@index([state, lastReviewedAt])`

**Por qué no se hizo**. Optimización prematura sin queries reales medidas. Una vez el sistema esté en uso, se medirán los hot-paths y se añadirán los compound indexes apropiados.

**Honestidad**. Esto solo aplica si la v1 Mongo sigue en producción tiempo suficiente para que importe. Con el pivote a SurrealDB inminente, los índices se redefinirán nativamente y esta cuestión se replantea.

**Estado**. **Optimización pendiente**, no crítica.

---

## 7. `sourceKind` como `String`, no enum

**Problema**. `NoteState` está enforced con `ASSERT $value INSIDE [...]`. `sourceKind` es `String?` libre. Inconsistencia en el modelo: ¿por qué este field puede tener cualquier valor mientras los otros están constrained?

**Defensa**. `sourceKind` anticipa **flexibilidad**. Hoy los kinds son `'chat' | 'voice' | 'agent' | 'manual' | 'import'`. Mañana puede haber `'browser-extension'`, `'mobile-share'`, `'rss-feed'`, `'spotify'`. Forzar migración para cada nuevo source genera fricción innecesaria — el cambio es trivial conceptualmente, no debería requerir cambio de schema.

**Trade-off**. Tipos magic strings sin enforce. El agente o un import podría meter `sourceKind = 'voce'` (typo) y nada lo detectaría.

**Mitigación**. Validación en tools MCP con Zod, lista de kinds conocidos pero **abierta** (`z.union([z.literal(...), z.string()])`).

**Alternativa rechazada**. Convertirlo en `model SourceKind` con tabla propia. Excesivo para algo que es un tag de procedencia.

**Estado**. **Trade-off vivo**, aceptado.

---

## 8. No multi-usuario

**Decisión explícita**. Huygens v1 es **single-user**. Rubén es el único usuario, no hay `userId` en ningún modelo, no hay tenancy. El MCP server vive en local o en una instancia personal.

**Limitación reconocida**. Retrofitar multi-tenant después es **doloroso**: añadir `userId` a cada tabla, a cada query, a cada edge, a cada chunk. Migración de datos no trivial. Es un coste que se asume conscientemente para no pagar complejidad ahora.

**Justificación**. El proyecto es una **memoria operativa personal**. No es un SaaS. Si en algún momento se convierte en uno (o se quiere compartir con otro usuario), se hace migración planificada. Hoy, simplemente no aplica.

**Variante posible**. Multi-tenant ligero por "espacios" (un usuario, varios espacios — personal, profesional, proyecto X). Esto sí se evaluará a futuro, pero no como blocker.

**Estado**. **Decisión consciente**, no es un bug ni un gap. Es alcance.

---

## Por qué documentar la autocrítica

La razón de tener este fichero como parte de la documentación oficial — y no como notas privadas — es triple:

**Honestidad**. El diseño no es perfecto. Pretender que lo es daña la confianza en el resto de la documentación. Cuando aparecen problemas reales en uso, tener un registro de "esto lo asumimos sabiendo el riesgo" es muy distinto de "esto se rompió porque nadie lo pensó".

**Memoria del razonamiento**. Rubén del futuro (en 6 meses, en 2 años) puede leer esto y entender **por qué** está el modelo como está. Sin esto, una decisión que parece arbitraria invita a deshacerla — perdiendo el razonamiento original que sí era válido.

**Disciplina de diseño**. Forzarse a escribir "qué trade-offs estoy aceptando" durante el diseño es una herramienta de pensamiento crítico. Aparecen agujeros que de otro modo se ignorarían.

---

## Resumen ejecutivo de estado

| # | Tema | Estado |
|---|---|---|
| 1 | `metadata Json` sin validación | Trade-off vivo (mitigado por Zod en tools) |
| 2 | `relatedNoteIds[]` plano | **Resuelto** (pivote a SurrealDB) |
| 3 | Type `note` semi-redundante | Trade-off vivo (queda como fallback) |
| 4 | Sin `NoteRevision` (audit) | **Gap reconocido**, candidato a v2 |
| 5 | Pipeline de regeneración de blocks | **Gap reconocido**, candidato a v1 final |
| 6 | Compound indexes | Optimización pendiente, no crítica |
| 7 | `sourceKind` String libre | Trade-off vivo, aceptado |
| 8 | Single-user | Decisión consciente, alcance |

Un resuelto. Dos gaps reconocidos con candidatos claros de solución. Cuatro trade-offs vivos, aceptados con razón. Una decisión consciente de alcance.

## Cross-references

- [topology-as-primary.md](./topology-as-primary.md) — el principio que disparó la resolución de #2
- [relations-and-edges.md](./relations-and-edges.md) — la resolución técnica de #2
- [../../MODEL.md](../../MODEL.md) — modelo canónico actual
- [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md) — el contexto del pivote
- [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md) — detalle del nuevo motor
