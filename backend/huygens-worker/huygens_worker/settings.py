from pydantic_settings import BaseSettings, SettingsConfigDict

from .domain import Actor


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    worker_enabled: bool = False
    actor: Actor = "worker"

    mcp_url: str = "http://huygens-mcp:3030/mcp"

    # The agent's doctrine (operating-doctrine + cookbook + live schema) is
    # fetched from the MCP at startup. By default the worker refuses to start
    # without it: an agent running on the hardcoded summary alone is missing
    # rules (DOCT-004, docs/issues/2026-06-09). Set to true to allow a
    # degraded start (logged as an error).
    allow_degraded_doctrine: bool = False

    # AG-UI agent (dashboard chat). The agent talks to the graph through the MCP
    # tools at `mcp_url`; it never commits — that stays a human action in the UI.
    openai_api_key: str = ""
    # gpt-5.x is served via OpenAI's Responses API (see agent.py → OpenAIResponses).
    openai_model: str = "gpt-5.5"
    agui_host: str = "0.0.0.0"  # noqa: S104 — container binds all interfaces by design
    agui_port: int = 7777


settings = Settings()
