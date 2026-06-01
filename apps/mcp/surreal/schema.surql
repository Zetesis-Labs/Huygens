-- Huygens — schema de datos en SurrealDB.
--
-- Modelo en dos planos:
--   1. raw_capture: lo que el usuario dijo literalmente (evidencia inmutable).
--      Es el verdadero "inbox" — sin procesar, sin clasificar, sin segmentar.
--   2. note + block + edges: la interpretación del agente sobre los raw_captures.
--      Es topología procesada — todo lo que aquí vive ya pasó una proposal aprobada.
--
-- La transición entre planos objetivo es deliberada: el agente lee
-- raw_captures con `status = 'pending'`, persiste una proposal draft visible,
-- y solo tras aprobación crea blocks narrativos + mutaciones mínimas del grafo.
-- `processed_at` queda como campo legacy/compatibilidad.
--
-- Una Note es composición ordenada de Blocks (markdown auto-contenido).
-- La topología (edges) puede apuntar a notes o a blocks indistintamente —
-- permite Zettelkasten-trails y referencias granulares sin pasar a un modelo
-- de bloques atómicos tipo Notion.
--
-- Idempotente: usa OVERWRITE para que aplicar varias veces sea seguro.

-- ─────────────────────────────────────────────────────────────────────────
-- raw_capture: lo que el usuario dijo literalmente, sin procesar.
-- El verdadero inbox vive aquí, no en notes.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE raw_capture SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE content      ON raw_capture TYPE string;
DEFINE FIELD OVERWRITE source_kind  ON raw_capture TYPE string
  ASSERT $value INSIDE ['chat', 'voice', 'manual', 'import', 'agent-self'];
DEFINE FIELD OVERWRITE source_ref   ON raw_capture TYPE option<string>;
DEFINE FIELD OVERWRITE created_at   ON raw_capture TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE status       ON raw_capture TYPE string
  DEFAULT 'pending'
  ASSERT $value INSIDE ['pending', 'processed', 'ignored', 'deferred'];
-- processed_at legacy: la fuente de verdad del inbox es `status`.
-- La procedencia (qué notes/blocks salieron de aquí) NO vive en este campo:
-- vive en el edge `derived_from` (ver más abajo).
DEFINE FIELD OVERWRITE processed_at ON raw_capture TYPE option<datetime>;

-- Migración idempotente para raws creados antes de `status`.
UPDATE raw_capture SET status = 'processed' WHERE status IS NONE AND processed_at IS NOT NONE;
UPDATE raw_capture SET status = 'pending' WHERE status IS NONE AND processed_at IS NONE;

-- Cleanup: la versión anterior usaba un array<record<note>> en este campo.
-- Ahora la procedencia es un edge `derived_from`.
REMOVE FIELD IF EXISTS processed_into ON TABLE raw_capture;

-- Índice para "dame el inbox real" en una query: WHERE status = 'pending'
DEFINE INDEX OVERWRITE raw_capture_status      ON raw_capture FIELDS status;
DEFINE INDEX OVERWRITE raw_capture_created     ON raw_capture FIELDS created_at;

-- ─────────────────────────────────────────────────────────────────────────
-- NoteType: árbol editable de tipos
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE note_type SCHEMAFULL;
DEFINE FIELD OVERWRITE slug            ON note_type TYPE string;
DEFINE FIELD OVERWRITE name            ON note_type TYPE string;
DEFINE FIELD OVERWRITE description     ON note_type TYPE option<string>;
DEFINE FIELD OVERWRITE parent          ON note_type TYPE option<record<note_type>>;
DEFINE FIELD OVERWRITE featured_fields ON note_type TYPE option<array<string>> DEFAULT [];
DEFINE FIELD OVERWRITE created_at      ON note_type TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at      ON note_type TYPE datetime VALUE time::now();
DEFINE INDEX OVERWRITE note_type_slug_unique ON note_type FIELDS slug UNIQUE;

-- ─────────────────────────────────────────────────────────────────────────
-- Note: contenedor de blocks + clasificación + estado GTD.
-- Ya NO tiene `content`: el contenido vive en blocks y se renderiza vía block_order.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE note SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE title       ON note TYPE string;
DEFINE FIELD OVERWRITE type        ON note TYPE option<record<note_type>>;
-- Pilares Estratégicos dropeados al adoptar ZTD (ADR-0021). La función estratégica
-- la cubren ahora los Objetivos (ADR-0022). Limpieza del campo legacy.
REMOVE FIELD IF EXISTS pillars ON TABLE note;
-- INBOX ya no es estado de note: una Note existe porque ya fue procesada
-- desde un raw_capture. El "estar pendiente" ahora vive en raw_capture.
DEFINE FIELD OVERWRITE state       ON note TYPE string
  DEFAULT 'CLARIFIED'
  ASSERT $value INSIDE ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'];
DEFINE FIELD OVERWRITE block_order ON note TYPE array<record<block>> DEFAULT [];
DEFINE FIELD OVERWRITE metadata    ON note TYPE option<object> FLEXIBLE;
-- source_kind y source_ref se mantienen para notas que NO vienen de raw_capture
-- (e.g. notas que el agente crea como meta-memoria, reports generados, etc.).
-- Para notas derivadas de un raw_capture, la procedencia se traza vía el edge
-- `derived_from` (ver más abajo), no por estos campos.
DEFINE FIELD OVERWRITE source_kind ON note TYPE option<string>;
DEFINE FIELD OVERWRITE source_ref  ON note TYPE option<string>;
DEFINE FIELD OVERWRITE created_at  ON note TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at  ON note TYPE datetime VALUE time::now();
DEFINE FIELD OVERWRITE last_reviewed_at ON note TYPE option<datetime>;
-- mit_for: si está set, esta task es MIT (Most Important Task) para ese día.
-- Convención ZTD: 1-3 MITs por día, decididos por el usuario (ADR-0023).
DEFINE FIELD OVERWRITE mit_for ON note TYPE option<datetime>;

DEFINE INDEX OVERWRITE note_state    ON note FIELDS state;
DEFINE INDEX OVERWRITE note_type_idx ON note FIELDS type;
DEFINE INDEX OVERWRITE note_updated  ON note FIELDS updated_at;
DEFINE INDEX OVERWRITE note_reviewed ON note FIELDS last_reviewed_at;
DEFINE INDEX OVERWRITE note_mit_for  ON note FIELDS mit_for;

-- ─────────────────────────────────────────────────────────────────────────
-- Block: unidad direccionable y vectorizable. Markdown auto-contenido.
-- En v2.1-lite hay dos usos:
--   - descriptive: pertenece a una note y se renderiza vía note.block_order.
--   - narrative: bloque aprobado desde uno o varios raw_capture; puede no
--     pertenecer a una note, y se conecta al grafo con about/affects.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE block SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE note            ON block TYPE option<record<note>>;
DEFINE FIELD OVERWRITE block_kind      ON block TYPE string
  DEFAULT 'descriptive'
  ASSERT $value INSIDE ['descriptive', 'narrative'];
DEFINE FIELD OVERWRITE content         ON block TYPE string;
-- Pilares Estratégicos dropeados al adoptar ZTD (ADR-0021). Limpieza del campo legacy.
REMOVE FIELD IF EXISTS pillars ON TABLE block;
DEFINE FIELD OVERWRITE embedding       ON block TYPE option<array<float>>;
DEFINE FIELD OVERWRITE embedding_model ON block TYPE option<string>;
DEFINE FIELD OVERWRITE dimensions      ON block TYPE option<int>;
DEFINE FIELD OVERWRITE topologized_at  ON block TYPE option<datetime>;
DEFINE FIELD OVERWRITE created_at      ON block TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at      ON block TYPE datetime VALUE time::now();

DEFINE INDEX OVERWRITE block_note ON block FIELDS note;
DEFINE INDEX OVERWRITE block_kind ON block FIELDS block_kind;
-- Índice vectorial HNSW directamente sobre blocks (1024 dims, BGE-M3, cosine).
-- Parámetros (kaig-inspired): EFC=efConstruction (calidad de construcción),
-- M=conexiones por nodo en capas superiores, M0=conexiones en capa base.
-- TYPE F32 = precisión completa (futuro: I8 para quantizar y ahorrar storage).
DEFINE INDEX OVERWRITE block_embedding ON block
  FIELDS embedding
  HNSW DIMENSION 1024
  DIST COSINE
  TYPE F32
  EFC 150 M 12 M0 24;

-- ─────────────────────────────────────────────────────────────────────────
-- Edges schemafull: relaciones autorizadas.
-- V2.1-lite mantiene solo el vocabulario mínimo.
--
-- Cada edge table tiene un UNIQUE index sobre (in, out) (kaig-inspired) que
-- impide duplicados: solo puede haber un edge de tipo X entre la misma pareja
-- (A, B). Re-ejecutar `RELATE A->X->B` no spawns un segundo edge.
-- ─────────────────────────────────────────────────────────────────────────

-- part_of: jerarquía macro (Area → Project → Task). Solo entre notes.
-- Padre único: el índice UNIQUE sobre `in` impide que una nota tenga más de un
-- padre → part_of es un bosque/árbol jerárquico (sin multi-padre), no un DAG.
DEFINE TABLE OVERWRITE part_of TYPE RELATION FROM note TO note SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE created_at ON part_of TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE part_of_unique ON part_of FIELDS in, out UNIQUE;
DEFINE INDEX OVERWRITE part_of_single_parent ON part_of FIELDS in UNIQUE;

-- blocked_by: una task/proyecto bloqueado por algo concreto (puede ser un bloque).
DEFINE TABLE OVERWRITE blocked_by TYPE RELATION FROM note TO note | block SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE since  ON blocked_by TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE reason ON blocked_by TYPE option<string>;
DEFINE INDEX OVERWRITE blocked_by_unique ON blocked_by FIELDS in, out UNIQUE;

-- mentions: referencia narrativa cualquier-a-cualquier.
DEFINE TABLE OVERWRITE mentions TYPE RELATION FROM note | block TO note | block SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE created_at ON mentions TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE mentions_unique ON mentions FIELDS in, out UNIQUE;

-- Limpieza de edges legacy que no forman parte de v2.1-lite.
REMOVE TABLE IF EXISTS supports;
REMOVE TABLE IF EXISTS refutes;
REMOVE TABLE IF EXISTS authored_by;

-- about: un block narrativo habla sobre una note.
DEFINE TABLE OVERWRITE about TYPE RELATION FROM block TO note SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE created_at ON about TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE about_unique ON about FIELDS in, out UNIQUE;

-- affects: un bloque narrativo aprobado declara qué note queda afectada y cómo.
DEFINE TABLE OVERWRITE affects TYPE RELATION FROM block TO note SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE action ON affects TYPE string
  ASSERT $value INSIDE ['created', 'updated', 'state_changed', 'linked', 'archived'];
DEFINE FIELD OVERWRITE summary ON affects TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON affects TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE affects_unique ON affects FIELDS in, out UNIQUE;

-- derived_from: procedencia desde raw_capture. La auditabilidad cruda → estructurado.
-- Granularidad objetivo: block narrativo -> raw_capture.
-- `transformation` permite al agente anotar cómo derivó (verbatim, extracted, summarized, inferred).
DEFINE TABLE OVERWRITE derived_from TYPE RELATION FROM block TO raw_capture SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE created_at     ON derived_from TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE transformation ON derived_from TYPE option<string>
  ASSERT $value IS NONE OR $value INSIDE ['verbatim', 'extracted', 'summarized', 'inferred'];
DEFINE INDEX OVERWRITE derived_from_unique ON derived_from FIELDS in, out UNIQUE;

-- ─────────────────────────────────────────────────────────────────────────
-- proposal: draft persistido de una sesión deliberada de procesamiento.
-- No muta el grafo hasta commit_proposal, que representa aprobación explícita.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE proposal SCHEMAFULL CHANGEFEED 10y;
DEFINE FIELD OVERWRITE status       ON proposal TYPE string
  DEFAULT 'draft'
  ASSERT $value INSIDE ['draft', 'committed', 'discarded'];
DEFINE FIELD OVERWRITE raw_captures ON proposal TYPE array<record<raw_capture>> DEFAULT [];
DEFINE FIELD OVERWRITE payload      ON proposal TYPE object FLEXIBLE;
-- Resultado materializado del commit: IDs reales creados/tocados + committed_at.
-- Permite responder "qué cambió este proposal" sin depender del changefeed.
DEFINE FIELD OVERWRITE result       ON proposal TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE created_at   ON proposal TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at   ON proposal TYPE datetime VALUE time::now();

DEFINE INDEX OVERWRITE proposal_status  ON proposal FIELDS status;
DEFINE INDEX OVERWRITE proposal_created ON proposal FIELDS created_at;

-- ─────────────────────────────────────────────────────────────────────────
-- agent_event: trazabilidad de las decisiones del agente (worker + conversacional).
-- Cada decisión emite un evento estructurado con metadata (reasoning, confidence,
-- model, tokens, duration, etc.). Ver ADR-0019.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE agent_event SCHEMAFULL;
DEFINE FIELD OVERWRITE kind ON agent_event TYPE string
  ASSERT $value INSIDE [
    'raw_received',
    'raw_status_changed',
    'proposal_created', 'proposal_updated', 'proposal_discarded', 'proposal_committed',
    'note_state_changed'
  ];
DEFINE FIELD OVERWRITE actor ON agent_event TYPE string
  ASSERT $value INSIDE ['worker', 'conversational', 'user', 'system'];
DEFINE FIELD OVERWRITE session_id ON agent_event TYPE string;
DEFINE FIELD OVERWRITE subject ON agent_event TYPE option<record>;
DEFINE FIELD OVERWRITE payload ON agent_event TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE confidence ON agent_event TYPE option<float>
  ASSERT $value IS NONE OR ($value >= 0 AND $value <= 1);
DEFINE FIELD OVERWRITE reasoning_summary ON agent_event TYPE option<string>;
DEFINE FIELD OVERWRITE model ON agent_event TYPE option<string>;
DEFINE FIELD OVERWRITE tokens_used ON agent_event TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE duration_ms ON agent_event TYPE option<int>;
DEFINE FIELD OVERWRITE created_at ON agent_event TYPE datetime DEFAULT time::now() READONLY;

DEFINE INDEX OVERWRITE agent_event_kind_time ON agent_event FIELDS kind, created_at;
DEFINE INDEX OVERWRITE agent_event_session   ON agent_event FIELDS session_id;
DEFINE INDEX OVERWRITE agent_event_subject   ON agent_event FIELDS subject;
DEFINE INDEX OVERWRITE agent_event_actor     ON agent_event FIELDS actor;

-- ─────────────────────────────────────────────────────────────────────────
-- USERS: read-only user for the SurrealMCP proxy.
-- The password is intentionally not versioned in this schema. Run
-- `bun run db:define-reader` with SURREAL_READER_PASS or SURREALDB_PASS set.
-- The script applies:
--   DEFINE USER IF NOT EXISTS huygens_reader ON DATABASE PASSWORD <secret> ROLES VIEWER;
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- CHANGEFEED: state-diff audit trail sobre tablas críticas (ADR-0020).
-- Retention de 10y = efectivamente ilimitado para uso personal.
-- Permite queries históricas: `SHOW CHANGES FOR TABLE x SINCE $t`
-- y time-travel: `SELECT * FROM note:abc AT d'YYYY-MM-DD'`.
--
-- La cláusula `CHANGEFEED 10y` está incrustada en el `DEFINE TABLE OVERWRITE`
-- de cada tabla auditada — buscar en este fichero. Esto se debe a que la
-- sintaxis standalone `DEFINE TABLE x CHANGEFEED 10y` colisiona con la tabla
-- ya definida (`AlreadyExists`) en este driver; al incrustarla en la propia
-- definición `OVERWRITE` el cambio es idempotente y atómico.
--
-- Tablas con CHANGEFEED 10y activo:
--   - raw_capture, note, block
--   - derived_from, part_of, blocked_by, mentions, about, affects
--   - proposal
--
-- Tablas SIN CHANGEFEED (deliberado):
--   - note_type     (taxonomía editable, baja cardinalidad, sin valor histórico)
--   - agent_event   (ya es el audit log — append-only por construcción)
--   - saved_query   (queries SurrealQL guardadas; config editable, sin histórico)
--   - conversation  (hilos de chat del dashboard; estado de app, no dominio)
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- SAVED QUERIES: SurrealQL guardadas con nombre. NO es topología de dominio.
-- SCHEMALESS a propósito: guarda { name, query, pinned, … } libremente; el
-- shape lo valida la tool en TS, no la BD, para que evolucione sin migraciones.
-- Se ejecutan read-only (huygens_reader) — SurrealDB rechaza cualquier escritura.
-- ─────────────────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE saved_query SCHEMALESS;
DEFINE FIELD OVERWRITE updated_at ON saved_query VALUE time::now();

-- ─────────────────────────────────────────────────────────────────────────
-- CONVERSATIONS: hilos de chat del agente del dashboard (mensajes + vistas
-- generadas). NO es topología de dominio. SCHEMALESS como saved_query: el
-- shape del thread/vistas (formato assistant-ui) lo valida la tool en TS y
-- evoluciona sin migraciones. Escrito vía MCP (root); el dashboard lo lee
-- como huygens_reader. `messages` y `state` se guardan como blobs opacos.
-- ─────────────────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE conversation SCHEMALESS;
DEFINE FIELD OVERWRITE created_at ON conversation TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON conversation VALUE time::now();
