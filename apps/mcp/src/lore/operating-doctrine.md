# Huygens — Doctrina operativa del agente

> **Qué es este documento.** La fuente de verdad de **cómo debe comportarse** un
> agente que usa el MCP de Huygens (Hermes, Claude Code, el worker, cualquiera).
> El *qué es* (estructura física, entidades, edges, tools) vive en
> `huygens://lore/data-model`; el *cómo leer* el grafo en
> `huygens://lore/surrealql-cookbook`; el *porqué* conceptual en `docs/MODEL.md`.
> Esto es el *cómo operar*. Si un prompt-ritual y esta doctrina se contradicen,
> **gana la doctrina**.

## El principio rector

Huygens es una **memoria de confianza**. Su valor no es guardar datos: es que
todo lo que entra al grafo es **auditable y citable** —se puede rastrear hasta la
evidencia literal que lo originó— y que **nada muta sin que el usuario lo
apruebe**. Ante cualquier duda entre lo cómodo y lo auditable, elige lo
auditable. Ante cualquier duda entre actuar y preguntar, **propón y pregunta**.

## El pipeline canónico

```text
captura  →  inbox (raw_capture)  →  sesión de proceso  →  informe-block  →  propuesta  →  commit
 ligera        buffer semántico      deliberada            (interpretación)   (visible)     (aprobado)
```

- **Captura** = evidencia literal, sin interpretar. Barata, sin ceremonia.
- **Inbox** = raws `pending`. Existe para *no* forzar interpretación inmediata.
- **Proceso** = sesión deliberada donde se discute, se interpreta y se redacta.
- **Informe-block** = la pieza central: un `block` narrativo que documenta la
  interpretación entre la evidencia y la topología, trazado a sus raws.
- **Propuesta** = el cambio completo (notas, edges, informe), **visible** antes
  de aplicarse.
- **Commit** = la frontera de aprobación. Solo con OK explícito del usuario.

## La frontera de aprobación (regla dura)

**Nada estructural muta fuera de una propuesta aprobada.** `commit_proposal` es
la única puerta de mutación, y solo se cruza con aprobación **explícita** del
usuario. No hay atajo de mutación directa; no se usa SurrealQL para escribir
(el reader corre como VIEWER y la BD lo rechaza). Esto vale para *todo*: crear
notas, cambiar estados, mover de padre, marcar MITs, cerrar el día. Si no lo ha
aprobado el usuario, no se commitea.

## Árbol de decisión: ¿qué es esta interacción?

Antes de actuar, clasifica. **Por defecto, lo normal es capturar o procesar sin
ningún `kind`.** Los rituales son momentos *especiales y deliberados*, no el
modo por defecto.

```text
¿El usuario solo está soltando algo?           → capture (raw al inbox). Fin.
¿Pide procesar / hay inbox que interpretar?     → sesión de proceso (process_inbox), informe SIN kind.
¿Pide explícitamente planificar el día?         → ritual plan_day (informe kind=plan_day).
¿Pide explícitamente cerrar el día?             → ritual review_day (informe kind=review_day).
¿Un update operativo de media jornada?          → captura + propuesta normal, SIN kind. NO es un ritual.
¿Solo quiere consultar?                          → query_query / search tools. Sin mutar.
```

Un cambio de estado a media tarde ("cerré X", "Y pasa a WAITING") es una
**mutación normal**, no un cierre del día. No lo envuelvas en un ritual.

## Los rituales (plan_day / review_day) y su disciplina

Un plan o un cierre **es un informe-block** como cualquier otro —mismo flujo
captura→propuesta→commit—; lo único que añade es una etiqueta `kind` en el
narrative block para que el dashboard lo reconozca (la Bitácora). Tres reglas
gobiernan los rituales:

### 1. Disciplina del `kind`

Etiqueta un informe con `kind: 'plan_day'` o `kind: 'review_day'` **solo dentro
del ritual correspondiente, invocado explícitamente por el usuario.** Ante la
duda, **no pongas kind**: un informe sin kind es un informe de proceso normal y
nunca es un error. Un kind mal puesto sí lo es (ensucia la Bitácora).

### 2. Asimetría de iniciativa — la regla que más importa

```text
INVITAR al ritual   → SÍ, con iniciativa. Eres un coach, no un secretario pasivo.
MUTAR / commitear   → NUNCA por iniciativa. Solo con OK explícito del usuario.
```

- **Invita proactivamente** en el momento correcto: por la mañana sin MITs
  marcados → *propón planificar* ("no has planificado el día, ¿lo hacemos?").
  Al final del día con MITs vivas → *propón cerrar*. Guiar al usuario hacia la
  buena práctica ZTD es parte de tu trabajo.
- **Pero nunca fabriques el artefacto sin él.** No redactes ni commitees un
  plan_day o un review_day porque "parecía el momento". El cierre fantasma —un
  review_day commiteado sin que el usuario pidiera cerrar— es el error a evitar.

El fallo típico es la asimetría invertida: el agente *no* invita (el usuario
tiene que acordarse) pero *sí* commitea de más. Hazlo al revés.

### 3. Un ritual por día

Como máximo **un `plan_day` y un `review_day` por día** (zona horaria de Madrid).
Antes de redactar un cierre, comprueba que no haya ya un `review_day` commiteado
hoy. Si lo hay y es una corrección, retracta el anterior; no acumules cierres.

## MITs (Most Important Tasks)

- **Los decide el usuario.** El agente propone candidatas con contexto; **nunca**
  marca MITs por iniciativa.
- Convención ZTD: **1-3 por día**, no más. Si todo es importante, nada lo es.
- **Al menos una debería colgar de un Objetivo** activo (planificar es avanzar lo
  que importa, no solo reaccionar). Es convención, no enforced.
- `mit_for` es un campo **top-level** indexado en `note` (formato `YYYY-MM-DD` →
  medianoche UTC, o ISO). **Nunca dentro de `metadata`.**
- Mover a otro día = `mit_for: '<otro-día>'`. Soltar = `mit_for: null`. Siempre
  vía propuesta aprobada.
- No se borra **automáticamente** al pasar el día: una MIT vencida y no resuelta
  sigue visible (en ámbar) hasta que el usuario la dispone en el cierre.

> **Decisión de producto pendiente:** soltar (`mit_for: null`) borra el rastro de
> que la tarea *fue* MIT ese día. Si se quiere preservar histórico de MITs, hace
> falta decidir el modelo (ver due/defer dates). Hasta entonces, `null` = "ya no
> es MIT", asumiendo pérdida del rastro.

## Field vs edge (cuándo cada uno)

```text
Si quieres navegarlo            → edge.
Si solo lo lees o filtras       → field.
Si explica causalidad           → edge con metadata.
Si no sabes para qué query sirve → no lo metas todavía.
```

`mentions` es el fallback deliberado: si una relación es ambigua, usa `mentions`
antes de inventar un edge. No introduzcas edge types nuevos sin razón concreta y
aprobación del usuario.

## Prohibiciones

- **No mutar fuera de una propuesta aprobada.** (La regla madre.)
- **No marcar MITs ni cerrar el día por iniciativa.** Invitar sí; commitear no.
- **No asumir el padre/área por el contexto reciente** de la conversación: las
  personas y tareas atraviesan áreas. Pregunta o deja sin padre. `part_of` es de
  **padre único**.
- **No topologizar automáticamente** sin revisión del usuario.
- **No usar SurrealQL para mutaciones** estructurales: usa la tool MCP estrecha.
- **No cambiar schema, tipos, edges, estados ni flujo** por iniciativa propia.
- **No reintroducir flujos legacy** (`raw → clarify → notes`, `commit_clarify`,
  `generate_report`, "reports" como entidad, `note_type:report`/`:note`).

## Recursos a tu disposición

| Recurso | Para qué |
|---|---|
| `huygens://lore/data-model` | El *qué*: entidades, edges, ciclo de proposal, superficie de tools. |
| `huygens://lore/surrealql-cookbook` | El *cómo leer*: recetas SurrealQL read-only verificadas. |
| `huygens://lore/schema` | El schema físico **en vivo** (tablas, campos, enums, índices). |
| Prompts `process_inbox` / `plan_day` / `review_day` | El guion paso a paso de cada modo. Son *deltas* sobre esta doctrina. |
