# CONTEXT — referencia compartida para todos los documentos de research

> Este fichero existe para que cualquier agente o lector entienda el proyecto sin tener que leer toda la conversación de diseño. Es el "qué es esto" condensado.

## Proyecto: Huygens

Huygens es un **MCP (Model Context Protocol) server** que sirve como **memoria estructurada** para un agente de IA personal. Su usuario único es **Rubén**, ingeniero senior. Vive en `/Users/ruben/Developer/Huygens/`.

### Función

El agente captura inputs del usuario — chat texto corto, notas de voz transcritas, "tochos" largos — los procesa GTD-style contra la BBDD, genera informes narrativos, y permite búsqueda vectorial + filtrado por actividad temporal.

Las entradas son siempre Markdown. El sistema NO es un second-brain de conocimiento general — es una memoria operativa + estratégica del propio Rubén, GTD-inspirada pero personalizada.

### Conceptos del dominio

- **Pilares estratégicos**: cuatro dimensiones ortogonales filosóficamente cargadas (conceptos griegos) que clasifican cada nota:
  - **Pathos & Soma**: salud mental/física, fisioterapia, nutrición, emociones, meditación
  - **Éthos**: hábito, productividad, GTD, disciplina, rutinas
  - **Telos**: propósito, metas, visión, OKRs, libertad financiera
  - **Sophia**: conocimiento, filosofía, teoría de categorías, programación funcional
  - Una nota puede tocar **varios** pilares (son ejes, no categorías excluyentes)

- **NoteType**: árbol editable de tipos. Una Note tiene **cero o un** Type (opcional — la captura entra sin tipo). Seeds iniciales: `task, project, area, routine, note, report, person, reference`

- **NoteState**: ciclo GTD: `INBOX → CLARIFIED → ACTIVE → WAITING → SOMEDAY → DONE → ARCHIVED`

- **Topología primaria**: principio rector. Lo importante son las RELACIONES, no los nodos individuales. La memoria es un grafo dirigido con edges tipados, no una pila de documentos con campos de referencia

### Stack actual

Commit inicial: `707fadb`. En proceso de pivote (Mongo → Surreal).

| Capa | Tecnología | Estado |
|---|---|---|
| Runtime + pkg manager | Bun 1.x | Estable |
| Lenguaje | TypeScript estricto, ESM | Estable |
| Lint/format | Biome (config mirroring ZetesisPortal) | Estable |
| Devcontainer | Docker Compose (app + DB) | Estable |
| BBDD | ~~MongoDB Atlas Local + Prisma~~ → **SurrealDB** | **Pivote en curso** |
| MCP transport | Streamable HTTP en `:3030` | Estable |
| Embeddings | BGE-M3 (1024 dims) vía DeepInfra | Plan |
| MCP architecture | Tres capas: agente + surrealmcp oficial + Huygens MCP pequeño | Plan |

### Perfil del usuario (aplica a TODA la documentación)

- Autodescripción: "creativo + caótico", fuerte en estrategia/largo plazo, débil en operativa diaria
- Lee: programación funcional + teoría de categorías (Milewski, Coecke), Austrian economics + filosofía contracorriente (Bastos, Escohotado, Huerta de Soto)
- Patrón: **frontier-seeking**. Prefiere lo nuevo bien diseñado a lo viejo bien rodado. No es conservador
- Primera vez con BBDDs de grafo — necesita aprendizaje fluido pero no quiere "fácil-y-tonto"
- Devcontainer-first development
- Idioma: español. Prosa técnica pero accesible. Cero emojis salvo que se pidan
- Valora documentación que pueda releer en futuro y profundizar — "para el Rubén curioso del futuro"

### Decisiones cerradas

1. **Pilares múltiples por nota** (orthogonal axes)
2. **Captura = nota sin tipo + state=INBOX**. "Inbox" NO es un tipo, es un estado
3. **Reports = Notes con type=report**, no modelo separado
4. **Rutinas fuera del schema v1**, solo el tipo seedeado para clasificar
5. **Embeddings: BGE-M3 vía DeepInfra**. 1024 dims, 8192 ctx
6. **BBDD: SurrealDB** (pivote desde MongoDB tras reconocer que esto es topología, no documentos)
7. **Edges schemafull con FROM/TO**: las relaciones autorizadas las enforza el motor, no validación en código
8. **Arquitectura MCP**: tres capas. Agente (prompt) + surrealmcp (oficial, CRUD genérico) + Huygens MCP (custom, ~200 líneas TS, sólo infraestructura: embed, chunk, vector_search, generate_report)

### Estructura del repo

```
Huygens/
├── .devcontainer/
├── apps/mcp/
│   ├── prisma/  ← se eliminará tras pivote
│   ├── src/
│   ├── scripts/
│   └── ...
├── docs/research/  ← AQUÍ vive toda esta documentación
├── CLAUDE.md
├── README.md
└── ...
```

### Estilo de la documentación

- **Spanish** salvo en bloques de código o términos técnicos consagrados
- **No emojis** salvo en tablas de resultados (✅ / ❌ aceptables si aportan claridad)
- **Tablas markdown** para comparativas
- **Code blocks** para syntax
- **Cross-references** entre archivos usando rutas relativas
- **Para profundizar**: en secciones teóricas, incluir lista de papers/libros/links para investigación posterior
- **Longitud variable**: 800-3000 palabras por fichero según densidad. Teoría: tirar hacia largo. Engineering: tirar hacia conciso

### Tono

Como una conversación técnica entre dos personas que se respetan. Sin condescendencia, sin _marketing speak_, sin "veamos cómo este maravilloso framework...". Cuando algo es trade-off, decirlo. Cuando algo está roto o es inmaduro, decirlo. Cuando algo es realmente brillante, decirlo sin azucarar.
