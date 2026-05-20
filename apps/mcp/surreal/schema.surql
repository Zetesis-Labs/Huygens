-- Huygens — schema de datos en SurrealDB.
--
-- Modelo: cada Note es composición ordenada de Blocks (markdown auto-contenido).
-- La topología (edges) puede apuntar a notes o a blocks indistintamente — esto
-- permite Zettelkasten-trails y referencias granulares sin pasar a un modelo
-- de bloques atómicos tipo Notion.
--
-- Idempotente: usa OVERWRITE para que aplicar varias veces sea seguro.
-- Las cleanups (REMOVE) al inicio toleran que la BBDD esté vacía.

-- ─────────────────────────────────────────────────────────────────────────
-- Cleanup de la versión anterior (note.content + note_chunk eliminados)
-- ─────────────────────────────────────────────────────────────────────────

REMOVE TABLE IF EXISTS note_chunk;
REMOVE FIELD IF EXISTS content ON TABLE note;

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

DEFINE TABLE OVERWRITE note SCHEMAFULL;
DEFINE FIELD OVERWRITE title       ON note TYPE string;
DEFINE FIELD OVERWRITE type        ON note TYPE option<record<note_type>>;
DEFINE FIELD OVERWRITE pillars     ON note TYPE array<string>
  DEFAULT []
  ASSERT $value ALLINSIDE ['PATHOS_SOMA', 'ETHOS', 'TELOS', 'SOPHIA'];
DEFINE FIELD OVERWRITE state       ON note TYPE string
  DEFAULT 'INBOX'
  ASSERT $value INSIDE ['INBOX', 'CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'];
DEFINE FIELD OVERWRITE block_order ON note TYPE array<record<block>> DEFAULT [];
DEFINE FIELD OVERWRITE metadata    ON note TYPE option<object>;
DEFINE FIELD OVERWRITE source_kind ON note TYPE option<string>;
DEFINE FIELD OVERWRITE source_ref  ON note TYPE option<string>;
DEFINE FIELD OVERWRITE created_at  ON note TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at  ON note TYPE datetime VALUE time::now();
DEFINE FIELD OVERWRITE last_reviewed_at ON note TYPE option<datetime>;

DEFINE INDEX OVERWRITE note_state    ON note FIELDS state;
DEFINE INDEX OVERWRITE note_type_idx ON note FIELDS type;
DEFINE INDEX OVERWRITE note_updated  ON note FIELDS updated_at;
DEFINE INDEX OVERWRITE note_reviewed ON note FIELDS last_reviewed_at;

-- ─────────────────────────────────────────────────────────────────────────
-- Block: unidad direccionable y vectorizable. Markdown auto-contenido.
-- Cada bloque pertenece a una note. El orden lo dicta note.block_order.
-- ─────────────────────────────────────────────────────────────────────────

DEFINE TABLE OVERWRITE block SCHEMAFULL;
DEFINE FIELD OVERWRITE note            ON block TYPE record<note>;
DEFINE FIELD OVERWRITE content         ON block TYPE string;
DEFINE FIELD OVERWRITE pillars         ON block TYPE array<string>
  DEFAULT []
  ASSERT $value ALLINSIDE ['PATHOS_SOMA', 'ETHOS', 'TELOS', 'SOPHIA'];
DEFINE FIELD OVERWRITE embedding       ON block TYPE option<array<float>>;
DEFINE FIELD OVERWRITE embedding_model ON block TYPE option<string>;
DEFINE FIELD OVERWRITE dimensions      ON block TYPE option<int>;
DEFINE FIELD OVERWRITE created_at      ON block TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at      ON block TYPE datetime VALUE time::now();

DEFINE INDEX OVERWRITE block_note ON block FIELDS note;
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
-- Los edges semánticos (mentions/supports/refutes/etc) admiten note Y block
-- como FROM/TO, permitiendo trails Zettelkasten a nivel de bloque.
--
-- Cada edge table tiene un UNIQUE index sobre (in, out) (kaig-inspired) que
-- impide duplicados: solo puede haber un edge de tipo X entre la misma pareja
-- (A, B). Re-ejecutar `RELATE A->X->B` no spawns un segundo edge.
-- ─────────────────────────────────────────────────────────────────────────

-- part_of: jerarquía macro (Area → Project → Task). Solo entre notes.
DEFINE TABLE OVERWRITE part_of TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON part_of TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE part_of_unique ON part_of FIELDS in, out UNIQUE;

-- blocked_by: una task/proyecto bloqueado por algo concreto (puede ser un bloque).
DEFINE TABLE OVERWRITE blocked_by TYPE RELATION FROM note TO note | block SCHEMAFULL;
DEFINE FIELD OVERWRITE since  ON blocked_by TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE reason ON blocked_by TYPE option<string>;
DEFINE INDEX OVERWRITE blocked_by_unique ON blocked_by FIELDS in, out UNIQUE;

-- mentions: referencia narrativa cualquier-a-cualquier.
DEFINE TABLE OVERWRITE mentions TYPE RELATION FROM note | block TO note | block SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON mentions TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE mentions_unique ON mentions FIELDS in, out UNIQUE;

-- supports: respaldo argumentativo. Zettel-trails clásicos.
DEFINE TABLE OVERWRITE supports TYPE RELATION FROM note | block TO note | block SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON supports TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE supports_unique ON supports FIELDS in, out UNIQUE;

-- refutes: contradicción argumentativa.
DEFINE TABLE OVERWRITE refutes TYPE RELATION FROM note | block TO note | block SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON refutes TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE refutes_unique ON refutes FIELDS in, out UNIQUE;

-- about: un Report cubre estos blocks/notes citados.
DEFINE TABLE OVERWRITE about TYPE RELATION FROM note TO note | block SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON about TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE about_unique ON about FIELDS in, out UNIQUE;

-- authored_by: atribución a Persons (que son notes con type=person).
DEFINE TABLE OVERWRITE authored_by TYPE RELATION FROM note | block TO note SCHEMAFULL;
DEFINE FIELD OVERWRITE created_at ON authored_by TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE authored_by_unique ON authored_by FIELDS in, out UNIQUE;
