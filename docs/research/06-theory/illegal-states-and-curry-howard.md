# Illegal states unrepresentable y la correspondencia de Curry-Howard

> "El schema es un programa. Los datos son sus ejecuciones."

## Tesis

El schema de Huygens **es** un programa en un lenguaje declarativo. Sus tipos y constraints son **proposiciones lógicas**. Los datos que sobreviven a su validación son **pruebas constructivas** de esas proposiciones. Esto no es metáfora ni juego de palabras: es una lectura formal posibilitada por la correspondencia de Curry-Howard, uno de los descubrimientos más profundos del siglo XX en lógica matemática y teoría de tipos.

Una BBDD bien tipada hace **illegal states unrepresentable** — los estados inválidos no pueden ni siquiera existir en el sistema. No los validas; **no los representas**. Y eso, traducido al lenguaje de Curry-Howard, significa que has construido un sistema donde ciertas proposiciones falsas no admiten prueba.

Este documento funde dos ideas y desarrolla sus consecuencias para Huygens:

1. **"Make illegal states unrepresentable"** — el principio ingenieril de Yaron Minsky.
2. **La correspondencia de Curry-Howard** — el isomorfismo entre lógica y computación.

Y muestra cómo ambas se manifiestan, ergonómicamente, en el schema declarativo de SurrealDB.

---

## 1. "Make illegal states unrepresentable"

### 1.1. El principio

Yaron Minsky, en Jane Street, popularizó esta frase como manifiesto del type-driven design. La idea es elemental pero subversiva: en lugar de **validar** invariantes en runtime con condicionales y excepciones, **codifícalas en los tipos** para que el código que viola las invariantes **no compile**.

Validación en runtime:

```typescript
function loadUser(state: 'loading' | 'loaded' | 'failed', user: User | null, error: Error | null) {
  if (state === 'loaded' && user === null) throw new Error('Inconsistent state');
  if (state === 'failed' && error === null) throw new Error('Inconsistent state');
  if (state === 'loading' && (user !== null || error !== null)) throw new Error('Inconsistent state');
  // ... lógica real
}
```

Cinco condicionales solo para impedir estados inválidos. La razón: el tipo del input permite combinaciones imposibles. `state='loaded'` con `user=null` y `error=new Error(...)` es un valor válido del tipo, pero semánticamente absurdo.

Versión con illegal states unrepresentable:

```typescript
type LoadState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'failed'; error: Error };

function loadUser(state: LoadState<User>) {
  // No hay nada que validar. El tipo lo impide.
  switch (state.status) {
    case 'loading': return /* ... */;
    case 'loaded': return state.data; // TypeScript sabe que data existe.
    case 'failed': return state.error;
  }
}
```

El estado inválido `{ status: 'loaded', error: ... }` ya **no tiene representación** en el tipo. No existe. No se puede construir. La validación es **estructural**.

### 1.2. Familias de patrones

Hay un puñado de patrones recurrentes para hacer illegal states unrepresentable:

**Discriminated unions / tagged sum types.** Una de las construcciones más poderosas de los lenguajes funcionales modernos. `type Result<T,E> = Ok<T> | Err<E>` colapsa la convención "devuelve null en error" en algo donde el caso de error no puede ignorarse.

**Phantom types.** Tipos que existen solo en el sistema de tipos, sin runtime:

```typescript
type Authenticated = { __brand: 'authenticated' };
type Anonymous = { __brand: 'anonymous' };
type Session<S> = { id: string; _state: S };

function adminEndpoint(session: Session<Authenticated>) { /* ... */ }
const anon: Session<Anonymous> = /* ... */;
adminEndpoint(anon); // compile error
```

**Refinement types.** Tipos con predicados embebidos: `NonEmptyList<T>` (lista garantizada no vacía), `Pos<int>` (entero positivo). Si el tipo dice "no vacía", el resto del código no valida.

**Non-empty constructors.** En lugar de `User { email: string }` (que admite `""`), `User.create(email: Email)` donde `Email` es un tipo que solo se construye desde un parser que valida. Una vez tienes el `Email`, no vuelves a chequear.

**State machines tipadas.** Cada estado es un tipo distinto; las transiciones son funciones de un tipo a otro. Imposible llamar a `complete()` sobre un `Draft`.

### 1.3. Aplicado a BBDD

El insight: una BBDD declarativa con `SCHEMAFULL` + `ASSERT` es una forma de illegal states unrepresentable a nivel de **persistencia**. No te limita solo a runtime de la aplicación — el dato inválido nunca se persiste. La inconsistencia no entra en el sistema. Y esto es más fuerte que validación en aplicación, porque:

- La BBDD es accesible desde múltiples clientes (agentes, scripts, mcp tools, sql directo).
- Cualquier path que intente persistir un estado ilegal falla.
- No depende de que recuerdes validar.

Es illegal-states-unrepresentable **horizontal**, no solo dentro del runtime de una app.

---

## 2. La correspondencia de Curry-Howard

### 2.1. El descubrimiento

A mediados del siglo XX, varios investigadores notaron — independientemente — un paralelismo entre la lógica intuicionista y los sistemas de tipos del cálculo lambda. Haskell Curry lo intuyó en 1934; William Howard lo formalizó en 1969 ("The Formulae-as-Types Notion of Construction"). De Bruijn, Lambek y otros lo desarrollaron. Hoy se conoce como **correspondencia (o isomorfismo) de Curry-Howard**.

El descubrimiento, expresado crudamente: **los tipos son proposiciones; los programas son pruebas**.

### 2.2. El mapping

Más precisamente, el isomorfismo establece correspondencias estructurales entre construcciones lógicas y construcciones tipo-teóricas:

| Lógica | Teoría de tipos |
|---|---|
| Proposición `P` | Tipo `P` |
| Implicación `P → Q` | Tipo función `P → Q` |
| Conjunción `P ∧ Q` | Producto / tupla `P × Q` |
| Disyunción `P ∨ Q` | Suma / unión etiquetada `P + Q` |
| Verdadero `⊤` | Tipo unidad `Unit` (un solo valor) |
| Falso `⊥` | Tipo vacío `Void` (ningún valor) |
| Negación `¬P` | `P → ⊥` (función a vacío) |
| Cuantificación universal `∀x. P(x)` | Tipo dependiente `Π x. P(x)` |
| Cuantificación existencial `∃x. P(x)` | Tipo dependiente `Σ x. P(x)` |
| Demostración de `P` | Programa de tipo `P` |

**Para construir una prueba de `P ∧ Q`, debes construir un par `(p, q)` donde `p : P` y `q : Q`.** Las dos cosas son la misma operación.

### 2.3. Consecuencias profundas

Esta correspondencia tiene consecuencias que se pierden en la presentación rápida:

- **Programar con tipos ricos es demostrar teoremas.** Cada vez que satisfaces el type-checker en Idris o Coq, has construido una prueba formal.
- **Type-checking es proof-checking.** El compilador, cuando verifica que tu programa tipa, está verificando que tu prueba es correcta.
- **Programas como objetos matemáticos.** No son secuencias de instrucciones — son testigos constructivos de proposiciones.
- **Bottom (`⊥`) y excepciones.** Un programa que lanza una excepción o entra en bucle infinito "tiene tipo `⊥`" porque puede pretender tener cualquier tipo. Por eso los lenguajes con sistemas de tipos rigurosos exigen totalidad — sin excepciones, sin no-terminación — para que la correspondencia sea limpia. Coq, Agda, Idris son lenguajes _totales_.

### 2.4. La extensión al dominio dependiente

La versión completa de la correspondencia incluye cuantificadores:

- `∀x: A. P(x)` ↔ `Π x: A. P(x)` (tipo dependiente Pi).
- `∃x: A. P(x)` ↔ `Σ x: A. P(x)` (tipo dependiente Sigma).

Esto requiere **dependent types** — tipos que dependen de valores. `Vector n T` es un tipo paramétrico por el valor `n: Nat`. Permite expresar cosas como "la lista de salida tiene la misma longitud que la de entrada", como un teorema, en el tipo.

Idris, Agda, Lean, Coq son los lenguajes mainstream con dependent types prácticos. En 2026, dependent types están entrando lentamente en lenguajes industriales (Scala 3, parcialmente; Haskell con extensions).

---

## 3. Curry-Howard aplicado a un schema de BBDD

### 3.1. Schema como sistema de proposiciones

Considera:

```surql
DEFINE TABLE note SCHEMAFULL;
DEFINE FIELD state ON note TYPE string
  ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED'];
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD reason ON blocked_by TYPE option<string>;
```

Léelo como sistema de axiomas:

- **Axioma 1**: `∀n: note. ∃t: string. (t ∈ {INBOX, CLARIFIED, ...}) ∧ state(n) = t`
- **Axioma 2**: `∀e: blocked_by. ∃n1, n2: note. from(e) = n1 ∧ to(e) = n2`
- **Axioma 3**: `∀e: blocked_by. (reason(e) = ⊥) ∨ (∃r: string. reason(e) = r)`

Cada inserción que sobrevive al schema es una prueba constructiva de la conjunción de estos axiomas. Cuando insertas:

```surql
CREATE note SET 
  title = 'Refactor pipeline', 
  state = 'ACTIVE', 
  pillars = ['SOPHIA'];
```

estás construyendo un testigo (witness) de la proposición:

> "Existe una nota cuyo título es 'Refactor pipeline', cuyo estado pertenece al conjunto válido, y cuyos pilares son un subconjunto de los cuatro pilares."

Si tu inserción no satisface los axiomas, el motor lanza un error. Lo que estás recibiendo, leído como Curry-Howard, es un **fallo de proof-checking**: no se pudo construir la prueba.

### 3.2. La analogía no es floja

Es importante subrayar que esto no es una analogía suelta. Hay teoría formal sólida:

**Algebraic data types.** Los productos (tuplas, records, structs) corresponden a `∧`; las sumas (enums, discriminated unions, variants) corresponden a `∨`. Un record `{ title: string, state: State }` es la conjunción "tiene título Y tiene estado". Un enum `State = INBOX | CLARIFIED | ...` es la disyunción "es INBOX O es CLARIFIED O ...".

**Refinement types.** Tipos con predicados: `{ x: Int | x > 0 }` es el tipo de enteros positivos. Esto corresponde a un tipo Sigma trivializado: `Σ x: Int. x > 0`. Liquid Haskell, F* (F-star), Dafny, y los lenguajes con SMT-solver embedded usan esto seriamente. Tu `ASSERT $value >= 1 AND $value <= 5` es un refinement type embedded en SurrealDB.

**Dependent types embebidos.** SurrealDB no es un lenguaje dependently typed completo (no es Idris), pero los `record<T>` con referencias verificadas sí son dependent en sentido débil: el tipo `record<note_type>` _depende_ de la existencia de la tabla `note_type`.

### 3.3. Tu schema como intersección de tres tradiciones

El schema de Huygens combina ergonómicamente tres líneas técnicas:

```surql
-- Sum type vía ASSERT en enum (∨ en lógica)
DEFINE FIELD state ON note TYPE string 
  ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED'];

-- Product type vía SCHEMAFULL (∧ en lógica)
DEFINE TABLE note SCHEMAFULL;
DEFINE FIELD title ON note TYPE string;
DEFINE FIELD content ON note TYPE string;
DEFINE FIELD pillars ON note TYPE array<string>
  ASSERT $value ALLINSIDE ['PATHOS_SOMA','ETHOS','TELOS','SOPHIA'];

-- Refinement type vía ASSERT con condición
DEFINE FIELD priority ON note TYPE option<int>
  ASSERT $value IS NONE OR ($value >= 1 AND $value <= 5);

-- "Constraint relacional dependiente" vía record<T>
DEFINE FIELD type ON note TYPE option<record<note_type>>;
```

Cada `ASSERT` es un predicado. Cada predicado es una proposición. Pasarlo es construir una prueba. La BBDD entera, leída así, es un **sistema deductivo embebido en infraestructura de persistencia**.

### 3.4. Una insight de aplicación

Si interiorizas esto, ciertas decisiones de diseño cambian:

- **Antes de añadir un field**: ¿qué proposición estoy queriendo afirmar? Si no puedo formularla, probablemente el field es ruido.
- **Antes de relajar un `ASSERT`**: ¿qué teorema dejo de poder probar? Si la respuesta es "ninguno importante", quizá no necesitaba el constraint. Si es "demuestro cosas más débiles", piénsalo dos veces.
- **Antes de hacer un field `option<T>`**: ¿qué proposiciones nuevas debo añadir para cubrir el caso ausente? `option<T>` es `T + Unit` — añade un caso al sum type, y todo código posterior debe manejarlo.

Cada cambio de schema es un cambio en el sistema de axiomas. Es así de serio.

---

## 4. Línea genealógica

Esta es una historia de descubrimientos encadenados. Conocerla ayuda a saber dónde estás situado.

1. **Lambda calculus** — Alonzo Church, años 30. El punto de partida. Una notación minimalista para computación.

2. **Simply typed lambda calculus** — Church, 1940. Añade tipos. Primer sistema de tipos formal.

3. **Type theory de Russell y Whitehead, _Principia Mathematica_** — 1910s. Origen del concepto de tipo como solución a paradojas lógicas (Russell's paradox).

4. **Combinatorial logic** — Haskell Curry, años 30. Curry intuye el paralelismo entre tipos y proposiciones.

5. **System F** — Jean-Yves Girard (1971), independientemente John Reynolds (1974). Polimorfismo (genéricos). Permite cuantificar sobre tipos.

6. **Curry-Howard correspondence formalizada** — William Howard, 1969 ("The Formulae-as-Types Notion of Construction"). El isomorfismo, articulado.

7. **ML y Hindley-Milner type inference** — Robin Milner et al., años 70. Inferencia automática de tipos. Hace los lenguajes tipados ergonómicos.

8. **Martin-Löf type theory** — Per Martin-Löf, años 70 en adelante. Tipos dependientes con interpretación constructiva. Base de Coq, Agda, Idris.

9. **Calculus of Constructions** — Thierry Coquand, Gérard Huet, 1986. Base teórica de Coq. Polimorfismo + dependent types unificados.

10. **Refinement types** — Frank Pfenning, Tim Freeman, 1991. Tipos con predicados decidibles.

11. **Liquid types** — Patrick Rondon, Ming Kawaguchi, Ranjit Jhala, 2008. Refinement types con SMT solvers (Z3, CVC). Permite verificación práctica.

12. **Idris, Agda, Coq, Lean** — años 2000s+. Lenguajes con dependent types maduros.

13. **Homotopy Type Theory (HoTT)** — Voevodsky et al., 2010s. Conexión entre type theory y topología algebraica. Abre rutas profundas.

14. **2020s: dependent types en lenguajes industriales** — Scala 3 (path-dependent types maduros), Haskell con `Dependent Haskell` (en desarrollo), Rust con const generics, TypeScript con const types y template literal types.

Tu schema de SurrealDB está, técnicamente, en el nivel 10 (refinement types embebidos) sin ser un lenguaje dependently typed completo. Es un buen lugar: ergonómico, expresivo, y captura el 80% de lo que pides en la práctica.

---

## 5. El puente filosófico

### 5.1. Wittgenstein de nuevo

Las proposiciones del _Tractatus_ son relevantes aquí. Wittgenstein distingue entre **lo que puede ser dicho** y **lo que solo puede ser mostrado** (5.6, 6.522). El schema es exactamente la frontera de lo decible en el mundo de tu BBDD. Lo que no encaja en el schema **no puede ser dicho** — no existe representación para ello.

Esto tiene consecuencias epistemológicas. Tu sistema **no contiene "lo que el usuario sabe"** — contiene **lo que el modelo permite expresar**. Decisiones de modelado son decisiones epistemológicas. Lo que dejas fuera del schema queda fuera del mundo conocible del sistema.

Para Huygens: si decides que las notas no pueden tener "estado emocional" como field tipado, el sistema no puede razonar sobre emociones como predicado. Puedes meterlo en `metadata`, pero el agente debe interpretarlo manualmente, sin garantías. La diferencia entre _tipado_ y _libre_ es la diferencia entre _decible y demostrable_ y _alusivo y conjetural_.

### 5.2. Constructivismo y matemática intuicionista

La correspondencia de Curry-Howard surge en el contexto de la **matemática constructiva**. Brouwer, Heyting, Martin-Löf rechazan el principio del tercio excluso (`P ∨ ¬P`) sin prueba constructiva. Para un intuicionista, decir "existe x tal que P(x)" significa **construir efectivamente** tal x. No vale demostración por contradicción si no te da el testigo.

Esto encaja perfectamente con BBDDs. Cuando afirmas "existe una nota con state=ACTIVE", o bien tienes una fila concreta (testigo constructivo), o la afirmación no se sostiene. No hay existencia abstracta: la existencia en la BBDD es **siempre constructiva**. Por eso Curry-Howard se aplica tan limpiamente al dominio de la persistencia.

### 5.3. La objeción platónica

Una objeción razonable: ¿no es la ontología "anterior" al schema? ¿No existen las notas, las relaciones, los conceptos, _antes_ de que los modeles? ¿No es el schema un descubrimiento, no una construcción?

Respuesta: ambas. El **dominio** (lo que Rubén quiere modelar) preexiste al schema. La **ontología formal** (qué de ese dominio entra en el sistema y cómo) es construida. El schema es la frontera entre el mundo real del dominio y el mundo computable de la BBDD. Lo que decide qué cruza esa frontera son decisiones ontológicas — y son a la vez descubrimientos del dominio (que limita las opciones razonables) y construcciones del modelador (que elige entre opciones razonables).

Para profundizar este punto desde otro ángulo, ver `./declarative-db-as-ontology.md`, especialmente la sección sobre Aristóteles.

---

## 6. Aplicación práctica a Huygens

### 6.1. Patterns donde illegal-states-unrepresentable funciona

En Huygens, varios constraints quedan limpiamente al substrato:

**Estados cerrados.**
```surql
DEFINE FIELD state ON note TYPE string
  ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED'];
```
Imposible que una nota tenga `state = 'ENMITT'`. Imposible representarlo. La validación queda fuera de la app.

**Pilares cerrados con membresía múltiple.**
```surql
DEFINE FIELD pillars ON note TYPE array<string>
  ASSERT $value ALLINSIDE ['PATHOS_SOMA','ETHOS','TELOS','SOPHIA'];
```
Una nota puede tocar varios pilares (es array), pero nunca un pilar inventado.

**Edges tipados con dominio fijo.**
```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE TABLE of_type TYPE RELATION FROM note TO note_type SCHEMAFULL;
```
Imposible relacionar `note → person` por `of_type`. Imposible relacionar `note_type → note` por `blocked_by`. La dirección y el dominio están tipados.

**Refinement numérico.**
```surql
DEFINE FIELD priority ON note TYPE option<int>
  ASSERT $value IS NONE OR ($value >= 1 AND $value <= 5);
```
Si hay prioridad, está entre 1 y 5. Imposible 0, imposible 6, imposible -3.

**Capture sin tipo.**
```surql
DEFINE FIELD type ON note TYPE option<record<note_type>>;
```
El `option<...>` codifica que "ausencia de tipo" es un estado válido y **representable**. INBOX-sin-tipo es una proposición legítima del sistema. (Esto es una decisión ontológica importante: el espacio de "cosas sin clasificar" tiene cabida ontológica.)

### 6.2. Patterns donde sufrimos

No todo se puede empujar al substrato. SurrealDB, como casi todas las BBDDs declarativas mainstream, tiene límites:

**Shape de `metadata: option<object>` por tipo.** Queremos decir "si type es Task, metadata sigue el shape `{ priority?, due?, ... }`". Esto es un refinement dependiente: `metadata` depende del valor de `type`. SurrealDB no expresa esto nativamente. Posibles approaches:

- Validar en capa app con Zod por type-slug. Pierde garantía persistente.
- Crear sub-tabla por tipo (task_metadata, project_metadata...). Pierde flexibilidad.
- Validación con event handlers + `ASSERT` complejos. Posible pero feo.

Lección: la frontera de lo enforzable es real. Decide qué pones del lado app, qué del lado BBDD, qué del lado prompt — siempre prefiriendo schema > tool > prompt cuando sea posible (ver `./declarative-db-as-ontology.md`, sección 3.2).

**Cardinalidades estrictas.** "Una nota tiene exactamente un type" (no cero, no varios). SurrealDB permite N edges `of_type` por nota; nada lo impide. Posibles approaches:

- Modelar `type` como field directo `option<record<note_type>>` en lugar de edge. Trade-off: pierdes algunas ventajas del edge (timestamps, metadata sobre la relación).
- Trigger de validación al insertar edge.
- Convención + linter externo.

**Acyclic constraints.** "Un bloqueo no puede formar ciclos" (A blocks B, B blocks A — incoherente). Imposible expresarlo declarativamente sin reachability queries. Esto es genuinamente más allá de lo que la lógica de primer orden con constraints simples puede expresar — requiere lógica de orden superior o transitive closure.

### 6.3. Decisión de diseño

El principio operativo para Huygens, derivado de todo lo anterior:

> Empuja todo constraint que pueda vivir en el schema. Para los que no caben, decide explícitamente dónde van (tool con Zod, validación en agent prompt, o nada), y documenta esa decisión.

Cada constraint que no está en ningún sitio es un **agujero ontológico** — un lugar donde la teoría del dominio admite estados que el modelo del dominio no debería admitir.

---

## 7. Para profundizar — Para el Rubén curioso del futuro

### Libros esenciales

- **_Type-Driven Development with Idris_** — Edwin Brady, Manning, 2017. Libro esencial. Te enseña a programar con dependent types en un lenguaje práctico. La forma más rápida de internalizar Curry-Howard.

- **_Software Foundations_** — Benjamin Pierce, Adam Chlipala, et al. Curso libre online basado en Coq. Texto extraordinario. Vol. 1 (Logical Foundations) es el más relevante para lo discutido aquí.

- **_Types and Programming Languages_** — Benjamin Pierce, MIT Press, 2002. Manual canónico. Denso pero exhaustivo.

- **_Advanced Topics in Types and Programming Languages_** — Pierce (ed.), 2004. Continuación con temas más avanzados.

- **_Homotopy Type Theory: Univalent Foundations of Mathematics_** — The HoTT Book, libre online. Avanzado, abre conexiones a topología algebraica. Para más tarde.

- **_Designing with Types_ series** — Scott Wlaschin, F# blog (fsharpforfunandprofit.com). Práctico, ergonómico, perfecto para internalizar illegal-states-unrepresentable en código real.

- **_Real World OCaml_** — Yaron Minsky et al., O'Reilly. Capítulos sobre variantes y phantom types muestran el aparato en acción industrial.

### Papers fundacionales

- **"The Formulae-as-Types Notion of Construction"** — William Howard, 1969 (publicado 1980). El paper donde la correspondencia se formaliza.

- **"Propositions as Types"** — Philip Wadler, 2015. Exposición elegante y accesible de Curry-Howard. Lectura inicial recomendada.

- **"Theorems for Free!"** — Philip Wadler, 1989. Cómo el polimorfismo paramétrico determina propiedades de las funciones desde su tipo. Fascinante.

- **"The Power of Pi"** — Nicolas Oury, Wouter Swierstra, 2008. Dependent types en práctica.

- **"Refinement Types for Practical Dependently Typed Languages"** — Vazou et al. Liquid Haskell base.

- **"Liquid Types"** — Rondon, Kawaguchi, Jhala, 2008. Refinement types automatizados con SMT solvers.

- **"Functional Programming in OCaml"** — Minsky, Madhavapeddy, Hickey. Tratamiento extenso de illegal-states-unrepresentable.

### Lenguajes para experimentar

- **Idris 2** — el lugar más ergonómico para dependent types hoy.
- **Lean 4** — más matemático, pero impresionante. Buen camino si quieres ir hacia formalización matemática.
- **Coq** — el patriarca. Maduro, exhaustivo, no muy ergonómico.
- **Agda** — minimalista, elegante, académico.
- **F* (F-star)** — Microsoft Research. Refinement types industriales.
- **Liquid Haskell** — refinement types añadidos a Haskell.
- **TypeScript con `as const` + discriminated unions + template literal types** — sorprendentemente lejos para un lenguaje industrial. Vale la pena explorar los límites.

### Conexiones cruzadas

- `./declarative-db-as-ontology.md` — el schema como ontología formal (este texto extiende ese argumento al lado matemático).
- `./living-topology.md` — qué pasa cuando la ontología/sistema-axiomático evoluciona.
- `./hypergraphs-foundations.md` — extensiones a relaciones n-arias (predicados n-arios).
- `./quantum-and-hypergraphs.md` — ZX-calculus y otras formalizaciones categoriales relacionadas.
- `../03-data-model/topology-as-primary.md` — relación práctica con el modelo de datos.
- `../03-data-model/self-critique.md` — limitaciones honestas.
- `../04-database/surrealdb-deep-dive.md` — qué de todo esto realmente expresa SurrealQL.
- `../04-database/surrealdb-innovations.md` — innovaciones específicas que aprovechan estos patrones.

### Conexión cruzada con tu otra lectura

Bartosz Milewski (_Category Theory for Programmers_) cubre el aparato categorial subyacente. La correspondencia de Curry-Howard se extiende a una correspondencia **Curry-Howard-Lambek** que incluye **teoría de categorías**:

| Lógica | Tipos | Categorías |
|---|---|---|
| Proposiciones | Tipos | Objetos |
| Pruebas | Programas | Morfismos |
| Conjunción | Producto | Producto categórico |
| Disyunción | Suma | Coproducto |
| Implicación | Función | Exponencial |

Bob Coecke (_Picturing Quantum Processes_) usa string diagrams en categorías compactas para razonar sobre procesos cuánticos — el mismo aparato categorial aplicado a otro dominio. ZX-calculus es ese aparato hecho ergonómico. Para Huygens, la conexión está en: el grafo de relaciones de tu BBDD es una **categoría** donde objetos son tipos de nodos y morfismos son edges. Hay teoría que explorar ahí. Ver `./quantum-and-hypergraphs.md` cuando exista.

---

## Cierre

La frase "_make illegal states unrepresentable_" es engañosamente simple. Detrás hay 60 años de teoría — Curry, Howard, Martin-Löf, Coquand — y un descubrimiento profundo sobre la naturaleza de la computación: programar es demostrar, los tipos son lógica.

Aplicado a Huygens, esto cambia cómo piensas el schema. No es "configuración de la BBDD". Es **un sistema de axiomas que define qué proposiciones son demostrables en tu mundo**. Cada inserción es una demostración. Cada constraint es un teorema que excluye contraejemplos. Cada `option<T>` es una proposición existencial débil.

El presupuesto cognitivo del agente se libera no por magia, sino porque las proposiciones que el schema demuestra son proposiciones que el agente ya no necesita razonar. La consistencia ontológica del sistema **es** la garantía formal de que ciertas inconsistencias son imposibles. Es un anclaje epistemológico fuerte. Y es bonito.
