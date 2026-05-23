FROM oven/bun:1-debian

# System dependencies. We use unversioned python3 / python3-venv because
# Debian Trixie (current base for oven/bun:1-debian) ships Python 3.13 as
# `python3` and doesn't expose `python3.12` as a package. uv only needs a
# Python ≥3.10, and our worker code declares >=3.12; 3.13 satisfies both.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    bash \
    openssl \
    docker.io \
    nodejs \
    npm \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI. Debian's docker.io ships the daemon (dockerd, docker-proxy,
# docker-init) but not the client, so we drop in the official static
# binary so we can drive the host daemon via /var/run/docker.sock.
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) dl_arch=x86_64 ;; \
      aarch64|arm64) dl_arch=aarch64 ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${dl_arch}/docker-29.5.2.tgz" \
      | tar -xz -C /usr/local/bin --strip-components=1 docker/docker; \
    docker --version; \
    # Compose v2 plugin so `docker compose ...` works against the host daemon
    case "$arch" in \
      x86_64) compose_arch=linux-x86_64 ;; \
      aarch64|arm64) compose_arch=linux-aarch64 ;; \
    esac; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.40.0/docker-compose-${compose_arch}" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; \
    docker compose version

# uv (Python package manager) — same stack as the huygens-worker container
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# Coding agents — same pattern as IronTec/nixon (official Anthropic npm pkg
# for Claude Code so we can pin/upgrade transparently) + opencode via curl.
RUN npm install -g @anthropic-ai/claude-code && \
    curl -fsSL https://opencode.ai/install | bash

WORKDIR /workspace

SHELL ["/bin/bash", "-c"]

CMD ["sleep", "infinity"]
