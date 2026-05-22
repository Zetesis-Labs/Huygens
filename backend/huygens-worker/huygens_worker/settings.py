from pydantic_settings import BaseSettings, SettingsConfigDict

from .domain import Actor


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    worker_enabled: bool = False
    actor: Actor = "worker"

    mcp_url: str = "http://huygens-mcp:3030/mcp"


settings = Settings()
