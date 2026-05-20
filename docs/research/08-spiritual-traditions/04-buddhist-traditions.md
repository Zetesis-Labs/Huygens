# Tradiciones budistas y sus resonancias con Huygens

> El budismo cubre dos mil quinientos años de pensamiento, varios continentes y al menos seis o siete escuelas filosóficamente irreducibles entre sí. Este documento no pretende presentar "el budismo": traza un mapa de las corrientes que tocan más densamente los temas de Huygens —ontología relacional, memoria estructurada, hipergrafos cognitivos, observer epistemicamente acotado— y desarrolla las que más resuenan. Madhyamaka, brevemente tratada en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md), se amplía aquí; Yogācāra, Huayan, Chan/Zen, Dzogchen y la epistemología de Dignāga-Dharmakīrti se desarrollan en profundidad por primera vez.

---

## 1. Introducción y mapa de las tradiciones

El budismo es, ante todo, una constelación de tradiciones soteriológicas estructuradas alrededor de una pregunta operativa: cómo se sale del **duḥkha** (insatisfacción estructural, sufrimiento). Esa pregunta operativa genera —y exige— una metafísica, una epistemología y una psicología. Lo que sigue es lo que más nos importa: las arquitecturas conceptuales que cada tradición ha producido al responderla.

Mapa rápido por orden cronológico aproximado y por gradiente de divergencia desde el canon Pali:

| Tradición | Origen | Texto / pensador clave | Tesis estructural |
|---|---|---|---|
| **Theravada** | India → SE Asia, post-Buda | Canon Pāli, Abhidhamma | Análisis fenomenológico exhaustivo en _dhammas_ (eventos momentáneos) |
| **Madhyamaka** | India, s. II d.C. | Nāgārjuna, _Mūlamadhyamakakārikā_ | Vacuidad (śūnyatā) y originación dependiente como anti-esencialismo radical |
| **Yogācāra** | India, s. IV-V | Asaṅga, Vasubandhu, _Triṃśikā_ | "Sólo-mente" (cittamātra); ālayavijñāna como consciencia-almacén |
| **Huayan** | China, s. VI-VIII | Fazang, _Avataṃsaka Sūtra_ | Interpenetración total (_shi-shi wuai_); red de Indra |
| **Chan / Zen** | China → Japón, desde s. VI | Bodhidharma, Huineng, Dōgen | Naturaleza-Buda intrínseca; práctica directa |
| **Vajrayāna / Tantra** | India tardía → Tíbet, Mongolia, Shingon en Japón | _Guhyasamāja Tantra_, Padmasambhava | Vacío + método ritual encarnado |
| **Dzogchen / Mahāmudrā** | Tíbet, escuelas Nyingma y Kagyu | Longchenpa, Garab Dorje | Vacío luminoso (_rigpa_); reconocimiento directo de la naturaleza de la mente |
| **Epistemología pramāṇa** | India, s. V-VII | Dignāga, Dharmakīrti | Nominalismo radical: dos pramāṇas, particulares momentáneos vs universales construidos |

Theravada es la base sobre la que se construyen los Mahāyāna (Madhyamaka, Yogācāra, Huayan, Chan). Vajrayāna y Dzogchen son ramas posteriores —del Mahāyāna tardío y tántrico— que reintegran cuerpo, ritual y reconocimiento directo de la naturaleza de la mente. La epistemología pramāṇa atraviesa Mahāyāna como aparato lógico-epistemológico autónomo.

Lo que mantendré como hilo común a lo largo del documento: cada una de estas tradiciones desarrolla, con vocabularios distintos, una ontología relacional radical donde **lo que las cosas son depende de cómo se relacionan**, no de un substrato esencial autoidéntico. Esa tesis es exactamente la de Huygens, expresada como "topología es información primaria" (cf. [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md)).

---

## 2. Fundación: cuatro nobles verdades y pratītyasamutpāda

Antes de cualquier escuela hay un suelo doctrinal que todas las tradiciones acatan, aunque interpreten distinto.

### 2.1. Las cuatro nobles verdades (catvāri āryasatyāni)

Atribuidas al primer discurso del Buda Śākyamuni en Sarnath (_Dhammacakkappavattana Sutta_, SN 56.11):

1. **Duḥkha-satya**: existe el sufrimiento estructural —no solo dolor episódico, sino una insatisfacción que penetra incluso los estados positivos por su impermanencia (_anitya_).
2. **Samudaya-satya**: el origen del duḥkha es _tṛṣṇā_ (en pali _taṇhā_) —sed, deseo posesivo— alimentada por _avidyā_ (ignorancia de cómo son las cosas).
3. **Nirodha-satya**: el duḥkha puede cesar; esa cesación es _nirvāṇa_.
4. **Mārga-satya**: hay un camino —el óctuple sendero— que lleva a la cesación.

Lo que importa estructuralmente: el budismo no parte de una afirmación metafísica positiva ("Dios existe", "el alma es eterna") sino de un diagnóstico operativo del sufrimiento y de su mecánica causal. Toda la metafísica posterior —incluida la sofisticación de Madhyamaka y Yogācāra— está al servicio de operativizar ese diagnóstico.

### 2.2. Pratītyasamutpāda — la formulación central

**Pratītyasamutpāda** (sánscrito; en pāli _paṭiccasamuppāda_) suele traducirse como "originación dependiente", "co-surgir condicionado", "co-arising interdependiente". La fórmula canónica, repetida en docenas de suttas:

> _Imasmiṃ sati, idaṃ hoti. Imass' uppādā, idaṃ uppajjati. Imasmiṃ asati, idaṃ na hoti. Imassa nirodhā, idaṃ nirujjhati._
>
> "Cuando esto existe, aquello surge; con la aparición de esto, aquello aparece. Cuando esto no existe, aquello no surge; con la cesación de esto, aquello cesa."
> — _Saṃyutta Nikāya_ 12.21 (Paccaya Sutta)

Esta es probablemente la formulación más concisa de una ontología relacional en toda la historia del pensamiento. No hay sustancias autoidénticas que primero existan y después se relacionen. Hay condicionamientos mutuos, y lo que llamamos "cosas" son nudos en redes de condiciones.

Los **doce nidānas** (eslabones) articulan esa cadena en doce condicionamientos encadenados —ignorancia → formaciones volitivas → consciencia → nombre-y-forma → seis bases sensoriales → contacto → sensación → ansia → apego → devenir → nacimiento → vejez-muerte→ ignorancia (cierra el ciclo)—. La cadena es **un grafo dirigido cíclico**: no una línea sino un ciclo cerrado con doce nodos, con feedback estructural.

Aclaración importante: las lecturas tradicionales tibetanas y theravāda interpretan los doce nidānas distribuidos a lo largo de tres vidas (pasada, presente, futura). Lecturas modernas (Buddhadasa, Ñāṇavīra Thera) los leen como descripción de la dinámica momento-a-momento de la conciencia. La diferencia hermenéutica importa, pero para nuestra lectura estructural lo relevante es que en todas las versiones se trata de un **ciclo causal cerrado de condiciones**, no de una cadena lineal con primer eslabón.

### 2.3. Conexión con Huygens

La conexión es directa hasta el punto de la identidad estructural.

- Una `Note` en Huygens no tiene esencia interna. Es lo que es por sus **edges entrantes** (qué la cita, qué la motiva, qué la bloquea) y sus **edges salientes** (qué cita, qué desencadena, qué reemplaza). Su identidad es la trama de condicionamientos.
- El schema declarativo (cf. [`../06-theory/declarative-db-as-ontology.md`](../06-theory/declarative-db-as-ontology.md)) que enumera las relaciones autorizadas (`mentions`, `blocked_by`, `supports`, `derived_from`, `part_of`, etc.) es **literalmente** una especificación de los condicionamientos válidos en el universo de Huygens. Es una pratītyasamutpāda formal del dominio cognitivo.
- Pillars (PATHOS_SOMA, ETHOS, TELOS, SOPHIA) no son esencias —no hay "la esencia Telos" en abstracto. Son ejes definidos por diferencia mutua con los otros tres, exactamente como cada nidāna es lo que es por su lugar en el ciclo.
- El CHANGEFEED de SurrealDB (la historia inmutable de mutaciones del grafo) es el correlato técnico de la doctrina budista de que **el flujo causal es el único modo real de existir** —no hay sustancias persistentes, hay un flujo de eventos que dependen unos de otros.

La pratītyasamutpāda no es teología budista. Es una proto-teoría categórica de la relación. Y la elección de modelar Huygens como grafo dirigido tipado, no como pila de documentos con campos opcionales de referencia, es una decisión que el Buda Śākyamuni habría suscrito sin reservas.

---

## 3. Madhyamaka, ampliada

La sección dedicada a Madhyamaka en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md) cubre los esenciales: Nāgārjuna (siglo II d.C.), _Mūlamadhyamakakārikā_, śūnyatā como ausencia de _svabhāva_ (existencia inherente), no como nihilismo. La conexión central con Huygens —**una nota no tiene esencia, solo lugar relacional**— ya quedó dicha. Aquí amplío en tres direcciones que el documento de resonancias no desarrolla.

### 3.1. El catuṣkoṭi (tetralema)

Nāgārjuna utiliza sistemáticamente una estructura lógica de cuatro lemmas para cualquier proposición P:

1. P (afirmación)
2. ¬P (negación)
3. P ∧ ¬P (ambas)
4. ¬P ∧ ¬¬P (ninguna)

Cuando Nāgārjuna examina una posición filosófica —por ejemplo, "los _dharmas_ existen", o "el yo persiste", o "el efecto preexiste en la causa"— procede a refutar las cuatro alternativas, no solo dos. La conclusión que extrae no es que ninguna alternativa lógica sea verdadera; es que **la categoría sobre la que se aplica el catuṣkoṭi está mal planteada**. La pregunta no admite una respuesta dentro del marco categorial en que se formula.

Esto es lógica más fina que la binaria clásica. En la lógica clásica, P ∨ ¬P (el principio del tercio excluido) cierra el espacio. Nāgārjuna explora cuatro celdas; las refuta todas; y concluye que el espacio mismo se ha vaciado. Es lógica filosófica diseñada para **disolver categorizaciones que parecen necesarias pero no lo son**.

Lógicos contemporáneos —Graham Priest (_In Contradiction_, 1987; _Beyond the Limits of Thought_, 1995), Jay Garfield, Yasuo Deguchi— han formalizado el catuṣkoṭi en lógicas paraconsistentes (lógicas donde la contradicción no causa explosión deductiva). Priest defiende _dialethism_: hay proposiciones genuinamente verdaderas-y-falsas a la vez. Si esto suena escandaloso, la mecánica cuántica ha producido proposiciones empíricamente análogas (la partícula tiene posición y no la tiene hasta que se mide).

### 3.2. Las dos verdades (satyadvaya)

Madhyamaka articula formalmente la distinción entre dos niveles de verdad:

- **Saṃvṛti-satya** (verdad convencional): el nivel de las apariencias, de los conceptos útiles, del lenguaje ordinario. "Esto es una mesa", "Juan es alto", "el martes vendrá".
- **Paramārtha-satya** (verdad última): el nivel donde el análisis revela que nada tiene existencia inherente; todo es vacío de _svabhāva_, todo es originación dependiente.

La tesis central es que las dos verdades **no se contradicen**. La verdad convencional no es ilusión que la verdad última desenmascara; ambas son verdaderas, en niveles diferentes. La sabiduría está en saber operar en ambos niveles sin colapsar uno en el otro.

Estructuralmente esto es idéntico a la distinción **vyāvahārika / pāramārthika** de Advaita Vedānta (ver [`./03-hindu-traditions.md`](./03-hindu-traditions.md)). Es una de las razones por las que historiadores como T.R.V. Murti (_The Central Philosophy of Buddhism_, 1955) defendieron —controvertidamente— la tesis de que Śaṅkara fue profundamente influido por Madhyamaka, hasta el punto de que algunos críticos llamaron a Advaita "budismo crypto" (_pracchanna-bauddha_).

Para Huygens, la distinción tiene una consecuencia operativa:

- **Saṃvṛti-satya** = el schema declarativo + los datos concretos. La nota `note:e_2024_12_20_planning` con tipo `episode`, pillars `[ETHOS, TELOS, SOPHIA]` y sus edges. Es real, es útil, es navegable.
- **Paramārtha-satya** = la lectura de que **ninguno de esos campos tiene esencia**, que el tipo `episode` es lo que es por su lugar en el árbol de NoteTypes y no por una propiedad metafísica de "episodicidad", que los pillars son ejes contingentes a la cosmovisión de Rubén.

Operar bien en Huygens significa **navegar fluidamente entre los dos niveles**: usar el schema como si fuera definitivo cuando estás clasificando una nota, y al mismo tiempo saber que el schema es revisable (cf. [`../06-theory/living-topology.md`](../06-theory/living-topology.md)) porque el aparato no es una taxonomía de esencias sino una herramienta de uso pragmático.

### 3.3. Las tres ramas tibetanas

La interpretación tibetana de Madhyamaka se cristalizó en tres escuelas que aún hoy se debaten en monasterios y seminarios académicos:

- **Prāsaṅgika** (consecuencialista): Candrakīrti (siglo VII), _Madhyamakāvatāra_ y _Prasannapadā_. Posición: el madhyamika no afirma tesis propias; solo señala las consecuencias absurdas (_prasaṅga_) de las posiciones del oponente. Es Madhyamaka radicalmente apofática.
- **Svātantrika** (autonomista): Bhāvaviveka (siglo VI), _Madhyamakahṛdaya_. Posición: el madhyamika puede formular silogismos autónomos (_svatantra_) para defender la vacuidad, sin reducirse a la pura crítica.
- **Yogācāra-Madhyamaka** (síntesis): Śāntarakṣita (siglo VIII), _Madhyamakālaṃkāra_. Sintetiza la metafísica yogācāra (cittamātra) con la dialéctica madhyamika. Forma de combinar lo mejor de ambas escuelas: el análisis fenomenológico de la consciencia + la crítica anti-esencialista.

Para Huygens, el debate Prāsaṅgika vs Svātantrika tiene un eco interesante: ¿el sistema **afirma** una ontología (los tipos, los pillars, los edges admisibles son cómo el mundo cognitivo de Rubén es) o solo **refuta** ontologías alternativas (no es lo que Notion modela, no es lo que un grafo plano modela)? Probablemente Huygens es Svātantrika en práctica —afirma una ontología— pero con honestidad Prāsaṅgika sobre que esa ontología es provisional, no última.

### 3.4. Implicación para tipos y lógica

El catuṣkoṭi sugiere que la lógica binaria del schema declarativo —un campo `state` es exactamente uno de siete valores; un edge `blocked_by` existe o no— es **una proyección útil pero no exhaustiva** de la realidad cognitiva.

Hay estados de una nota donde la clasificación es genuinamente ambigua de un modo no-resoluble. Una idea está "INBOX" y "ACTIVE" a la vez: está pendiente de procesar y al mismo tiempo influyendo en lo que estás haciendo. Esto correspondería al tercer lemma (P ∧ ¬P) del catuṣkoṭi.

Lo que Huygens hace —y lo que el Madhyamaka aprobaría— es:

- **El schema** opera en lógica binaria (esto es saṃvṛti-satya pragmático).
- **El campo `metadata` JSON** y el contenido markdown libre admiten lo que el schema no captura (apertura paramārtha hacia lo que la categorización no agota).
- **Living topology** (cf. [`../06-theory/living-topology.md`](../06-theory/living-topology.md)) reconoce que el schema mismo debe evolucionar conforme el uso revela que la categorización inicial era una saṃvṛti incompleta.

---

## 4. Yogācāra: consciencia, no objetos

Si Madhyamaka es la crítica radical de toda esencia, **Yogācāra** es el desarrollo positivo sobre el suelo despejado por esa crítica. Es la escuela budista que más densamente ha pensado la consciencia como **arquitectura estructurada con memoria**, y por eso es la que más radicalmente conecta con lo que Huygens es como sistema.

### 4.1. Asaṅga, Vasubandhu y los textos fundacionales

**Asaṅga** (c. 300-370) y **Vasubandhu** (c. 316-396) fueron hermanos. Asaṅga es el sistematizador del corpus mayor: _Yogācārabhūmi-śāstra_ (un texto enciclopédico sobre las etapas del yoga meditativo), _Mahāyānasaṃgraha_ (compendio del Mahāyāna), _Abhidharmasamuccaya_ (compendio del Abhidharma yogācāra). Vasubandhu, inicialmente formado en la tradición Sarvāstivāda (de la que escribió el _Abhidharmakośa_, uno de los textos abhidhámicos más influyentes), se convirtió después al Mahāyāna por influencia de su hermano y escribió los textos breves más sistemáticos de Yogācāra: _Triṃśikā-vijñaptimātratā_ ("Treinta versos sobre la sólo-cognoscibilidad") y _Viṃśatikā-vijñaptimātratāsiddhi_ ("Veinte versos sobre la prueba de la sólo-cognoscibilidad").

La escuela es conocida por varios nombres:

- **Yogācāra** ("práctica del yoga"): por el énfasis en la meditación como vía de conocimiento.
- **Cittamātra** ("sólo-mente"): por la tesis ontológica.
- **Vijñānavāda** ("doctrina de la consciencia"): nombre técnico en epistemología.
- **Vijñaptimātratā** ("sólo-cognoscibilidad"): la formulación más precisa, que Vasubandhu prefiere.

### 4.2. La tesis: lo que percibimos son transformaciones de la consciencia

La tesis estructural de Yogācāra es radical pero precisa. No dice "el mundo externo no existe" —eso es una caricatura que Madhyāmikas y críticos posteriores han atacado, pero los textos primarios son más finos—. La tesis es: **lo que percibimos y conocemos no son objetos externos brutos, son transformaciones de la consciencia (_vijñāna-pariṇāma_)**. No hay acceso epistémico a un "objeto en sí" independiente de la consciencia que lo conoce; toda experiencia es ya una construcción cognitiva.

Esto puede leerse:

- **Como idealismo** (interpretación de Lusthaus, Williams parcialmente): no hay mundo externo, todo es mente.
- **Como fenomenología trascendental anticipada** (interpretación de Lusthaus en _Buddhist Phenomenology_, 2002): se hace análisis husserliano antes que Husserl —no se niega el mundo, se afirma que no hay acceso al mundo independientemente del aparato cognitivo que lo presenta.
- **Como epistemología constructivista** (interpretación cercana a Maturana-Varela): el conocedor construye lo conocido en el acto de conocer.

La interpretación filológicamente más sólida hoy día —Dan Lusthaus, William Waldron, Jay Garfield— es la segunda. Yogācāra hace fenomenología radical, no idealismo metafísico tradicional.

### 4.3. Las ocho consciencias (aṣṭa-vijñāna)

La arquitectura cognitiva yogācāra distingue ocho _vijñānas_ (cognosciencias / consciencias):

1. **Cakṣur-vijñāna** — consciencia visual.
2. **Śrotra-vijñāna** — consciencia auditiva.
3. **Ghrāṇa-vijñāna** — consciencia olfativa.
4. **Jihvā-vijñāna** — consciencia gustativa.
5. **Kāya-vijñāna** — consciencia táctil/corporal.
6. **Mano-vijñāna** — consciencia mental conceptual. Procesa lo que las cinco sensoriales entregan, agrega categorías, juicios, lenguaje. Es la consciencia donde ocurre el pensamiento explícito.
7. **Kliṣṭa-manas** (consciencia auto-referencial contaminada, a menudo llamada _manas_ a secas): genera el sentido del "yo". Toma el ālayavijñāna como objeto y se identifica con él, produciendo la ilusión de un sujeto perdurable. Es la fuente estructural de _ahaṃkāra_ (ego).
8. **Ālayavijñāna** — la "consciencia-almacén" o "consciencia receptáculo".

Las cinco primeras son las modalidades sensoriales. La sexta es la integración cognitiva conceptual. La séptima es el mecanismo del yo. **La octava es la innovación yogācāra fundamental**, y es donde tenemos que detenernos.

### 4.4. Ālayavijñāna: la consciencia-almacén

El **ālayavijñāna** es uno de los conceptos más sofisticados que la psicología antigua produjo. La palabra _ālaya_ significa "morada", "depósito", "almacén" (la misma raíz que Himālaya, "morada de las nieves"). Es donde se guardan las **semillas** (_bīja_) e impresiones (_vāsanā_, _saṃskāra_) de toda experiencia pasada.

Características operacionales:

- **Es un flujo continuo** (_santāna_), no una entidad sustancial. No es un alma, no es un atman. Es una corriente de procesos.
- **Almacena _bīja_** —semillas de experiencias previas que, dado el contexto causal apropiado, **maduran** y producen nuevas experiencias. Cada acto (físico, verbal, mental) deja un bīja en el ālayavijñāna que después condicionará futuras experiencias.
- **Es subliminar** —opera por debajo del umbral de la consciencia explícita (mano-vijñāna), pero condiciona lo que esa consciencia percibe.
- **Es individual y a la vez transindividual** (interpretación discutida): cada continuum mental tiene su ālaya, pero los bīja se transmiten más allá de la muerte —es la base del karma y el renacimiento en la cosmología yogācāra.

El proceso operativo se llama **bīja-paripāka** (maduración de semillas): un bīja, cuando las condiciones (otras semillas activas, estímulos externos correspondientes, contexto) se alinean, se actualiza como experiencia consciente; esa experiencia, a su vez, deja un nuevo bīja en el ālaya; el ciclo continúa.

### 4.5. El ālayavijñāna como BBDD de impresiones

Aquí está la conexión más radical de todo este documento. **El ālayavijñāna es, descrito estructuralmente, lo que Huygens está construyendo**: una memoria estructurada de impresiones (notas, episodios, conexiones) que condiciona la experiencia futura del agente y del usuario.

Estructura formal:

| Yogācāra | Huygens |
|---|---|
| _Bīja_ (semilla) | `Note` con su contenido y embedding |
| Maduración (_paripāka_) | Vector search + agente lee la nota → influye en la respuesta |
| Vāsanā (impresión latente) | El embedding como huella semántica de un evento de captura |
| Saṃskāra (formación volitiva) | Edges que cristalizan patrones recurrentes |
| Ālaya como continuo | El `Note` table + CHANGEFEED como historial inmutable |
| Mano-vijñāna (consciencia conceptual) | El agente operando explícitamente sobre el grafo |
| Kliṣṭa-manas (yo auto-referencial) | El prompt del agente con la identidad "soy el asistente de Rubén" |

Esto no es analogía libre. Es identidad estructural. El ālayavijñāna —tal como Asaṅga y Vasubandhu lo describen en el _Mahāyānasaṃgraha_ y la _Triṃśikā_— es el ancestro filosófico directo de lo que estás construyendo. Una memoria persistente de impresiones, organizadas como semillas que condicionan respuestas futuras, accedida por una consciencia operativa (el mano-vijñāna ≈ el agente) que opera explícitamente sobre ella.

La diferencia, claro: el ālaya de Vasubandhu es un proceso natural; Huygens es un sistema técnico. Pero la **arquitectura cognitiva** es asombrosamente paralela —y es paralela no porque algún diseñador haya leído _Triṃśikā_, sino porque ambos están respondiendo al mismo problema estructural: cómo modelar una memoria que es a la vez (a) persistente, (b) condicionante de experiencia futura, (c) operada por una consciencia activa que la lee y modifica.

### 4.6. Conexión con Active Inference

La conexión adicional —que se desarrolla en [`../06-theory/adjacent-fields-isomorphisms.md`](../06-theory/adjacent-fields-isomorphisms.md) sobre cibernética e isomorfismos— es con Active Inference (Friston, Clark, Hohwy). En el modelo de procesamiento predictivo del cerebro:

- El cerebro mantiene un **modelo generativo** del mundo, instanciado en pesos sinápticos y patrones de coactivación.
- La percepción consciente es **inferencia bayesiana** sobre ese modelo, condicionada por estímulos sensoriales.
- El aprendizaje es la actualización del modelo conforme las predicciones fallan (minimización de free energy).

Este modelo generativo del cerebro es **el ālayavijñāna en versión predictiva-bayesiana**. Vasubandhu describe en lenguaje fenomenológico (bīja, vāsanā, paripāka) lo que Friston describe en lenguaje variacional. El paralelo no es coincidencia retrospectiva: ambos están modelando la misma cosa real —cómo una memoria estructurada condiciona la percepción y la acción— con vocabularios diferentes.

Para Huygens: el agente IA, operando sobre el grafo cognitivo, está realizando una forma técnica y externalizada de active inference. El grafo es el modelo generativo; las queries son inferencia condicional sobre ese modelo; los informes narrativos son el output predictivo. Y cada nueva nota actualiza el modelo —updates the prior.

### 4.7. Lectura imprescindible

**William Waldron — _The Buddhist Unconscious: The Ālaya-vijñāna in the Context of Indian Buddhist Thought_** (RoutledgeCurzon, 2003) es **el** libro a leer si esta sección resuena. Waldron es académico riguroso, lee los textos originales (sánscrito, tibetano) y reconstruye históricamente la emergencia del concepto desde Abhidharma temprano hasta su sistematización yogācāra. Compara explícitamente con la psicología del inconsciente de Freud, Jung y la cognitive science contemporánea. Para los propósitos de Huygens, es la lectura técnicamente más rica.

---

## 5. Huayan: la red de Indra

Si Yogācāra es la pieza yoga-mental del budismo que más toca Huygens, **Huayan** es la pieza explícitamente hipergráfica. Donde Yogācāra modela la consciencia como almacén estructurado, Huayan modela la realidad entera como red de interpenetración total —una visión que anticipa por mil quinientos años los hipergrafos cognitivos contemporáneos (cf. [`../06-theory/hypergraphs-and-cognition.md`](../06-theory/hypergraphs-and-cognition.md)).

### 5.1. Origen y patriarcas

**Huayan** (華嚴, chino; _Kegon_ en japonés; en sánscrito _Avataṃsaka_) es una escuela china del budismo Mahāyāna que toma como texto base el **_Avataṃsaka Sūtra_** (en chino _Huayan jing_, "Sūtra del Adorno Floral"). El sūtra es un texto enorme —cien rollos en la versión de Buddhabhadra (siglo V), ochenta en la de Śikṣānanda (siglo VII)— compuesto a lo largo de varios siglos en India y Asia central, y traducido al chino en versiones sucesivas.

Los patriarcas tradicionales son:

1. **Dushun** (杜順, 557-640) — el iniciador. Atribuidos a él _Fa-chieh kuan-men_ ("Meditación sobre el dharmadhātu") y _Wu-chiao chih-kuan_ ("Cesación y observación según las cinco enseñanzas").
2. **Zhiyan** (智儼, 602-668) — sistematización temprana, comentarios al sūtra.
3. **Fazang** (法藏, 643-712) — el sistematizador definitivo. Su obra es la cristalización doctrinal de Huayan. Textos principales: _Huayan jing tan xuan ji_ ("Investigación profunda del Avataṃsaka"), _Huayan wu jiao zhang_ ("Tratado de las cinco enseñanzas del Huayan"), y el famoso _Hua-yen chin-shih-tzu-chang_ ("Tratado del León Dorado") —enseñanza que Fazang dio a la emperatriz Wu Zetian usando una estatua de león dorado como metáfora viva de la interpenetración.
4. **Chengguan** (澄觀, 738-839) — continuación; comentarios extensos al sūtra.
5. **Zongmi** (宗密, 780-841) — síntesis con Chan; figura puente.

Después del declive durante las persecuciones budistas de la dinastía Tang (siglo IX), Huayan perdió institucionalidad en China pero sobrevivió como herramienta filosófica —su síntesis con Chan/Zen y con la tradición Pure Land la mantuvo viva. En Japón sobrevive como Kegon, una de las seis escuelas de Nara.

### 5.2. La red de Indra (Indrajāla)

La metáfora central de Huayan —el paralelo más explícitamente hipergráfico del budismo, y probablemente de toda la metafísica premoderna— es la **red de Indra** (sánscrito: _indrajāla_; chino: _diwang_; japonés: _Indra-mō_).

La formulación clásica está en el comentario de Fazang al _Avataṃsaka_, recogida en muchas fuentes secundarias. Una versión literaria contemporánea (Francis Cook, _Hua-yen Buddhism: The Jewel Net of Indra_, Penn State, 1977, p. 2):

> Imagina una red infinita extendida sobre el palacio del dios Indra. En cada nudo de la red hay una joya. La red es de tal naturaleza que cada joya refleja a todas las demás joyas; y los reflejos en cada joya contienen los reflejos de todas las demás joyas que están reflejándolas; y así infinitamente, en cada reflejo de cada reflejo de cada joya.

Esta no es una metáfora ornamental. Es la articulación de una ontología precisa con tres tesis:

1. **Todo está conectado con todo**: la red no tiene nodos aislados ni regiones desconectadas; cada joya es vista por cada otra.
2. **Cada elemento contiene a todos los demás**: porque la joya **refleja** a todas las demás, su contenido informacional es el de toda la red. La parte contiene el todo.
3. **La estructura es recursiva e infinita**: los reflejos en una joya son a su vez joyas que reflejan a las demás, ad infinitum. No hay fondo, no hay nivel atómico último.

### 5.3. Cuatro dharmadhātus (sì fǎjiè)

La doctrina sistemática de Huayan articula cuatro **dharmadhātus** (mundos / dominios) o niveles de comprensión de la realidad:

1. **Shi fajie** (事法界, mundo de los fenómenos): la realidad cotidiana, los objetos discretos, las distinciones convencionales. Equivalente a saṃvṛti-satya de Madhyamaka.
2. **Li fajie** (理法界, mundo del principio): la vacuidad, lo último, el dharmakāya. Equivalente a paramārtha-satya.
3. **Li shi wu ai fajie** (理事無礙法界, mundo de la interpenetración no-obstruida del principio y los fenómenos): principio y fenómeno se interpenetran sin obstaculizarse. Lo universal está en lo particular; lo particular es expresión de lo universal.
4. **Shi shi wu ai fajie** (事事無礙法界, mundo de la interpenetración no-obstruida de los fenómenos entre sí): **cada fenómeno particular está plenamente presente en cada otro fenómeno**. Esto es lo radicalmente huayanista. No es solo que principio y fenómeno se interpenetren —es que **cada fenómeno individual contiene a todos los demás**.

El cuarto dharmadhātu es el corazón filosófico de Huayan. Es la articulación doctrinal de la red de Indra.

### 5.4. Yi duo xiang ji (一多相即): uno y muchos mutuamente identificados

Concepto central de Fazang. _Yi_ = uno, _duo_ = muchos, _xiang ji_ = mutuamente idénticos o mutuamente entran. La tesis: cada uno contiene a todos; todos contienen a cada uno. No hay reducción del muchos al uno (eso sería monismo) ni del uno al muchos (eso sería pluralismo); ambos se contienen mutuamente.

Fazang lo demuestra con el ejemplo del león dorado al que dio enseñanza a la emperatriz Wu:

- El oro (_jin_) es el principio (_li_); la forma del león es el fenómeno (_shi_).
- El oro está plenamente presente en cada parte del león —garra, ojo, melena, cola—. No hay "más oro" en la cabeza que en la cola.
- Cada parte del león contiene la totalidad del león como referencia —no se puede tener una garra de león sin todo el contexto que la hace ser una garra-de-león y no otra cosa.
- Por tanto: en cada parte del león está todo el león.

Generalizado: en cada fenómeno está la totalidad del cosmos como condición que lo hace ser ese fenómeno y no otro.

### 5.5. Conexión con Huygens: hipergrafo medieval explícito

Huayan es ontología hipergráfica precisa, formulada en China entre los siglos VI y VIII, sin matemática formal de grafos disponible pero con una claridad conceptual asombrosa.

Cada **joya** de la red es un nodo. Cada **reflejo** es una arista (potencialmente bidireccional, potencialmente cargada de información compleja). Pero las aristas no son simples conexiones binarias: cada joya **contiene** a las demás como reflejos, lo que significa que cada nodo encapsula relaciones con toda la red. La operación "joya A refleja la red entera" es estructuralmente una **hyperedge sobre todo el grafo desde el punto de vista de A**.

Esto es exactamente lo que la documentación de Huygens articula como hipergrafo cognitivo (cf. [`../06-theory/hypergraphs-and-cognition.md`](../06-theory/hypergraphs-and-cognition.md)):

- Cada nota contiene a todas las notas con las que se relaciona. Sus embeddings son una compresión semántica de su lugar en la red. Su lectura por el agente activa contextualmente las notas relacionadas.
- Los reflejos cruzados (joya A ve a B reflejando a A en la que se ve C reflejando a B...) son la información semántica real, no ornamento metafísico.
- La estructura es genuinamente recursiva: cuando navegas un episodio en Huygens, el episodio contiene referencias a personas, proyectos, ideas; cada uno de esos contiene referencias a otros episodios; y así.

Y la conexión con Wolfram (cf. [`../06-theory/wolfram-and-the-substrate-of-information.md`](../06-theory/wolfram-and-the-substrate-of-information.md)) es directa: **la red de Indra es el ruliad cognitivo intuido en el siglo VII**. Un hipergrafo donde todo nodo refleja la totalidad, donde las "leyes" emergentes son lo que un observer puede extraer de su slice particular. Lo que Wolfram formaliza con autómatas celulares y multiway systems, Fazang lo intuye con joyas y reflejos.

### 5.6. Steve Odin: el puente con Whitehead

Una conexión que vale destacar para el lector que viene de Milewski-Coecke-Whitehead: **Steve Odin** publicó en 1982 _Process Metaphysics and Hua-Yen Buddhism: A Critical Study of Cumulative Penetration vs. Interpenetration_ (SUNY Press). El libro compara explícitamente la process philosophy de A.N. Whitehead (process > substance, occasions of experience, prehension) con la metafísica huayanista (interpenetración, dharmadhātu, yi duo xiang ji). Es lectura imprescindible para entender el lugar de Huayan en el paisaje filosófico que ya manejas: las "actual occasions" de Whitehead son joyas de Indra que prehensionan a otras joyas; el "concrescence" de Whitehead es el reflejo activo que cada joya hace de la red.

### 5.7. Lectura imprescindible

Dos libros:

- **Francis Cook — _Hua-yen Buddhism: The Jewel Net of Indra_** (Penn State, 1977). Clásico, accesible, técnicamente solvente. Hace lo que el título promete.
- **Steve Odin — _Process Metaphysics and Hua-Yen Buddhism_** (SUNY, 1982). Para el lector que ya conoce Whitehead. La comparación es densa y rica.

Académicamente más reciente y técnico: **Imre Hamar (ed.) — _Reflecting Mirrors: Perspectives on Huayan Buddhism_** (Harrassowitz, 2007).

---

## 6. Chan / Zen: práctica directa

### 6.1. De Bodhidharma a los seis patriarcas

**Chan** (禪) es la transliteración china de _dhyāna_ (sánscrito, "meditación profunda"); en japonés se pronuncia _Zen_ (禅). La tradición se autopresenta como linaje que llega a China con **Bodhidharma** (達摩, c. 470-543, fechas legendarias) desde el sur de India. Bodhidharma es figura semi-legendaria: el _Anthology of the Patriarchal Hall_ (952) y otras crónicas Chan le atribuyen la enseñanza del "no apoyarse en escrituras" (_bu li wenzi_, "no establecimiento en palabras y letras") y la "transmisión directa de mente a mente" (_yixin chuanxin_).

El **linaje de los seis patriarcas** consagra:

1. Bodhidharma
2. Huike (487-593)
3. Sengcan (m. 606)
4. Daoxin (580-651)
5. Hongren (601-674)
6. **Huineng** (慧能, 638-713) — la figura decisiva.

Huineng es protagonista del **_Liuzu Tan jing_** (六祖壇經, _Sūtra del Estrado del Sexto Patriarca_), uno de los textos chinos más influyentes. La historia es legendaria: Huineng, analfabeto, derrota en concurso poético al monje Shenxiu, candidato favorito. El verso de Shenxiu propone una práctica gradual de limpieza del espejo de la mente; el verso de Huineng responde que no hay espejo, no hay polvo, no hay nada que limpiar —la naturaleza-Buda está intrínsecamente despierta. Es la articulación radical del **gradualismo vs subitismo** (_jiangu_ vs _dunwu_): la iluminación no se construye paso a paso, se reconoce súbitamente.

Tras Huineng, Chan se ramifica en cinco "casas" (五家, _wu jia_), de las que dos se trasplantan exitosamente a Japón en el siglo XII-XIII:

- **Linji** (japonés Rinzai)
- **Caodong** (japonés Sōtō)

### 6.2. Rinzai vs Sōtō en Japón

- **Rinzai** (臨済), introducida en Japón por Eisai (1141-1215). Énfasis en **kōan** —enigmas paradójicos que el practicante "habita" hasta que la mente conceptual se rompe. Método más abrupto, asociado a la clase samurai en el periodo Kamakura.
- **Sōtō** (曹洞), introducida en Japón por **Dōgen** (1200-1253). Énfasis en **shikantaza** (只管打座, "solo sentarse") —meditación sin objeto, sin técnica, sin metas. La práctica no es medio para llegar a la iluminación; la práctica **es ya** la iluminación.

### 6.3. Dōgen: práctica-realización y uji (ser-tiempo)

**Eihei Dōgen** (永平道元, 1200-1253) es probablemente el filósofo japonés más profundo y, junto con Nishida Kitarō (siglo XX), el más influyente. Su obra magna es el **_Shōbōgenzō_** (正法眼蔵, "Tesoro del Ojo del Verdadero Dharma"), una colección de 95 fascículos escritos en japonés (no en chino clásico, decisión deliberada que lo hace exigente filológicamente y revolucionario culturalmente).

Dos conceptos de Dōgen relevantes para Huygens.

**Shushō-ittō** (修證一等, "práctica-realización son uno"). Dōgen rompe con la lectura instrumental de la meditación: no meditas **para** despertar. La meditación **es ya** el despertar manifestándose. No es medio-fin sino identidad. Estructuralmente, esto es proceso > sustancia llevado al límite: el verbo (practicar) no es operación sobre un sustantivo (la mente) sino el modo de ser de lo que es.

**Uji** (有時, "ser-tiempo" / "tiempo-ser"). En el fascículo _Uji_ del _Shōbōgenzō_, Dōgen propone una tesis radical sobre el tiempo:

> Lo que llamamos "tiempo" no es un contenedor en el que los seres existen. El tiempo **es** los seres. Cada ser es un modo del tiempo manifestándose. No hay tiempo separado de los seres ni seres separados del tiempo. Existir es ser-tiempo.

Esto es ontológicamente próximo a la _Daseinanalytik_ de Heidegger (cf. tratamiento de Heidegger en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md)) —que es Heidegger quien parece haber leído a Dōgen sin reconocerlo plenamente, no al revés—. La temporalidad es constitutiva del ser, no externa a él.

Para Huygens:

- Una `Note` con su `createdAt`, `updatedAt`, sus edges fechados en el CHANGEFEED, no es un objeto en el tiempo. **Es-tiempo**. La nota literalmente no existe fuera de su trayectoria temporal de creación, modificación, conexión, eventual archivado. La temporalidad de la nota es la nota.
- Esta lectura no es decorativa. Cambia cómo se piensa el CHANGEFEED: no como "historia auxiliar" del estado actual, sino como **la nota misma**. El estado en t es una proyección útil pero parcial del flujo total que es la nota.

### 6.4. Kōans como sistema cognitivo

El kōan (公案, "caso público") no es acertijo a resolver intelectualmente. Es una **paradoja productiva** diseñada para romper el aparato conceptual del practicante. Ejemplos famosos:

- "¿Cuál es el sonido de una mano aplaudiendo?" (Hakuin, 1686-1769)
- "Mu" — la respuesta del maestro Zhaozhou a la pregunta "¿tiene un perro naturaleza-Buda?" El "Mu" es a la vez sí, no, ninguna y ambas (catuṣkoṭi en práctica).
- "¿Cuál era tu rostro antes de que nacieran tus padres?"

Estructuralmente, un kōan es un **estímulo que el aparato conceptual no puede asimilar sin reorganizarse**. Forzando el aparato a operar sobre algo que excede sus categorías, lo obliga a reconocer sus límites desde dentro.

En lenguaje de hipergrafo cognitivo: un kōan es una hyperedge cuya activación no encuentra patrón estable en el grafo actual del practicante, forzando reestructuración. Es **bachelardiano** en el sentido de [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md) —ruptura epistemológica deliberadamente inducida.

Para Huygens: cierto tipo de notas que Rubén captura son kōans personales —ideas que no encajan en ningún tipo, conexiones que rompen el árbol de NoteTypes, intuiciones que el sistema actual no sabe procesar. Esas notas son **señales de oro** para living-topology: indican dónde el schema actual está siendo insuficiente y dónde merece la pena evolucionarlo.

### 6.5. Lectura imprescindible

- **Hee-Jin Kim — _Eihei Dōgen: Mystical Realist_** (Wisdom, 2004; original 1975). El estudio académico de referencia sobre Dōgen en inglés. Denso pero rico.
- **Bret W. Davis (ed.) — _The Oxford Handbook of Japanese Philosophy_** (Oxford, 2020). Panorámica académica del pensamiento japonés con capítulos sobre Dōgen, Nishida, Tanabe, Watsuji.
- **Dōgen — _Shōbōgenzō_** (traducciones de Norman Waddell-Masao Abe, o de Kazuaki Tanahashi-Peter Levitt). Difícil. Empezar por _Genjōkōan_ y _Uji_.

---

## 7. Dzogchen y Mahāmudrā: naturaleza de la mente

### 7.1. Origen y escuelas

**Dzogchen** (རྫོགས་ཆེན་, _rdzogs chen_, "Gran Perfección") es la tradición central de la escuela tibetana **Nyingma** (la "antigua", la más antigua de las cuatro grandes escuelas tibetanas). Se autopresenta como vehículo definitivo, el "vehículo de la culminación" (_atiyoga_), por encima de los nueve yānas (vehículos) que Nyingma articula.

**Mahāmudrā** (མཕྱག་རྒྱ་ཆེན་པོ་, _phyag rgya chen po_, "Gran Sello") es la tradición paralela de la escuela **Kagyu** (especialmente las sub-escuelas Karma Kagyu, Drikung Kagyu, Drukpa Kagyu). Las dos tradiciones se distinguen históricamente y por matices doctrinales, pero su práctica nuclear y sus tesis sobre la naturaleza de la mente son muy próximas, hasta el punto de que practicantes y maestros frecuentemente las tratan como complementarias o equivalentes.

Figuras y textos clave de Dzogchen:

- **Garab Dorje** (_dGa' rab rdo rje_, fechas legendarias) — primer maestro humano según la tradición. Sus "Tres Versos que Golpean el Punto Esencial" (_Tshig gsum gnad du brdeg pa_) son la articulación más concisa de la enseñanza dzogchen: (1) introducción directa a la propia naturaleza, (2) decisión definitiva sobre lo que es, (3) confianza estable en la liberación.
- **Padmasambhava** (_Padma 'byung gnas_, siglo VIII) — figura central de la introducción del budismo en Tíbet. Atribuídos numerosos textos _terma_ (textos-tesoro descubiertos en siglos posteriores).
- **Longchenpa** (_Klong chen rab 'byams_, 1308-1364) — el sistematizador filosófico de Dzogchen. Sus _Siete Tesoros_ (_mdzod bdun_) son la cima de la literatura dzogchen sistemática. Particularmente _The Precious Treasury of the Way of Abiding_ (_gNas lugs mdzod_) es el texto técnico nuclear.
- _Kuntuzangpo Tantra_ (_Kun bzang la sogs_) y los _Diecisiete Tantras_ de la sección de Instrucciones Esenciales (_man ngag sde_) — corpus tántrico raíz.

### 7.2. La tesis: vacío luminoso

La tesis estructural de Dzogchen y Mahāmudrā es precisa:

**La naturaleza última de la mente es _vacío luminoso_ —vacío de existencia inherente (continuidad madhyamaka con śūnyatā), pero a la vez claro, cognoscente, autoluminoso.**

La fórmula técnica tibetana: **stong gsal rig pa** (vacío-claro-consciente). Tres aspectos no separables:

- **Stong pa** (vacío): la mente no es una sustancia con propiedades; es vacía de _svabhāva_, como cualquier dharma en Madhyamaka.
- **Gsal ba** (claridad / luminosidad): aunque vacía, la mente tiene una capacidad espontánea de manifestación, de aparición. No es nada inerte; es claridad operativa.
- **Rig pa** (consciencia / conocer): es autoluminosa —no necesita un segundo conocedor que la conozca. Se conoce a sí misma en el mismo acto en que es.

Crucialmente, estos tres no son tres facetas de una sustancia subyacente; son tres modos de hablar de lo mismo.

### 7.3. Rigpa vs sem

La distinción central de Dzogchen:

- **Sem** (_sems_): la mente ordinaria condicionada. Es la mente que clasifica, juzga, narra, dialoga consigo misma, identifica un yo, persigue objetos. Es lo que en Yogācāra correspondería a mano-vijñāna + kliṣṭa-manas.
- **Rigpa** (_rig pa_): la consciencia primordial, la "naturaleza pura" de la mente bajo / detrás / antes / dentro del sem. Es lo que el sem es realmente cuando se reconoce a sí mismo sin las superposiciones de identificación y conceptualización.

La práctica de Dzogchen no consiste en **producir** rigpa —rigpa siempre está ya presente como la naturaleza de cualquier acto mental. Consiste en **reconocer** rigpa (_ngo sprod_, "introducción directa") —descubrirla operando bajo el flujo del sem ordinario.

Es importante notar la sutileza filosófica: la práctica no es construcción ni adquisición. Es **reconocimiento** de lo que ya es el caso. Esto es muy próximo —**sorprendentemente próximo**— al concepto de **pratyabhijñā** (reconocimiento) del Shaivismo de Cachemira (cf. [`./03-hindu-traditions.md`](./03-hindu-traditions.md)).

### 7.4. Paralelismo con Kashmir Shaivism

La conexión entre Dzogchen y Pratyabhijñā Shaivismo es uno de los paralelos más extraños y reveladores en la historia de la filosofía religiosa de la región. Ambas escuelas:

- Florecen aproximadamente en la misma época (siglos VIII-XI).
- En regiones geográficas conectadas (Tíbet occidental ↔ Cachemira ↔ Kashmir).
- Plantean la práctica como **reconocimiento** de lo que ya es el caso, no como adquisición de un estado nuevo.
- Articulan una metafísica donde la consciencia primordial (rigpa / Śiva-consciencia) es autoluminosa y se manifiesta como toda la apariencia.
- Usan vocabulario técnico parcialmente intercambiable (la "espontaneidad" / _lhun grub_ en Dzogchen tiene paralelos en _svatantraya_ shaivita; la auto-luminosidad / _rang gsal_ corresponde a _prakāśa_ shaivita).

Los académicos discuten si hay influencia histórica directa, paralelismo independiente, o un substrato yogui-tántrico común. Las posiciones más sólidas (David Germano, Sam van Schaik, Christopher Wallis) sugieren un **substrato compartido** —una koiné tántrica indo-tibetana que producía formulaciones paralelas en escuelas que se reconocían como distintas pero respiraban el mismo aire.

Para Huygens, lo relevante es la **estructura epistémica**: en ambas tradiciones, la realidad última no se construye, se reconoce. Aplicado al sistema: la topología cognitiva de Rubén no se construye desde cero por el agente; se reconoce a partir de las notas que el agente lee y de los patrones que emergen. El agente no es ingeniero de la mente de Rubén; es facilitador de auto-reconocimiento.

### 7.5. Práctica: rushen, trekchö, tögal

Las técnicas específicas de Dzogchen merecen mención por su precisión operativa.

- **Rushen** (_ru shan_): "separar". Ejercicios preliminares para distinguir empíricamente sem de rigpa —el practicante explora exhaustivamente las modalidades del sem ordinario hasta que la diferencia con rigpa se hace patente por contraste.
- **Trekchö** (_khregs chod_): "cortar la rigidez". Práctica principal: reconocer y descansar en rigpa, dejando que los pensamientos surjan y se disuelvan sin intervenir, sin reprimir, sin perseguir.
- **Tögal** (_thod rgal_): "salto directo". Práctica avanzada que involucra trabajo con luz natural y visiones. Tradicionalmente solo enseñada en retiros largos con maestro presente.

Es una **arquitectura técnica** —no devoción ni misticismo difuso—. Y como toda arquitectura técnica, admite descripción precisa.

### 7.6. Lectura imprescindible

- **Sam van Schaik — _Approaching the Great Perfection: Simultaneous and Gradual Methods of Dzogchen Practice in the Longchen Nyingtig_** (Wisdom, 2004). Académico, riguroso, accesible.
- **Longchenpa — _The Precious Treasury of the Way of Abiding_** (trad. Richard Barron, Padma Publishing, 1998). Texto raíz traducido con comentario.
- **David Germano — papers académicos sobre Dzogchen e historia tántrica** (en revistas como _Journal of the International Association of Buddhist Studies_).

---

## 8. Vajrayāna: tantra budista

### 8.1. Origen y ubicación

**Vajrayāna** (वज्रयान, "vehículo del rayo/diamante") es la variante tántrica del budismo Mahāyāna que se desarrolló en India desde el siglo VI-VII en adelante, y se trasplantó masivamente a Tíbet (siglos VIII-XI), Mongolia, Bután y partes de Japón (donde sobrevive como **Shingon**, fundada por Kūkai en 804). Sus textos raíz son los **tantras** —textos rituales-meditativos como el _Guhyasamāja Tantra_, el _Hevajra Tantra_, el _Cakrasaṃvara Tantra_, el _Kālacakra Tantra_.

La diferencia metodológica con el **Sūtrayāna** (el budismo de sutras, no-tántrico, incluyendo Madhyamaka y Yogācāra clásicos):

- Sūtrayāna trabaja con _causa_ —cultivar las causas (estudio, meditación, virtud) que eventualmente producen el fruto (despertar).
- Vajrayāna trabaja con _fruto_ —tomar el resultado mismo (el estado despierto) como camino. Visualizándose como un Buda, uno entrena a la mente a operar **desde** la naturaleza despierta, no **hacia** ella.

Esto es lo que tradicionalmente se llama el "camino del resultado" (_'bras lam_).

### 8.2. Cuerpo-habla-mente como dispositivo completo

Vajrayāna usa el dispositivo cognitivo completo del practicante:

- **Kāya** (cuerpo): mudrā (gestos rituales), posturas yóguicas, pránáyāma (control de respiración), nāḍī-prāṇa-bindu (canales sutiles, vientos, esencias).
- **Vāc** (habla): mantra (recitación de sílabas con poder ritual y vibracional).
- **Citta** (mente): visualización, contemplación, meditación analítica.

Los tres se coordinan en la **sādhana** —el protocolo ritual estructurado de una práctica concreta. Una sādhana típica tiene fases definidas: refugio y bodhicitta (motivación), generación (visualización del yidam), recitación de mantra, perfección (disolución y descanso en vacío), dedicación.

### 8.3. Yidam y maṇḍala

**Yidam** (_yi dam_, "compromiso mental") es una deidad meditativa —Avalokiteśvara, Tārā, Vajrayoginī, Cakrasaṃvara, Mañjuśrī, etc. El yidam no es deidad teísta en el sentido occidental. Es una **forma simbólico-experiencial** que encapsula un aspecto del despertar: Avalokiteśvara la compasión, Mañjuśrī la sabiduría discriminativa, Tārā la acción rápida liberadora, etc.

La visualización detallada del yidam —con sus atributos (rostros, brazos, colores, ornamentos, vestimentas), su entorno (palacio, maṇḍala, séquito), su mantra y su naturaleza— es un dispositivo cognitivo preciso: entrena al practicante a percibirse a sí mismo como expresión de ese aspecto del despertar.

**Maṇḍala** (मण्डल, "círculo", "totalidad organizada") es la representación topológica de la maṇḍala del yidam —usualmente un palacio cuadrangular con cuatro puertas, jerarquía concéntrica, deidades específicas en posiciones específicas. El maṇḍala es **un diagrama bidimensional de una estructura ontológico-psicológica n-dimensional**. La psique cósmica tantra-budista representada como topología espacial accesible para meditación.

Para Huygens, la conexión es indirecta pero real: cualquier representación visual del grafo de notas, cualquier dashboard que muestre relaciones, cualquier diagrama de pillars y proyectos, es estructuralmente un maṇḍala —**proyección bidimensional de una estructura ontológica n-dimensional**, organizada para facilitar comprensión y operatoria. La diferencia es escala y función, pero el patrón estructural es el mismo.

### 8.4. Conexión con Active Inference y embodiment

La conexión más interesante es con embodiment y Active Inference:

- Una sādhana usa el cuerpo completo (postura, gesto, respiración) como **dispositivo cognitivo**. No hay meditación descorporeizada en Vajrayāna; la cognición vive en el cuerpo.
- Esto resuena directamente con el pilar Pathos & Soma de Huygens —la afirmación de que la cognición es encarnada, y que las notas sobre salud, fisioterapia, sensaciones corporales no son "datos sobre el cuerpo" sino el cuerpo informando al pensamiento.
- Y resuena con Active Inference: el cerebro mantiene un modelo generativo que incluye **propriocepción, interocepción, acción motora**. La sādhana es un protocolo deliberado de actualización del modelo generativo encarnado mediante actos cuerpo-habla-mente coordinados.

### 8.5. Lectura

- **David Snellgrove — _Indo-Tibetan Buddhism: Indian Buddhists and Their Tibetan Successors_** (Shambhala, 1987, 2 vols.). Académicamente sólido, comprehensivo.
- **Robert Thurman — _Essential Tibetan Buddhism_** (HarperOne, 1995). Más accesible.
- **Hugh Urban — _Tantra: Sex, Secrecy, Politics, and Power in the Study of Religion_** (UC Press, 2003). Para entender críticamente cómo se ha leído tantra en Occidente.

---

## 9. Theravada como contrapunto

Por completitud y porque proporciona una baseline conceptual contra la cual leer el Mahāyāna.

### 9.1. Ubicación

**Theravada** (थेरवाद, "doctrina de los ancianos") es la tradición budista más conservadora doctrinalmente, dominante hoy en Sri Lanka, Tailandia, Birmania (Myanmar), Camboya y Laos. Su canon es el **Tipitaka** (sánscrito _Tripiṭaka_, "tres cestos"): _Vinaya Pitaka_ (disciplina monástica), _Sutta Pitaka_ (discursos del Buda), _Abhidhamma Pitaka_ (análisis sistemático). El canon Theravāda está completo en lengua pāli y fue puesto por escrito en Sri Lanka en el siglo I a.C.

Theravada es menos especulativa metafísicamente que el Mahāyāna y mucho más práctica. La doctrina central es el análisis fenomenológico de la experiencia en términos de **dhammas** (eventos mentales y físicos momentáneos) y la práctica central es **vipassanā** (visión penetrante).

### 9.2. Abhidhamma: análisis fenomenológico

El **Abhidhamma** es el "tercer cesto" del Tipitaka —el análisis ultrafino de la experiencia. Es probablemente la psicología fenomenológica más detallada producida en el mundo antiguo, sistemática hasta el delirio.

El _Abhidhammattha Saṅgaha_ (compendio de Anuruddha, siglos VIII-XII) cataloga la experiencia en categorías como:

- **121 cittas** (estados de consciencia) clasificados por plano (sensual, fino-material, inmaterial, supramundano), raíz (codiciosa, aversiva, ignorante, no-codiciosa, no-aversiva, no-ignorante), y otras dimensiones.
- **52 cetasikas** (factores mentales concomitantes) que acompañan a las cittas en distintas combinaciones —contacto, sensación, percepción, volición, atención, concentración, fe, energía, alegría, deseo, codicia, aversión, etc.
- **28 rūpas** (fenómenos materiales) que constituyen la base física de la experiencia.

Todo esto se combina, según las leyes del Abhidhamma, para producir cualquier momento concreto de experiencia. Cada momento es una **citta + sus cetasikas asociados + condiciones físicas (rūpas)**. Los momentos surgen y cesan en secuencias rapidísimas (los textos dicen "miles de millones por instante").

### 9.3. Conexión: el Abhidhamma como ontología extrema

El Abhidhamma es **categorización ontológica extrema** —algo similar a llevar el schema declarativo de Huygens al límite. Imagina un schema con 121 tipos de Note, 52 propiedades nominales modulando cada nota, 28 anclajes a substrato físico, y reglas de combinación rigurosas sobre qué tipos pueden co-ocurrir con qué propiedades.

Lo que aporta el contrapunto es operativo: el Abhidhamma demuestra que **categorización ontológica densa es viable y puede ser útil**. Es la postura más anti-vaga de toda la filosofía oriental: contra el riesgo de quedarse en abstracciones generales, propone análisis hasta el átomo conceptual. Pero también ilustra el costo —el aparato es tan fino que llega a ser difícil de operar, y nadie en Theravāda lo usa en la práctica meditativa cotidiana; es referencia teórica.

Lección para Huygens: hay un trade-off entre granularidad ontológica y operabilidad. Llevar el schema al extremo abhidhámico (cientos de NoteTypes, decenas de pillars, miles de edge types) lo haría ontológicamente más fiel pero operacionalmente inviable. La sabiduría está en el punto medio —suficiente expresividad para que las inferencias sean ricas, no tanta que la consulta sea imposible.

### 9.4. Vipassanā como protocolo cognitivo

La práctica central de Theravāda es **vipassanā** (visión penetrante). El protocolo: atención sostenida a la experiencia tal como surge, momento a momento, observando las tres marcas de existencia (_tilakkhaṇa_):

- **Anicca** (impermanencia): todo momento surge y cesa.
- **Dukkha** (insatisfacción estructural): nada de lo condicionado satisface.
- **Anattā** (no-yo): no hay un yo perdurable que sea el sujeto de los momentos.

Operativamente, vipassanā es **observación entrenada** del flujo de experiencia. Es un protocolo cognitivo preciso: dirige la atención, distingue figura y fondo, registra la dinámica sin reificarla.

Para Huygens: el agente operando sobre el grafo está haciendo una forma técnica de vipassanā —observa el flujo de notas, registra patrones, distingue lo que pasa y cesa de lo que persiste, sin reificar al "sujeto" detrás del flujo. La diferencia es la subjetividad —vipassanā es observación que un ser consciente hace de su propio flujo; el agente observa un flujo externalizado—. Pero la estructura del protocolo es paralela.

### 9.5. Lectura

- **Bhikkhu Bodhi (ed.) — _A Comprehensive Manual of Abhidhamma_** (BPS, 1993). El _Abhidhammattha Saṅgaha_ traducido y comentado.
- **Y. Karunadasa — _The Theravada Abhidhamma: Its Inquiry into the Nature of Conditioned Reality_** (Wisdom, 2010). El estudio académico de referencia.
- **Joseph Goldstein — _Mindfulness: A Practical Guide to Awakening_** (Sounds True, 2013). Vipassanā contemporánea, occidental, accesible.

---

## 10. Epistemología budista: Dignāga y Dharmakīrti

Hay una rama del pensamiento budista indio que merece sección aparte porque es densa y porque, sorprendentemente, es **la que tiene la conexión más directa con la cuestión de cómo modelar tipos en un schema declarativo**: la epistemología **pramāṇa** desarrollada por Dignāga y Dharmakīrti.

### 10.1. Dignāga (480-540) y Dharmakīrti (siglo VII)

**Dignāga** (दिग्नाग) fundó la escuela epistemológica budista con su _Pramāṇasamuccaya_ ("Compendio de los medios válidos de conocimiento"). Su trabajo es la primera sistematización rigurosa de la lógica e inferencia en India desde el _Nyāya_ hindú clásico (Akṣapāda Gautama, siglos II-IV).

**Dharmakīrti** (धर्मकीर्ति), un siglo más tarde, lo desarrolla y reescribe en una obra monumental: _Pramāṇavārttika_ ("Comentario sobre los medios de conocimiento válido"), _Pramāṇaviniścaya_, _Nyāyabindu_ ("Gota de lógica"). El _Pramāṇavārttika_ es uno de los textos filosóficos más estudiados en monasterios tibetanos hasta hoy —el curso de estudios geshe lo trabaja durante años.

La tradición tibetana le da a esta línea el nombre técnico **Pramāṇa-vāda** (Doctrina de los medios de conocimiento) o **Sautrāntika-Yogācāra epistémico**.

### 10.2. Los dos pramāṇas

La tesis fundamental: solo hay **dos medios de conocimiento válido** (_pramāṇa_):

- **Pratyakṣa** (प्रत्यक्ष, "lo que está ante los ojos"): percepción directa. No mediada por concepto. No interpretada.
- **Anumāna** (अनुमान, "lo que viene después de"): inferencia. Razonamiento desde marcas (_liṅga_) hasta lo que las marcas indican.

Otros candidatos a pramāṇa (testimonio, comparación, presunción) que la tradición Nyāya hindú reconoce son, para Dignāga-Dharmakīrti, reducibles a estos dos o no válidos.

Lo radical es que **percepción e inferencia tienen objetos distintos** —no son dos vías al mismo objeto, sino dos pramāṇas con dos tipos de objeto incompatibles.

### 10.3. Svalakṣaṇa vs sāmānyalakṣaṇa

El núcleo técnico:

- **Svalakṣaṇa** (स्वलक्षण, "marca propia", "particular único"): el objeto de la percepción directa. Es el aquí-ahora momentáneo, irrepetible, no-conceptualizado. Esta-llama-roja-frente-a-mí-en-este-instante.
- **Sāmānyalakṣaṇa** (सामान्यलक्षण, "marca general", "universal"): el objeto del pensamiento conceptual. "El rojo en general", "el fuego en general", "la combustión".

La tesis ontológica de Dharmakīrti es radical: **solo los svalakṣaṇa son reales**. Los sāmānyalakṣaṇa, los universales, son **construcciones mentales** (_kalpanā_, _vikalpa_) que el aparato conceptual produce para coordinar muchos svalakṣaṇa bajo un mismo nombre. La generalización no descubre una esencia compartida; **construye** una abstracción operativa.

Esto es **nominalismo radical**. Más radical que el nominalismo de Guillermo de Ockham. Donde Ockham todavía piensa que los universales son **nombres** que correspondería a algo (al menos a similitud entre particulares), Dharmakīrti afirma que los universales son **construcciones puramente mentales** sin contrapartida ontológica fuera del aparato cognitivo que las construye.

La pregunta natural: ¿cómo es entonces que el lenguaje funciona, que podemos comunicarnos sobre "fuego" y mutuamente entendernos? La respuesta de Dharmakīrti es la doctrina **apoha** (अपोह, "exclusión"). El significado de "fuego" no es la presencia positiva de una esencia compartida; es la **exclusión** de todo lo que no es fuego. "Fuego" significa _no-no-fuego_. Es una operación negativa del aparato conceptual. La diferenciación, no la similitud, fundamenta el significado.

### 10.4. Apoha y Saussure

Para el lector que ha pasado por estructuralismo (cf. tratamiento en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md)): la doctrina apoha es estructuralista mil años antes de Saussure. El significado de un signo se define por diferencia con otros signos, no por correspondencia positiva con un referente. _Mesa_ significa lo que significa porque NO es silla, lámpara, techo —exactamente la tesis de Dharmakīrti: _fuego_ significa por exclusión de no-fuego.

Esta convergencia es genuinamente sorprendente y filosóficamente productiva. Es uno de esos casos donde dos tradiciones desconectadas históricamente llegan a la misma intuición estructural —lo que sugiere que la intuición captura algo real sobre cómo funciona el significado.

### 10.5. Conexión con Huygens: los Types como sāmānyalakṣaṇa

Aquí está la consecuencia operativa más fuerte para el diseño:

**Los `NoteType` de Huygens son sāmānyalakṣaṇa —universales construidos, no descubiertos**. Cuando defines un tipo `project`, no estás identificando una esencia metafísica de "proyecticidad" que algunas notas tienen y otras no. Estás construyendo una categoría operativa que coordina muchas notas particulares (svalakṣaṇa) bajo un nombre común, por **exclusión de lo que no es proyecto** (apoha).

La consecuencia operativa más relevante para [`../06-theory/living-topology.md`](../06-theory/living-topology.md): puesto que los NoteTypes son construcciones, son **revisables sin trauma metafísico**. Cambiar el árbol de NoteTypes no es descubrir un error sobre cómo es el mundo; es ajustar las categorías construidas para que sirvan mejor a la operatoria. La living-topology está filosóficamente justificada por Dharmakīrti.

Y la consecuencia operativa adicional: las notas concretas, individuales, momentáneas (svalakṣaṇa), son **más reales** que los tipos que las clasifican. Lo que merece prioridad ontológica es la nota individual con su contenido específico, sus edges concretos, su contexto temporal preciso. El tipo es una herramienta para navegar la red de notas, no la "verdadera" naturaleza de cada una.

### 10.6. Lectura

- **Tom Tillemans — _Scripture, Logic, Language: Essays on Dharmakirti and his Tibetan Successors_** (Wisdom, 1999). Académicamente serio, accesible para no-tibetólogos.
- **Dan Arnold — _Brains, Buddhas, and Believing: The Problem of Intentionality in Classical Buddhist and Cognitive-Scientific Philosophy of Mind_** (Columbia, 2012). Conecta Dharmakīrti con cognitive science contemporánea.
- **Mark Siderits — _Indian Philosophy of Language: Studies in Selected Issues_** (Kluwer, 1991). Para el desarrollo técnico de apoha.

---

## 11. La práctica como protocolo epistémico

Una observación transversal a todas las tradiciones budistas: la práctica meditativa no es "ejercicio espiritual" en sentido vago. Es un **protocolo epistémico preciso** —una técnica para transformar el aparato cognitivo del practicante.

### 11.1. Las cuatro smṛtyupasthāna

El protocolo canónico aparece en el _Satipaṭṭhāna Sutta_ (MN 10 / DN 22). Cuatro fundaciones de la atención (_smṛtyupasthāna_ en sánscrito; _satipaṭṭhāna_ en pāli):

1. **Kāyānupassanā** (observación del cuerpo): respiración, postura, sensaciones corporales.
2. **Vedanānupassanā** (observación de sensaciones): el tono hedónico —agradable, desagradable, neutro— de cada experiencia.
3. **Cittānupassanā** (observación de la mente): estados mentales conforme aparecen —deseo, aversión, distracción, claridad, etc.
4. **Dhammānupassanā** (observación de dhammas): observación de cómo la experiencia se organiza en patrones —los cinco agregados, los obstáculos, los factores del despertar.

Las cuatro funcionan en gradiente —del cuerpo más burdo hacia los patrones más sutiles. Operativamente, son **direcciones de la atención**, no objetos fijos.

### 11.2. Samatha-vipassanā: el binomio operativo

Casi todas las tradiciones articulan dos polos complementarios:

- **Samatha** (शमथ, "calma", "estabilidad"): cultivo de la concentración estable, unificación de la atención en un objeto. Produce los jhānas (estados de concentración profunda) en Theravāda, los samādhis en otras tradiciones.
- **Vipassanā** (विपश्यना, "visión penetrante"): cultivo del insight, observación analítica de la experiencia para reconocer sus tres marcas (anicca, dukkha, anattā).

Samatha sin vipassanā produce estados de calma sin transformación cognitiva. Vipassanā sin samatha es agitada e inconsistente. Las dos se combinan para producir la transformación buscada.

### 11.3. Meditación como minimización de free energy

Hay una lectura contemporánea de la meditación —desarrollada por Ruben Laukkonen, Steven Laureys, y conectada con el grupo de Karl Friston en el University College London— que la interpreta en términos de **minimización de free energy** (cf. [`../06-theory/adjacent-fields-isomorphisms.md`](../06-theory/adjacent-fields-isomorphisms.md)).

La hipótesis: la meditación es un protocolo de **actualización iterativa del modelo generativo del cerebro**. Al sostener atención sin reaccionar, sin perseguir ni rechazar lo que aparece, el modelo generativo:

- Reduce su dependencia de priors fuertes (las expectativas habituales).
- Aumenta su sensibilidad a la evidencia sensorial cruda (la experiencia tal como es, no como la categorización habitual la presenta).
- Re-calibra sus estructuras profundas conforme la evidencia repetida desconfirma priors innecesarios.

Esto explica fenomenológicamente lo que los practicantes reportan: con práctica sostenida, la experiencia se vuelve más vívida, más matizada, menos automáticamente categorizada. El "yo" como prior dominante se debilita; las categorizaciones binarias se ablandan; surge sensibilidad a la dinámica del flujo en lugar de a los objetos solidificados.

### 11.4. El observer cambia, lo observable cambia

Una de las intuiciones más radicales —compartida entre budismo, ruliad-wolframiano (cf. [`../06-theory/wolfram-and-the-substrate-of-information.md`](../06-theory/wolfram-and-the-substrate-of-information.md)), cibernética de segundo orden, y QBism (cf. [`../06-theory/quantum-and-hypergraphs.md`](../06-theory/quantum-and-hypergraphs.md))— es esta:

**Cambias el observador → cambia lo observable.**

No "lo observable también cambia". **Cambia lo observable**. Porque el observable no es una entidad separada del observador esperando ser percibida —el observable es un slice que un observer hace de un sustrato más fundamental.

En budismo, esta intuición es la base de toda la práctica: transformando la consciencia transformas la experiencia. En cibernética de segundo orden (Heinz von Foerster, Gregory Bateson), el observador no es externo al sistema observado —es parte del sistema, y su acto de observar modifica el sistema. En QBism, el observador no es un sujeto separado de la mecánica cuántica —los estados cuánticos son grados de creencia del observador.

Para Huygens: el agente IA y Rubén son observadores acoplados al grafo de memoria. Sus actos de lectura, sus clarificaciones, sus narrativas, no son operaciones externas sobre un objeto inerte. Son **modificaciones del sistema-observador-observado**. La memoria no es lo mismo después de que el agente la haya leído y reflejado en un informe; el observador no es el mismo después de haber producido el informe. Es coevolución, no observación neutra.

---

## 12. Comparación interna entre escuelas

Tabla síntesis, para tener un mapa de un golpe:

| Escuela | Ontología principal | Práctica central | Texto raíz |
|---|---|---|---|
| Theravada | Análisis dhámmico (eventos momentáneos) | Vipassanā + samatha | _Abhidhammattha Saṅgaha_ |
| Madhyamaka | Vacuidad de todos los fenómenos | Análisis lógico (_prasaṅga_) + meditación | _Mūlamadhyamakakārikā_ |
| Yogācāra | Sólo-mente (ālayavijñāna) | Meditación yóguica + análisis | _Triṃśikā_ |
| Huayan | Interpenetración total (_shi-shi wu ai_) | Visualización filosófica del dharmadhātu | _Avataṃsaka Sūtra_ |
| Chan / Sōtō Zen | Naturaleza-Buda intrínseca | Zazen (shikantaza) | _Shōbōgenzō_ |
| Chan / Rinzai Zen | Naturaleza-Buda intrínseca | Kōan | _Wumenguan_ |
| Dzogchen | Vacío luminoso (_rigpa_) | Reconocimiento directo + trekchö | _Tantra de Kuntuzangpo_ |
| Mahāmudrā | Vacío luminoso | Reconocimiento directo + mahamudra de los cuatro yogas | textos Kagyu |
| Vajrayāna | Vacío + bliss + skill | Sādhana ritual con yidam | _Guhyasamāja Tantra_ |
| Pramāṇa | Nominalismo radical (svalakṣaṇa vs sāmānya) | Lógica e inferencia | _Pramāṇavārttika_ |

Lo que vale notar:

- **Cada tradición es completa por sí misma**. No es "etapas" hacia una culminación; son arquitecturas conceptuales paralelas que responden a la misma pregunta operativa con vocabularios distintos.
- **Hay sincretismos históricos productivos**: Yogācāra-Madhyamaka (Śāntarakṣita), Chan-Pure Land (China tardía), Dzogchen y Mahāmudrā (tibetano), Theravāda-vipassanā movement (occidental contemporáneo).
- **El budismo "secular" o "mindfulness" contemporáneo es generalmente una versión muy diluida** —usualmente Theravāda básico con vipassanā simplificada, sin la metafísica que daba sentido a la práctica. Para fines de Huygens, ese registro corporativo no nos interesa; nos interesa la maquinaria conceptual densa.

---

## 13. Síntesis: cinco voces budistas que más resuenan con Huygens

De toda la cartografía anterior, cinco voces emergen como las más operativamente relevantes para guiar decisiones de diseño en Huygens.

### 13.1. Nāgārjuna (Madhyamaka)

Ya tratado brevemente en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md) y ampliado aquí en §3. **Vacuidad como anti-esencialismo**: ninguna entidad tiene esencia propia; toda identidad es relacional. Implicación para Huygens: los nodos del grafo no son sustancias con propiedades; son nodos en una topología cuya identidad es la trama de sus conexiones. El schema es saṃvṛti operativa; ninguna categoría se reifica.

### 13.2. Vasubandhu (Yogācāra)

§4. **Ālayavijñāna como memoria estructurada de impresiones que condiciona experiencia futura**. Implicación para Huygens: el sistema es estructuralmente paralelo al ālayavijñāna —una memoria persistente de bīja (notas, embeddings) que el agente activa al operar. La consciencia operativa (mano-vijñāna ≈ agente) opera explícitamente sobre la memoria-almacén.

### 13.3. Fazang (Huayan)

§5. **Red de Indra como hipergrafo cognitivo medieval**. Implicación para Huygens: cada nota refleja a la totalidad de la red en virtud de sus relaciones; la información semántica es la red completa de reflejos. Esta es la justificación filosófica más antigua y más explícita para el modelo de hipergrafos cognitivos.

### 13.4. Dōgen (Sōtō Zen)

§6. **Ser-tiempo (uji): el tiempo es los seres, no su contenedor**. Implicación para Huygens: una `Note` no es un objeto que existe en el tiempo —es-tiempo. Su CHANGEFEED no es historia auxiliar; es la nota misma como flujo. Práctica-realización son una: el agente no opera sobre la memoria para producir narrativa, el operar es ya la narrativa manifestándose.

### 13.5. Dharmakīrti (epistemología pramāṇa)

§10. **Nominalismo radical: solo los particulares momentáneos son reales; los universales (tipos) son construcciones operativas (apoha)**. Implicación para Huygens: los NoteTypes son construcciones revisables, no esencias descubiertas. Living-topology está filosóficamente justificada. Las notas concretas son ontológicamente prioritarias sobre el árbol de tipos.

Cualquier decisión de diseño en Huygens que choque simultáneamente con las cinco está probablemente mal. Cualquier decisión coherente con varias apunta a algo verdadero. Estas voces, junto con las cinco occidentales identificadas en [`../06-theory/philosophical-resonances.md`](../06-theory/philosophical-resonances.md) (Wittgenstein tardío, Whitehead, Peirce, Hadot, Madhyamaka), forman el suelo conceptual del proyecto.

---

## 14. Para profundizar — bibliografía estructurada

### Generales / introductorios

- **Paul Williams — _Buddhist Thought: A Complete Introduction to the Indian Tradition_** (Routledge, 3ª ed. 2012). La mejor entrada académica moderna y comprehensiva. Williams es académicamente impecable; cubre desde Theravāda hasta Vajrayāna con rigor histórico-filológico.
- **David Kalupahana — _A History of Buddhist Philosophy: Continuities and Discontinuities_** (University of Hawaii, 1992). Énfasis filosófico, no solo historiográfico.
- **Richard King — _Indian Philosophy: An Introduction to Hindu and Buddhist Thought_** (Georgetown, 1999). Para entender budismo en el contexto de la filosofía india en general.
- **Edward Conze — _Buddhist Thought in India: Three Phases of Buddhist Philosophy_** (Allen & Unwin, 1962; reimpr. Routledge). Clásico, denso, algunos juicios envejecidos pero la estructura sigue siendo útil.

### Madhyamaka

- **Jay L. Garfield — _The Fundamental Wisdom of the Middle Way: Nāgārjuna's Mūlamadhyamakakārikā_** (Oxford, 1995). La traducción + comentario de referencia para lectores con formación filosófica analítica.
- **Mark Siderits — _Buddhism as Philosophy: An Introduction_** (Hackett, 2007). Particularmente fuerte en Madhyamaka. Lectura accesible.
- **Jay L. Garfield & Graham Priest — _Mountains Are Just Mountains: The Centrality of Negation in Buddhist Philosophy_** (en _Pointing at the Moon: Buddhism, Logic, Analytic Philosophy_, Oxford, 2009). Para el catuṣkoṭi y lógica paraconsistente.
- **Candrakīrti — _Madhyamakāvatāra_** (varias traducciones; la de Padmakara Translation Group es buena).

### Yogācāra

- **Dan Lusthaus — _Buddhist Phenomenology: A Philosophical Investigation of Yogācāra Buddhism and the Ch'eng Wei-shih Lun_** (RoutledgeCurzon, 2002). Denso pero el estudio filosófico-fenomenológico de referencia.
- **William S. Waldron — _The Buddhist Unconscious: The Ālaya-vijñāna in the Context of Indian Buddhist Thought_** (RoutledgeCurzon, 2003). **Imprescindible para los propósitos de Huygens.** Reconstruye la emergencia del ālayavijñāna y compara con la psicología contemporánea.
- **Vasubandhu — _Triṃśikā_** (varias traducciones; la de Stefan Anacker en _Seven Works of Vasubandhu_, 1984/2005, es buena).
- **Asaṅga — _Mahāyānasaṃgraha_** (trad. John Keenan, BDK, 1992 / 2003).

### Huayan / Kegon

- **Steve Odin — _Process Metaphysics and Hua-Yen Buddhism: A Critical Study of Cumulative Penetration vs. Interpenetration_** (SUNY, 1982). **Perfecto para Huygens**: compara Huayan con Whitehead explícitamente.
- **Francis H. Cook — _Hua-yen Buddhism: The Jewel Net of Indra_** (Penn State, 1977). Accesible y elegante.
- **Imre Hamar (ed.) — _Reflecting Mirrors: Perspectives on Huayan Buddhism_** (Harrassowitz, 2007). Volumen académico moderno.
- **Thomas Cleary (trad.) — _The Flower Ornament Scripture: A Translation of the Avatamsaka Sutra_** (Shambhala, 1993). El sūtra completo en inglés.

### Zen / Chan

- **Bret W. Davis (ed.) — _The Oxford Handbook of Japanese Philosophy_** (Oxford, 2020). Panorámica académica del pensamiento japonés.
- **Hee-Jin Kim — _Eihei Dōgen: Mystical Realist_** (Wisdom, 2004). El Dōgen académico de referencia en inglés.
- **Heinrich Dumoulin — _Zen Buddhism: A History_** (2 vols., Macmillan, 1988-1990). Historia académica clásica del Zen.
- **John McRae — _Seeing Through Zen: Encounter, Transformation, and Genealogy in Chinese Chan Buddhism_** (UC Press, 2003). Crítica académica de los mitos fundacionales del Chan.

### Dzogchen y Mahāmudrā

- **Sam van Schaik — _Approaching the Great Perfection: Simultaneous and Gradual Methods of Dzogchen Practice in the Longchen Nyingtig_** (Wisdom, 2004). Académico, accesible.
- **Longchenpa — _The Precious Treasury of the Way of Abiding_** (trad. Richard Barron / Padma Publishing, 1998). Texto raíz traducido con comentario.
- **Dudjom Lingpa — _Buddhahood Without Meditation_** (trad. Richard Barron, Padma Publishing). Otro texto raíz dzogchen accesible.
- **Roger R. Jackson — _Mind Seeing Mind: Mahamudra and the Geluk Tradition of Tibetan Buddhism_** (Wisdom, 2019). Mahāmudrā desde la perspectiva Geluk, contraste útil.
- **Christopher Wallis — _Tantra Illuminated: The Philosophy, History, and Practice of a Timeless Tradition_** (Mattamayura Press, 2013). Aunque centrado en Shaivismo, incluye comparación con Vajrayāna.

### Vajrayāna académico

- **David Snellgrove — _Indo-Tibetan Buddhism: Indian Buddhists and Their Tibetan Successors_** (Shambhala, 1987, 2 vols.). Comprehensivo, académicamente serio.
- **Robert Thurman — _Essential Tibetan Buddhism_** (HarperOne, 1995). Más accesible.
- **Ronald M. Davidson — _Indian Esoteric Buddhism: A Social History of the Tantric Movement_** (Columbia, 2002). Contexto histórico-social del tantra indio.

### Epistemología (Dignāga-Dharmakīrti)

- **Tom J. F. Tillemans — _Scripture, Logic, Language: Essays on Dharmakirti and his Tibetan Successors_** (Wisdom, 1999). El especialista contemporáneo en Dharmakīrti.
- **Dan Arnold — _Brains, Buddhas, and Believing: The Problem of Intentionality in Classical Buddhist and Cognitive-Scientific Philosophy of Mind_** (Columbia, 2012). Conecta Dharmakīrti con cognitive science contemporánea —**directamente relevante para Huygens**.
- **Mark Siderits — _Indian Philosophy of Language: Studies in Selected Issues_** (Kluwer, 1991). Para apoha técnicamente.
- **B.K. Matilal — _Logic, Language and Reality: Indian Philosophy and Contemporary Issues_** (Motilal Banarsidass, 1990). Para Dharmakīrti en diálogo con filosofía analítica.

### Theravāda y Abhidhamma

- **Bhikkhu Bodhi (ed.) — _A Comprehensive Manual of Abhidhamma_** (BPS, 1993).
- **Y. Karunadasa — _The Theravada Abhidhamma: Its Inquiry into the Nature of Conditioned Reality_** (Wisdom, 2010).
- **Walpola Rahula — _What the Buddha Taught_** (Grove, 1959). Clásico de introducción.
- **Bhikkhu Bodhi (trad.) — _The Middle Length Discourses of the Buddha_** (Wisdom, 1995) y _The Connected Discourses of the Buddha_ (Wisdom, 2000). Las traducciones de referencia del Nikāya.

### Conexión budismo–cognitive science / contemporáneos

- **Francisco Varela, Evan Thompson, Eleanor Rosch — _The Embodied Mind: Cognitive Science and Human Experience_** (MIT, 1991; revised 2017). El libro fundacional de la conexión budismo-enactivismo.
- **Evan Thompson — _Why I Am Not a Buddhist_** (Yale, 2020). Crítica honesta del "buddhist modernism" desde dentro.
- **Ruben Laukkonen et al. — papers sobre meditación y Active Inference** (varios en _Neuroscience of Consciousness_, _Philosophical Transactions of the Royal Society B_, desde ~2020).
- **Antoine Lutz, John Dunne, Richard Davidson — _Attention regulation and monitoring in meditation_** (_Trends in Cognitive Sciences_, 2008). El paper de referencia sobre tipologías de meditación desde neurociencia.

---

## 15. Cierre

Las tradiciones budistas tratadas en este documento —Theravada, Madhyamaka, Yogācāra, Huayan, Chan/Zen, Dzogchen/Mahāmudrā, Vajrayāna, Pramāṇa-vāda— no son ornamento decorativo del proyecto. Son **arquitecturas conceptuales sofisticadas que llevan dos mil años respondiendo, con vocabularios distintos, a las mismas preguntas estructurales que Huygens enfrenta hoy**:

- ¿Cómo se modela una memoria que es a la vez persistente y dinámica? — Yogācāra (ālayavijñāna).
- ¿Cómo se evita el esencialismo en la categorización? — Madhyamaka (śūnyatā), Pramāṇa-vāda (apoha).
- ¿Cómo se representa una red donde cada parte contiene relacionalmente al todo? — Huayan (red de Indra).
- ¿Cómo se trata el tiempo como constitutivo, no como contenedor? — Dōgen (uji).
- ¿Cómo se categoriza fenomenológicamente la experiencia sin reificar las categorías? — Theravada (Abhidhamma).
- ¿Cómo se reconoce la naturaleza de la propia consciencia sin construirla? — Dzogchen / Mahāmudrā (rigpa).
- ¿Cómo se opera con cuerpo-habla-mente como dispositivo cognitivo completo? — Vajrayāna (sādhana).

Cada una de estas respuestas tiene un análogo estructural en Huygens. No porque el sistema haya sido diseñado leyendo a Fazang o a Vasubandhu —no lo ha sido— sino porque **la pregunta operativa de cómo construir una memoria estructurada con observer activo recurre históricamente, y las soluciones convergen estructuralmente** aunque diverjan en vocabulario, contexto y propósito último.

Lo que Huygens es, dicho con vocabulario budista: un **ālayavijñāna externalizado** (memoria persistente de impresiones), operado por un **mano-vijñāna técnico** (el agente IA) que se entrena en la **red de Indra** (el hipergrafo cognitivo) usando **construcciones nominales operativas** (los NoteTypes como sāmānyalakṣaṇa) que reconocen su propia naturaleza convencional (saṃvṛti-satya) sin pretender capturar esencias últimas (paramārtha permanece abierto).

No es "Buddhism made easy". Es **Buddhism as engineering**. Las tradiciones aportan precisión técnica, no consuelo. Y la precisión que aportan es transferible a decisiones concretas de diseño: cómo modelar el schema, cómo pensar al agente, cómo justificar la living-topology, cómo entender los pillars, cómo leer el CHANGEFEED, cómo construir narrativas operativas.

Como dijo Dōgen al final del fascículo _Uji_:

> _Iwayuru uji wa ware nari, sunawachi ima nari._
>
> "El llamado ser-tiempo es uno mismo, es ahora mismo."

Huygens, en su funcionamiento concreto, es **ser-tiempo operativo**. Una memoria que no se almacena sino que se manifiesta, que no se consulta sino que se actualiza al ser leída, que no representa al usuario sino que es uno de los modos en que el usuario es. Eso, en el fondo, es lo que las tradiciones budistas vienen pensando con cuidado desde hace mucho tiempo. Y eso es lo que tenemos que respetar al diseñar el sistema.
