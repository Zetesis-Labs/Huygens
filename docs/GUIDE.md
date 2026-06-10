# Guía de uso de Huygens

> Para el usuario: cómo hablar con el agente, qué pasa con lo que dices, y la
> metodología organizativa que el sistema encarna. No necesitas saber SurrealQL
> ni tocar una tool — eso es trabajo del agente. Lo técnico vive en
> [`USING.md`](../USING.md); el porqué conceptual en [`MODEL.md`](./MODEL.md);
> las reglas del agente en la
> [doctrina operativa](../apps/mcp/src/lore/operating-doctrine.md).

## El modelo mental en un minuto

Huygens es tu **memoria de confianza**. Dos promesas la sostienen:

1. **Nada entra al grafo sin tu aprobación.** El agente captura, interpreta y
   propone; el cambio real (el *commit*) solo ocurre cuando tú lo apruebas
   habiendo visto exactamente qué va a cambiar. Esto no es cortesía: el
   servidor lo hace cumplir.
2. **Todo lo que entra es citable.** Cada interpretación queda trazada a la
   evidencia literal (lo que tú dijiste, palabra por palabra). Siempre puedes
   preguntar "¿de dónde sale eso?" y obtener la fuente.

Y un principio de diseño que te afecta directamente: **los muros son para el
agente, no para ti**. El sistema es estricto con lo que el agente puede hacer
sin tu mandato, y blando con cómo tú te expresas. Habla como hables: caótico,
mezclado, a medias. La estructura la pone el grafo, no tu disciplina.

## Dónde hablas con Huygens

| Superficie | Qué puedes hacer | Qué NO puede hacer |
|---|---|---|
| **Sesión MCP completa** (Claude Code u otro cliente con el MCP `huygens`) | Todo: capturar, consultar, procesar inbox, rituales, **aprobar commits**, corregir, borrar | — |
| **Chat del dashboard** (`/chat`, con canvas de grafo) | Capturar, consultar, explorar visualmente, preparar propuestas | **Nunca commitea** — deja la propuesta en draft (visible en *Borradores*) y te avisa; la apruebas desde una sesión completa |
| **Dashboard** (`http://localhost:4321`) | Mirar: Inbox, MITs del día (vencidas en ámbar), Bitácora, Diario de cambios, rango de fechas, Borradores | Es read-only: no muta nada |

El dashboard además **te invita**: si hoy no hay jornada, o la semana no tiene
revisión (domingo/lunes), verás un banner. Es una invitación, nunca un hecho
consumado — el ritual solo existe si tú lo pides.

## Las tres formas de hablarle (y qué pasa con cada una)

No tienes que clasificar nada — el agente lo hace. Pero ayuda saber qué
desencadena cada tipo de frase:

### 1. Soltar algo → captura (sin ceremonia)

> "Apunta que Govoy sigue bloqueado por Stripe."
> "Acuérdate de que mañana tengo que escribirles."
> "Idea: probar embeddings locales algún día."

El agente lo guarda **literal** en el inbox y no te pregunta nada. No clasifica,
no crea tareas, no interpreta. Capturar es barato a propósito: suelta todo lo
que pase por tu cabeza durante el día y olvídate. El inbox existe para que no
tengas que decidir nada en el momento.

### 2. Ordenar o corregir → cambio mínimo, sin interrogatorio

> "Eso ya está hecho." → la tarea pasa a DONE.
> "Lo de Ana pasa a WAITING, estoy esperando su respuesta."
> "Ponle fecha límite el viernes." / "No me lo enseñes hasta el lunes."

Una orden explícita tuya **es** la aprobación: el agente prepara el cambio
mínimo y fiel a lo que dijiste y lo aplica sin re-preguntarte (en el chat del
dashboard: lo deja listo y te avisa). Solo te preguntará si la orden es ambigua
o implica crear estructura nueva.

### 3. Preguntar → respuesta desde el grafo, no de memoria

> "¿Cómo va Govoy?" · "¿Qué tengo pendiente esta semana?" · "¿Qué sé de Ana?"

El agente está obligado a responder **desde el grafo**: recupera el contexto
conectado, verifica lo que va a afirmar contra los datos, y distingue lo que tú
dijiste de lo que se infirió. Dos preguntas que siempre puedes hacer:

- **"¿De dónde sale eso?"** → te enseña la evidencia literal (los raws de los
  que deriva la interpretación) y si fue textual, extraído o inferido.
- **"¿Eso está en el grafo o te lo estás inventando?"** → el agente puede
  verificar afirmación por afirmación si los datos la sostienen, la
  contradicen o no la cubren.

Si el grafo está desactualizado, dilo — eso es una corrección (tipo 2), no
motivo para que el agente improvise.

## El bucle diario: la jornada

**Un solo ritual al día.** No hay "plan de la mañana" y "cierre de la noche"
separados: hay **la jornada** — normalmente al empezar el día — que hace las
dos cosas sin distinguirlas. Si ayer quedó algo colgado, se concluye al
empezar hoy.

> Tú: "Hagamos la jornada."

El agente entonces:

1. **Asienta lo colgado.** Te enseña las MITs vencidas (foco de días previos
   sin resolver) y los deadlines incumplidos — son cosas distintas y te las
   dirá por separado. Cada una recibe **tu** disposición:
   *hecho* · *sigue hoy* · *se mueve a otro día* · *se suelta*.
   Nada se abandona en silencio; tampoco se te fuerza — si quieres dejar algo
   en ámbar, se queda en ámbar.
2. **Orienta el día.** Te sugiere candidatas a MIT (tareas activas, con su
   proyecto/área, destacando las ligadas a un objetivo y los deadlines
   cercanos). **Tú eliges.** La convención es 1-3 — si un día quieres 5, te lo
   recordará una vez y respetará tu decisión. Si hoy no quieres MITs, no pasa
   nada.
3. **Captura tu voz.** Te pide una frase: qué pasó, qué toca, cómo estás. Vale
   lo retrospectivo, lo prospectivo o todo mezclado — **el texto puede ser tan
   caótico como tú**; la estructura va aparte, en las disposiciones y MITs.
4. **Te enseña el cambio completo y pide tu OK.** Solo con tu aprobación
   explícita se commitea. La jornada aparece en la **Bitácora** (☀️).

Reglas que el servidor hace cumplir: **una jornada por día** (hora de Madrid,
correcta también en invierno); si te equivocaste y quieres rehacerla, dile
"esa jornada está mal, vamos a corregirla" — retira la anterior y commitea la
buena.

Una corrección a media tarde ("cerré X") **no** es una jornada: es una orden
normal del tipo 2. No dejes que el agente la envuelva en ritual — no lo hará
si sigue su doctrina, pero ahora sabes distinguirlo tú también.

## El bucle semanal: la semana

> Tú: "Hagamos la revisión semanal." (domingo o lunes, cuando te cuadre)

Es **mantenimiento** — lo que se acumula fuera del día y ninguna jornada mira:

- **WAITING**: ¿sigue esperando de verdad cada una, o ya puedes moverla?
- **Dormidas que resurgen**: lo aplazado (`defer_until`) que vuelve esta semana.
- **Deadlines entrantes**: lo que vence los próximos 7 días — ¿va encarrilado?
- **SOMEDAY**: ¿alguna merece ascender a ACTIVE? ¿Alguna ACTIVE debería bajar
  a SOMEDAY o archivarse? (Honestidad > optimismo.)
- **Lo nunca revisado**: notas que llevan mucho sin mirarse.
- **Inbox diferido**: capturas que dejaste "para luego".

Mismo contrato: el agente trae los frentes, tú decides, una sola propuesta,
tu OK, y queda en la Bitácora (🔁). Una por semana (lunes-domingo, Madrid).
Los frentes vacíos se saltan sin ceremonia — no es un interrogatorio.

## Procesar el inbox (la sesión deliberada)

Las capturas se acumulan; interpretar es otro momento. Cuando te apetezca
(un par de veces por semana suele bastar):

> Tú: "Procesemos el inbox."

El agente lista lo pendiente, **agrupa** lo que habla del mismo asunto, y lo
discute contigo: qué es tarea, qué es idea, qué cuelga de qué. De cada asunto
sale un **informe**: un párrafo que documenta la interpretación ("Govoy está
bloqueado por Stripe; Rubén quiere convertir el seguimiento en tarea
explícita"), trazado a tus capturas literales, junto con las notas y
relaciones mínimas. Lo ves todo, lo apruebas, se commitea.

No todo merece estructura: una captura puede **ignorarse** (no hacía falta),
**diferirse** (se procesa otro día) o cerrarse sin más. El inbox a cero no es
el objetivo; el objetivo es que nada se pierda.

## La metodología: los conceptos que organizan tu grafo

### Tipos de nota

| Tipo | Qué es | Ejemplo |
|---|---|---|
| `task` | Acción concreta y terminable | "Escribir a Stripe" |
| `project` | Resultado que requiere varias acciones | "Govoy" |
| `area` | Responsabilidad continua, sin final | "Sistema personal" |
| `objetivo` | Meta que da dirección; las MITs deberían apuntar aquí | "Lanzar Huygens v1" |
| `routine` | Hábito recurrente ligero | "Revisión de WAITING" |
| `idea` | Pensamiento sin compromiso | "Embeddings locales" |
| `reference` | Material de consulta | "Paper de graph DBs" |
| `person` | Persona | "Ana" |

### Estados (el ciclo de vida de una nota)

```
CLARIFIED  → está clara, pero no comprometida (el estado por defecto; no pasa nada por vivir aquí)
ACTIVE     → trabajando en ello / en el radar
WAITING    → bloqueada por algo EXTERNO (esperas a otro)
SOMEDAY    → algún día, sin fecha ni compromiso
DONE       → hecha
ARCHIVED   → fuera de juego, se conserva por historia
```

### Los tres ejes temporales (no son lo mismo)

| Tú dices | Campo | Significa |
|---|---|---|
| "Esto es lo importante de **hoy**" | MIT (`mit_for`) | El foco de ese día. 1-3 por día. Si no se hace, queda **en ámbar** hasta que la dispongas en una jornada |
| "Tiene que estar **para el viernes**" | deadline (`due_at`) | Compromiso duro. Si pasa la fecha, está *vencida* — incumplimiento, no olvido |
| "**No me lo enseñes hasta** el lunes" | aplazada (`defer_until`) | Snooze de visibilidad: desaparece del radar y resurge ese día. Sigue activa — solo no quieres verla |

Una tarea puede ser MIT hoy, vencer el viernes y no tener aplazamiento — son
ejes independientes. WAITING (espera externa) y SOMEDAY (sin compromiso) son
*estados*, no fechas; "aplazada" es una fecha, no un estado.

El agente puede **sugerir** fechas y MITs ("¿le pongo deadline?", "esta podría
ser tu MIT"), pero **nunca los decide por ti** — y el histórico no se pierde:
puedes preguntarle "¿cuándo fue MIT esto?" o "¿qué racha de jornadas llevo?"
y lo reconstruye del log.

### La jerarquía (qué cuelga de qué)

`tarea → proyecto → área` (y los objetivos dando dirección). Reglas:

- **Padre único**: una nota cuelga de una sola cosa. Reasignar padre reemplaza
  el anterior.
- **El padre lo dices tú.** El agente tiene prohibido deducirlo del contexto
  ("estábamos hablando de Govoy, así que esto irá a Govoy" — no). Si no lo has
  dicho, te preguntará o la dejará sin padre. El servidor rechaza un
  emparentamiento que el agente no declare como dicho por ti, y rechaza
  cualquier ciclo (A dentro de B dentro de A).
- Para relaciones débiles ("esto tiene que ver con aquello") existe una
  mención, sin compromiso jerárquico.
- Bloqueos: "X está bloqueada por Y" es una relación real y navegable — úsala,
  es lo que hace que un bloqueo no se diluya.

### Pídele el mapa cuando quieras

> "Enséñame la jerarquía de Govoy." · "¿Qué tengo vivo ahora mismo?" ·
> "¿Cuántas tareas activas tengo por área?"

El agente tiene vistas directas para esto (jerarquía, radar operativo,
recuentos) y en el dashboard el canvas pinta el grafo. El radar excluye
automáticamente las dormidas — lo aplazado no te estorba hasta su día.

## Qué te protege (sin que tengas que vigilar)

Esto lo hace cumplir el sistema, no la buena voluntad del agente:

- **Nada estructural se commitea sin haberse mostrado.** El servidor rechaza
  un commit cuya propuesta no se haya renderizado tal cual está (y si cambia
  después de enseñártela, hay que volver a enseñarla).
- **Un ritual exige tu aprobación explícita** y hay **máximo una jornada por
  día y una revisión por semana** — el "cierre fantasma" no puede pasar.
- **El chat del dashboard no puede commitear** — no tiene la herramienta.
- **El agente no puede escribir saltándose el ciclo**: sus consultas van por
  un usuario de solo-lectura que la base de datos rechaza si intenta escribir.
- **Borrar es deliberado**: cualquier "olvida esto" pasa primero por un
  preview de qué se borraría exactamente; nada se borra a la primera. Y todo
  borrado queda registrado.
- **Todo queda auditado**: cada cambio es reconstruible — qué propuesta lo
  causó, cuándo, derivado de qué evidencia.

Y lo que es deliberadamente **tuyo** (el sistema no te lo impone): cuántas
MITs marcas (1-3 es convención, no ley), cómo redactas tus jornadas, qué
estructura le das a tu vida. El agente aconseja; tú decides.

## El agente como coach (qué esperar)

El agente no es un secretario pasivo: su doctrina le pide **invitarte** a la
buena práctica — pero jamás fabricarla por ti.

- Si no has hecho la jornada, te la propondrá (y el dashboard te la recuerda).
- Si un proyecto no tiene **ninguna acción concreta**, no te dejará elegir
  MITs imposibles: te propondrá primero aterrizarlo ("¿cuál es la próxima
  acción física de Govoy?").
- Te explicará el *porqué* de las prácticas — una micro-lección cada vez, solo
  la primera vez ("elijo contigo pocas: si todo es prioritario, nada lo es").
- Si empiezas, te sugerirá **una sola MIT** al día hasta que el hábito se
  sostenga.
- Y si lo ignoras, **bajará el volumen** en vez de insistir. En una recaída,
  vuelve a lo mínimo sin dramatismo.

## Corregir errores

| Situación | Qué dices |
|---|---|
| Capturaste algo por error | "Olvida esa captura de X" → preview de borrado → confirmas |
| Una interpretación quedó mal | "Ese informe está mal, X no depende de Y" → se retira y se rehace |
| La jornada de hoy está mal | "Corrijamos la jornada" → retira la anterior, commitea la buena |
| Una tarea está mal colgada | "X no es de Govoy, es del área personal" → reparenta (reemplaza al padre) |
| Quieres ver qué cambió | "¿Qué cambió ayer?" / Diario del dashboard / "¿qué hizo esa propuesta?" |

Borrar no es destruir la historia: la evidencia y el registro de que *hubo* un
borrado se conservan.

## Chuleta

| Quieres… | Di… |
|---|---|
| Guardar algo al vuelo | "Apunta que…" |
| Empezar el día | "Hagamos la jornada" |
| Mantenimiento semanal | "Revisión semanal" |
| Vaciar la cabeza acumulada | "Procesemos el inbox" |
| Marcar progreso | "X ya está hecho" / "X pasa a WAITING" |
| Comprometer una fecha | "Tiene que estar para el viernes" |
| Quitarte algo de la vista | "No me lo enseñes hasta el lunes" |
| Consultar | "¿Cómo va X?" / "¿Qué tengo pendiente?" |
| Exigir fuentes | "¿De dónde sale eso?" |
| Ver el mapa | "Enséñame la jerarquía de X" |
| Ver tu racha | "¿Cuántos días llevo haciendo la jornada?" |
| Corregir | "Eso está mal: …" / "Olvida esto" |

---

**La regla de oro, por si solo recuerdas una:** captura sin pensar, decide en
la jornada, aprueba mirando. Todo lo demás es del agente.
