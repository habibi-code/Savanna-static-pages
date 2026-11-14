"""Abstract base class for AI providers."""
from abc import ABC, abstractmethod

from models import ChatMessage, Citation


class AIProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        message: str,
        language: str,  # "en" or "am"
        context_chunks: list[dict],  # RAG results: {"id", "text", "source"}
        history: list[ChatMessage],
    ) -> tuple[str, list[Citation]]:
        """Return (response_text, citations)."""

    @property
    @abstractmethod
    def name(self) -> str: ...
