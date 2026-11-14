"""Ollama-backed AI provider using httpx.AsyncClient."""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

import httpx

from ai.provider import AIProvider
from models import ChatMessage, Citation

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_EN = (
    "You are a helpful learning assistant for Savanna, an online learning platform. "
    "Answer ONLY from the provided course content. "
    "If the answer is not in the provided content, say so clearly. "
    "Always cite your sources using [source_id] notation. "
    "Do not make up information."
)

_SYSTEM_PROMPT_AM = (
    "እርስዎ ለሳቫና የመስመር ላይ ትምህርት መድረክ አጋዥ የትምህርት ረዳት ነዎት። "
    "ከቀረበው የኮርስ ይዘት ብቻ ይመልሱ። "
    "መልሱ ካልተገኘ ግልጽ ያድርጉ። "
    "ምንጮቹን ሁልጊዜ ጠቅሰው [source_id] ምልክት ይጠቀሙ።"
)

_CITATION_RE = re.compile(r"\[([^\]]+)\]")


def _build_context_block(context_chunks: list[dict]) -> str:
    if not context_chunks:
        return "No additional context available."
    lines = ["=== Provided course content ==="]
    for chunk in context_chunks:
        lines.append(f"[{chunk['id']}] (source: {chunk['source']})\n{chunk['text']}")
        lines.append("---")
    return "\n".join(lines)


def _extract_citations(
    response_text: str, context_chunks: list[dict]
) -> list[Citation]:
    chunk_map = {c["id"]: c for c in context_chunks}
    seen: set[str] = set()
    citations: list[Citation] = []
    for match in _CITATION_RE.finditer(response_text):
        ref = match.group(1)
        if ref in chunk_map and ref not in seen:
            seen.add(ref)
            c = chunk_map[ref]
            citations.append(
                Citation(
                    id=ref,
                    source=c["source"],
                    excerpt=c["text"][:200],
                )
            )
    return citations


def _build_ollama_messages(
    message: str,
    language: str,
    context_chunks: list[dict],
    history: list[ChatMessage],
) -> list[dict]:
    system_prompt = _SYSTEM_PROMPT_AM if language == "am" else _SYSTEM_PROMPT_EN
    context_block = _build_context_block(context_chunks)

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Here is the relevant content to answer from:\n\n{context_block}",
        },
        {
            "role": "assistant",
            "content": "Understood. I will answer only from the provided content.",
        },
    ]

    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": message})
    return messages


class OllamaProvider(AIProvider):
    def __init__(self, settings: "Settings") -> None:
        self._settings = settings

    @property
    def name(self) -> str:
        return "ollama"

    async def chat(
        self,
        message: str,
        language: str,
        context_chunks: list[dict],
        history: list[ChatMessage],
    ) -> tuple[str, list[Citation]]:
        messages = _build_ollama_messages(message, language, context_chunks, history)
        payload = {
            "model": self._settings.ollama_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        url = f"{self._settings.ollama_base_url.rstrip('/')}/api/chat"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                text: str = data.get("message", {}).get("content", "")
                citations = _extract_citations(text, context_chunks)
                return text, citations

        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            logger.warning(
                "Ollama unreachable at %s, falling back to offline: %s", url, exc
            )
            # Lazy import to avoid circular dependency
            from ai.offline_provider import OfflineProvider  # noqa: PLC0415

            offline = OfflineProvider(self._settings)
            return await offline.chat(message, language, context_chunks, history)

        except httpx.HTTPStatusError as exc:
            logger.error("Ollama HTTP error %s: %s", exc.response.status_code, exc)
            return (
                f"⚠️ Ollama returned an error ({exc.response.status_code}). "
                "Please check that the model is loaded.",
                [],
            )

        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected Ollama error: %s", exc)
            return f"⚠️ An unexpected error occurred: {exc}", []
