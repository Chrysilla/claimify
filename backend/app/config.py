from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Claimify API"
    database_url: str = "sqlite:///./claimify.db"
    frontend_origin: str = "http://localhost:3000"
    use_mock_ai: bool = True
    ai_provider: str = "mock"
    ai_model: str = ""
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
