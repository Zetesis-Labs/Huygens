# Changelog

## [0.3.0](https://github.com/Zetesis-Labs/Huygens/compare/worker-v0.2.0...worker-v0.3.0) (2026-05-26)


### ⚠ BREAKING CHANGES

* **mcp:** replace surrealmcp proxy with native query_query

### Features

* **mcp:** replace surrealmcp proxy with native query_query ([d9e2376](https://github.com/Zetesis-Labs/Huygens/commit/d9e2376cc2b0504efa6ddf85c0c89414c264aad5))


### Documentation

* align all documentation with v2 report-centered model ([aea2c58](https://github.com/Zetesis-Labs/Huygens/commit/aea2c58eb85cfdaf0b2de7a402a29f9331b67e76))

## [0.2.0](https://github.com/Zetesis-Labs/Huygens/compare/worker-v0.1.0...worker-v0.2.0) (2026-05-21)


### ⚠ BREAKING CHANGES

* **worker:** drop Python commit_clarify port, call MCP over HTTP instead

### Features

* **mcp:** self-describing layer — LORE resources + canonical prompts ([cbb17ec](https://github.com/Zetesis-Labs/Huygens/commit/cbb17ece973f46d401a50b6fafbc67ca80677588))
* **worker:** add huygens-worker iteration 0 — Python service watching the inbox ([ca5f843](https://github.com/Zetesis-Labs/Huygens/commit/ca5f843cec16ae1558d1a257b3bb930c2035095b))
* **worker:** auto-embed blocks after commit + USING.md ([44ff63e](https://github.com/Zetesis-Labs/Huygens/commit/44ff63e2fa7beeda3ba8f08219f80e4b33ca1258))
* **worker:** iter 1 — autonomous clarify via Agno + OpenAI gpt-4o-mini ([74046fa](https://github.com/Zetesis-Labs/Huygens/commit/74046fadb6b2c0b620a461120021e7b11296d8d3))
* **worker:** retrieve-then-generate RAG via find_related — worker iter 2 ([964ac19](https://github.com/Zetesis-Labs/Huygens/commit/964ac19a8b1294a5f7ac2cecee07bd6a1563e493))


### Code Refactoring

* **worker:** drop Python commit_clarify port, call MCP over HTTP instead ([064d8f5](https://github.com/Zetesis-Labs/Huygens/commit/064d8f572c79ed5e70e94a082822e306f3f6b95c))
