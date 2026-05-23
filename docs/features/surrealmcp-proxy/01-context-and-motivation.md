# SurrealMCP proxy — contexto y motivación

## Origen: las fricciones de Hermes

El agente Hermes (cliente MCP que consume Huygens) reportó cuatro fricciones
al usar el MCP en una sesión real:

1. **Tools no nativas**. Al cargar Huygens, las tools no aparecían como
   nativas dentro de Hermes. Tras inspeccionar resultó ser un problema de
   hot-reload del propio Hermes, no del MCP. Se resolvió fijando el YAML en
   `/home/fiser/.hermes/config.yaml` — la `url` necesitaba quoting.
2. **Sin overview**. Al iniciar una sesión no había forma de obtener una
   visión general del grafo. No existe `get_status`, no existe
   `get_overview`, y tampoco hay un canal de query libre.
3. **Human-readable first**. Las respuestas de las tools son JSON
   estructurado. Un agente que quiere razonar prefiere ver primero una
   salida narrativa y solo después el detalle estructurado.
4. **Sin session memory**. El MCP es stateless. Cada call empieza de cero
   y el agente no puede "continuar pensando" desde un estado previo.

Este documento se centra en el ítem 2, que es lo que motiva esta feature.
Las otras tres fricciones se mencionan como contexto y se documentan por
separado.

## El problema: tools curadas vs exploración libre

Las tools actuales de Huygens MCP (`capture`, `list_inbox`,
`create_proposal`, `commit_proposal`, `list_notes_by_type`, `vector_search`,
`find_related`…) están diseñadas alrededor del flujo deliberado
`raw_capture → proposal → commit`. Esa estrechez es intencional: guía al
agente por el camino correcto y evita mutaciones improvisadas.

Pero cuando el agente quiere preguntas exploratorias, sin compromiso, las
tools curadas no llegan. Ejemplos reales:

- "¿Cuántos blocks tiene el proyecto X?"
- "¿Qué edges entran o salen de `note:abc`?"
- "¿Qué entradas hay en `raw_capture` entre estas dos fechas?"
- "Lista los `note_type` con count agrupado."
- "¿Hay algún block sin `derived_from`?"

Para cada una de estas preguntas habría que escribir una tool nueva. No
escala: la curva de mantenimiento del catálogo crece con cada exploración.

La alternativa obvia es dejar al agente hablar SurrealQL directamente. Pero
exponer una tool `query` cruda contra la BD principal con credenciales
`root` es peligroso: cualquier `UPDATE`, `DELETE` o `REMOVE` desde el agente
pasaría sin filtro.

## Alternativas consideradas

1. **Añadir más tools curadas** (`get_overview`, `count_by_type`,
   `list_edges_for_note`…). Descartado: no escala. Cada exploración nueva
   pide una tool nueva, y el catálogo crece sin techo claro.

2. **Tool `raw_query` propia con role-checking en código**. Implementar una
   tool que ejecute SurrealQL pero filtre por whitelist de comandos
   (`SELECT`, `SHOW`, `INFO`…). Descartado: parsear SurrealQL desde
   TypeScript es frágil, hay que mantener el parser actualizado con cada
   versión de SurrealDB, y duplica lógica que la propia BD ya hace de forma
   nativa con su sistema de roles.

3. **MCP oficial de SurrealDB como servidor separado**. Configurar dos MCPs
   en el cliente: Huygens y SurrealMCP en paralelo. Descartado
   parcialmente: técnicamente funciona, pero el cliente ve dos servidores
   distintos. El usuario quiere que todo cuelgue de Huygens — que `/graph`
   en Hermes o en Claude muestre un único namespace coherente.

4. **Proxy del SurrealMCP oficial dentro de Huygens MCP**. Huygens monta el
   oficial como contenedor backend y re-expone sus tools con prefijo. El
   cliente ve un único servidor MCP con todo dentro. Es la opción
   elegida.

## La decisión

Citas del usuario que anclan la decisión:

> "Get status es buena idea, pero creo que no es suficiente, yo creo que
> habría dejar explorar operaciones de lectura con libertad al modelo."

> "Podemos hacer que nuestro MCP haga de proxy del SurrealMCP? Así
> configuras el nuestro y ya tienes ambos en un /graph todo colgando de
> el."

> "Es totalmente personal, single user el MCP full read de todo."

> "Creo que solo Lecturas el MCP oficial de surreal en solo lecturas."

De ahí, la decisión:

- **Montar SurrealMCP oficial como contenedor backend** en el devcontainer
  (`surrealdb/surrealmcp:v0.4.0`).
- **Huygens MCP actúa como proxy**: en el arranque llama a
  `Client.listTools()` contra SurrealMCP, registra cada tool descubierta en
  su propio `McpServer` con un prefijo (por ejemplo `query_select`,
  `query_query`), y al recibir invocaciones hace pasa-a-través vía
  `Client.callTool()`.
- **Solo lecturas**. El SurrealMCP se autentica contra SurrealDB con un
  usuario nuevo `huygens_reader` con `ROLES VIEWER`. Si el agente intenta
  por error una escritura, falla en la BD, no en el proxy. La defensa vive
  donde tiene que vivir.
- **License**. SurrealMCP se distribuye bajo BSL 1.1. El uso aquí es
  personal y single-user, dentro de los términos de la licencia.

## Qué queda fuera de esta feature

- **Las otras tres fricciones de Hermes**: tools no nativas (ya resuelto en
  cliente), human-readable-first y session memory. Se documentan por
  separado; no se resuelven aquí.
- **Write tools del SurrealMCP**. El proxy expone solo lectura. Si en
  futuro se quisiera abrir escritura desde el agente vía SurrealMCP, sería
  una decisión nueva con su propio diseño de permisos.
- **Caching de la lista de tools**. La discovery se hace una vez al boot
  de Huygens MCP. Si SurrealMCP cambia tools en caliente (versión nueva,
  feature flag…), hay que reiniciar Huygens MCP para que el catálogo
  expuesto se actualice.
- **Reescritura semántica de respuestas**. El proxy devuelve lo que devuelva
  SurrealMCP sin transformar. Si el output no es agradable de leer, se
  resuelve en la capa human-readable-first, no aquí.
