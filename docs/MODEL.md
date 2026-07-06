# Huygens — Modelo v2.1-lite

> **Documento canónico del *porqué* conceptual** (la epistemología de dos planos
> y la tesis del informe-block). Si otro documento conceptual lo contradice, este
> gana hasta que el otro se actualice.
>
> Reparto de fuentes de verdad (para no duplicar ni driftar):
> - **Cómo debe comportarse el agente** → `apps/mcp/src/lore/operating-doctrine.md`
>   (recurso `huygens://lore/operating-doctrine`). Es el SSOT del comportamiento.
> - **Contrato físico vivo** (entidades, edges, ciclo de proposal, tools) →
>   `apps/mcp/src/lore/data-model.md` + `schema.surql`.
> - **Este documento** → el modelo mental y el rationale; ilustra con ejemplos.
>
> El flujo v2.1-lite ya existe en schema/tools; el repo conserva piezas legacy por
> compatibilidad.

## En una frase

Huygens es una memoria personal estructurada: mandas fragmentos al inbox, el
agente los guarda como `raw_capture`, y cuando decides procesar el inbox
discutis esos raws con el agente para producir `block`s narrativos aprobables y
cambios mínimos al grafo de `note`s.

La idea central se conserva: entre el texto literal y la topología debe existir
una pieza interpretativa auditable. En v2.1-lite esa pieza es el
**informe-block**: un `block` con `block_kind = 'narrative'`.

## Flujo objetivo

```text
captura durante el dia
  -> inbox de raw_capture
  -> sesion deliberada de procesamiento
  -> uno o varios blocks narrativos aprobados
  -> propuestas visibles de mutaciones
  -> commit al grafo
```

La captura es ligera; el procesamiento es deliberado. El inbox existe para no
forzar interpretacion inmediata.

1. **Captura**. El agente conversacional llama `capture` y guarda la evidencia
   literal en `raw_capture`. No clasifica ni crea topología.
2. **Procesamiento del inbox**. Cuando el usuario dice "procesemos el inbox",
   el agente lista raws pendientes y los discute con el usuario. Puede agrupar
   varios raws relacionados en un mismo informe-block.
3. **Síntesis**. El agente propone uno o varios `block`s narrativos breves. El
   usuario puede aceptarlos, pedir cambios, ignorar raws o dejarlos diferidos.
4. **Propuesta**. El agente muestra qué `note`s crearía o actualizaría y qué
   edges mínimos usaría.
5. **Commit**. Tras aprobación, el MCP persiste el block narrativo, los cambios
   en `note`, los edges y la traza `affects`.

No hay worker autónomo topologizando sin revisión en esta fase.

## Roles

| Actor | Responsabilidad | No hace en v2.1-lite |
|---|---|---|
| Usuario | Mandar fragmentos al inbox, pedir sesiones de procesamiento, aprobar interpretaciones y cambios estructurales. | Pensar en SurrealQL ni mantener el grafo a mano. |
| Agente conversacional | Interfaz principal. Captura raws, ayuda a procesar el inbox, propone informe-blocks y propuestas de mutación. | Escribir topología compleja sin aprobación visible. |
| MCP Huygens | Frontera de persistencia y validación. Expone tools estrechas. | Ser un agente autónomo ni tomar decisiones de dominio. |
| SurrealDB | Persistencia de documento, grafo, vector y audit. | Lógica de interpretación. |
| Worker Python | Futuro worker especializado conectado al MCP. | Ser la interfaz conversacional principal ni procesar inbox por polling. |

El usuario habla con Claude Code, Codex, Hermes u otro agente conectado al MCP.
El MCP es el producto estable; el agente conversacional es un cliente.

## Modelo mental

No hace falta teoría de grafos para operar Huygens. Usa estas tres categorías:

```text
Nodo  = cosa con identidad
Edge  = frase navegable entre dos cosas
Field = dato interno que solo quieres leer o filtrar
```

Reglas prácticas:

```text
Si quieres navegarlo: edge.
Si solo quieres leerlo o filtrarlo: field.
Si explica causalidad: edge con metadata.
Si no sabes para que query sirve: no lo metas todavia.
```

Ejemplos:

```text
Task "Enviar propuesta" part_of Project "Govoy"
Task "Seguimiento Stripe" blocked_by Task "Esperar respuesta de Stripe"
Block narrativo "Govoy esta bloqueado por Stripe..." about Project "Govoy"
Block narrativo "Govoy esta bloqueado por Stripe..." affects Task "Seguimiento Stripe"
Block narrativo "..." derived_from Raw conversation
```

## Entidades minimas

### `raw_capture`

Evidencia literal. Es inmutable para uso normal. El conjunto de raws pendientes
es el inbox semántico: un buffer de captura sin interpretacion inmediata.

```text
raw_capture {
  id
  content
  source_kind   // chat | voice | manual | import | agent-self
  source_ref?
  status        // pending | processed | ignored | deferred
  created_at
  processed_at? // legacy/compatibilidad
}
```

Un raw puede quedarse sin sintetizar. Los captures pequeños no tienen que pasar
por todo el flujo. Un informe-block puede derivar de varios raws si durante la
sesion de procesamiento se descubre que pertenecen al mismo asunto.

La fuente de verdad del inbox es `status`. `processed_at` se mantiene solo como
compatibilidad legacy y se rellena al marcar un raw como `processed`.

### `note`

Entidad topológica tipada: cosas que haces, persigues, mantienes, piensas o
referencias.

```text
note {
  id
  type               // area | objective | project | task | idea | reference | agent | tool
  title
  state              // ACTIVE | WAITING | SOMEDAY | DONE | ARCHIVED
  block_order        // blocks descriptivos que forman su cuerpo
  mit_for?           // option<datetime> — MIT (Most Important Task) para ese día (ADR-0023)
  due_at?            // option<datetime> — deadline duro (indexed)
  defer_until?       // option<datetime> — tickler: oculto del radar hasta ese día (indexed)
  metadata?
  source_kind?       // para notas que no vienen de raw_capture
  source_ref?
  created_at
  updated_at
}
```

Los estados son ZTD como field; el default de una note nueva es `ACTIVE`. La
matriz type↔state y los guardarraíles de metadata se especifican en
[`HUYGENS-2-FUNCTIONAL-SPEC.md`](./HUYGENS-2-FUNCTIONAL-SPEC.md), la autoridad del
grafo operativo Huygens 2. Los slugs son en inglés (`objective`, `agent`, `tool`);
la revisión ya no es un field (`last_reviewed_at` retirado) sino un evento de
proposal/ritual.

`mit_for` es campo top-level indexado (no `metadata`). Convención ZTD: 1-3 MITs
por día decididos por el usuario; el agente no los marca autonomamente. Un valor
fecha-solo (`YYYY-MM-DD`) se persiste a medianoche UTC del día. **No se borra
automáticamente** al pasar el día: una MIT vencida y no resuelta sigue visible
(en ámbar) hasta que el usuario la dispone — el punto natural es la siguiente
**jornada** (`kind: day`), que empieza asentando lo colgado.

> Tensión abierta: la jornada permite *soltar* una MIT con `mit_for: null`, lo que
> borra el rastro de que *fue* MIT ese día. Si se quiere preservar histórico de
> MITs, es una decisión de producto pendiente (ligada a due/defer dates). Reglas
> de comportamiento vivas en `operating-doctrine`.

### `block`

Atomo de contenido direccionable y vectorizable.

```text
block {
  id
  content
  embedding?
  embedding_model?
  dimensions?
  block_kind     // descriptive | narrative

  // si descriptive:
  note?

  // si narrative:
  topologized_at?

  created_at
  updated_at
}
```

Un `block` descriptivo es el cuerpo de una `note`. Un `block` narrativo es un
informe-block: una interpretacion breve, aprobada y trazable de un raw.

## Edges operativos (Huygens 2)

Edges **operativos** (la topología del dominio; todos `note -> note`, materializados por commits):

| Edge | Forma | Para que sirve |
|---|---|---|
| `part_of` | `note -> note` | Jerarquia: task/project/area/objective. Padre unico, anchored, aciclico. |
| `blocked_by` | `note -> note` | Dependencias y esperas. Tiene campos `since` y `reason` opcional. |
| `depends_on` | `note -> note` | Dependencia no-bloqueante. |
| `owned_by` | `note -> note` | Responsabilidad/asignacion (el destino deberia ser una note de type `agent`). |
| `relates_to` | `note -> note` | Relacion debil cuando no merece un edge mas especifico (reemplaza `mentions`). |
| `duplicates` | `note -> note` | Declaracion explicita de duplicado. |

Edges **técnicos de traza** (plumbing de proposals/eventos, NO topología del dominio; las tools operativas no los recorren):

| Edge | Forma | Para que sirve |
|---|---|---|
| `derived_from` | `block -> raw_capture` | Probar de que raw o raws salio una interpretacion. Tiene campo `transformation` opcional (`verbatim | extracted | summarized | inferred`). |
| `about` | `block -> note` | Decir sobre que sujetos habla un informe-block. |
| `affects` | `block -> note` | Registrar que cambios causo o justifico el block. Tiene campo `action` obligatorio (`created | updated | state_changed | linked | archived`) y `summary` opcional. |

`relates_to` es el fallback deliberado. Antes de crear un edge nuevo, primero hay
que comprobar que aparece en conversaciones reales y responde a una query real.
`mentions` es una tabla **legacy** (solo compatibilidad de datos antiguos); no la
uses en propuestas nuevas.

`part_of` es de **padre unico** (una note cuelga de una sola). Por eso es
**replace-on-write**: declarar un `part_of` para una note que ya tenia padre
**reemplaza** el anterior — el commit retira el viejo en la misma transaccion
(queda registrado en `proposal.result.edges_removed`). No hace falta declarar la
retirada a mano. Para quitar un `blocked_by`, `depends_on`, `owned_by`,
`relates_to` o `duplicates` (o declarar el reparent de forma explicita para que el
preview lo muestre) se usa `payload.edges_remove`, el inverso de `edges`. Los
trace-edges de procedencia (`derived_from` / `about` / `affects`) son
**append-only**: no se retiran.

Un block narrativo puede tener varios `derived_from` si sintetiza varios raws
del inbox en una sola interpretacion.

Nota: todos los edges operativos son `note -> note`. La relación de un block
narrativo con las notes vive en los trace-edges `about` / `affects`, no en la
topología operativa.

## Fuera de scope por ahora

Estas piezas quedan aparcadas aunque sean compatibles con el modelo grande:

- Worker autonomo que topologiza sin revision (el commit sigue siendo humano).
- `based_on` entre blocks narrativos.
- `supports` y `refutes`.
- `authored_by`.
- Reports como entidad persistida (`note(type=report)`).
- `compose_report` sofisticado.
- Routines con RRULE engine.

El criterio es conservador: v2.1-lite mantiene el informe-block, pero reduce
automatismo y vocabulario.

**Ya enviado (antes fuera de scope):** el **dashboard** (Astro+React, read-only)
existe y visualiza grafo, MITs (con vencidos en ámbar) y la **Bitácora**. Y los
**rituales**: la **jornada** (`kind: day`) — un único informe-block diario que
asienta lo pendiente y orienta el día, *sin* separar plan de cierre (decisión
2026-06-10: la estructura vive en las mutaciones, no en la taxonomía del texto;
los kinds `plan_day`/`review_day` quedaron legacy) — y la **revisión semanal**
(`kind: week`). Ambos reusan el mismo flujo captura→propuesta→commit. Las
reglas de cuándo y cómo invocarlos viven en `operating-doctrine` (no las
repitas aquí).

## Ejemplos

### 1. Inbox como buffer semantico

Durante el dia:

```text
raw 1: Govoy sigue bloqueado por Stripe.
raw 2: Mañana tengo que escribirles.
raw 3: No quiero que Govoy se quede parado por esto.
```

Sesion de procesamiento:

```text
Usuario: procesemos el inbox de hoy.
Agente: estos tres raws parecen el mismo asunto: bloqueo de Govoy por Stripe.
```

Block narrativo:

```text
Govoy esta bloqueado por la integracion con Stripe. Rubén quiere convertir el
seguimiento a Stripe en una task explicita para que el bloqueo no se diluya en
fragmentos sueltos del inbox.
```

Notes afectadas:

```text
Project "Govoy"
Task "Escribir a Stripe sobre integracion"
```

Edges minimos:

```text
block derived_from raw 1
block derived_from raw 2
block derived_from raw 3
block about Project "Govoy"
block affects Project "Govoy"
block affects Task "Escribir a Stripe sobre integracion"
Task "Escribir a Stripe sobre integracion" part_of Project "Govoy"
Project "Govoy" blocked_by Task "Escribir a Stripe sobre integracion"
```

Duda ontologica:

```text
raw_capture necesita status pending | processed | ignored | deferred,
o processed_at basta para v2.1-lite?
```

### 2. Proyecto bloqueado

Usuario:

```text
Acuérdate de que Govoy sigue bloqueado por Stripe. Tengo que escribirles
mañana y no quiero que esto se pierda.
```

Raw:

```text
raw_capture.content = mensaje literal
```

Block narrativo:

```text
Govoy esta bloqueado por la integracion con Stripe. Rubén quiere convertir el
seguimiento a Stripe en una task explicita para que el bloqueo no quede solo en
la conversacion.
```

Notes afectadas:

```text
Project "Govoy"
Task "Escribir a Stripe sobre integracion"
```

Edges minimos:

```text
block derived_from raw_capture
block about Project "Govoy"
block affects Project "Govoy"
block affects Task "Escribir a Stripe sobre integracion"
Task "Escribir a Stripe sobre integracion" part_of Project "Govoy"
Project "Govoy" blocked_by Task "Escribir a Stripe sobre integracion"
```

### 3. Idea sin compromiso

Usuario:

```text
Creo que Huygens debería empezar con ontología mínima y no intentar modelar
supports/refutes todavía.
```

Block narrativo:

```text
Rubén prefiere una ontologia minima para Huygens: mantener informe-block,
recortar edges avanzados y validar el vocabulario con conversaciones reales.
```

Notes afectadas:

```text
Project "Huygens"
Idea "Ontologia minima v2.1-lite"
```

Edges minimos:

```text
block derived_from raw_capture
block about Project "Huygens"
block affects Idea "Ontologia minima v2.1-lite"
Idea "Ontologia minima v2.1-lite" relates_to Project "Huygens"
```

### 4. Revisión recurrente ligera

Usuario:

```text
Quiero revisar los viernes por la mañana las tasks WAITING, pero no montemos
todavía un motor de recurrencias.
```

Block narrativo:

```text
Rubén quiere una revision semanal ligera de tasks WAITING los viernes por la
mañana, sin implementar todavía un motor de recurrencias.
```

Notes afectadas (Huygens 2 no tiene type `routine`: se modela como `project` en curso):

```text
Project "Revision semanal de WAITING"
Area "Sistema personal"
```

Edges minimos:

```text
block derived_from raw_capture
block about Area "Sistema personal"
block affects Project "Revision semanal de WAITING"
Project "Revision semanal de WAITING" part_of Area "Sistema personal"
```

### 5. Referencia externa

Usuario:

```text
Guarda este paper sobre graph databases como referencia para Huygens.
```

Block narrativo:

```text
Rubén añade un paper sobre graph databases como referencia contextual para el
diseño de Huygens.
```

Notes afectadas:

```text
Reference "Paper sobre graph databases"
Project "Huygens"
```

Edges minimos:

```text
block derived_from raw_capture
block about Project "Huygens"
block affects Reference "Paper sobre graph databases"
Reference "Paper sobre graph databases" relates_to Project "Huygens"
```

## Contrato implementado

| Pieza | Estado |
|---|---|
| `capture` | Crea `raw_capture` con `status='pending'`. |
| `list_inbox` | Lista raws por `status`; default `pending`. |
| `set_raw_status` | Permite `ignored`, `deferred`, `processed` sin crear topologia. |
| `create_proposal` / `update_proposal` | Persiste drafts visibles sin mutar el grafo. |
| `get_proposal` / `discard_proposal` | Inspecciona o descarta drafts. |
| `commit_proposal` | Aprobacion del usuario: transaccion atomica (BEGIN…COMMIT) que crea blocks narrativos, notes/edges minimos, marca raws `processed` y materializa `proposal.result` con los record ids reales + `temp_ids` {notes, blocks} + `versionstamp` + `committed_at`. |
| `get_proposal_changes` | Recupera cambios exactos de una proposal commiteada: vista materializada (record ids resueltos a registros) + vista changefeed (delta de la transaccion). La visualizacion grafica del cambio vive en el dashboard (React Flow), no en el MCP. |
| `vector_search` | Busqueda semantica sobre blocks via embedding HNSW. |
| `embed_text` / `index_block` | Genera embedding y lo persiste en un block. |
| `find_related` | Bloques semanticamente proximos a un block dado. |
| `chunk_markdown` | Trocea markdown en blocks. |
| `query_query` | Query SurrealQL de lectura (read-only). |
| `huygens-worker` | Shell MCP para futuros workers especializados; no procesa inbox ni llama Agno/OpenAI. |
| `note_type:*` | Slugs Huygens 2 en inglés: `area`, `objective`, `project`, `task`, `idea`, `reference`, `agent`, `tool`. |
| `processed_at` en `raw_capture` | Compatibilidad. La fuente de verdad del inbox es `status`. |

El flujo antiguo `raw -> clarify -> notes` fue eliminado:

```text
commit_clarify   eliminado
generate_report  eliminado
note_type:report eliminado del seed
note_type:note   eliminado del seed
```

## Siguiente paso antes de ampliar schema

Hacer el ejercicio de 10 conversaciones:

1. Escribir 10 capturas o mini-sesiones reales/plausibles con el agente.
2. Para cada una, distinguir raws del inbox, sesion de procesamiento, block
   narrativo, notes afectadas y edges minimos.
3. Anotar cada vez que parezca faltar un edge o un estado de inbox.
4. Solo promover un edge o field nuevo si aparece varias veces y responde una
   query real.

No diseñar ontologia en abstracto si puede validarse con conversaciones.
