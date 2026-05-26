# Changelog

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
