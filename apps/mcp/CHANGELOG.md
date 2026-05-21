# Changelog

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
