"""Application settings — loaded from environment / .env file."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # AI
    ai_provider: str = "openai"          # openai | ollama | offline
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Telegram
    telegram_bot_token: str = ""

    # SMS / Africa's Talking
    at_username: str = "sandbox"
    at_api_key: str = ""
    at_sender_id: str = "SAVANNA"
    at_shortcode: str = "12345"

    # App
    secret_key: str = "change-me"
    api_base_url: str = "http://localhost:8000"
    widget_origin: str = "*"

    # LTI
    lti_tool_private_key_path: str = "/app/lti_private.pem"
    lti_tool_public_key_path: str = "/app/lti_public.pem"

    # Storage
    redis_url: str = "redis://localhost:6379"
    chroma_path: str = "./chroma_data"
    docs_path: str = "./docs"

    # Escalation
    escalation_webhook_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
