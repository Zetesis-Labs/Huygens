FROM oven/bun:1-debian

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    bash \
    openssl \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Coding agents (same UX as ZetesisPortal devcontainer)
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    curl -fsSL https://opencode.ai/install | bash

WORKDIR /workspace

SHELL ["/bin/bash", "-c"]

CMD ["sleep", "infinity"]
