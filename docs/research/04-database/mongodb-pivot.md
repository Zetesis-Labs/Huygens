# MongoDB → SurrealDB: anatomía de un pivote temprano

> Documento histórico-técnico. Registra por qué Huygens empezó montado sobre MongoDB y por qué, una vez puesto el stack inicial, lo desmontamos antes de escribir la primera línea de lógica de dominio. La pieza interesante no es Mongo en sí — es el cambio de framing que disparó el pivote.

## Por qué empezamos con MongoDB

La elección inicial no fue caprichosa. Tenía cuatro razones simultáneas, todas defendibles aisladamente:

### 1. Inspiración de ZetesisPortal

ZetesisPortal — el proyecto hermano sobre el que Rubén estaba trabajando — usa **Payload CMS**. Payload soporta dos adaptadores de BBDD canónicos: MongoDB y PostgreSQL. En ese contexto, "el modelo es un documento con relaciones laxas" funciona bien: posts, taxonomías, media, etc., son entidades con shape razonablemente plano.

Huygens nació con la misma forma mental: "vamos a tener notas Markdown con un poco de metadata; esto se parece a documentos Payload, así que monto Mongo y avanzo". Es un caso textbook de **transferencia de patrón mental desde un proyecto adyacente** — no malo a priori, pero peligroso cuando los dominios no son tan simétricos como parecen.

### 2. Familiaridad con Prisma

Prisma es un ORM con typesafety en TypeScript de muy buena calidad. Rubén ya lo había usado en otros proyectos. El loop `editar schema.prisma → bunx prisma generate → tipos actualizados en el editor` es agradable.

El soporte de Mongo en Prisma es razonable (con limitaciones — `$vectorSearch` no es nativo y hay que ir a `$runCommandRaw`), pero suficiente para arrancar.

### 3. `mongodb/mongodb-atlas-local` resuelve dos requisitos en un solo contenedor

Esto fue el clincher técnico real. La imagen `mongodb/mongodb-atlas-local`:

- Levanta un **replica set automático** (`rs0`), requisito de Prisma para transacciones contra Mongo
- Incluye **`mongot`** — el sidecar que da `$vectorSearch` y `$search` (Atlas Search) en local sin tener que pagar Atlas Cloud

En un proyecto que necesita búsqueda vectorial + tipado fuerte vía Prisma, conseguir las dos cosas en un solo `docker compose up` es atractivo. Cero infrastructura adicional.

### 4. Schemaless como "flexibilidad para el bag de metadata"

El plan inicial incluía un campo `metadata Json` por nota, intencionalmente sin schema, porque el agente iba a poder meter ahí información tipo-específica (`task` lleva `dueDate`, `person` lleva `email`, etc.). Mongo lo permite trivialmente. Postgres también lo permite con `jsonb`, pero conceptualmente "casa mejor" con Mongo.

## El insight que disparó el pivote

Una vez montado el stack inicial — devcontainer corriendo, Prisma generando tipos, el primer endpoint MCP listando notas — el usuario lanzó la pregunta que cambió el proyecto:

> "Y si MongoDB está mal planteado o es insuficiente? Esto que tenemos es una **topología**, claramente, no es simplemente una BBDD. Quizá definir una topología inicial y luego ir definiendo las relaciones que **autorizamos** hacia los markdowns sea una aproximación con más futuro."

Esa frase contiene tres ideas separadas, y conviene desempacarlas:

1. **"Es una topología, no una BBDD"** — el modelo mental que el usuario tiene del producto NO es "colección de documentos" sino "grafo dirigido con tipos de relación". Los nodos casi importan menos que las aristas
2. **"Definir una topología inicial"** — el schema NO debe nacer permisivo y evolucionar. Debe nacer **declarado**, como una ontología, y crecer por extensión explícita
3. **"Relaciones que autorizamos"** — las edges tienen que estar **enumeradas en el motor**. No es "puedes meter cualquier relación y ya validaremos en código" sino "estas son las relaciones legales y el motor rechaza las demás"

Esa tercera idea es ortogonal a Mongo. No tiene nada que ver con NoSQL vs SQL. Tiene que ver con si tu BBDD sabe lo que es una **relación** como entidad de primera clase, o si las relaciones son artefactos secundarios que tú mantienes a mano.

## Análisis honesto: Mongo contra los requisitos reales de Huygens

Una vez identificado que el shape del problema era una topología, la auditoría se vuelve trivial:

| Necesidad de Huygens | Cómo lo resuelve Mongo |
|---|---|
| Relaciones tipadas (`BLOCKED_BY`, `SUPPORTS`, `PART_OF`, `OF_TYPE`, etc.) | No hay tipo nativo de relación. Sólo arrays de `ObjectId` (`relatedNoteIds: ObjectId[]`) sin distinguir qué tipo de relación es |
| Validación de qué relaciones están permitidas entre qué tipos | Validación a nivel código aplicación. ~80 líneas de TS que sólo existen para enforce "no puedes relacionar X con Y de esta manera" |
| Traversals multi-hop (ej: "todas las Tasks activas dentro de cualquier Project dentro de Area=salud") | `$graphLookup`. Funciona pero es lento, escala mal y la sintaxis es punitiva |
| Bidireccionalidad de relaciones | Manual: cuando A relaciona con B, hay que escribir el ref en A y en B. Tu código mantiene consistencia |
| Properties tipadas sobre los edges (ej: edge `BLOCKED_BY` con campo `reason: string`) | No existe. Puedes meter un objeto JSON con esa información pero sin schema y separado del propio link |
| Búsqueda vectorial | `$vectorSearch` — bien, esto sí funciona |
| Schema enforced para edges | No existe el concepto |

La conclusión es brutalmente clara: para **document workloads**, Mongo es razonable; para **graph workloads con relaciones tipadas y autorizadas**, Mongo es la herramienta equivocada **por diseño**.

## Lo que sí hizo Mongo bien (registro honesto)

Para no sesgar la narrativa, conviene reconocer lo que funcionó:

- **`$vectorSearch` out-of-the-box**: con `mongodb-atlas-local` corriendo, crear un índice vectorial y consultar fue trivial. No es magia conceptual — pero la ergonomía del setup local fue buena
- **Prisma + TypeScript fue agradable mientras duró**: el loop de edición de schema → tipos actualizados es difícil de batir. Cualquier sustituto tiene que ofrecer algo equivalente
- **Replica set automático**: `mongodb/mongodb-atlas-local` levanta el replica set por sí solo, sin scripts de init. Mejor experiencia que las imágenes oficiales puras
- **Las herramientas existen y están maduras**: clientes, dashboards, exporters de Prometheus, todo. Comparado con cualquier opción frontier, Mongo es civilización rodada

## Las trampas técnicas encontradas (registro de cicatrices)

Mongo dejó tres aristas concretas durante el corto periodo de uso, dignas de registro:

### Trampa 1: replica set name = hostname del container

`mongodb-atlas-local` configura el replica set con el hostname del container como el nombre del miembro. Como los hostnames de Docker son aleatorios (`a84d76e5c2a0` etc.), el cliente recibe la lista de miembros con un nombre que NO coincide con el que el cliente tiene en su DNS interno.

Resultado: error `rs0 does not match a84d76e5c2a0` o similar. El cliente no puede hablar al replica set "correctamente".

**Solución temporal**: añadir `directConnection=true` al connection string. Funciona pero es un hack. El connection string final quedó:

```
mongodb://mongo:27017/huygens?replicaSet=rs0&directConnection=true
```

No es bloqueante pero es un olor — el setup tiene una pieza configurada de forma frágil de fábrica, y la fix es "miente al cliente diciendo que es una conexión directa, no a un RS".

### Trampa 2: Mongo no enforza tipos en absoluto

Esto no es bug, es feature de Mongo — pero es feature equivocada para Huygens. El agente, escribiendo via MCP, podía teóricamente insertar un documento con `pillars: "ethos"` (string) en lugar de `pillars: ["ETHOS"]` (array). Mongo lo aceptaría. Prisma intentaría leerlo y crashearía.

La defensa contra esto es **validar en código**. Lo cual significa: tu schema NO es la fuente de verdad, es una sugerencia. La fuente de verdad real es tu código de validación. Cuando tu BBDD entiende su propio schema con dientes, esto se elimina.

### Trampa 3: `relatedNoteIds: ObjectId[]` era un smell ya identificado en autocrítica

Antes del pivote, una autocrítica del propio diseño ya había marcado `Note.relatedNoteIds: ObjectId[]` como sospechoso. La pregunta era "relacionado *cómo*". Un blocker es diferente de un soporte conceptual es diferente de un "esto inspiró aquello". Un array de IDs los aplasta todos en lo mismo y obliga al consumidor a inventar convenciones para distinguirlos.

La salida en Mongo era "añade un objeto separado por tipo de relación" — `blockedByIds`, `supportsIds`, `partOfIds`, etc. — multiplicando el número de campos. Y siguen sin tener properties propias.

El smell, en retrospectiva, era el mismo problema visto desde una orilla diferente: Mongo no tiene un concepto de "edge". Forzarlo a tener uno produce monstruos.

## El momento del pivote: por qué fue barato

Tres factores hicieron que pivotar fuera trivial:

- **Estábamos a un único commit** (`707fadb`). Cero data real persistida. Cero usuario impactado. Cero migraciones que escribir
- **El blast radius era el devcontainer y `prisma/schema.prisma`** — no más
- **No habíamos escrito lógica de dominio todavía** — sólo el scaffolding del MCP server y dos endpoints básicos

El usuario llegó al insight ANTES de que el agente lo propusiera. Esto es importante: el patrón **frontier-seeking** del usuario (preferir lo nuevo bien diseñado a lo viejo bien rodado) emerge claramente. Habiendo descartado Mongo, el siguiente paso natural fue auditar las BBDDs de grafo — y dentro de ellas, las nacidas en la era post-IA, no las legacy con un retrofit de vector index encima. Ver [`graph-db-comparison.md`](./graph-db-comparison.md) para la auditoría completa.

## Lo aprendido (transferible más allá de este proyecto)

Tres lecciones que no son específicas de Huygens:

### 1. Reconocer el shape del problema ANTES de elegir la herramienta

La pregunta natural cuando empiezas un proyecto es "¿qué BBDD popular conozco que me puede servir?". Es la pregunta equivocada. La pregunta correcta es: **"¿qué clase de problema estoy modelando?"**.

Si la respuesta es "colección de cosas con búsquedas y filtros razonables", Mongo o Postgres están bien. Si la respuesta es "grafo dirigido con aristas tipadas que importan tanto como los nodos", entonces te metes en territorio de grafo, y la elección entre Mongo y Postgres es entre dos malas opciones. La elección correcta es Neo4j, Falkor, Memgraph, Kuzu, o SurrealDB.

El error de framing inicial fue mirar el set de herramientas que ya conocía y forzar el problema dentro. El framing correcto es **describir el problema en sus propios términos** y luego ir a buscar qué herramientas le corresponden.

### 2. "Es schemaless por flexibilidad" suele esconder "no he pensado el modelo todavía"

El argumento "uso Mongo porque schemaless me da flexibilidad" es real en algunos casos (verdaderamente heterogéneos, p.ej. logs estructurados de fuentes muy distintas). Pero en la mayoría de los proyectos donde aparece, el subtexto honesto es: "no sé todavía qué shape tienen mis datos y quiero diferir esa decisión".

Diferir esa decisión a la BBDD significa que la haces más tarde, en código aplicación, peor. Tomarla temprano y declararla en el schema **te fuerza a pensarla**. Esa fricción es valiosa, no un problema.

En Huygens, "metadata Json bag" era una excusa para no decidir qué metadata tiene cada tipo de Note. La realidad es que cada tipo (task, project, area...) tiene fields predecibles. Diferirlo a un campo JSON sin schema era posponer el trabajo de modelado, no preservar flexibilidad real.

### 3. Topología vs documentos es una distinción ontológica, no técnica

Esta es la lección más profunda. La pregunta "¿es esto una BBDD documental o de grafo?" parece técnica pero es ontológica — es decir, depende de qué **clase de cosas** crees que existen en el dominio.

Si crees que existen **objetos** (notas, tareas, personas) que tienen referencias entre sí, eliges document DB. Las referencias son detalles de implementación.

Si crees que existen **objetos Y relaciones** como entidades de igual estatus ontológico — donde "A bloqueado por B" es tan real como A o B mismos — eliges graph DB. Las relaciones son entidades de primera clase.

Esta es exactamente la misma distinción que en filosofía analítica separa **substance ontology** (sólo existen sustancias, las relaciones son derivativas) de **relation ontology** (las relaciones son fundamentales). No es una decisión de herramienta. Es una decisión sobre qué existe.

Huygens, por la naturaleza de su uso — un agente narrando, GTD-style, sobre relaciones entre intenciones, contextos, bloqueos, soportes — cae claramente en el segundo lado. El pivote no fue "Mongo → Surreal por features"; fue "reconocemos qué existe en este sistema y elegimos la herramienta que lo refleja".

## Cross-references

- [`graph-db-comparison.md`](./graph-db-comparison.md) — auditoría completa de las graph DBs consideradas
- [`surrealdb-deep-dive.md`](./surrealdb-deep-dive.md) — cómo funciona SurrealDB en profundidad
- [`surrealdb-innovations.md`](./surrealdb-innovations.md) — qué hace Surreal que ningún otro
- [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md) — el principio rector
- [`../03-data-model/relations-and-edges.md`](../03-data-model/relations-and-edges.md) — modelado de aristas
- [`../06-theory/declarative-db-as-ontology.md`](../06-theory/declarative-db-as-ontology.md) — el schema como ontología declarada
- [`../06-theory/living-topology.md`](../06-theory/living-topology.md) — topología que evoluciona en el tiempo
