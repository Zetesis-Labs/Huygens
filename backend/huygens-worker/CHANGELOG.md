# Changelog

## [0.3.1](https://github.com/Zetesis-Labs/Huygens/compare/worker-v0.3.0...worker-v0.3.1) (2026-06-09)


### Features

* **dashboard:** Bitácora day/week entries and ritual nudge banners ([8661731](https://github.com/Zetesis-Labs/Huygens/commit/8661731a6905f3dafb321d050be4642fa0dd60c7))
* **mcp:** coaching/pedagogical layer — teach ZTD, activate the dormant habit ([a3a0159](https://github.com/Zetesis-Labs/Huygens/commit/a3a015951dfad532548680544f07ab8c3fb4d603))
* **worker:** anchor the dashboard agent on the operating doctrine ([4ac0dc2](https://github.com/Zetesis-Labs/Huygens/commit/4ac0dc271d97de26eb1dc9ca5d447aba71f155d5))
* **worker:** fail fast when the MCP doctrine cannot be fetched ([66f1eb1](https://github.com/Zetesis-Labs/Huygens/commit/66f1eb12e6def6a997aa5d91abdda085e95fd926))


### Bug Fixes

* **worker:** revertir gpt-5.5 (el audit lo marcó irreal por error) y alinear README ([d8e61ca](https://github.com/Zetesis-Labs/Huygens/commit/d8e61ca94c8b39b2b692df77313a947cc8c0fde9))


### Continuous Integration

* **worker:** gate the Python worker on lint, types and tests ([ebd748f](https://github.com/Zetesis-Labs/Huygens/commit/ebd748f595ef1ec790f669671bc9936b81788570))

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
