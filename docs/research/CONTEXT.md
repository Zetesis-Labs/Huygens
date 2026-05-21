# CONTEXT — referencia compartida para todos los documentos de research

> Este fichero existe para que cualquier agente o lector entienda el proyecto sin tener que leer toda la conversación de diseño. Es el "qué es esto" condensado.

## Proyecto: Huygens

Huygens es un **MCP (Model Context Protocol) server** que sirve como **memoria estructurada** para un agente de IA personal. Su usuario único es **Rubén**, ingeniero senior. Vive en `/Users/ruben/Developer/Huygens/`.

### Función

El agente captura conversaciones libres como evidencia inmutable (`raw_capture`), sintetiza informes narrativos a partir de esos raws usando informes previos cercanos como contexto, y un worker pequeño traduce cada informe nuevo a mutaciones del grafo de tasks/projects/objetivos/ideas/references. **El informe es el artefacto central**; el worker es plomería. Modelo canónico en [`docs/MODEL.md`](../MODEL.md).

Las entradas son siempre Markdown. El sistema NO es un second-brain de conocimiento general — es una memoria operativa + estratégica del propio Rubén.

### Conceptos del dominio

- **NoteType**: taxonomía de tipos. Los 10 tipos coexisten desde día uno (`task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`, `objetivo`, `idea`). Solo `report` es estructuralmente especial — es el único que dispara la fase de topologización.

- **Topología primaria**: principio rector. Lo importante son las RELACIONES, no los nodos individuales. La memoria es un grafo dirigido con edges tipados, no una pila de documentos con campos de referencia.

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

1. **Captura = `raw_capture` inmutable**, no una `note`. La nota nace solo cuando un informe la materializa, o cuando el worker crea/actualiza nodos topologizando un informe.
2. **Reports = Notes con `type=report`**, no modelo separado. Es el corazón del sistema.
3. **Rutinas fuera del schema v1**, solo el tipo seedeado para clasificar
4. **Embeddings: BGE-M3 vía DeepInfra**. 1024 dims, 8192 ctx
5. **BBDD: SurrealDB** (pivote desde MongoDB tras reconocer que esto es topología, no documentos)
6. **Edges schemafull con FROM/TO**: las relaciones autorizadas las enforza el motor, no validación en código
7. **Arquitectura MCP**: tres capas. Agente (prompt) + surrealmcp (oficial, CRUD genérico) + Huygens MCP (custom, sólo infraestructura: embed, chunk, vector_search, generate_report, get_report)
8. **Worker = topologizador**, no clarificador. Lee informes sin topologizar, traduce la narrativa a mutaciones del grafo, emite `affects` edges. No toca raws directamente, no genera informes.

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
