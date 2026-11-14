"""Factory for selecting the active AI provider from configuration."""
from config import get_settings
from ai.provider import AIProvider


def get_provider() -> AIProvider:
    """Return the configured AI provider instance."""
    settings = get_settings()
    if settings.ai_provider == "ollama":
        from ai.ollama_provider import OllamaProvider  # noqa: PLC0415
        return OllamaProvider(settings)
    elif settings.ai_provider == "offline":
        from ai.offline_provider import OfflineProvider  # noqa: PLC0415
        return OfflineProvider(settings)
    else:  # default: openai
        from ai.openai_provider import OpenAIProvider  # noqa: PLC0415
        return OpenAIProvider(settings)
