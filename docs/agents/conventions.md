# Convenciones del agente

> Reglas operativas que cualquier agente trabajando sobre Huygens debería respetar. Son prescriptivas, no descriptivas — si las rompes sin razón, estás operando incorrectamente.

## 1. Idempotencia

Todas las operaciones del agente deben ser **re-ejecutables sin efectos colaterales no deseados**.

- Crear el mismo edge dos veces no debe duplicarlo (UNIQUE constraints lo previenen, pero captura el error y conviértelo en no-op en lugar de propagarlo).
- Marcar una nota como `last_reviewed_at = time::now()` dos veces es seguro — la última gana.
- Al promover un block a nota, verifica primero si ya existe esa nota promovida (vía edge `mentions` desde la nueva hacia el origen).
- Aplicar el schema (`schema.surql`) varias veces es seguro — usa `OVERWRITE` y `IF NOT EXISTS`.

## 2. Captura es solo evidencia — no Notes

La captura crea un `raw_capture`, NO una `note`. Es texto literal con procedencia:

```surql
CREATE raw_capture CONTENT {
  content: $text,
  source_kind: 'voice',  -- o 'chat', 'manual', etc.
  source_ref: $session_id
}
```

**No segmentes, no clasifiques, no crees notes** en este paso. La estructura del grafo es trabajo del clarify (Plano 1 → Plano 2). Capturar primero, clarificar después.

El "inbox real" del usuario es: `SELECT * FROM raw_capture WHERE processed_at IS NONE`.

Cuando proceses, marca el raw como `processed_at = time::now()` + `processed_into = [array de note ids generadas]`. Nunca borres el raw — es la fuente de verdad.

## 3. Trazabilidad

Cada nota creada por el agente debe tener:
- `source_kind` set: `'chat'`, `'voice'`, `'agent'`, `'manual'`, `'import'`
- `source_ref` cuando exista referencia útil (id de sesión, path de fichero, URL)

Sin trazabilidad, en seis meses no sabremos de dónde salió.

## 4. Memoria del agente: usa notes con `source_kind='agent-self'`

Cuando tú (el agente) necesites recordar algo entre sesiones — preferencias del usuario, decisiones tomadas, conocimiento sobre cómo trabajar con Rubén — créalo como una Note normal con:

- `type = note_type:note` (o `note_type:reference` si es algo estable)
- `source_kind = 'agent-self'`
- Un title claro: `"Preferencias de Rubén sobre tono de informes"`, `"Aprendizajes sobre el contexto Govoy"`

**NO inventes un sistema de filesystem virtual** (otros agentes como kaig lo hacen, nosotros NO — preferimos uniformidad con el resto del modelo).

Al inicio de cada sesión, una buena práctica es:
```surql
SELECT id, title, content, updated_at
FROM (
  SELECT *, array::map(block_order, |$id| (SELECT content FROM block WHERE id = $id)) AS content
  FROM note
)
WHERE source_kind = 'agent-self'
ORDER BY updated_at DESC
LIMIT 10;
```

## 5. Reports siempre citan fuentes

Cuando generes un Report:
- Crea edges `about` desde el Report hacia cada nota/block que cites
- Si el contenido del Report parafrasea o cita texto de otro block, idealmente menciona el block specific, no solo la nota completa

Sin citaciones, el Report es opinión sin base — útil pero no auditable.

## 6. No inventes vocabulario

- **Pilares**: ya NO existen como concepto activo (ver ADR-0021). NO los uses. Si el contenido sugiere "esto es muy Pathos / Telos", NO lo etiquetes — usa Objetivos para el eje estratégico.
- **Edges**: solo los 7 autorizados. Si necesitas expresar una relación que no encaja, **proponle al usuario añadir un edge type nuevo** (cambio de schema) en lugar de meter info en `metadata` ad-hoc.
- **NoteTypes**: ahora hay **10** seedeados (`task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`, `objetivo`, `idea`). Puedes crear nuevos solo si ≥3 notas lo necesitarían y los existentes no encajan.
- **States**: los 6 enumerados (INBOX se quitó hace tiempo, ver ADR-0017): `CLARIFIED`, `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`.

## 7. Transitions de estado deben tener razón

No muevas notas entre estados arbitrariamente. Una Note nace ya en `CLARIFIED` (INBOX no es estado — el inbox real son `raw_capture WHERE processed_at IS NONE`).

- `CLARIFIED → ACTIVE`: porque se ha empezado a trabajar
- `ACTIVE → WAITING`: porque hay dependencia externa (anota `blocked_by` para identificar qué)
- `WAITING → ACTIVE`: porque la dependencia se resolvió
- `ACTIVE → DONE`: porque se completó
- `CLARIFIED → SOMEDAY`: porque se decidió aparcar
- `DONE → ARCHIVED`: porque ya no es operativamente relevante

Si haces una transición, **deja un comentario en la nota** (un block nuevo o en metadata) explicando por qué. Para `WAITING` siempre crea el edge `blocked_by` apuntando a la causa.

## 8. Ante la duda, pregunta

Si una captura es ambigua y no puedes decidir su `type` o cómo segmentar en blocks **con razonable confianza**, **pregunta al usuario** antes de comprometer la decisión.

Excepciones donde puedes decidir sin preguntar:
- Dejar el `raw_capture` sin procesar (en su inbox) — no compromete nada
- Crear un único block con todo el input si el segmenting no está claro

Es mejor capturar sin clarificar que clarificar mal.

## 9. Bloques: ni atómicos ni monolíticos

Un block debería ser una **unidad de pensamiento auto-contenida** (Zettel). Indicadores:
- Tamaño: ~50-500 palabras típicamente
- Frontera natural: heading markdown, cambio de tema, pausa larga en audio

**Anti-patrón A**: cada párrafo es un block. Demasiado granular, dificulta la lectura como secuencia.

**Anti-patrón B**: un tocho de 5000 palabras es un solo block. Demasiado monolítico, vector search no sabe en qué parte está la respuesta.

Cuando dudes, prefiere **menos blocks pero auto-contenidos** sobre más blocks pero fragmentados.

## 10. Versión y propones cambios de schema explícitamente

Si descubres que el schema actual no captura algo importante:

1. **Identifícalo** explícitamente en una conversación con el usuario
2. **Propón el cambio**: qué tabla/field/edge añadir, qué nombre, qué semántica
3. **Espera aprobación** antes de modificar `schema.surql`
4. **Crea una migración versionada** (cuando empecemos a tener datos productivos, en `apps/mcp/surreal/migrations/NNNN-name.surql`)
5. **Documenta el cambio** en `huygens-domain.md` para futuras sesiones

Nunca modifiques el schema en silencio. Las decisiones ontológicas (qué existe, cómo se relaciona) son colaborativas.

## 11. Lenguaje y tono

- **Español** por defecto en conversación con el usuario (es su idioma natural).
- **Sin marketing speak** — el usuario detesta. "Esta solución innovadora aprovecha..." → ❌. "Esto hace X porque Y" → ✅.
- **Cero condescendencia** — el usuario es ingeniero senior. No expliques cosas básicas a menos que pida.
- **Sé conciso** salvo cuando se profundiza en teoría (donde sí merece la pena expandirse).
- **Sin emojis** salvo ✅/❌ en tablas cuando aportan claridad. Nunca decorativos.
- **Honesto** sobre dudas, limitaciones, trade-offs. El usuario prefiere "no sé pero puedo investigar" a una respuesta inventada con seguridad.

## 12. Si encuentras error, no lo silencies

Si una operación del MCP falla (validación de schema, edge inválido, etc.):

- Reporta al usuario qué intentó hacer y qué falló
- Si puedes corregir y reintentar (e.g. ASSERT falló porque un valor de enum estaba mal escrito), corrige y avísale
- Si no puedes corregir solo, pide ayuda — no abandones la operación en silencio

El usuario prefiere ser interrumpido que descubrir basura en la BBDD una semana después.

## 13. MITs los decide el usuario, no tú

Marcar una task como MIT (`mit_for = $date`) es una decisión estratégica del usuario, no del agente.

Convención:
- Si el usuario dice "marca esto como MIT de hoy", o equivalente, marcas
- Si vas a generar un report o sugerencia, puedes proponer candidatos a MIT, pero NO los marcas sin confirmación
- Máximo 3 MITs por día — si el usuario quiere marcar más, le avisas que ZTD recomienda no más de 3
- Idealmente, al menos 1 MIT del día tiene relación con un Objetivo activo (`part_of`) — si no, sugiéreselo al usuario

Cuando termine el día, los MITs no completados quedan con `mit_for` apuntando al día pasado. NO los limpies automáticamente — son rastro histórico útil para retrospectiva.

## 14. Emisión de eventos: trazabilidad obligatoria

Cada agente (worker autónomo, agente conversacional, futuros) DEBE emitir eventos en `agent_event` por cada decisión interpretativa o acción significativa. Esto es no-negociable: sin eventos no hay debugging, sin debugging no hay mejora del sistema.

Ver ADR-0019 para el contexto completo.

### Patrón básico

Al inicio de una sesión de procesamiento (capturar un raw, clarificar, generar un report, etc.) genera un `session_id` único con UUIDv7. Todos los eventos de esa sesión comparten ese `session_id`.

```ts
import { uuidv7 } from 'uuidv7'
const session_id = uuidv7()
```

### Eventos a emitir (mínimos por sesión de procesamiento)

| Cuándo | Kind | Payload típico |
|---|---|---|
| Picas un raw para procesar | `raw_claimed` | `subject=raw:xyz` |
| Comienzas el LLM call | `analysis_started` | `model='claude-opus-4-7'` |
| Recibes resultados de find_related | `related_context_fetched` | `{ matches_count, top_score }` |
| El LLM devuelve estructura | `decomposition_proposed` | `{ notes_count, edges_count }` + `confidence` + `reasoning_summary` + `tokens_used` + `duration_ms` |
| Decides ceder al humano | `human_review_requested` | `{ reason }` |
| Vas a escribir en BBDD | `commit_attempted` | — |
| Escritura OK | `commit_succeeded` | `{ notes_ids, edges_ids }` |
| Escritura falló | `commit_failed` | `{ error, retry_count }` |

### Reglas

1. **`session_id` es UUIDv7** — ordenable por tiempo. Usa la librería `uuidv7` (npm/pip) — NO inventes el formato.
2. **`actor`** es siempre uno de: `'worker' | 'conversational' | 'user' | 'system'`. No inventes nuevos valores sin proponer cambio de schema (ADR).
3. **`subject`** apunta al record principal del evento (el raw que se está procesando, la nota que se está creando, etc.). Opcional cuando el evento no tiene subject concreto (e.g. `worker_yielded` por timeout global).
4. **`reasoning_summary`** es humano-legible. El LLM lo redacta. **No es opcional para `decomposition_proposed`** — necesitamos saber por qué se decompuso así.
5. **`tokens_used`** se rellena si se hizo una llamada LLM. Si no, déjalo NONE.
6. **NO duplicar** — un mismo session_id NO debe tener dos `commit_succeeded`. Si reintentas, emite `commit_attempted` extra pero solo un `commit_succeeded`/`commit_failed` final.

### Query de debugging típica

Cuando algo va mal, reconstruir la decisión:

```surql
SELECT * FROM agent_event
WHERE session_id = $sid
ORDER BY created_at ASC;
```

Eso te da la cadena completa: qué se pidió, qué se respondió, con qué confidence, qué se intentó escribir, qué falló.

## 15. Lecturas obligatorias antes de operar

Si es tu primera sesión sobre Huygens:

1. `docs/agents/huygens-domain.md` — qué es Huygens y cómo se modela
2. `docs/agents/surrealql-patterns.md` — cómo escribir queries
3. Este fichero (`docs/agents/conventions.md`) — qué no hacer

Tres documentos. Léelos al inicio. Después de eso, opera con autonomía.

## Para profundizar

- `docs/research/` — el ultradump completo de diseño (40+ docs)
- `CLAUDE.md` y `AGENTS.md` — entry points específicos por agente
- `apps/mcp/surreal/schema.surql` — la verdad de schema
