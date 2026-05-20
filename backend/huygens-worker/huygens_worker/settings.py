from pydantic_settings import BaseSettings, SettingsConfigDict

from .domain import Actor


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    surreal_url: str = "ws://surrealdb:8000/rpc"
    surreal_ns: str = "huygens"
    surreal_db: str = "main"
    surreal_user: str = "root"
    surreal_pass: str = "root"  # noqa: S105 — dev default; real value comes from env

    poll_interval_seconds: float = 2.0
    actor: Actor = "worker"

    openai_api_key: str = ""
    clarify_model: str = "gpt-4o-mini"


settings = Settings()
