# User Context — para quién está hecho Huygens

> Huygens es un sistema de un solo usuario. Este documento existe para que cualquier decisión técnica o de producto se pueda contrastar contra el perfil real al que sirve. Si una decisión no encaja con lo que está aquí, la decisión está mal o el perfil ha cambiado.

## Auto-descripción del usuario

El usuario, literalmente, dijo:

> "Soy una persona muy desestructurada, desordenada, caótica pero también creativa. Mi inbox es mi conversación con el agente que usará el MCP. Yo soy muy bueno con mi planificación a largo plazo pero fallo en la operatividad, en la ejecución diaria."

Esta cita es el núcleo del que sale todo lo demás. Conviene leerla con atención porque cada cláusula tiene consecuencias:

- **"desestructurada, desordenada, caótica"** → el sistema no debe imponer estructura al capturar. Si el usuario tiene que clasificar antes de escribir, no escribe.
- **"también creativa"** → la dispersión es parte del proceso productivo, no un bug a arreglar. El sistema debe absorberla, no estrangularla.
- **"mi inbox es la conversación con el agente"** → no hay otra UI. No hay formulario, no hay app móvil de captura, no hay hotkey. Hay chat.
- **"bueno en planificación a largo plazo, débil en operativa diaria"** → la estrategia ya existe; lo que se delega es la ejecución y el seguimiento.

Todo el diseño parte de esta asimetría. Huygens no es un sistema neutro para usuarios genéricos; es un compensador específico para este perfil.

## Patrones de trabajo observados

Lo que se ve cuando uno mira cómo el usuario opera día a día:

- **Multi-repo**. Vive en `/Users/ruben/Developer/` con 30+ repos. Salta entre ellos constantemente. Una sesión típica toca tres o cuatro proyectos en paralelo.
- **Ingeniería senior**. TypeScript estricto, Bun, Next.js, Payload CMS, Kubernetes, GitOps. No es un usuario que necesite que se le expliquen los fundamentos; es uno que necesita que las herramientas le acompañen al nivel donde ya está.
- **MCPs y agentes en el día a día**. Trabaja con LLMs como herramientas de producción, no como curiosidad. Esto importa porque Huygens es **otro MCP más** que se va a integrar en un flujo donde ya hay agentes; no es un experimento aislado.
- **Devcontainer-first**. Aislamiento por proyecto, todo en Docker, dependencias reproducibles. No tolera contaminación entre proyectos. Eso obliga a Huygens a ser un buen ciudadano de ese modelo (compose, volúmenes claros, sin acoplarse al host).
- **Primera vez con BBDDs de grafo**. SurrealDB es nuevo terreno. El usuario quiere aprender — no quiere que se le esconda la complejidad detrás de un ORM amigable, pero tampoco quiere abrirse el cráneo contra documentación dispersa. Necesita un onramp técnico, no un onramp didáctico.

## Patrón de toma de decisiones: frontier-seeking

Esto es importante y conviene nombrarlo explícitamente porque modula cómo se proponen alternativas técnicas.

**El usuario es frontier-seeking, no conservador.** Cuando se le presenta una decisión con un default seguro y una opción más nueva, suele empujar hacia la nueva. Tres ejemplos observados sólo en este proyecto:

1. **Cuestionó MongoDB** sin que nadie le sugiriese hacerlo. La pregunta literal fue _"¿y si está mal planteado desde el inicio?"_. Eso disparó el pivote a BBDD de grafo.
2. **Rechazó Neo4j** por ser "pre-IA". Es una BBDD madura, robusta, con ecosistema. Aun así, el argumento de que su diseño es anterior a la era de LLMs como first-class citizens pesó más que la madurez.
3. **Eligió SurrealDB sobre FalkorDB**, a pesar de que FalkorDB también estaba en la mesa. La razón fue una mezcla de "el modelo multi-paradigma encaja mejor con lo que necesito" y "está madurando rápido y quiero crecer con ella".

**El razonamiento subyacente**: prefiere invertir esfuerzo cognitivo en algo nuevo que va a madurar con él, antes que en algo viejo y bien rodado. Las herramientas nuevas tienen un dividendo compuesto a largo plazo (uno aprende junto con el ecosistema) que las maduras no ofrecen.

**Caveat importante**: no es imprudencia. Si la diferencia de madurez fuese brutal — alpha vs v5, una BBDD que se cae cada semana vs una que lleva 15 años en producción — escogería lo razonable. La frontera está en algo así como _"esto es usable hoy aunque imperfecto"_. SurrealDB cumple ese umbral; un proyecto pre-alpha experimental no.

**Implicación para proponer alternativas**: cuando haya una decisión técnica abierta, no presentar sólo el default seguro. Presentar el espectro completo y dejar que el usuario elija. Asumir que el default es "lo que la mayoría haría" y que el usuario probablemente no es la mayoría.

## Lecturas y referentes — qué afecta al tono y al diseño

El usuario tiene un mapa intelectual concreto que afecta tanto a lo que valora como a cómo quiere que se escriban las cosas. Lista no exhaustiva, agrupada por tema:

### Filosofía contracorriente y economía austríaca

- Miguel Anxo Bastos
- Antonio Escohotado
- Juan Ramón Rallo
- Jesús Huerta de Soto

Patrón mental compartido: cuestionar el default, mirar lo que el consenso da por sentado, no asumir que lo establecido está establecido por buenas razones. Esto explica por qué el usuario empuja a frontier — no es un rasgo aislado, es coherente con su lectura.

### Programación funcional y teoría de categorías

- Bartosz Milewski — _Category Theory for Programmers_
- Pointfree.fm y la tradición de funcional puro
- Conceptos como functor, monad, profunctor, lente

Esto importa para Huygens porque las **relaciones tipadas en el grafo** se pueden pensar como morfismos en una categoría. La documentación puede (y debe, cuando aporte) hacer esa conexión.

### Computación cuántica + categorías aplicadas

- Bob Coecke y Aleks Kissinger — _Picturing Quantum Processes_
- ZX-calculus

Es nicho, pero relevante: el usuario está familiarizado con notación diagramática de procesos compuestos. Eso significa que diagramas de flujo de relaciones en el grafo, o explicaciones por composición, son lenguaje común, no decoración.

### Sistemas de tipos

- Tipos refinados
- "Illegal states unrepresentable" (Yaron Minsky)
- Tipos dependientes

Esto sí que afecta directamente al diseño: el principio de **hacer estados ilegales irrepresentables en el schema** es uno de los motores por los que las edges autorizadas se enforzan en el motor de la BBDD y no en código. Si el motor lo permite, el agente lo puede hacer; si no lo permite, no hace falta validarlo en código.

### GTD y productividad

- David Allen — _Getting Things Done_

La columna vertebral del modelo `NoteState`. Las cinco fases (capture, clarify, organize, reflect, engage) son la traducción literal en el lifecycle de cada nota.

### Otras lecturas mencionadas

- Hermann Hesse — _Siddhartha_ (lo contemplativo, el sustrato budista)
- Andrew Huberman — neurociencia aplicada, sueño, foco
- Jordan Peterson — psicología, sentido
- Robert Greene — _Mastery_, _48 Laws of Power_

Estos no afectan a decisiones técnicas, pero sí al **tono general**: el usuario valora la profundidad sobre la velocidad, y prefiere documentación que pueda releer en seis meses y profundizar, antes que documentación que se queda en la superficie por temor a aburrir.

## Implicaciones para la documentación

Síntesis operativa de lo anterior:

- **Conexiones con teoría de categorías son bienvenidas, no decorativas.** Cuando un edge tipado se puede explicar como morfismo, hacerlo. Cuando un Pilar puede entenderse como proyección sobre una dimensión, hacerlo. No es _name-dropping_; es vocabulario común.
- **Conexiones filosóficas son bienvenidas.** Epistemología, fenomenología, ontología, autopoiesis. Si aparecen, aparecen con su nombre. El usuario las reconoce.
- **Tono: como hablar con un par.** No condescendencia. No _marketing speak_. Si algo es un trade-off, decirlo. Si algo está roto, decirlo. Si algo es genuinamente bonito, decirlo sin azucarar.
- **"Para el Rubén curioso del futuro".** Incluir bibliografía, links, referencias cuando el tema lo permita. La documentación no es sólo para ahora, es para volver a ella en 2028 con una pregunta y poder profundizar.

## Lo que el usuario explícitamente NO quiere

Estos puntos son tan importantes como los positivos. Cada uno se ha verbalizado explícitamente en la conversación de diseño:

- **Replicar la taxonomía de Notion**. La conoce, ha vivido con ella, sabe que mezcla churros con merinas. Personas, Tools, Sources, Notes, Perspectivas, Metatipos — todos en un solo árbol jerárquico. Huygens NO debe replicar esa estructura. La separación de ejes ortogonales (State / Type / Pillar) nace precisamente de no querer repetir ese error.

- **Un second-brain de conocimiento general**. Notion seguirá siendo el sitio para apuntes de lecturas, snippets, referencias. Huygens es para lo operativo y estratégico del propio usuario. Si una nota tiene la forma "qué he aprendido de X", probablemente va a Notion. Si tiene la forma "qué voy a hacer / qué he hecho / qué pienso sobre mi vida", va a Huygens.

- **Un sistema rígido que imponga estructura para capturar**. El usuario es caótico al capturar — esa es la realidad y el sistema tiene que aceptarla. La capture entra como `state=INBOX`, sin tipo obligatorio, sin pilar obligatorio. La clarificación es un paso posterior, hecho por el agente, no una barrera de entrada.

- **Que la BBDD le obligue a clasificar antes de archivar**. Si para guardar una nota hace falta haberla taxonomizado, el sistema no se usa. Punto.

## El contraste Notion → Huygens

Este es probablemente el contraste más importante porque define qué tipo de cambio supone Huygens respecto al status quo del usuario.

**Notion actual del usuario**:

Taxonomía heterogénea organizada en un único árbol. Personas, Tools, Sources, Notes, Perspectivas, Metatipos — todos colgando del mismo padre conceptual. Mezcla **categorías de cosa** (qué es) con **estado** (en qué momento del ciclo está) con **dimensión vital** (qué pilar toca). El resultado: una taxonomía que no es navegable y que requiere recordar dónde se puso cada cosa.

**Huygens**:

Tres ejes ortogonales claramente separados:

| Eje | Qué representa | Ejemplo |
|---|---|---|
| **State** | Lifecycle GTD | `INBOX`, `ACTIVE`, `WAITING`, `DONE` |
| **Type** | Qué clase de cosa es | `task`, `project`, `note`, `report`, `person` |
| **Pillar** | Qué dimensión vital toca | `PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA` |

Cada nota tiene los tres independientemente. Una nota puede ser `state=ACTIVE`, `type=project`, `pillars=[TELOS, ETHOS]`. La consulta "muéstrame todos los proyectos activos relacionados con Telos" se traduce literalmente al filtro; no hay que adivinar dónde se archivó.

Esto es el cambio fundamental. No es "Notion con mejor búsqueda". Es **descomponer una taxonomía aplanada en sus ejes constituyentes**, y dejar que cada eje viva su propia vida.

Detalle del modelo: [note-model.md](../03-data-model/note-model.md). Detalle de los Pilares: [strategic-pillars.md](./strategic-pillars.md). Decisiones de stack: [stack-decisions.md](../02-architecture/stack-decisions.md).

## Cierre

Huygens existe para una persona específica con un perfil específico — creativa, caótica, frontier-seeking, con formación filosófica y técnica profunda, que ya usa LLMs como herramientas de producción y que tiene un problema concreto con la operativa diaria. Cada decisión técnica del proyecto se justifica contra este perfil; cada documento posterior asume estas características como dadas.

Si en el futuro este perfil cambia — si el usuario deja de ser frontier-seeking, si abandona la lectura técnica, si decide que sí quiere replicar su Notion — el proyecto se replanteará. Hasta entonces, este documento es la regla de validación implícita de todo lo demás.
