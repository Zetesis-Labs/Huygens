# Architecture review — 2026-05-21

> Revisión en profundidad de la arquitectura tras una evaluación end-to-end del MCP (las 13 tools ejercitadas + lectura del worker Python + ADRs 0014–0023). Lo que sigue es el inventario de hallazgos. No es backlog operativo.

**Material auditado**: `apps/mcp/src/` completo, `backend/huygens-worker/huygens_worker/`, `apps/mcp/surreal/schema.surql`, ADRs 0014/0017/0018/0019/0020/0021/0022/0023, `docs/research/02-architecture/*`.

**Resumen ejecutivo**: arquitectura conceptualmente fuerte (modelo en dos planos, edges schemafull, `agent_event` para trazabilidad), pero operacionalmente frágil. Tres clases de bug latente: atomicidad mentirosa, gestión de conexión ingenua, y contrato entre las tres capas que es solo HTTP+JSON sin enforcement. Para uso personal hoy, sirve. A 6 meses vista sin mantenimiento, no.

---

## Críticas críticas

Rompen invariantes que el propio sistema promete (atomicidad, trazabilidad, robustez).

### ARCH-001 · `commit_clarify` no es atómico, pero su nombre y su tagline lo prometen

**Estado**: open · **Severidad**: alta

`apps/mcp/src/tools/commit-clarify.ts:201-212` es un loop de queries secuenciales sin transacción:

```ts
for (const proposal of input.decomposition.notes) {
  const noteId   = await createNoteRecord(db, proposal)                 // RT 1
  const blockIds = await createBlocksForNote(db, noteId, proposal)      // RT 2+3
  await linkDerivedFrom(db, noteId, input.raw_id, proposal.transformation)  // RT 4
  ...
}
edgesCreated += await createInternalRefs(...)   // N round-trips
edgesCreated += await createExternalRefs(...)   // M round-trips
await markRawProcessed(db, input.raw_id)        // RT final
```

Si el proceso muere o SurrealDB se cae a mitad del loop, te quedas con un raw **no procesado** + notes/blocks parciales + edges colgando. `assertRawNotProcessed` protege contra re-ejecuciones intencionadas; **no** protege contra crashes parciales.

SurrealQL soporta `BEGIN TRANSACTION; … COMMIT TRANSACTION;`. No se usa. El tool description literal dice *"Atomically commit a clarify decomposition"* — la implementación no lo cumple.

**Remedio**: envolver el cuerpo de `commitClarifyImpl` en `BEGIN/COMMIT`, o componerlo como un único SurrealQL multi-statement con `LET $note = (CREATE …)`. Misma semántica, una round-trip atómica, sin estados intermedios visibles.

---

### ARCH-002 · Singleton SurrealDB sin reconexión

**Estado**: open · **Severidad**: alta

`apps/mcp/src/surreal.ts:3-23`:

```ts
let cached: Surreal | null = null
export async function getDb(): Promise<Surreal> {
  if (cached) return cached       // ← nunca se valida si sigue viva
  ...
}
```

Si SurrealDB se reinicia, o el WebSocket se cae (network blip, idle timeout, restart del compose), `cached` apunta a un cliente muerto y **todas las llamadas posteriores fallan** hasta que reinicies el MCP. No hay reconexión, no hay healthcheck, no hay heartbeat.

Para un proceso que pretende correr días/semanas, esto se rompe seguro.

**Remedio**: hook on-disconnect del SDK que invalide `cached`; o wrapper que detecte error de conexión y reintente con cliente fresco una vez antes de propagar. ~10 líneas.

---

### ARCH-003 · `emitEvent` silencia errores → puede vaciarte la trazabilidad cuando más la necesitas

**Estado**: open · **Severidad**: media-alta

`apps/mcp/src/events.ts:25-44`:

```ts
try {
  ...CREATE agent_event...
} catch (err) {
  console.error('[agent_event] emit failed:', err)
}
```

La razón es loable ("agent_event no debe romper la operación padre"). Pero combinado con [[ARCH-002]] (driver muerto), existen escenarios donde:

- El commit a `note`/`block` falla porque la BBDD está caída
- El `emit('commit_failed')` también falla en silencio
- Te quedas SIN evento y SIN nota — sin rastro

El ADR-0019 dice literalmente *"sin eventos no hay debugging, sin debugging no hay mejora del sistema. Esto es no-negociable"*. La implementación lo negocia.

**Remedio**: cuando `emitEvent` falla, escribir el evento a un fichero append-only local (`agent_event_pending.jsonl`) como dead-letter. Re-enviar en el próximo boot del MCP.

---

### ARCH-004 · El MCP no valida su pre-condición al arrancar

**Estado**: open · **Severidad**: media-alta · **Manifestado**: 2026-05-20 durante eval

`apps/mcp/src/index.ts` no hace `INFO FOR DB` ni comprueba que las 11 tablas críticas existan al boot.

Cuando el schema no está aplicado, el server arranca sin chistar. Las primeras tools (`capture`, `list_inbox`) funcionan porque las tablas se crean implícitamente como SCHEMALESS. Las siguientes (`get_raw`, `find_related`, `commit_clarify`) fallan con `"the table X does not exist"` — error opaco en runtime.

**Manifestación real**: durante la eval del 2026-05-20 esto bloqueó el flujo end-to-end. Lo descubrimos haciendo `INFO FOR DB` a mano. Diagnóstico tardó más que el fix.

**Remedio**: al boot del MCP, listar tablas esperadas vs `INFO FOR DB`. Si falta algo:

- En dev: `console.error` claro con `bun run db:apply` como instrucción
- En "prod": abortar con `exit 1`

~15 líneas en `index.ts`.

---

### ARCH-005 · Worker no claima el raw atómicamente — race condition latente

**Estado**: open · **Severidad**: media (alta solo si escalas a >1 worker)

`backend/huygens-worker/huygens_worker/inbox_watcher.py:48-52` claima usando un `set` Python intra-proceso (`in_flight`). Funciona con un único worker.

Con dos workers en paralelo (escalado horizontal futuro, o desarrollo en paralelo con el agente conversacional), ambos verán el mismo raw en su SELECT, ambos llamarán `commit_clarify`, el segundo fallará con `RawAlreadyProcessedError`. No pierdes data — pero **gastas tokens LLM por nada** y ensucias `agent_event` con `commit_failed` falsos.

**Remedio canónico**: claim atómico vía SurrealQL en lugar de un SET en memoria.

```sql
UPDATE raw_capture
SET   claimed_by = $worker_id, claimed_at = time::now()
WHERE id = $id AND claimed_by IS NONE
RETURN AFTER;
```

Si devuelve un row, procesas. Si no, otro lo cogió. Requiere añadir `claimed_by`, `claimed_at` y opcionalmente `claim_expires_at` al schema de `raw_capture` (schema change menor + cleanup periódico de claims expirados para tolerar workers caídos).

---

## Críticas serias

Deuda visible. No te rompen hoy pero se manifestará si el proyecto crece o cambia.

### ARCH-006 · `note.block_order` puede desincronizarse de los blocks reales

**Estado**: open · **Severidad**: media

`apps/mcp/surreal/schema.surql:75` declara `block_order: array<record<block>>` pero el motor no garantiza que ese array refleje exactamente los blocks cuyo `block.note` apunta a la nota.

Si insertas un block sin actualizar `block_order` → invisible al render. Si borras un block sin sacarlo del array → referencia colgante.

`commit-clarify.ts:118-126` lo gestiona correctamente, pero solo porque esa tool lo recuerda. No hay invariante en el motor. Una tool nueva escrita mañana puede romperlo y nadie lo detectará.

**Remedio**: `DEFINE EVENT` sobre `block` que regenere `block_order` automáticamente al insertar/borrar; o test que verifique consistencia y corra en CI.

---

### ARCH-007 · Worker hace polling 2s en vez de LIVE query (ADR-0018 traicionado)

**Estado**: open · **Severidad**: media · **Origen**: ADR-0018

ADR-0018 promete LIVE query. Implementación es `SELECT WHERE processed_at IS NONE` cada 2 segundos (`inbox_watcher.py:175-184`). Razón probable: SDK Python 2.x no maneja bien LIVE.

Consecuencias:

- Latencia mínima ~2s para procesar un raw nuevo
- 1800 SELECTs/hora aunque no haya nada que hacer
- El ORDER BY ASC sin LIMIT (verificar) devuelve todo el backlog en cada tick

**Remedio**: o (a) actualizar SDK Python a 3.x y probar LIVE de nuevo, o (b) **actualizar ADR-0018** reconociendo que es polling, documentar el LIMIT y el sizing del intervalo. La opción más honesta hoy es (b); migrar a LIVE cuando el SDK lo soporte bien.

---

### ARCH-008 · Sin migraciones — `OVERWRITE` puede invalidar data en silencio

**Estado**: open · **Severidad**: media

Toda `schema.surql` usa `DEFINE TABLE OVERWRITE` y `DEFINE FIELD OVERWRITE`. Idempotente, sí. Pero si cambias `embedding TYPE F32` → `TYPE I8` y reaplico, SurrealDB acepta el cambio y los embeddings existentes pueden quedar en estado inconsistente.

No existe la carpeta `apps/mcp/surreal/migrations/` aunque `docs/agents/conventions.md` la menciona.

Para corpus personal hoy, OK. Cuando los embeddings cuesten tokens reales o cambies a quantización (ver nota [[EVAL] Quantizar HNSW index a I8]), NO ok sin guardia.

**Remedio**: crear `apps/mcp/surreal/migrations/0001-baseline.surql` ya, aunque solo sea para establecer el patrón. Cuando hagas el primer cambio destructivo, sabrás dónde meterlo.

---

### ARCH-009 · `generate_report` hardcodea gpt-4o-mini, sin streaming, sin protección de contexto

**Estado**: open · **Severidad**: media

`apps/mcp/src/tools/generate-report.ts` defaultea a `gpt-4o-mini`. Sin streaming. Sin guardia de tamaño del corpus de entrada.

- Calidad de la narrativa personal depende del modelo más cheap
- Si pides report sobre 200 notas, contexto puede explotar
- Sin streaming, esperas el final completo

**Remedio**:

1. Subir el default a un modelo decente (Sonnet 4.6: 3$/Mtok input). Vale 5 céntimos más por report, no es problema.
2. Truncar o resumir corpus si supera N notas o M tokens.
3. Devolver el report streaming (MCP SDK lo soporta).

---

### ARCH-010 · Tres capas hablan HTTP+JSON sin contrato compartido

**Estado**: open · **Severidad**: media-baja (alta si añades más consumidores)

TS MCP, surrealmcp oficial, Python worker. Cuando un schema de tool cambia, el worker se rompe en runtime sin que nada lo avise. Los tests del worker (`test_clarify_schema.py`) validan **su propio** entendimiento del contrato Pydantic, no contra el MCP real. Drift inevitable.

**Remedio caro**: generar OpenAPI/JSON Schema desde el TS, derivar cliente Python con `datamodel-code-generator`. Reduce divergencia a cero.

**Remedio barato**: test E2E (en CI o en pre-push del worker) que arranque MCP + worker juntos y verifique que el worker procesa un raw real. No elimina el drift pero lo detecta antes del incidente.

---

## Hallazgos menores

### ARCH-011 · `agent_event` retention ilimitado sin curación

**Estado**: open · **Severidad**: baja

Tabla con 717 rows hoy (`SELECT count() AS n FROM agent_event GROUP ALL`), de los cuales ~700 son legacy de tests o runs antiguos previos a la eval del 2026-05-20.

A 6 meses con uso real, fácilmente 100k+ rows. Sin índice por `created_at` (verificar — probablemente solo por `session_id`), queries "últimos eventos" serán full scan.

**Remedio**: decidir entre purga periódica (drop `agent_event` de >90d en kind ruidosos como `analysis_started`), partitioning por mes, o filtrado por actor. Lo más simple: índice por `(actor, created_at)` ya, decidir purga cuando duela.

---

### ARCH-012 · Sin retry / backoff hacia DeepInfra ni OpenAI

**Estado**: open · **Severidad**: baja

`apps/mcp/src/embeddings.ts:39-42`: en `!res.ok`, throws inmediatamente. Sin retry, sin backoff exponencial. Si DeepInfra te 429, la tool falla y queda en el caller. Idem `generate-report` con OpenAI.

Para uso personal interactivo (1 captura cada minuto), no se manifiesta. Para el worker procesando un backlog grande, sí.

**Remedio**: wrapper de retry exponencial con jitter (3 intentos máx, 1s/2s/4s). Trivial con `p-retry` o similar; ~20 líneas a mano.

---

### ARCH-013 · `commit_attempted` se emite antes de validar el raw

**Estado**: open · **Severidad**: muy baja (ruido cosmético)

`commit-clarify.ts:183-192` emite `commit_attempted` antes de `assertRawNotProcessed`. Re-clarificar un raw ya procesado genera un `commit_attempted` + `commit_failed` espurio.

**Trade-off real**: emitir antes de validar refleja que SE INTENTÓ desde el punto de vista de auditoría — es decisión consciente, no necesariamente bug. Si se cambia, documentar por qué.

---

## Trade-offs reconocidos (no son críticas, son límites conscientes)

| Decisión | Trade-off |
|---|---|
| Sin auth en MCP (root/root, sin TLS) | OK para devcontainer personal; no deployable a nada compartido |
| `note` sin `content`, contenido en `block_order` | Elegante para Zettelkasten; pagas concatenar+ordenar para render |
| CHANGEFEED 10y en 11 tablas | Storage no trivial; OK para 100k rows, problema a 10M |
| `mentions`/`supports`/`refutes` semánticamente solapados | Drift entre sesiones inevitable; no basar queries fuertes en distinguirlos |
| 13 tools en MCP en vez de delegar reads a surrealmcp | Más superficie a mantener; gana legibilidad de prompts y contrato estable |

---

## Lo que la auditoría NO criticaría

Para que no se pierda el contexto positivo entre tanto issue:

- **SurrealDB como BBDD única**. Multi-modelo (grafo + documento + vector + changefeed) en un solo proceso ahorra 3 servicios y sus consistencias cruzadas. Para esta escala, correcto.
- **Separación raw_capture ↔ note + edge `derived_from`** (ADR-0017). Pieza más elegante del diseño.
- **`agent_event` estructurado con `reasoning_summary`**. Cuando algún día tengas que debuggear una decisión rara del worker a las 3am, lo agradecerás.
- **Tests del MCP con namespace per-test** (`apps/mcp/test/_fixtures.ts`). Aislamiento real, no mocks. La forma correcta de testear sobre BBDD.
- **Edges schemafull con FROM/TO + UNIQUE(in, out)**. Te ahorra una clase entera de bugs (verificado contra doble-RELATE y doble-clarify en la eval).

---

## Plan de remedio priorizado

Si solo se tocan tres cosas esta semana, en este orden:

1. **[[ARCH-001]]** atomicidad real en `commit_clarify` — una tarde, elimina clase entera de bugs.
2. **[[ARCH-002]]** reconexión/healthcheck del singleton SurrealDB — 10 líneas, gana robustez en sesiones largas.
3. **[[ARCH-004]]** validación de schema al boot del MCP — 15 líneas, cierra la herida del 2026-05-20.

Después, en este orden:

4. **[[ARCH-005]]** claim atómico del worker — bloqueante para escalar a 2 workers; no urgente con 1.
5. **[[ARCH-009]]** subir default model en `generate_report`.
6. **[[ARCH-008]]** carpeta `migrations/` + primer baseline.
7. **[[ARCH-003]]** dead-letter para `emitEvent`.

El resto (ARCH-006, 007, 010, 011, 012, 013) son cosas a vigilar; promover a "in-progress" cuando se manifiesten o cuando alguien tenga tiempo.

---

## Cómo cerrar un issue

Cuando se resuelva, editar el bloque del issue:

- Cambiar `**Estado**: open` → `**Estado**: resolved`
- Añadir línea: `**Resuelto en**: commit `abc1234` / PR #N / ADR-NNNN`
- No borrar el issue. La trazabilidad histórica es el valor.
