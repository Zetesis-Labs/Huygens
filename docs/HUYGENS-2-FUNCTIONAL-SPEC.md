# Huygens 2 — Briefing funcional para Fable

Fecha: 2026-07-06  
Estado: especificación funcional / briefing de objetivos  
Audiencia primaria: Fable  
Audiencia secundaria: agentes de diseño e implementación  
Origen: conversación de definición Fiser + Hermes

---

## 0. Cómo debe usar Fable este documento

Este documento no es un plan de implementación. Es un **briefing funcional** para que Fable entienda qué se quiere conseguir con Huygens 2 y qué límites no debe cruzar.

Fable debe usarlo para:

- validar la coherencia del modelo objetivo;
- detectar ambigüedades funcionales;
- refinar el diseño conceptual sin hincharlo;
- preservar las decisiones ya cerradas;
- convertir el deseo de “grafo operativo” en un sistema pequeño, usable y resistente a recaídas.

Fable **no** debe usarlo para:

- proponer una migración histórica completa;
- diseñar un cold archive;
- reabrir decisiones cerradas salvo contradicción grave;
- convertirlo en un plan de implementación paso a paso;
- diseñar Baúles como producto;
- añadir nuevas capas, rituales o auditoría rica por ansiedad de pérdida.

La petición a Fable, en una frase:

> Ayuda a diseñar Huygens 2 como un grafo operativo nuevo, pequeño y estructural, que conserve solo lo que sirve para actuar, decidir, coordinar o recordar contexto estable.

---

## 1. Resumen ejecutivo

Huygens 2 debe ser una reconstrucción limpia de Huygens como **grafo operativo**.

No debe ser:

- un archivo epistemológico;
- una memoria histórica total;
- un sistema de provenance exhaustiva;
- un diario de informes;
- un cementerio de captures/proposals;
- una capa producto tipo Baúles;
- una migración conservadora de Huygens 1.

La base antigua se considera **cantera**, no sistema a preservar. Se acepta pérdida real de datos.

La unidad de valor de Huygens 2 no es “todo lo que se dijo”, sino el **estado estructural actual con utilidad operativa**:

- entidades vivas o útiles;
- relaciones que cambian orientación o acción;
- estado actual;
- metadata mínima;
- event sourcing mínimo para controlar mutaciones.

Regla central:

> **KEEP si opera. DROP si solo explica historia.**

---

## 2. Problema que Huygens 2 resuelve

Huygens 1 acumuló demasiada masa alrededor de la trazabilidad y la narrativa:

- raw captures;
- proposals completas;
- narrative blocks;
- informes/reviews dentro del grafo;
- `about` / `affects` / `derived_from`;
- provenance rica;
- relaciones interpretativas masivas;
- historia de cómo se llegó a cada cosa;
- obligación implícita de revisar, procesar, cerrar o deduplicar material antiguo.

Eso era potente como sistema epistemológico, pero fallaba como sistema operativo.

El problema no era solo técnico. Era cognitivo:

- demasiadas cosas pedían atención;
- el grafo mezclaba acción, historia, evidencia, informes y mutaciones;
- revisar se volvía irresoluble;
- el agente podía emitir proposals “como churros”;
- la topología avanzada se volvía barro semántico;
- la captura dejaba de liberar y empezaba a generar deuda.

Huygens 2 nace para cortar eso.

---

## 3. Misión de Huygens 2

Huygens 2 debe ayudar a cuatro trabajos principales:

1. **Actuar**  
   Saber qué hacer, qué está activo, qué está bloqueado, qué está esperando.

2. **Decidir**  
   Ver frentes vivos, objetivos, proyectos, ideas fuertes y contexto estable.

3. **Coordinar**  
   Saber qué agentes, herramientas o dependencias intervienen.

4. **Recordar contexto estable**  
   Mantener referencias y estructura que reducen reexplicación futura.

La misión negativa es igual de importante:

> Huygens 2 no debe intentar conservar todo lo hablado, todo lo pensado ni todo lo inferido.

---

## 4. Decisiones no negociables

Estas decisiones están cerradas y Fable debe tratarlas como guardrails.

### 4.1 Grafo operativo

Huygens 2 será un **grafo operativo**, no epistemológico/auditable.

El hot graph solo contiene lo que ayuda a actuar, decidir, coordinar o recordar contexto estable.

### 4.2 Base nueva

Huygens 2 nace en una **base nueva limpia**.

No se hará purga in-place sobre la base actual.

### 4.3 Sin cold archive

No habrá cold archive.

También quedan descartados:

- snapshot markdown de seguridad;
- JSON histórico;
- segunda base consultable;
- archivo frío navegable;
- restauración nostálgica.

Se acepta pérdida real.

### 4.4 No migrar semántica histórica

No se migra la historia semántica de Huygens 1.

No migran:

- raw captures;
- bloques narrativos;
- bloques descriptivos como historia;
- proposals completas;
- provenance rica;
- `about`;
- `affects`;
- `derived_from`;
- informes diarios/semanales;
- reviews;
- explicaciones históricas;
- semántica conversacional antigua.

### 4.5 Solo grafo estructural compactado

La migración inicial, si existe, debe llevar solo:

- nodos estructurales con valor actual;
- edges operativos mínimos;
- estado actual;
- título/nombre;
- metadata mínima permitida.

### 4.6 Schema real nuevo

Huygens 2 debe tener schema real nuevo.

No basta con mapear mentalmente el schema viejo.

Deben existir realmente:

- `Agent`;
- `Tool`;
- nuevos edges operativos;
- estados depurados;
- eliminación de `CLARIFIED` como estado operativo.

### 4.7 Proposals siguen, pero no como memoria

Las proposals siguen existiendo como mecanismo de **mutación controlada / event sourcing**.

No son memoria operativa ni archivo histórico consultable.

---

## 5. Principio rector

La pregunta para decidir si algo pertenece al hot graph:

> ¿Esto cambia qué hago, qué decido, con quién/qué coordino, o qué contexto estable necesito recordar?

Si la respuesta es no, no pertenece al grafo operativo.

Formulación brutal:

> Si no cambia acción, decisión, coordinación o contexto estable, no entra.

---

## 6. Modelo canónico de tipos

Tipos permitidos en el hot graph:

1. `Area`
2. `Objective`
3. `Project`
4. `Task`
5. `Idea`
6. `Reference`
7. `Agent`
8. `Tool`

No añadir tipos nuevos salvo necesidad operativa clara y recurrente.

---

## 7. Definición funcional de tipos

### 7.1 Area

Un ámbito continuo de responsabilidad, interés o actividad.

Ejemplos:

- salud;
- trabajo;
- finanzas;
- sistemas;
- familia;
- investigación.

Función:

- organizar proyectos, objetivos, referencias e ideas;
- representar una zona estable de vida/trabajo;
- contener continuidad sin final natural.

No debe usarse para registrar historia ni informes.

Estados permitidos:

- `ACTIVE`
- `ARCHIVED`

No tiene `DONE`.

---

### 7.2 Objective

Un resultado deseado o dirección estratégica.

Función:

- orientar proyectos y tareas;
- expresar intención de alto nivel;
- conectar acción con propósito;
- permitir distinguir actividad de dirección.

Estados permitidos:

- `ACTIVE`
- `WAITING`
- `SOMEDAY`
- `DONE`
- `ARCHIVED`

---

### 7.3 Project

Un frente con resultado, tensión o entrega identificable.

Función:

- agrupar tareas, referencias, ideas y dependencias;
- representar una unidad de avance;
- servir como lugar natural para próximas acciones.

Regla importante:

> Un `Project` en `ACTIVE` sin tasks vivas no está automáticamente stale. Significa “sin próxima acción / necesita planificación” hasta que otra evidencia indique que está muerto.

Ese “necesita planificación” no debe persistirse como `planning_status`; debe ser una vista derivada:

```text
Project ACTIVE
+ sin Task ACTIVE/WAITING hija
= proyecto vivo sin próxima acción visible
```

Estados permitidos:

- `ACTIVE`
- `WAITING`
- `SOMEDAY`
- `DONE`
- `ARCHIVED`

---

### 7.4 Task

Una acción concreta, espera o unidad accionable.

Función:

- representar trabajo ejecutable;
- representar esperas reales (`WAITING`);
- conectar bloqueos y dependencias;
- permitir decidir “qué hago ahora”.

No se migran tasks `DONE` desde Huygens 1.

Huygens 2 sí puede producir tasks `DONE` futuras una vez exista el nuevo sistema.

Estados permitidos:

- `ACTIVE`
- `WAITING`
- `SOMEDAY`
- `DONE`
- `ARCHIVED`

Metadata permitida:

- `due_at`
- `defer_until`

Nada más por defecto.

---

### 7.5 Idea

Una posibilidad fértil que aún no es proyecto, tarea ni referencia.

Función:

- conservar posibilidades con valor;
- aparcar intuiciones útiles;
- alimentar proyectos u objetivos futuros;
- evitar convertir cada ocurrencia en obligación.

Una idea debe tener valor operativo o creativo real.

No deben migrar:

- ideas flojas;
- ocurrencias históricas;
- ideas huérfanas sin área/proyecto/objetivo;
- ideas que solo explican una conversación pasada.

Estados permitidos:

- `ACTIVE`
- `SOMEDAY`
- `ARCHIVED`

No tiene `DONE`.

Si una idea se ejecuta o cristaliza, normalmente debe transformarse en Project/Task/Reference o archivarse como idea superada.

---

### 7.6 Reference

Contexto estable reutilizable.

Función:

- conservar información que reduce reexplicación;
- enlazar fuentes externas;
- servir como base de consulta;
- sostener proyectos, áreas, tools o decisiones recurrentes.

No debe ser:

- log;
- informe histórico;
- review;
- raw capture embellecida;
- proposal disfrazada.

Estados permitidos:

- `ACTIVE`
- `ARCHIVED`

No tiene `DONE`.  
No tiene `SOMEDAY`: una reference es útil o se archiva.

Metadata permitida:

- `source`
- `url`

---

### 7.7 Agent

Un actor, contraparte o entidad social/organizativa con la que se opera, coordina o que importa operacionalmente.

`Agent` no significa “cualquier sistema externo”. Para software, servicios, instrumentos o infraestructura existe `Tool`.

`Agent` puede representar:

- amigo;
- familia;
- cliente;
- contacto;
- equipo;
- agente de IA;
- institución.

Estados permitidos:

- `ACTIVE`
- `ARCHIVED`

No tiene `DONE`.

Campo obligatorio:

- `agent_kind`

Valores permitidos:

- `friend`
- `family`
- `client`
- `contact`
- `team`
- `ai_agent`
- `institution`

---

### 7.8 Tool

Un instrumento GTD: sistema, software, servicio, infraestructura, canal o medio usado para operar.

Ejemplos:

- Hermes;
- Huygens;
- GitHub;
- Google Calendar;
- Telegram;
- PostgreSQL;
- Codex CLI;
- Claude Code;
- un MCP server;
- una CLI;
- un proveedor técnico.

Estados permitidos:

- `ACTIVE`
- `ARCHIVED`

No tiene `DONE`.

No tiene `kind` obligatorio.

---

## 8. Regla de frontera: Agent vs Tool

Esta frontera es importante.

### 8.1 Agent

Usar `Agent` cuando la entidad tiene papel de actor o contraparte:

- decide;
- responde;
- coordina;
- espera algo;
- bloquea algo por acción/no acción;
- representa una persona, grupo, cliente, institución o agente de IA.

Ejemplos:

- “Irontec como cliente” → `Agent(kind=client)`
- “Fable como agente de diseño” → `Agent(kind=ai_agent)`
- “equipo de infraestructura” → `Agent(kind=team)`

### 8.2 Tool

Usar `Tool` cuando la entidad es instrumento, sistema o servicio:

- se usa;
- falla;
- se configura;
- se integra;
- se depende técnicamente de ella;
- no actúa como contraparte social/organizativa.

Ejemplos:

- “GitHub” → `Tool`
- “Telegram” → `Tool`
- “Codex CLI” → `Tool`
- “Huygens MCP” → `Tool`

### 8.3 Entidades híbridas

Algunas cosas pueden tener doble aspecto.

Ejemplo:

- “Codex como herramienta CLI” → `Tool`
- “Codex como agente que ejecuta una tarea y propone cambios” → `Agent(kind=ai_agent)`

Regla:

> Si importa como capacidad usada, modelar como `Tool`. Si importa como actor responsable o contraparte, modelar como `Agent`.

Puede haber dos nodos si ambos papeles son operacionalmente útiles, pero no por defecto.

---

## 9. Estados operativos

Estados permitidos globalmente:

- `ACTIVE`
- `WAITING`
- `SOMEDAY`
- `DONE`
- `ARCHIVED`

`CLARIFIED` desaparece.

### 9.1 Por qué desaparece CLARIFIED

`CLARIFIED` es ambiguo:

- no dice si algo está vivo;
- no dice si exige acción;
- no dice si está aparcado;
- no dice si está muerto;
- funciona como comodidad del agente, no como estado operativo.

Si algo está “clarificado pero no decidido”, debe resolverse como:

- `ACTIVE`, si está vivo;
- `WAITING`, si depende de algo;
- `SOMEDAY`, si se aparca conscientemente;
- `ARCHIVED`, si no importa;
- inbox/pending, si aún no debe entrar al grafo.

### 9.2 Matriz de estados por tipo

```text
Area       ACTIVE, ARCHIVED
Objective  ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
Project    ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
Task       ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED
Idea       ACTIVE, SOMEDAY, ARCHIVED
Reference  ACTIVE, ARCHIVED
Agent      ACTIVE, ARCHIVED
Tool       ACTIVE, ARCHIVED
```

Regla:

> Si un tipo no puede estar “hecho”, no tiene `DONE`.

---

## 10. Metadata mínima

La metadata debe ser deliberadamente escasa.

No queremos recrear Huygens 1 con campos nuevos.

### 10.1 Permitida

```text
Task:
  due_at
  defer_until

Reference:
  source
  url

Agent:
  agent_kind

Area/Object/Project/Idea/Tool:
  nada obligatorio
```

Nota: `Objective` se usa como tipo; si el schema internamente usa otro nombre, el concepto funcional sigue siendo `Objective`.

### 10.2 Excluida por defecto

No introducir por defecto:

- `priority`;
- `planning_status`;
- `last_reviewed_at`;
- `reviewed_by`;
- campos psicológicos;
- campos de coaching;
- scores semánticos persistidos;
- metadata de provenance;
- resumen histórico;
- campos derivados que puedan computarse desde topology.

Regla:

> Si se puede calcular desde estado + edges, no se persiste.

---

## 11. Relaciones operativas

Huygens 2 usa un conjunto pequeño de relaciones inspiradas en Jira, pero adaptadas a un grafo operativo personal.

Relaciones canónicas:

1. `part_of`
2. `blocked_by`
3. `depends_on`
4. `owned_by`
5. `relates_to`
6. `duplicates`

No añadir edge types nuevos sin necesidad operativa clara y recurrente.

---

## 12. Semántica de relaciones

### 12.1 part_of

Relación jerárquica/estructural.

Función:

- dar lugar topológico;
- permitir navegación;
- organizar áreas, objetivos, proyectos, tareas, ideas y referencias.

Ejemplos:

```text
Task part_of Project
Project part_of Area
Project part_of Objective
Idea part_of Area/Project/Objective
Reference part_of Area/Project/Tool si es contexto estable de ese frente
```

Invariantes deseables:

- un nodo operativo debe tener parent cuando el parent es claro;
- evitar huérfanos;
- evitar ciclos;
- preferir un parent canónico salvo que el diseño técnico permita multi-parent de forma explícita y controlada.

Regla de admisión:

> Si el parent es claro desde el mandato del usuario, el `part_of` debe entrar con el nodo. Si no es claro, preguntar o dejar en inbox/pending explícito.

---

### 12.2 blocked_by

Bloqueo real.

Indica que un nodo no puede avanzar por otro nodo, Agent, Tool o condición modelada.

Ejemplos:

```text
Task blocked_by Agent
Project blocked_by Tool
Task blocked_by Task
Project blocked_by Agent
```

Uso correcto:

- bloqueo accionable;
- espera externa;
- dependencia que impide avanzar;
- obstáculo real.

Uso incorrecto:

- asociación blanda;
- “tiene que ver con”;
- dependencia que no impide avanzar.

Relación con `WAITING`:

- un `Task` en `WAITING` debería poder explicar su espera mediante `blocked_by`, `depends_on`, `owned_by` externo o una nota clara;
- `blocked_by` no tiene que cambiar automáticamente el estado, pero en UI/reporting debe aparecer como bloqueo.

Evitar mencionar “evento” como tipo si no existe `Event`. Si hay un evento externo, modelarlo como Task/Reference/Agent/Tool según su función o no modelarlo.

---

### 12.3 depends_on

Dependencia no necesariamente bloqueante.

Ejemplos:

```text
Project depends_on Tool
Task depends_on Reference
Project depends_on Agent
Objective depends_on Project
```

Diferencia con `blocked_by`:

- `depends_on` = importa para el éxito o comprensión;
- `blocked_by` = detiene el avance.

Si una dependencia pasa a impedir avanzar, puede cambiar a `blocked_by` o añadirse bloqueo explícito.

---

### 12.4 owned_by

Responsabilidad o ownership operativo.

Ejemplos:

```text
Project owned_by Agent
Task owned_by Agent
Tool owned_by Agent/Team
```

No debe convertirse en sistema de permisos.

Función:

- saber quién lleva algo;
- saber a quién esperar;
- coordinar responsabilidades.

---

### 12.5 relates_to

Relación blanda, escasa y explícitamente útil.

Reemplaza conceptualmente al antiguo `mentions` como vínculo laxo.

Regla:

> `relates_to` no debe ser un junk drawer. Si el vínculo no aporta navegación, decisión o coordinación, no se enlaza.

Uso correcto:

- conectar una idea con un proyecto relacionado;
- conectar una reference con una tool relevante;
- conectar dos proyectos cuando la relación ayuda a decidir.

Uso incorrecto:

- registrar cada mención semántica;
- sustituir provenance;
- enlazar por “parecido” sin utilidad.

---

### 12.6 duplicates

Relación de deduplicación/limpieza.

Ejemplos:

```text
Idea duplicates Idea
Task duplicates Task
Reference duplicates Reference
```

Debe ayudar a limpiar el grafo.

Regla funcional:

- debe haber un nodo canónico;
- el duplicado debe apuntar al canónico o quedar claramente marcado;
- no debe crear una red de duplicados ambigua.

---

## 13. Restricciones de topology

### 13.1 Huérfanos

No debe haber huérfanos operativos por pereza.

Aceptable:

- inbox/pending explícito;
- entidad sin parent porque realmente no hay parent claro todavía.

No aceptable:

- crear ideas, tasks o references sin parent cuando el área/proyecto/objetivo está claro.

### 13.2 Ciclos

El grafo debe evitar ciclos en `part_of`.

Ejemplo prohibido:

```text
Project A part_of Area B
Area B part_of Project A
```

### 13.3 Jerarquía vs asociación

Usar `part_of` solo para pertenencia estructural.

No usar `part_of` para:

- “tiene relación con”;
- “lo mencionó”;
- “se parece a”;
- “depende de”.

### 13.4 Derivados no persistidos

Vistas derivadas que no deben persistirse como campos:

```text
Project ACTIVE sin tasks vivas => necesita planificación
Task WAITING sin explicación => espera incompleta / higiene pendiente
Nodo sin parent => huérfano operativo o inbox
```

---

## 14. Conceptos excluidos del hot graph

No forman parte de la navegación diaria:

- `mentions` como relación principal;
- `about`;
- `affects`;
- `derived_from`;
- raw captures procesadas;
- full proposals;
- narrative reports;
- day/week review blocks;
- provenance rica;
- informes como nodos operativos;
- semantic summaries antiguos.

`mentions` puede existir como legacy durante transición, pero Huygens 2 debe preferir `relates_to`.

`about`/`affects` pueden existir en sistemas técnicos legacy o logs internos, pero no deben formar el paisaje operativo.

---

## 15. Event sourcing mínimo

Las proposals siguen siendo importantes, pero solo como control de mutación.

Función:

> proposal/event sourcing = mecanismo de mutación controlada, revisión humana y trazabilidad mínima.

No son:

- memoria semántica;
- archivo histórico;
- informe;
- unidad de navegación;
- cosa que haya que revisar en rutina.

### 15.1 Commit log mínimo

Cada commit debe conservar:

- `commit_id`
- `fecha`
- `actor`
- `resumen`
- `ids_afectados`
- `diff_compacto`

### 15.2 Actor

`actor` indica quién ejecuta o propone materialmente el cambio.

Ejemplos:

- `Fiser`
- `Hermes`
- `Codex`
- `Claude Code`
- `Fable`
- `huygens-worker`
- `migration-script`

No implica un sistema complejo de permisos.

### 15.3 Diff compacto

`diff_compacto` debe ser pequeño y operacional.

Ejemplo conceptual:

```json
{
  "created": ["note:abc"],
  "updated": ["note:def"],
  "deleted": [],
  "edges_added": 3,
  "edges_removed": 1,
  "states_changed": [
    {"id": "note:x", "from": "ACTIVE", "to": "DONE"}
  ]
}
```

No debe guardar narrativa larga ni provenance rica.

---

## 16. Informes, reports y reviews

Los informes no pertenecen por defecto al hot graph.

Regla:

> Informe ≠ nota operativa.

Los reports son artefactos externos de pensamiento, orientación o comunicación. Solo sus consecuencias operativas explícitamente promovidas entran al grafo.

### 16.1 Dónde viven

Pueden vivir como:

- markdown;
- fichero;
- mensaje;
- artefacto externo deliberado.

Pero eso no debe confundirse con cold archive.

Un informe externo no es:

- snapshot masivo;
- export histórico;
- segundo Huygens;
- cementerio searchable de todo lo viejo.

### 16.2 Reviews pequeñas

En rescue/autopsy, evitar revisiones totales.

Preferir:

- slices pequeñas;
- valor visible;
- `reviewed_this_session` local;
- no re-preguntar lo ya revisado;
- disposición concreta por ítem.

Disposiciones posibles:

- `keep`
- `drop`
- `someday`
- `next_action`
- `waiting`
- `archive`

---

## 17. Política de admisión al hot graph

### 17.1 Promoción explícita

Nada entra al grafo sin promoción explícita.

Conversación, exploración, brainstorming, crítica y pensamiento en voz alta son efímeros por defecto.

Triggers válidos:

- “guárdalo”;
- “asienta esto”;
- “actualiza X”;
- “haz una proposal”;
- “commitéalo”;
- “usa Huygens”;
- “procesa la inbox”.

Si no hay mandato, no se captura ni se propone.

### 17.2 Topología obligatoria si es clara

Si se promueve una entidad y el área/proyecto/objetivo es claro, debe entrar con topología.

No crear huérfanos por pereza.

Si no está claro:

- preguntar;
- o dejar en inbox/pending explícito.

### 17.3 Inbox/pending

Debe existir solo como zona temporal de decisión, no como archivo.

Función:

- contener lo que aún no se puede colocar;
- permitir decidir si algo entra o muere;
- evitar crear nodos operativos mal topologizados.

No debe ser:

- raw archive permanente;
- backlog infinito;
- replacement de Huygens 1;
- lugar donde todo “importante” se acumula.

Regla:

> Inbox existe para decidir entrada, no para conservar historia.

---

## 18. Política de selección del grafo inicial

La selección inicial desde Huygens 1 debe migrar solo lo que tenga valor operativo actual.

### 18.1 Sí migra

- áreas útiles;
- objetivos vivos o someday con valor;
- proyectos `ACTIVE`, `WAITING` o `SOMEDAY` con valor;
- tasks `ACTIVE`, `WAITING` o `SOMEDAY` con valor;
- ideas `ACTIVE` o `SOMEDAY` fuertes;
- references útiles;
- agents relevantes;
- tools relevantes;
- edges operativos mínimos.

### 18.2 No migra

- tasks `DONE`;
- nodos que solo explican historia;
- ideas flojas;
- references que son logs;
- informes;
- reviews;
- narrative blocks;
- raw captures;
- full proposals;
- provenance;
- `about` / `affects` / `derived_from`;
- metadata derivada.

### 18.3 SOMEDAY sí puede migrar

`SOMEDAY` no significa basura.

Puede migrar si conserva valor real:

- idea fuerte aparcada;
- proyecto futuro relevante;
- objetivo futuro;
- task aparcada pero todavía válida.

Matiz:

- `Reference` no es `SOMEDAY`; una reference útil migra como `ACTIVE`, o no migra / se archiva.

---

## 19. Rúbrica KEEP / DROP / ASK

### 19.1 KEEP

Conservar si cumple al menos una:

- está vivo ahora;
- tiene próxima acción;
- bloquea algo vivo;
- coordina con un Agent relevante;
- depende de una Tool relevante;
- es contexto estable reutilizable;
- es una idea fuerte vinculada a Area/Project/Objective;
- es un nodo estructural necesario para entender un frente vivo.

### 19.2 DROP

Descartar si:

- solo explica historia;
- solo conserva cómo se llegó a una decisión;
- es task `DONE` histórica;
- es informe/review viejo;
- es raw/proposal/provenance;
- es idea floja;
- no tiene parent ni función clara;
- crea más deuda de revisión que orientación.

### 19.3 ASK

Pedir decisión humana si:

- parece útil pero no tiene parent claro;
- no se sabe si sigue vivo;
- podría ser idea fuerte o ruido;
- podría ser reference útil o log;
- hay duplicados y no está claro el canónico;
- hay valor emocional/histórico pero no operativo.

---

## 20. Lifecycle funcional

Esta sección no es plan de implementación. Define comportamientos esperados.

### 20.1 Idea que cristaliza

Cuando una idea se convierte en acción:

- puede crear un Project;
- puede crear una Task;
- puede crear una Reference;
- la Idea original puede archivarse o relacionarse con `relates_to` si sigue aportando contexto.

No debe quedar como idea activa duplicando el nuevo frente.

### 20.2 Task completada

Una task completada en Huygens 2 puede pasar a `DONE`.

Pero las tasks `DONE` históricas de Huygens 1 no migran.

### 20.3 Proyecto completado

Un Project puede pasar a `DONE` si su resultado se alcanzó.

Si solo deja de importar, debe pasar a `ARCHIVED`.

### 20.4 Parent archivado

Archivar un parent no debe implicar necesariamente cascada automática.

La cascada puede ser peligrosa. Debe ser decisión explícita o propuesta visible.

### 20.5 Duplicados

Cuando se detecta duplicado:

- elegir nodo canónico;
- marcar el otro con `duplicates`;
- si procede, archivar/eliminar el duplicado;
- evitar redes ambiguas de duplicados.

---

## 21. Riesgos de recaída

Huygens 2 debe diseñarse contra sus propias tentaciones.

Riesgos principales:

1. Reintroducir provenance rica por ansiedad de pérdida.
2. Convertir `relates_to` en el nuevo `mentions`.
3. Migrar demasiado por nostalgia.
4. Dejar projects activos sin próxima acción invisibles.
5. Crear reports que pidan ser procesados.
6. Convertir inbox en archivo.
7. Usar `SOMEDAY` como basurero.
8. Mezclar Agent y Tool.
9. Persistir campos derivados como metadata.
10. Reconstruir Huygens 1 con nombres nuevos.
11. Usar Huygens para capturar la conversación sobre si Huygens captura demasiado.
12. Pivotar a Baúles/product layer durante el rescate.

---

## 22. Reglas anti-recaída

1. Nada entra al grafo sin promoción explícita.
2. Nada huérfano salvo inbox/pending real.
3. Informes van fuera del grafo salvo promoción explícita.
4. Proposals son mutación, no memoria.
5. Raws procesados no forman cementerio operativo.
6. Cada entidad debe tener tipo, estado y función operacional.
7. `relates_to` no se usa como cubo de basura.
8. No se crean nuevos edge types sin necesidad operativa clara.
9. No se reintroduce `CLARIFIED`.
10. No se persisten derivados calculables.
11. No se migra task `DONE` histórica.
12. No se crea cold archive bajo otro nombre.
13. No se diseña Baúles dentro de este refactor.

---

## 23. Baúles queda fuera

Baúles puede ser una capa producto/comercial sobre Huygens en otra conversación.

Distinción:

```text
Huygens = motor técnico / MCP / grafo operativo personal
Baúles  = posible capa producto con usuarios, permisos, invitaciones, colaboración
```

En este refactor, Baúles queda fuera salvo petición explícita.

Fable no debe convertir este documento en diseño de producto multiusuario.

---

## 24. Experiencia deseada

Huygens 2 debe sentirse:

- pequeño;
- navegable;
- accionable;
- estructural;
- no ceremonial;
- no burocrático;
- no culpabilizante;
- no lleno de informes;
- no saturado de provenance;
- útil para orientación rápida.

El usuario debe poder confiar en que:

- lo vivo está vivo;
- lo muerto no molesta;
- lo aparcado está aparcado conscientemente;
- los reports no crean deuda;
- las referencias son útiles;
- las ideas supervivientes merecen estar;
- los proyectos activos muestran o revelan próximas acciones.

---

## 25. Preguntas que Huygens 2 debe responder bien

Huygens 2 debe facilitar respuestas a:

- ¿qué frentes tengo vivos?
- ¿qué está bloqueado?
- ¿qué depende de quién o de qué?
- ¿qué Agent lleva o bloquea algo?
- ¿qué Tool interviene o falla?
- ¿qué ideas fuertes tengo aparcadas?
- ¿qué references siguen siendo útiles?
- ¿qué projects activos no tienen próxima acción?
- ¿qué tasks están waiting y por qué?
- ¿qué nodos están huérfanos y requieren decisión?
- ¿qué duplicados deben colapsarse?

No debe obligar a responder:

- ¿qué dijimos hace tres semanas exactamente?
- ¿de qué raw salió cada frase?
- ¿qué proposal histórica generó este bloque?
- ¿qué informe viejo queda sin procesar?

Eso pertenece al mundo que estamos dejando atrás.

---

## 26. Criterios funcionales de aceptación

Huygens 2 cumple el objetivo si puede:

1. Mostrar todos los Projects `ACTIVE` agrupados por Area/Objective.
2. Mostrar Projects `ACTIVE` sin Task `ACTIVE/WAITING` hija como “sin próxima acción visible”.
3. Mostrar Tasks `WAITING` con su bloqueo/dependencia/responsable si existe.
4. Mostrar bloqueos por Agent y por Tool.
5. Mostrar dependencias no bloqueantes sin confundirlas con bloqueos.
6. Listar Ideas `SOMEDAY` con parent claro.
7. Listar References `ACTIVE` útiles por Area/Project/Tool.
8. Detectar huérfanos operativos.
9. Detectar `relates_to` excesivo o sin utilidad.
10. Detectar duplicados y su canónico.
11. Rechazar o señalar `CLARIFIED`.
12. Rechazar metadata no permitida por tipo.
13. Mantener reports fuera del hot graph.
14. Registrar commits con log mínimo.
15. Evitar que raw/proposal/provenance aparezcan en navegación diaria.

---

## 27. Fuera de alcance para Fable

Fable no debe entregar:

- plan de implementación;
- comandos;
- migraciones SurrealQL;
- diseño detallado de DB;
- endpoints MCP;
- estrategia de testing;
- plan de despliegue;
- UI;
- diseño de Baúles;
- export histórico;
- cold archive;
- sistema multiusuario;
- permission model;
- plan de restauración de Huygens 1.

Puede señalar implicaciones técnicas, pero no convertir el documento en backlog.

---

## 28. Resultado esperado de Fable

Una buena respuesta de Fable debería:

- confirmar si el modelo funcional es coherente;
- detectar ambigüedades restantes;
- proponer ajustes mínimos al modelo;
- preservar la orientación operacional;
- advertir riesgos de recaída;
- no reabrir decisiones cerradas sin razón fuerte;
- no sobrediseñar;
- no proponer cold archive;
- no llevar el debate a Baúles.

Si Fable propone cambios, deberían tener esta forma:

```text
Problema funcional detectado
→ Por qué importa operacionalmente
→ Ajuste mínimo propuesto
→ Qué decisión existente toca o no toca
```

---

## 29. Checklist de alineación conceptual

- [ ] Huygens 2 es grafo operativo, no epistemológico/auditable.
- [ ] Nace en base nueva.
- [ ] No hay cold archive.
- [ ] No hay snapshot histórico.
- [ ] No se migra semántica histórica.
- [ ] Solo migra estructura compactada con valor.
- [ ] Proposals son mutación controlada, no memoria.
- [ ] Reports viven fuera del hot graph.
- [ ] No se reintroduce `CLARIFIED`.
- [ ] No se reintroduce provenance rica por otra puerta.
- [ ] No se diseña Baúles.

---

## 30. Checklist de modelo funcional

- [ ] Tipos: `Area`, `Objective`, `Project`, `Task`, `Idea`, `Reference`, `Agent`, `Tool`.
- [ ] `Agent` usa `agent_kind` controlado.
- [ ] `Tool` existe separado y sin kind obligatorio.
- [ ] Estados válidos dependen del tipo.
- [ ] `DONE` solo existe donde tiene sentido.
- [ ] `Reference` no tiene `SOMEDAY`.
- [ ] `Task` solo añade `due_at` y `defer_until`.
- [ ] `Reference` solo añade `source` y `url`.
- [ ] Edges: `part_of`, `blocked_by`, `depends_on`, `owned_by`, `relates_to`, `duplicates`.
- [ ] `relates_to` no sustituye a provenance ni se vuelve junk drawer.
- [ ] `part_of` no tiene ciclos.
- [ ] Huérfanos operativos se detectan o evitan.
- [ ] `WAITING` tiene explicación operacional.
- [ ] Commit log mínimo: `commit_id`, `fecha`, `actor`, `resumen`, `ids_afectados`, `diff_compacto`.

---

## 31. Frase canónica

> Huygens 1 no se refactoriza. Huygens 1 se mina. Huygens 2 nace como un grafo operativo nuevo, pequeño y estructural, migrando solo nodos y relaciones con valor actual.

---

## 32. Núcleo irreducible

Si todo el documento tuviera que reducirse a una sola especificación:

```text
Construir una base nueva de Huygens como grafo operativo.
Conservar solo nodos estructurales vivos/útiles y relaciones accionables.
Eliminar historia semántica, provenance rica, reports, raws y proposals completas del hot graph.
Usar tipos mínimos: Area, Objective, Project, Task, Idea, Reference, Agent, Tool.
Usar edges mínimos: part_of, blocked_by, depends_on, owned_by, relates_to, duplicates.
Usar estados mínimos sin CLARIFIED.
Guardar solo event log mínimo por commit.
Diseñar contra la recaída: nada entra sin promoción explícita, nada queda huérfano si el parent es claro, nada histórico se conserva por nostalgia.
```
