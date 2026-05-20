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
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# uv (Python package manager) — same stack as the huygens-worker container
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# Coding agents (same UX as ZetesisPortal devcontainer)
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    curl -fsSL https://opencode.ai/install | bash

WORKDIR /workspace

SHELL ["/bin/bash", "-c"]

CMD ["sleep", "infinity"]
