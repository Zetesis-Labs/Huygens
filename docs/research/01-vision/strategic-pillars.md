# Pilares Estratégicos — Dimensiones de Perspectiva

> Los Pilares son el esqueleto vertebrador de toda la memoria de Huygens. No son etiquetas, no son categorías, no son un menú desplegable. Son los ejes bajo los cuales se articula la existencia del usuario, y la BBDD los trata como ciudadanos de primera clase.

## El concepto: dimensiones, no categorías

La pregunta de la que nace este modelo es: ¿cómo clasificas algo que es simultáneamente "una sesión de meditación en la que se me ocurre cómo aplicar functors a la práctica contemplativa"?

Respuesta tradicional: o la mandas a "Salud", o la mandas a "Filosofía", o te inventas un cajón llamado "Misc". Ninguna refleja la realidad de la nota.

Respuesta de Huygens: la nota tiene **dos pilares simultáneamente** — `SOPHIA` (porque hay un contenido teórico sobre functors) y `PATHOS_SOMA` (porque la sesión meditativa es el sustrato corporal-afectivo donde ocurre). El campo en el modelo es un array, no un valor único:

```ts
type Note = {
  // ...
  pillars: Pillar[]  // siempre array, mínimo 0, sin máximo formal
}
```

Esto es lo que se quiere decir cuando se habla de **dimensiones ortogonales**: los Pilares no compiten entre sí. Son ejes en un espacio. Una nota puede tener proyección en uno, dos, tres o cuatro de esos ejes. Lo natural será que la mayoría tengan uno o dos; lo importante es que el modelo no lo impida.

## El origen: filosofía griega clásica

Los nombres no son decorativos. Vienen de la tradición filosófica griega y cada uno designa un modo distinto de operar del ser humano. Rubén tiene formación filosófica y eligió estos términos con intención. La elección es parte de la documentación: aclara qué se quiere decir y qué se descarta.

A continuación, los cuatro.

### Pathos & Soma

> Pathos (πάθος): aquello que se padece, lo afectivo, la pasión, la sensación. Soma (σῶμα): el cuerpo.

Este pilar agrupa todo lo que ocurre en y a través del cuerpo y la afectividad. Es un pilar deliberadamente fusionado: en la tradición griega, la separación cuerpo/mente que hereda Occidente (vía cartesianismo) no opera con la misma claridad. Pathos y Soma forman un continuo.

**Qué entra aquí**:

- Salud física: el problema crónico de cuello, el asma, la fisioterapia, el ejercicio, el sueño.
- Salud mental: estados de ánimo, ansiedad, frustración, momentos de claridad.
- Nutrición: dieta, hidratación, ayuno, suplementación.
- Meditación y práctica contemplativa: incluyendo el sustrato budista que el usuario cultiva.
- Cualquier nota que tenga como sujeto principal una sensación, una emoción o una intervención sobre el cuerpo.

**Qué NO entra**:

- "Comprar suplementos" es una tarea operativa (Éthos) que toca Pathos & Soma. Va a ambos.
- Una reflexión filosófica sobre la fenomenología del dolor es Sophia, aunque mencione el cuerpo.

### Éthos

> Éthos (ἦθος): costumbre, hábito, carácter. Aristóteles construye la ética sobre la idea de que el carácter se forja por repetición.

Es el pilar de la operativa diaria, la disciplina, el cómo-se-hacen-las-cosas. Si Telos es a dónde vamos y Sophia es qué pensamos sobre el camino, Éthos es **cómo lo recorremos un día tras otro**.

**Qué entra aquí**:

- GTD en su sentido técnico: inbox, clarification, next actions, weekly review (David Allen).
- Productividad: time blocking, deep work, gestión de interrupciones.
- Rutinas: la rutina matinal, la rutina de cierre del día, la rutina semanal.
- Hábitos en formación, hábitos en mantenimiento, hábitos en disolución.
- Metodología de trabajo: cómo abordo un proyecto, cómo decido prioridades, cómo manejo el contexto cuando salto entre repos.
- Disciplina: la dimensión virtuosa de la repetición.

**Por qué importa que sea su propio pilar**:

Mucha gente colapsa Éthos en Telos ("¿para qué hago la rutina? Para alcanzar X meta"). En la tradición aristotélica esa subordinación es errónea: el hábito virtuoso no es medio para un fin externo, **es constitutivo del agente**. El usuario que medita media hora cada mañana no lo hace para "ser productivo" — lo hace porque ese acto repetido construye el tipo de persona que es. Huygens respeta esa distinción.

### Telos

> Telos (τέλος): fin, propósito, aquello hacia lo cual algo se dirige.

El pilar de la dirección. Dónde voy, qué quiero conseguir, qué estoy construyendo. Es el pilar más fácil de entender en términos contemporáneos y también el más fácil de hipertrofiar.

**Qué entra aquí**:

- Propósito vital, las preguntas grandes: qué quiero hacer con mi vida profesional, qué tipo de obra quiero dejar.
- Visión a largo plazo: 3, 5, 10 años.
- Metas concretas: objetivos anuales, trimestrales.
- OKRs (Objectives and Key Results) cuando se trabajan en formato explícito.
- Proyecciones comerciales: ingresos esperados, hitos profesionales, decisiones de carrera.
- Libertad financiera: independencia económica, gestión patrimonial, planificación.

**Tensión sana con Éthos**:

Las notas de Telos sin Éthos correspondiente son sospechosas (objetivos sin operativa). Las notas de Éthos sin Telos detrás también lo son (rutinas que no tributan a nada). Una buena memoria estructurada permite ver esta tensión. Un informe narrativo bien generado la nombra cuando aparece.

### Sophia

> Sophia (σοφία): sabiduría, conocimiento teórico, en contraste con phronesis (sabiduría práctica).

El pilar del aprendizaje, la teoría, el pensamiento. Lo que el usuario lee, estudia, piensa, deduce. Es el pilar más "tradicionalmente intelectual" — y el que tiene más riesgo de canibalizar a los otros si no se acota.

**Qué entra aquí**:

- Conocimiento técnico profundo: teoría de categorías, programación funcional, sistemas de tipos.
- Filosofía: lecturas, posiciones, argumentos.
- Economía y política en clave teórica: escuela austríaca, libertarismo, anarcocapitalismo, lo que esté en lectura.
- Computación cuántica, teoría de la información, fundamentos.
- Estudios formales en curso.

**Qué NO entra**:

- "Apuntes sobre cómo usar Bun en monorepos" → eso es operativa de ingeniería, va a Éthos o sin pilar.
- "Tengo que estudiar Coecke este trimestre" → si es una meta del trimestre, es Telos. Si es la sesión concreta de estudio, es Sophia.

La distinción Sophia / Éthos en lo intelectual es: ¿estoy generando entendimiento (Sophia) o estoy ejecutando un protocolo (Éthos)?

## Implicaciones para el modelo de datos

El campo `pillars` en la entidad `Note` es:

```ts
type Pillar = "PATHOS_SOMA" | "ETHOS" | "TELOS" | "SOPHIA"

type Note = {
  // ...
  pillars: Pillar[]
}
```

Decisiones específicas:

- **Array, no enum único**. Una nota puede tener varios. La cardinalidad mínima es 0 (notas en inbox sin clasificar). La máxima formal es 4, pero en la práctica casi nunca llega.
- **Cardinalidad esperada**: la mayoría de notas tendrá 1 o 2 pilares. Una nota con 4 pilares es sospechosa — probablemente debería ser varias notas relacionadas.
- **Las notas en `INBOX` pueden tener `pillars: []`**. La asignación de pilar es parte del proceso de clarificación, no una restricción de entrada. El agente puede inferirlo después.

Detalle de implementación en SurrealDB: véase [pillars-and-states.md](../03-data-model/pillars-and-states.md).

## Por qué enum y no modelo editable

Una pregunta legítima: ¿por qué los pilares son un enum hardcodeado y `NoteType` es un árbol editable? Si Rubén descubriera mañana un quinto pilar, ¿no debería poder añadirlo en runtime?

**Respuesta**: no.

Los Pilares son **fundacionales y filosóficamente cargados**. No son una taxonomía operativa que crezca según el uso. Son ejes vertebradores que se eligieron deliberadamente y se quieren mantener estables a lo largo de toda la vida del sistema. Tres argumentos:

1. **Estabilidad semántica**. Los informes narrativos van a usar los Pilares como esqueleto durante años. Cambiar el conjunto de pilares retroactivamente rompe la comparabilidad histórica. "Cómo iba mi Pathos en Q1" debe significar lo mismo en 2026 y en 2030.

2. **Razonamiento del agente**. El agente está programado (vía prompt y herramientas) para razonar sobre cuatro dimensiones concretas. Añadir un quinto pilar no es sólo cambiar un enum: es reescribir cómo el agente clasifica y reporta. Eso se hace con migración consciente, no con un click en una UI.

3. **Coste aceptable de migración**. Si en el futuro Rubén descubre que necesita un quinto pilar — candidatos plausibles serían **Praxis** (acción transformadora del mundo), **Logos** (discurso, lenguaje), **Bios** (vida, comunidad) — se hace una migración de schema, se reescribe el prompt del agente, se regenera el subset de notas afectadas. Coste finito y asumible. Es preferible a tener un sistema "flexible" que diluya la semántica.

## Por qué importan a nivel arquitectónico

David Allen en _Getting Things Done_ describe los **Horizons of Focus**:

| Horizonte | Concepto |
|---|---|
| Runway (cota 0) | Acciones inmediatas |
| 10.000 ft | Proyectos actuales |
| 20.000 ft | Áreas de responsabilidad |
| 30.000 ft | Metas 1-2 años |
| 40.000 ft | Visión 3-5 años |
| **50.000 ft** | **Propósito y principios — quién soy** |

Los Pilares de Huygens son el equivalente al **50.000 ft, pero específicos del usuario**. No "propósito y principios" en abstracto, sino los cuatro ejes concretos bajo los cuales Rubén ha decidido leer su propia vida.

Esto tiene consecuencias arquitectónicas:

- **Los informes narrativos se vertebran por pilar**. Una review semanal no es una lista plana de tareas hechas; es una narración en cuatro secciones que cose lo operativo (Éthos), lo estratégico (Telos), lo intelectual (Sophia) y lo corporal-afectivo (Pathos & Soma).
- **Las queries vectoriales pueden filtrar por pilar**. "Encuéntrame notas similares a esta, pero sólo dentro de Sophia."
- **Los dashboards de actividad pueden agruparse por pilar**. Detectar negligencia de un pilar (e.g., "llevas tres semanas sin notas en Pathos & Soma") es una señal valiosa.

## Para profundizar

Para el Rubén curioso del futuro que vuelva aquí a entender por qué se eligieron estos cuatro:

- **David Allen — _Getting Things Done_**. Especialmente los capítulos sobre _Horizons of Focus_. Es la base GTD sobre la que se construye Éthos como pilar operativo.
- **Aristóteles — _Ética a Nicómaco_**. La distinción entre éthos (carácter formado por hábito) y pathos (afecto, pasión) es el corazón conceptual del par Éthos / Pathos. Libros II y VI son los más relevantes.
- **Aristóteles — _Metafísica_, libros sobre causas**. La distinción telos / causa final es de aquí.
- **Aristóteles — distinción sophia / phronesis**. Sabiduría teórica vs sabiduría práctica. _Ética a Nicómaco_ libro VI.
- **James Clear — _Atomic Habits_**. Para una versión contemporánea y aplicada del Éthos. Mucho menos profundo que Aristóteles pero útil operativamente.
- **Pierre Hadot — _Filosofía como forma de vida_**. Conexión entre teoría filosófica y práctica vital. Útil para entender por qué Sophia, Éthos y Pathos no son compartimentos estancos.

## Cierre

Los Pilares no son una decisión técnica disfrazada de decisión filosófica. Son una decisión filosófica con consecuencias técnicas. La memoria estructurada de Huygens existe para servir a una vida articulada en estos cuatro ejes; si los ejes cambian, el sistema cambia.

Para detalle del tipo en SurrealDB y cómo se enforza la cardinalidad, véase [pillars-and-states.md](../03-data-model/pillars-and-states.md). Para entender por qué el usuario eligió este vocabulario en concreto, véase [user-context.md](./user-context.md). Para la motivación general del proyecto, véase [motivation.md](./motivation.md).
