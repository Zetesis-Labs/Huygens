# La topología como primaria (subordinada al informe)

> "Esto que tenemos es una topología, claramente, no es simplemente una BBDD. Quizá definir una topología inicial y luego ir definiendo las relaciones que autorizamos hacia los markdowns sea una aproximación con más futuro."

> Nota de reframing posterior: **el informe es el artefacto primario; la topología es el byproduct de topologizar informes**. Lo que sigue en este documento describe por qué tratar las relaciones como ciudadanos de primera (frente a un store documental) sigue siendo cierto y necesario — pero el grafo no se construye directamente. Se construye porque un worker traduce informes a mutaciones. Ver [`docs/MODEL.md`](../../MODEL.md).

Este fichero documenta el principio que determinó el pivote de MongoDB a SurrealDB, la forma del schema, y la separación entre nodos y edges. El informe entra al grafo como un `note(type=report)` más, pero su rol es estructuralmente distinto: cada vez que existe uno nuevo, el worker lo lee y emite las mutaciones que pueblan el resto del grafo.

## El reframing

Hay dos formas de pensar una capa de persistencia para una memoria como Huygens.

**Tratamiento clásico (documental, relacional, ORM-céntrico)**. Los documentos son ciudadanos de primera clase. Tienen identidad, campos, índices propios. Las relaciones existen como **campos secundarios**: una foreign key, una `ref` de Mongo, un array de IDs. La pregunta natural es "¿qué columnas tiene esta tabla?". Las relaciones aparecen casi como un accidente — algo que el modelo necesita para resolver joins, pero que no es realmente "lo importante".

**Tratamiento topológico**. Las **relaciones son ciudadanos de primera clase**. Tienen tipo, dirección, propiedades, y el motor las trata como entidades reificadas. Los nodos siguen importando, pero pasan a ser **contenedores de payload**: lugares donde cuelga el markdown, los metadatos y las propiedades específicas del tipo. La pregunta natural deja de ser "¿qué columnas?" y pasa a ser "¿qué edges autoriza este nodo, y a qué otros tipos de nodo?".

El pivote no es cosmético. Cambia qué se valida en el motor, qué se valida en código, qué queries son baratas y cuáles son caras, y — sobre todo — qué se puede pedir al sistema sin que se rompa.

## Por qué este reframing cambia todo

En el modelo clásico, el schema empieza por listar tablas y sus campos. Las relaciones se anotan como referencias entre filas. En el modelo topológico, el schema empieza por declarar **qué nodos existen** y **qué edges están autorizados** entre ellos. Las properties del payload (markdown, fields, metadata) son secundarias en el orden de pensamiento, aunque sigan siendo necesarias en el orden de ejecución.

Una consecuencia inmediata: la información que vive **en las aristas** ya no es un campo más. Es estructural. Una `BLOCKED_BY` no es "una nota tiene un array de IDs"; es una **arista tipada** del grafo, con sus propiedades (`since`, `reason`, `blocker`). Otra `BLOCKED_BY` que apunte a un objeto de tipo equivocado no existe — la base de datos la rechaza antes de que llegue al disco.

Esto importa porque la semántica del dominio (qué puede estar relacionado con qué, y de qué manera) deja de ser un comentario en el código TypeScript y pasa a ser **una propiedad del motor de almacenamiento**. La validación de "una Note puede estar BLOCKED_BY otra Note pero no por una Person" no es una función de TypeScript que invocamos antes de escribir; es una restricción declarativa del schema. Si alguien — un agente, un script de seed, un import — intenta crear esa arista, la BBDD se niega.

## Las relaciones autorizadas

El catálogo de relaciones autorizadas es lo que da forma al grafo. NO toda combinación entre dos tipos de nodo está permitida. La pregunta de diseño no es solo "¿qué edge types existen?" sino "¿qué edge types están autorizados entre qué pares de nodos?".

**Ejemplo concreto**: una `Note` puede estar `BLOCKED_BY` otra `Note`. No tiene sentido decir que una `Note` está `BLOCKED_BY` una `Person`. Una persona no bloquea una nota; lo que la bloquea es **una espera asociada a una persona** (una respuesta pendiente, una decisión, una entrega). Si quieres capturar "espero a Juan", lo modelas como `Note BLOCKED_BY Note` donde la segunda Note es la espera (una sub-nota tipo `task` o `waiting-on` con `metadata.person = juan`), o bien con una property `blocker: record<person>` en la propia arista.

La distinción importa: el grafo dice la verdad sobre lo que es posible. Si la BBDD permitiese `Note BLOCKED_BY Person`, agentes futuros podrían crear esas relaciones por error, y los informes narrativos pasarían a contener frases sin sentido. El schema declarativo **enforza** la semántica. No es validación en código.

## Edge types planeados para Huygens

Esta es la lista inicial. Es ampliable — el árbol de tipos de relación crecerá igual que el árbol de tipos de nodo. El compromiso es que **cada edge nuevo debe declarar su FROM y su TO**, no aparecer como un campo libre.

| Edge type | FROM | TO | Semántica |
|---|---|---|---|
| `PART_OF` | `Note` | `Note` | Una Task es PART_OF un Project; un Project es PART_OF un Area |
| `BLOCKED_BY` | `Note` | `Note` | Esta nota espera por aquella |
| `MENTIONS` | `Note` | `Note` | Referencia narrativa, débil |
| `SUPPORTS` | `Note` | `Note` | Esta idea/evidencia respalda aquella |
| `REFUTES` | `Note` | `Note` | Esta idea contradice aquella |
| `ABOUT` | `Note` (típicamente un Report) | `Note` | Un Report cubre estas notas |
| `AUTHORED_BY` | `Note` | `Person` (note con type=person) | Una nota es atribuible a alguien (e.g., una cita) |
| `DERIVED_FROM` | `Note` | `raw_capture` | Procedencia: este note salió de aquel raw |

Algunas observaciones importantes sobre esta tabla:

- **El `type` de un `note`** se modela como `record<note_type>` en la propia tabla `note`, no como edge. El árbol de tipos es identidad estable; promoverlo a edge añade overhead sin beneficio.

- `BLOCKED_BY`, `SUPPORTS`, `REFUTES`, `MENTIONS` son los edges argumentativos / operativos entre Notes. Los emite el worker al topologizar informes — son los que dan vida al grafo. Sin ellos, Huygens sería una lista de markdowns sin tejido.

- `AUTHORED_BY` cruza semánticamente `Note → Person`. `Person` ya es un Note (con type=person), así que la arista vive entre dos nodos del mismo table `note`. La distinción "FROM Note TO Person" es semántica, no estructural.

- `DERIVED_FROM` es el único edge que cruza planos (de `note` a `raw_capture`). Lo emite el MCP cuando se materializa un informe a partir de un raw.

Edges centrales al modelo pendientes de implementar como tablas (descritos en [`docs/MODEL.md`](../../MODEL.md)): `based_on` (informe → informe previo usado como contexto) y `affects` (informe → cualquier note tocada por su topologización).

## Propiedades de edges

Una de las razones por las que SurrealDB encaja con este modelo es que **los edges pueden tener properties tipadas**. No es solo "A está conectado con B"; es "A está conectado con B desde tal fecha, por tal razón, con tal grado de confianza".

```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD since   ON blocked_by TYPE datetime DEFAULT time::now();
DEFINE FIELD reason  ON blocked_by TYPE option<string>;
DEFINE FIELD blocker ON blocked_by TYPE option<record<person>>;
```

Esto es lo que MongoDB NO permite limpio. En Mongo podías meter las properties del edge en una colección aparte (`note_relations` con `fromId, toId, type, since, reason`), pero perdías el `RELATE` nativo, los traversal multi-hop, y la posibilidad de que el motor te impidiera meter un edge con `from` apuntando a una `Person` cuando el schema dice que solo acepta `Note`.

El detalle importante para el resto de la documentación: **un edge no deja de ser binario porque tenga properties**. El edge `blocked_by` sigue conectando exactamente dos nodos (`FROM note` y `TO note`); la `blocker` que viaja en la property es un record-link a otro nodo, pero no es un participante simétrico de la relación. Esa distinción se desarrolla en [relations-and-edges.md](./relations-and-edges.md) (sección de reificación) y en [../06-theory/hypergraphs-foundations.md](../06-theory/hypergraphs-foundations.md).

## Por qué importa para los informes narrativos

Una manera concreta de medir si el reframing aporta: ¿qué tipo de informe queremos que el agente sea capaz de producir, y qué tipo de subgrafo le hace falta al worker para topologizarlo?

Un informe real es algo como:

> "Esta semana, el **Project Mileto** tuvo 3 Tasks `ACTIVE` que se desbloquearon de **Task Z** (que estaba `BLOCKED_BY` proveedor externo durante 9 días). De esas tres, una pasó a `DONE` y dos siguen `ACTIVE` con dependencia interna. **Idea X**, capturada el martes, `SUPPORTS` la dirección del Project en su sección de arquitectura."

Esa frase requiere:

1. Conocer el **estado actual** de cada Task (`state`).
2. Conocer la **transición de estado** durante la semana (audit trail / changefeed; ver self-critique).
3. Saber **qué bloqueaba a qué** (`BLOCKED_BY` con `since`).
4. Saber qué Tasks son `PART_OF` Mileto (atravesando el grafo).
5. Saber qué notas `SUPPORTS` esa dirección, y qué notas son ideas vs evidencia (tipos).

Sin edges tipados y dirigidos, ese informe no se puede construir sin escribir bastante código ad-hoc. Con edges tipados y dirigidos en el motor, la query es declarativa: el MCP pide el subgrafo y se lo entrega al LLM como contexto al sintetizar, y el worker pide otro subgrafo al topologizar para decidir qué mutaciones aplicar.

## La carga semántica del schema

> "Una BBDD declarativa tiene tantísima carga semántica que si la construyes bien la información fluye y se consolida por sí sola en ella, es hiperdefinido por su propia topología, es parte de la información semántica."

El schema no es un detalle de implementación. Es **una pieza de la ontología del sistema**. Cuando declaras que `BLOCKED_BY` va `FROM note TO note`, no solo estás configurando una constraint. Estás afirmando algo sobre cómo el mundo de Huygens está estructurado: las cosas se bloquean entre sí, las personas no bloquean cosas (su espera sí).

Esta es la diferencia entre un schema que tienes que documentar aparte ("ojo, no metas Persons aquí, el código lo valida pero el motor no") y un schema que **se documenta a sí mismo**. Lo segundo es lo que se busca aquí. El día que un agente nuevo lea el schema de Huygens debería poder reconstruir gran parte de la semántica solo mirando los `DEFINE TABLE`. El markdown del payload añade contexto sobre cada nota individual; la topología añade contexto sobre cómo todas se relacionan.

## Cómo lee esto el resto de la documentación

- [`docs/MODEL.md`](../../MODEL.md) — modelo canónico; describe cómo el informe es el artefacto primario y la topología emerge de topologizarlo.
- [relations-and-edges.md](./relations-and-edges.md) documenta la implementación concreta de los edges, comparando Mongo (v1) con SurrealDB (v2).
- [self-critique.md](./self-critique.md) lista qué decisiones de este reframing siguen siendo trade-offs vivos.
- [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md) cuenta por qué se pivotó.
- [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md) entra al detalle del motor elegido.
- [../06-theory/declarative-db-as-ontology.md](../06-theory/declarative-db-as-ontology.md) profundiza en la idea de que el schema **es** ontología.
- [../06-theory/hypergraphs-foundations.md](../06-theory/hypergraphs-foundations.md) trata el caso de relaciones N-arias.

## Resumen

1. Lo que estamos modelando es una **topología**, no una base de datos en el sentido clásico — pero esa topología es **subordinada al informe**: emerge porque un worker traduce informes a mutaciones del grafo.
2. **Las relaciones son ciudadanos de primera**; los nodos son contenedores de payload.
3. El schema empieza por declarar **qué edges están autorizados** entre qué tipos de nodo.
4. Esa autorización **la enforza el motor**, no validación en código.
5. Los edges pueden tener **properties tipadas**, lo que les permite cargar la información temporal y causal que los informes narrativos necesitan.
6. La carga semántica vive en el schema: bien construido, la información se consolida por la topología misma.
