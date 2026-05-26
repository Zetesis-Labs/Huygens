# syntax=docker/dockerfile:1.7
#
# Build context: the repo root (not apps/mcp/), so we can copy the workspace
# manifest + lockfile and let Bun resolve the workspace member.
#
#   docker build -f apps/mcp/Dockerfile .

FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/mcp/package.json ./apps/mcp/package.json

RUN bun install --frozen-lockfile

COPY apps/mcp ./apps/mcp

# ── Runtime ───────────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime

WORKDIR /app/apps/mcp
COPY --from=builder /app /app

ENV MCP_PORT=3030
EXPOSE 3030

CMD ["bun", "src/index.ts"]
