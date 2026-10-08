# Changelog

## [0.7.1](https://github.com/Zetesis-Labs/Huygens/compare/mcp-v0.7.0...mcp-v0.7.1) (2026-10-08)


### Features

* align Huygens with the operational graph model ([e7eb737](https://github.com/Zetesis-Labs/Huygens/commit/e7eb737fbac9a7fc11c4c243adfb9a9c25d2fa8a))


### Bug Fixes

* **mcp:** purge orphaned last_reviewed_at values when dropping the field ([4063310](https://github.com/Zetesis-Labs/Huygens/commit/4063310cec861b9d4979f0cbbd286eda02296e83))


### Documentation

* **mcp:** clarify where the human commit happens in the operating doctrine ([e1178eb](https://github.com/Zetesis-Labs/Huygens/commit/e1178eb0e337cff30d75aabe08574d9ed65731ee))

## [0.7.0](https://github.com/Zetesis-Labs/Huygens/compare/mcp-v0.6.0...mcp-v0.7.0) (2026-06-09)


### ⚠ BREAKING CHANGES

* **mcp:** narrative_blocks.kind accepts only 'day'|'week' in new proposals; the legacy split kinds (plan_day/review_day/plan_week/ review_week) remain valid on historic blocks and stored payloads but are rejected at create_proposal. commit_proposal now requires a get_proposal preview of the latest payload, and rejects part_of cycles.
* **mcp,dashboard:** proposal.payload pasa a usar ids reales; proposal.result se reduce a la ancla. Legacy tolerado en lectura.
* **mcp:** the get_raw, list_mits_for_date and list_notes_by_type MCP tools are removed; read those via query_query/run_query using the cookbook recipes.
* **mcp:** the update_note_state MCP tool is removed; clients must change a note's state via a committed proposal.

### Features

* **dashboard,mcp:** query composer (TS script -&gt; SurrealQL) with Monaco ([49560b9](https://github.com/Zetesis-Labs/Huygens/commit/49560b9a6c52d6272cf3368bb0844a42f62c9751))
* due/defer operational hardening (P0) + inbox view, DST fix, review stamping (P1) ([ab7fcb3](https://github.com/Zetesis-Labs/Huygens/commit/ab7fcb3daebacb866f33178325ba0f2177774818))
* get_proposal_changes from the payload (SSOT); dashboard guards legacy proposals ([5b5636f](https://github.com/Zetesis-Labs/Huygens/commit/5b5636f4abe0ba557f7f90d6988f3141ec45f7f3))
* **mcp,dashboard:** changefeed-as-history; payload con ids reales; sin result/temp_ids ([f71d6e4](https://github.com/Zetesis-Labs/Huygens/commit/f71d6e40f181e573b31a1d5ee8448959003c1ca7))
* **mcp,dashboard:** saved SurrealQL queries + explorer ([6f5a5a5](https://github.com/Zetesis-Labs/Huygens/commit/6f5a5a58801e2afd01a9bdfff229aabae310537d))
* **mcp:** add lexical (BM25) and hybrid (RRF) search ([1351fa9](https://github.com/Zetesis-Labs/Huygens/commit/1351fa96855238b3429f5f31dac7a90ae54c2f81))
* **mcp:** add retract and collection_stats tools ([8334e4e](https://github.com/Zetesis-Labs/Huygens/commit/8334e4eb48a649e705c035d3ef3382769017165a))
* **mcp:** boot schema validation + serve inbox-processing prompt ([d2af9f9](https://github.com/Zetesis-Labs/Huygens/commit/d2af9f979cff08c50334faab7adecf2938b37648))
* **mcp:** changes_between aggregate + conversation persistence ([a5129dc](https://github.com/Zetesis-Labs/Huygens/commit/a5129dc20926294c13022292c9250da2c1260423))
* **mcp:** check_claim — faithfulness verification (C3) ([7b54fae](https://github.com/Zetesis-Labs/Huygens/commit/7b54fae820b657cdc065945f190834e633f50748))
* **mcp:** close the P0 hygiene loop — persist blocked_by.reason + auto-embed post-commit ([d6d1fac](https://github.com/Zetesis-Labs/Huygens/commit/d6d1fac3ce58e55fda3e5af1d0ec9868ba34694a))
* **mcp:** coaching/pedagogical layer — teach ZTD, activate the dormant habit ([a3a0159](https://github.com/Zetesis-Labs/Huygens/commit/a3a015951dfad532548680544f07ab8c3fb4d603))
* **mcp:** draft change-graph preview via format_d2 on get_proposal ([6164e7a](https://github.com/Zetesis-Labs/Huygens/commit/6164e7adf00959715628dd5f881a22671f62859f))
* **mcp:** due_at and defer_until — deadlines and a real tickler (+ date normalization) ([d80fa2f](https://github.com/Zetesis-Labs/Huygens/commit/d80fa2f4c38dcc1aaea4dbc4d25d58b6f52ab6e9))
* **mcp:** edge provenance + crash-safe proposal changes + metadata guard ([0aa0784](https://github.com/Zetesis-Labs/Huygens/commit/0aa0784dc11e570346d051a55466566963c72dba))
* **mcp:** enforce single-parent part_of via unique index on `in` ([5ca389b](https://github.com/Zetesis-Labs/Huygens/commit/5ca389bb20040ec70bc4825b1e3790aaceb4693e))
* **mcp:** expand_context — hybrid vector+graph retrieval (B2) ([f033f35](https://github.com/Zetesis-Labs/Huygens/commit/f033f354e648d427d95d7608765ecf7d212c84cd))
* **mcp:** expose live DB schema as server instructions ([0104611](https://github.com/Zetesis-Labs/Huygens/commit/010461125ff236c985f558cedbf5191ffb5c0848))
* **mcp:** first-class mit_for and a temp_id-&gt;real_id map on commit ([8f63ce9](https://github.com/Zetesis-Labs/Huygens/commit/8f63ce956afead0a77fd543701baa7ed387f7b1c))
* **mcp:** gate ritual commits and materialize informe kind on the block ([739bf7a](https://github.com/Zetesis-Labs/Huygens/commit/739bf7a9fd606f2eb9d92e408750994161574085))
* **mcp:** genesis commit — flatten legacy history into one máximo-limpio snapshot ([6759842](https://github.com/Zetesis-Labs/Huygens/commit/67598421e7f67dbdcf4facfa4af2eb222ba31f42))
* **mcp:** log every tool call to stderr + DB for debugging traces ([ee9ca7c](https://github.com/Zetesis-Labs/Huygens/commit/ee9ca7c80bb43d662093a08bc8c988aa3e4728d6))
* **mcp:** M2a via_proposal lock + user_anchored part_of + typed read tools (M2) ([4525a6a](https://github.com/Zetesis-Labs/Huygens/commit/4525a6a7ba59122ea02c86448d7a3f02b14002e0))
* **mcp:** mit_history — derive the per-note MIT timeline from the log ([66ac927](https://github.com/Zetesis-Labs/Huygens/commit/66ac927f546789c1d08d3da4cf20f6e0dc2ee582))
* **mcp:** neighborhood tool — subgraph→triples retrieval (B1) ([1d3ade9](https://github.com/Zetesis-Labs/Huygens/commit/1d3ade912aa4859bd5e917f052aa6d54d1a2aac0))
* **mcp:** plan_day prompt — daily MIT planning ritual ([894535b](https://github.com/Zetesis-Labs/Huygens/commit/894535ba851159655aaedd4aaffd71bd013e210a))
* **mcp:** proposal edge removal + part_of replace ([66ea8c7](https://github.com/Zetesis-Labs/Huygens/commit/66ea8c7ffbec8de59bba033329cf0c53dc251b6f))
* **mcp:** provenance flag on vector_search & find_related hits (C2) ([4d91f0e](https://github.com/Zetesis-Labs/Huygens/commit/4d91f0e3b4594c176cc5e1483b8b95d20e3eb35a))
* **mcp:** rebuild() — re-derive the graph from the committed proposals (event-sourcing) ([c5645c4](https://github.com/Zetesis-Labs/Huygens/commit/c5645c44285dd8551c0ece26715a26e0052dc120))
* **mcp:** remove update_note_state tool ([dc12e43](https://github.com/Zetesis-Labs/Huygens/commit/dc12e43b71c55e9d78c327520d190dbf78e333db))
* **mcp:** review_day prompt — daily MIT close ritual ([7fe258d](https://github.com/Zetesis-Labs/Huygens/commit/7fe258d3458e1b232a0ffeee091cb9cc9c848a5d))
* **mcp:** shared graph→text serializer + contextual block embeddings ([d815f74](https://github.com/Zetesis-Labs/Huygens/commit/d815f749973be3e725b4a411a5d301e745f8dff3))
* **mcp:** single daily ritual (day/week), preview + acyclic muros, DST-correct gate ([26d122b](https://github.com/Zetesis-Labs/Huygens/commit/26d122b78392ffed4f9f4098142a936e674d3c80))
* **mcp:** trace_provenance tool — read & cite provenance ([810a8b5](https://github.com/Zetesis-Labs/Huygens/commit/810a8b5c8507f5678084697959152071fdb8c7b5))
* **mcp:** verified SurrealQL exploration cookbook in server instructions ([8099eab](https://github.com/Zetesis-Labs/Huygens/commit/8099eab390d12c49c34f70a5193de1bef651b185))
* tag planning/review informes by kind + Bitácora reader ([21485c5](https://github.com/Zetesis-Labs/Huygens/commit/21485c593ac5391959021ecd9e7e21dbf23d3e34))


### Bug Fixes

* linter ([32bf860](https://github.com/Zetesis-Labs/Huygens/commit/32bf8602abb4fbcf77fbba06d2f2ac5f7b336847))
* **mcp,dashboard:** resilient SurrealDB reconnection on dropped/lost sessions (D5) ([3dbc88a](https://github.com/Zetesis-Labs/Huygens/commit/3dbc88a180227533e42004abe5d7a03d92d34eee))
* **mcp:** capture commit versionstamp reliably; fix Dockerfile workspace resolution ([12452df](https://github.com/Zetesis-Labs/Huygens/commit/12452df864beab22b72c19a5caf4de4f063b6b0e))
* **mcp:** expose cookbook & live schema as resources; fix inbox prompt ([f24d407](https://github.com/Zetesis-Labs/Huygens/commit/f24d407920a10566078d749b72916e53612db418))
* **mcp:** guard rebuildGraph against provenance flattening + honest docs (M1 e/d) ([31aba2e](https://github.com/Zetesis-Labs/Huygens/commit/31aba2e9ade4c0f6632f443473a0f2d3f0a6a8cb))
* **mcp:** OR-tokenise the lexical leg and hide ARCHIVED by default ([bcd799a](https://github.com/Zetesis-Labs/Huygens/commit/bcd799a49032fbbd0c20de1f174a1303998478d7))
* **mcp:** pre-assign stable descriptive-block ids for deterministic replay (M1 c) ([a46c620](https://github.com/Zetesis-Labs/Huygens/commit/a46c620e708bed2e63bbaef7ce6914cd0eb2fa92))
* **mcp:** route query_query through defineTool so it's traced too ([0fdaa53](https://github.com/Zetesis-Labs/Huygens/commit/0fdaa53da44912dc5b32e30008592594534f2d62))


### Code Refactoring

* **mcp:** declarative/immutable rewrites over loops+mutation (wave 1/5) ([9cd0902](https://github.com/Zetesis-Labs/Huygens/commit/9cd0902d887279845297cec984e5600be50c3a70))
* **mcp:** drop D2/image rendering; graph viz moves to the dashboard ([0ff9db2](https://github.com/Zetesis-Labs/Huygens/commit/0ff9db20260bded889d43e6923c8d881c49f3a9b))
* **mcp:** extract pure text/JSON builders behind public contracts, byte-identical (wave 5/5) ([e74fbdf](https://github.com/Zetesis-Labs/Huygens/commit/e74fbdff3f2397c02823857698a291c47671e9bc))
* **mcp:** extract pure validation cores from DB-fused validators (wave 2/5) ([983303a](https://github.com/Zetesis-Labs/Huygens/commit/983303a750995aa7c7efe46b83b196751e0dd25c))
* **mcp:** prune trivial read tools, covered by the cookbook ([1fa2f0a](https://github.com/Zetesis-Labs/Huygens/commit/1fa2f0afbbae714f6745502c9f2e66457344ef2c))
* **mcp:** push side effects to the edges, split fetch from pure transform (wave 3/5) ([de15320](https://github.com/Zetesis-Labs/Huygens/commit/de1532030df82e8b7c3d0e7e47ebc388c8502fc6))
* **mcp:** sequential-&gt;concurrent I/O where order-independent (wave 4/5) ([ff02e00](https://github.com/Zetesis-Labs/Huygens/commit/ff02e008af8ba4ff7c5889fcb27bb94e50d2db12))
* **mcp:** unify read-tool output via serialize nodeLine (A3) ([1593fb7](https://github.com/Zetesis-Labs/Huygens/commit/1593fb746b0d6fcb04dcf30b8698470229d5c8d0))


### Documentation

* **mcp:** consolidate operative docs into a single operating-doctrine ([b696f95](https://github.com/Zetesis-Labs/Huygens/commit/b696f95e9ea292ad4cb97284a9c45db1d9259f94))
* **mcp:** data-model via_proposal now reflects 100% coverage post-backfill ([cccd1df](https://github.com/Zetesis-Labs/Huygens/commit/cccd1df1d73500026e6a450c511d15b0b4d9ef79))
* **mcp:** fix lore doc-vs-reality mismatches + document via_proposal/superseded ([4ad8e29](https://github.com/Zetesis-Labs/Huygens/commit/4ad8e292fe6cc202121dcbb925d4ddd8792e56ff))
* **mcp:** list decompose_project in the doctrine's prompt resources ([0b185cc](https://github.com/Zetesis-Labs/Huygens/commit/0b185cc1d6463450d68489a8c9d71e29599f0ad4))
* refine doctrine per review + fix stale docs (correction-as-approval, contracts) ([e908e70](https://github.com/Zetesis-Labs/Huygens/commit/e908e7044c3a29be514b558b4e164a71e06c9600))
* sync operational docs with the current MCP and data model ([169dbd0](https://github.com/Zetesis-Labs/Huygens/commit/169dbd02f25c81c59b42df5072edbcd60a86e6d7))


### Tests

* broad coverage sweep across MCP + dashboard ([4596b9d](https://github.com/Zetesis-Labs/Huygens/commit/4596b9de63b340071499d0f06222a41108470c00))
* **mcp:** anchor part_of in the proposal-flow fixture ([dc90ba1](https://github.com/Zetesis-Labs/Huygens/commit/dc90ba1b201d3937729892a53287dd82ae62aaa3))
* **mcp:** fold-verification harness proves graph == fold(log) (M1 — acceptance) ([ccd3494](https://github.com/Zetesis-Labs/Huygens/commit/ccd3494fa5c2ad07285819c6ec9bccda26cca3d4))
* **mcp:** guard the suite against touching the production namespace ([c3120f2](https://github.com/Zetesis-Labs/Huygens/commit/c3120f214b2640e1dfabd5997d7718f0e4d48259))
* **mcp:** ritual gate, commit muros, madrid-time, anti-drift nets ([a6c2915](https://github.com/Zetesis-Labs/Huygens/commit/a6c29157fc8ef2a41fb785674cf7ac80b555875a))
* **mcp:** strengthen fold-verification to compare ALL invariant fields ([42ffba6](https://github.com/Zetesis-Labs/Huygens/commit/42ffba67db721cd96d800f035c45884b6706de78))

## [0.6.0](https://github.com/Zetesis-Labs/Huygens/compare/mcp-v0.5.0...mcp-v0.6.0) (2026-05-26)


### ⚠ BREAKING CHANGES

* **mcp:** replace surrealmcp proxy with native query_query

### Features

* **mcp:** atomic commit_proposal with materialized result and versionstamp ([11d9cdb](https://github.com/Zetesis-Labs/Huygens/commit/11d9cdb19f641dd0fccb239ee86e4fe9b9cff04e))
* **mcp:** D2 diagram output for get_proposal_changes (format_d2) ([6778c36](https://github.com/Zetesis-Labs/Huygens/commit/6778c364551df505fb3f497b476d2c62c546f82d))
* **mcp:** get_proposal_changes — recover a committed proposal's exact changes ([1ff8362](https://github.com/Zetesis-Labs/Huygens/commit/1ff836267db434350cbef59c07fd16d76d2db7f7))
* **mcp:** preview proposal changes in get_proposal ([3b99c22](https://github.com/Zetesis-Labs/Huygens/commit/3b99c2203be037748973bd34b4542753b4c30cd5))
* **mcp:** proxy SurrealMCP read-only tools under query_ namespace ([2e00bb4](https://github.com/Zetesis-Labs/Huygens/commit/2e00bb4e65515dd2e6a4797dcb20723202c6d8de))
* **mcp:** replace surrealmcp proxy with native query_query ([d9e2376](https://github.com/Zetesis-Labs/Huygens/commit/d9e2376cc2b0504efa6ddf85c0c89414c264aad5))
* **mcp:** semantic & audit D2 views for get_proposal_changes ([8ddd685](https://github.com/Zetesis-Labs/Huygens/commit/8ddd6858e95738b72e7ac7bfe5b40133f80b458b))


### Bug Fixes

* **mcp:** make surrealmcp query_* proxy actually work end-to-end ([e5f535b](https://github.com/Zetesis-Labs/Huygens/commit/e5f535b72530b278788411dd59434e5184463375))
* **mcp:** pin surrealmcp upstream endpoint via connect_endpoint at boot ([b93f7e4](https://github.com/Zetesis-Labs/Huygens/commit/b93f7e4ac2a1a1482aba05d3531db4761447f518))
* **mcp:** reauth SurrealDB RPC session on lost-auth errors ([510e931](https://github.com/Zetesis-Labs/Huygens/commit/510e9317cb4de588bd3e12970f66c77c5c2072d3))


### Code Refactoring

* **mcp:** consistent value coercion + flatter tool handlers ([0da099c](https://github.com/Zetesis-Labs/Huygens/commit/0da099cd1b18b816fdaa1d8db854524f484c8e23))
* **mcp:** extract pure context-label logic; unit-test it ([bcc3b4b](https://github.com/Zetesis-Labs/Huygens/commit/bcc3b4bdfe8e17085ebcee3512e2bdfa8a511346))
* **mcp:** inject the embedder; hermetic tests, no API key in CI ([9be8238](https://github.com/Zetesis-Labs/Huygens/commit/9be8238bd5b1d48d644af04143ad88699c69b264))
* **mcp:** split proposal.ts into cohesive modules ([344e6f5](https://github.com/Zetesis-Labs/Huygens/commit/344e6f569495d0137cbb9d973919d48723010500))
* **mcp:** tidy id coercions and context-label complexity ([77ad103](https://github.com/Zetesis-Labs/Huygens/commit/77ad103e06d219119b0a620c7aaff6be2ee535eb))
* **mcp:** type the SurrealDB record boundary ([a380b9f](https://github.com/Zetesis-Labs/Huygens/commit/a380b9f79821bbd8cd6236a8acb90d0f57d42778))
* **mcp:** unify tool registration and error handling via defineTool ([b788f95](https://github.com/Zetesis-Labs/Huygens/commit/b788f957da52931f3179c7294db4f6ef9763d3bb))


### Documentation

* align all documentation with v2 report-centered model ([aea2c58](https://github.com/Zetesis-Labs/Huygens/commit/aea2c58eb85cfdaf0b2de7a402a29f9331b67e76))
* introduce MODEL.md as canonical model (v2) — report-centered ([713b290](https://github.com/Zetesis-Labs/Huygens/commit/713b290b7eaa1073cebdf3be5a2df8920e3585cb))


### Tests

* **mcp:** cover defineTool, the error boundary and vector-search ([909fd6b](https://github.com/Zetesis-Labs/Huygens/commit/909fd6b23a9e3ff1bd7d2807c5d328d03114f63b))

## [0.5.0](https://github.com/Zetesis-Labs/Huygens/compare/mcp-v0.4.0...mcp-v0.5.0) (2026-05-21)


### ⚠ BREAKING CHANGES

* **worker:** drop Python commit_clarify port, call MCP over HTTP instead

### Features

* **mcp:** add capture, list_inbox, get_raw, commit_clarify tools ([4ea7427](https://github.com/Zetesis-Labs/Huygens/commit/4ea74271c09339310c1102253bb9ef0f1e5efae5))
* **mcp:** add embeddings pipeline — chunk_markdown, embed_text, index_block, vector_search ([81ca020](https://github.com/Zetesis-Labs/Huygens/commit/81ca020a94d6de01a3561a33406a9e02e13f0bd6))
* **mcp:** add ergonomics tools + generate_report ([ac9fdbf](https://github.com/Zetesis-Labs/Huygens/commit/ac9fdbffb3d61919a7498064753655465ee3c1ce))
* **mcp:** persist generate_report as a first-class graph note ([a3661c8](https://github.com/Zetesis-Labs/Huygens/commit/a3661c883263d5c7fc34b11c8a77c6a9dbf2763c))
* **mcp:** self-describing layer — LORE resources + canonical prompts ([cbb17ec](https://github.com/Zetesis-Labs/Huygens/commit/cbb17ece973f46d401a50b6fafbc67ca80677588))
* **model:** adopt ZTD, drop Pilares, add Objetivo + Idea + MIT ([82a8076](https://github.com/Zetesis-Labs/Huygens/commit/82a8076b690995a2658a7eefbcf1248847921d4f))
* **observability:** autonomous worker, event sourcing, and CHANGEFEED audit ([a41ee7d](https://github.com/Zetesis-Labs/Huygens/commit/a41ee7d701ace128dca00db6202ac8fb8fd4f74c))
* scaffold Bun monorepo with MCP server and Note schema ([707fadb](https://github.com/Zetesis-Labs/Huygens/commit/707fadbb409e41e4b60943570549b9e3d37e4fc4))
* **worker:** iter 1 — autonomous clarify via Agno + OpenAI gpt-4o-mini ([74046fa](https://github.com/Zetesis-Labs/Huygens/commit/74046fadb6b2c0b620a461120021e7b11296d8d3))
* **worker:** retrieve-then-generate RAG via find_related — worker iter 2 ([964ac19](https://github.com/Zetesis-Labs/Huygens/commit/964ac19a8b1294a5f7ac2cecee07bd6a1563e493))


### Code Refactoring

* **worker:** drop Python commit_clarify port, call MCP over HTTP instead ([064d8f5](https://github.com/Zetesis-Labs/Huygens/commit/064d8f572c79ed5e70e94a082822e306f3f6b95c))
