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

# D2 diagram toolchain for get_proposal_changes(format_d2): `d2` renders the
# change graph to SVG; `rsvg-convert` (librsvg) → PNG with good embedded-font
# fidelity; ImageMagick `convert` → JPEG. All run inside this container.
# d2 is fetched as a prebuilt release binary (the install.sh path needs `make`).
ARG D2_VERSION=0.7.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates librsvg2-bin imagemagick \
  && arch="$(dpkg --print-architecture)" \
  && curl -fsSL "https://github.com/terrastruct/d2/releases/download/v${D2_VERSION}/d2-v${D2_VERSION}-linux-${arch}.tar.gz" -o /tmp/d2.tar.gz \
  && tar -xzf /tmp/d2.tar.gz -C /tmp \
  && cp "/tmp/d2-v${D2_VERSION}/bin/d2" /usr/local/bin/d2 \
  && chmod +x /usr/local/bin/d2 \
  && rm -rf /tmp/d2.tar.gz "/tmp/d2-v${D2_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/mcp
COPY --from=builder /app /app

ENV MCP_PORT=3030
EXPOSE 3030

CMD ["bun", "src/index.ts"]
