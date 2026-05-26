# Upstream issue draft — `VERSION` table scans do not reconstruct historical record set (deletes)

Draft to file at `surrealdb/surrealdb`. Internal context: this is the bug behind
ADR-0025 (we work around it with changefeed replay). Distinct from the already-fixed
[#7245](https://github.com/surrealdb/surrealdb/issues/7245), which fixed graph
*traversals* under `VERSION`; plain table *scans* remain wrong.

---

## Title

`VERSION` table scans return the wrong record set across deletes (false positives unindexed, false negatives index-backed)

## Versions affected

- `surrealdb 3.0.5` (latest published release)
- `surrealdb 3.1.0-nightly+20260525.e694e04` (still reproduces)
- Storage engine: **SurrealKV** started with `?versioned=true`.

## Summary

Time-travel reads by **record id** (`SELECT * FROM tbl:id VERSION d"…"`) are correct, including
respecting deletes. But time-travel reads that **scan a table** (`SELECT * FROM tbl … VERSION d"…"`)
do not reconstruct the set of records that existed at that version:

- **Unindexed scan** → **false positives**: returns records that were already *deleted* as of the
  queried version (tombstones ignored).
- **Index-backed filter** (e.g. `WHERE in IN […]` covered by an index) → **false negatives**: misses
  records that existed at the version but were *deleted since*, because the index only contains
  currently-live records.

Either way, a table scan under `VERSION` cannot answer "what rows existed at time T". This affects
both `NORMAL` and `RELATION` tables. (This is separate from #7245, which fixed `->edge->` traversals.)

## Reproduction

```surql
-- engine: surrealkv:/data/db?versioned=true
DEFINE TABLE t SCHEMALESS CHANGEFEED 10y;

CREATE t:a SET v = 1;
CREATE t:b SET v = 1;
LET $t1 = <string> time::now();   -- both rows exist here
DELETE t:b;
LET $t2 = <string> time::now();   -- b is deleted here

-- by id: CORRECT (respects the delete)
SELECT * FROM t:b VERSION d"$t2";          -- => []   ✅

-- unindexed scan as of $t2: WRONG, returns the deleted row (false positive)
SELECT * FROM t VERSION d"$t2";            -- => [{id: t:a, v:1}, {id: t:b, v:1}]   ❌ (b is deleted)
```

Index-backed false-negative variant (re-parent pattern on a `RELATION` with a `UNIQUE` index on
`in`/`(in,out)`):

```surql
DEFINE TABLE rel TYPE RELATION SCHEMALESS CHANGEFEED 10y;
DEFINE INDEX rel_in ON rel FIELDS in, out UNIQUE;
CREATE node:a; CREATE node:b; CREATE node:c;
RELATE node:a->rel->node:b;
LET $t1 = <string> time::now();            -- a->b exists here
DELETE rel WHERE in = node:a AND out = node:b;
RELATE node:a->rel->node:c;

-- as of $t1 the only edge was a->b; index-backed scan returns nothing (false negative)
SELECT in, out FROM rel WHERE in IN [node:a] VERSION d"$t1";   -- => []   ❌ (expected a->b)
```

## Expected

A `VERSION d"T"` table scan should return exactly the rows that were live at `T` — excluding rows
deleted at/before `T`, and including rows live at `T` even if deleted afterwards.

## Notes

- `SELECT … VERSION` by record id is correct, so the version history itself is intact; the defect is
  in how scans/index lookups assemble the row set under a version.
- Changefeed replay (`SHOW CHANGES … SINCE` + apply create/delete) reconstructs the correct set, so
  the underlying data exists — this is a query-path issue, not a storage one.
- `VERSION` is documented as alpha; filing so the table-scan case is tracked separately from the
  traversal fix (#7245 / PR #7198).
