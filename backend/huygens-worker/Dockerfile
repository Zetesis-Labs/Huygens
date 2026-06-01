# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=ghcr.io/astral-sh/uv:python3.12-bookworm-slim

FROM ${BASE_IMAGE} AS builder

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml README.md ./
COPY huygens_worker ./huygens_worker

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app
COPY --from=builder /app /app
ENV PATH=/app/.venv/bin:$PATH

RUN useradd -u 65532 -ms /bin/bash app
USER app

# AG-UI endpoint (POST /agui). Exposed for the internal network; the dashboard
# SSR proxies to it. Not published to the host (see docker-compose).
EXPOSE 7777

CMD ["python", "-m", "huygens_worker"]
