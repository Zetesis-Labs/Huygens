# Motivación — por qué existe Huygens

> Este fichero responde al "para qué" del proyecto. No al "cómo" ni al "con qué". Si dudas si una decisión técnica encaja en Huygens, vuelve aquí: probablemente el filtro está en este documento.

## El problema, dicho en una frase

Rubén — el único usuario de Huygens — tiene mucha producción mental y poca disciplina de archivado. Genera ideas, planes, lecturas, intuiciones y compromisos a un ritmo que su sistema actual (una mezcla de Notion, voz, post-its mentales y conversaciones con LLMs) no consigue capturar de forma coherente. La información sobrevive en fragmentos. La estrategia está clara; la operativa se desangra.

La autodescripción del usuario, literal:

> "Soy una persona muy desestructurada, desordenada, caótica pero también creativa. Yo soy muy bueno con mi planificación a largo plazo pero fallo en la operatividad, en la ejecución diaria."

Huygens nace de aceptar esa asimetría en vez de combatirla. No intenta convertir a Rubén en una persona ordenada. Intenta **delegar el orden a una máquina que conversa con él**, dejándole la parte creativa y estratégica intacta.

## La tesis

> Un agente con memoria estructurada puede asumir gran parte del trabajo GTD por mí. La parte creativa y estratégica la sigo haciendo yo; la parte de clarificar, clasificar, archivar y recordar la hace el agente.

Esta frase es la tesis del proyecto y conviene leerla con cuidado:

- **"agente"**: no un editor de notas, no una base de datos consultable. Un LLM que conversa, decide y archiva.
- **"memoria estructurada"**: no un volcado plano. Una topología — grafo dirigido con relaciones tipadas — donde el agente puede razonar sobre conexiones, no sólo sobre contenido.
- **"gran parte del trabajo GTD"**: no todo. Hay decisiones (qué es importante, qué es residual, cuál es el próximo objetivo) que siguen siendo del usuario. El agente las ejecuta, no las inventa.
- **"intacta"**: el sistema no debe cambiar cómo piensa Rubén. Debe cambiar cómo lo organiza.

## Qué es Huygens

Huygens es un **MCP (Model Context Protocol) server** que sirve de memoria estructurada para un agente de IA personal. El usuario habla con el agente; el agente habla con Huygens vía MCP; Huygens habla con SurrealDB y devuelve estructura.

La forma más útil de describirlo es por su flujo:

### Inputs

Todo entra por la conversación con el agente. No hay UI de captura aparte. No hay formulario. Hay chat:

- **Notas cortas**: "tengo que pedir cita con el fisio antes del viernes".
- **Notas de voz transcritas**: lo mismo, pero hablado mientras camina o conduce.
- **Tochos**: dumps largos. Una nota de Notion exportada. Un volcado de pensamientos al final del día. Un transcript de 40 minutos de hablar solo sobre una idea.

El agente recibe el input y decide qué hacer: clasificar, archivar, partir en chunks, enlazar con otras notas, marcar como tarea, dejarlo en inbox para revisión posterior. **El usuario no procesa nada manualmente.**

### Outputs

Lo que el sistema produce, en orden de utilidad operativa:

- **Notas markdown clasificadas y archivadas**, tipadas por `NoteType` y con su `NoteState` reflejando dónde están en el flujo GTD.
- **Informes narrativos**: documentos que cosen estrategia → táctico → operativo. No son listados. Son texto que cuenta qué ha pasado en una semana, en un mes, en un trimestre.
- **Búsqueda vectorial** sobre todo el contenido, por similitud semántica (embeddings BGE-M3 vía DeepInfra).
- **Filtrado por actividad temporal**: qué se ha modificado, cuándo, qué se ha quedado parado.

### El modo agentico

La palabra clave es "agentico". Cuando el usuario lanza algo a la conversación, el agente no debe parar hasta haber resuelto la problemática y haber archivado lo importante. Si una nota llega ambigua, el agente puede preguntar — pero no debe devolver la pelota por defecto. El default es: hazlo tú, deja constancia, y si me equivoco lo corrijo después.

Esto tiene una implicación arquitectónica: el sistema tiene que aguantar errores del agente sin corromperse. Las relaciones autorizadas se enforzan en el motor de la BBDD, no en el código del MCP. Si el agente intenta enlazar dos tipos de nodos que no tienen edge definida entre ellos, el motor lo rechaza. Esto se decidió pronto y se justifica en [stack-decisions.md](../02-architecture/stack-decisions.md).

## Lo que Huygens NO es

Esta lista importa tanto como la anterior. Cada item está aquí porque fue tentación en algún momento de la conversación y se descartó conscientemente:

- **No es un second-brain de conocimiento general**. Rubén ya tiene eso en Notion. No quiere replicarlo. Notion seguirá siendo el sitio para "qué he leído sobre teoría de categorías" o "apuntes del libro X". Huygens es para **lo operativo y estratégico de Rubén**, no para todo lo que Rubén consume.
- **No es multi-usuario**. No hay tenancy. No hay roles. Hay un usuario y se llama Rubén. Todo el diseño parte de esa premisa.
- **No es un producto comercial**. No habrá SaaS, no habrá pricing, no habrá onboarding para nadie más. Lo que justifica decisiones que serían cuestionables en producto: schema acoplado a las preferencias del usuario, enums hardcodeados, vocabulario en castellano filosófico, etc.
- **No es un sustituto de pensar**. Es un sustituto de **organizar lo pensado**. La diferencia es importante: Huygens no genera ideas, las clasifica. No toma decisiones de fondo, las ejecuta. No suple la dirección, suple la fricción operativa que impide que la dirección se materialice.
- **No es Notion con grafo**. La taxonomía actual de Notion (Personas, Tools, Sources, Notes, Perspectivas, Metatipos todos en un solo árbol) se considera explícitamente parte del problema. Huygens separa ejes ortogonales — State y Type — en lugar de aplanarlos en un único árbol. Más detalle en [user-context.md](./user-context.md).

## La quimera reconocida

Durante la conversación de diseño, el propio usuario verbalizó:

> "Es una quimera, quizá pido demasiado."

Conviene no esconderlo. Sí, es ambicioso. Sí, la mayoría de proyectos de "agente personal con memoria" terminan en un cajón, o en un MVP que sólo usa su autor durante dos semanas. Sí, hay un riesgo real de que el coste de mantenimiento supere al valor.

Huygens es **una apuesta personal**, no un producto. La pregunta no es "¿es esto viable como startup?" sino "¿esto puede hacer la vida de Rubén un 20% más operativa sin estorbar a su pensamiento estratégico?". Si la respuesta es sí, el proyecto justifica su coste. Si no, se archiva sin drama.

Esa honestidad va por delante porque modula todas las decisiones técnicas posteriores. Se elige SurrealDB en vez de FalkorDB porque va a madurar con el proyecto, no porque el roadmap dependa de ello. Se elige BGE-M3 multilingüe porque Rubén piensa en castellano. Se elige Bun porque es lo que el usuario disfruta usando. Si fuese un producto, estas decisiones se mirarían distinto.

## El criterio de éxito

Huygens funciona si, al cabo de seis meses de uso real, se cumple algo parecido a esto:

- Rubén deja de tener inboxes paralelos. La conversación con el agente es **el** inbox.
- Los reviews semanales/mensuales se generan solos. El usuario los lee y corrige, no los redacta desde cero.
- Las cosas que importan no se pierden. Cuando algo lleva tres semanas en `WAITING` esperando una respuesta externa, el agente lo trae a la superficie.
- El sistema absorbe el caos creativo en lugar de combatirlo. Una idea suelta a las 23:47 entra, se archiva con sus relaciones, y reaparece cuando es relevante — sin obligar al usuario a clasificarla en el momento.

Si esto pasa, la quimera está justificada. Si no pasa, la quimera se documenta como tal y el aprendizaje queda.

## Cierre

Huygens no resuelve un problema universal. Resuelve un problema muy concreto de una persona muy concreta. Esa especificidad es su fortaleza y su límite. Toda la documentación posterior — el modelo canónico en [MODEL.md](../../MODEL.md), las decisiones de stack en [stack-decisions.md](../02-architecture/stack-decisions.md), el perfil del usuario en [user-context.md](./user-context.md) — sólo tiene sentido leída desde aquí.

Si una decisión futura no se puede justificar contra este documento, probablemente la decisión esté mal.
