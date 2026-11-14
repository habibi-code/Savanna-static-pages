"""Offline FAQ fallback provider — no network required."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

from ai.provider import AIProvider
from models import ChatMessage, Citation

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)

_OFFLINE_NOTE_EN = "⚠️ Offline mode — answers from FAQ only."
_OFFLINE_NOTE_AM = "⚠️ ከተያዘ ሁኔታ — መልሶች ከፍ ላይ ካለው FAQ ብቻ ናቸው።"

_FAQ_SEARCH_PATHS = [
    "/app/docs/offline_faq.json",
    os.path.join(os.path.dirname(__file__), "..", "..", "docs", "offline_faq.json"),
    os.path.join(os.path.dirname(__file__), "..", "docs", "offline_faq.json"),
]

_DEFAULT_FAQ: list[dict] = [
    {
        "question": "What is Savanna?",
        "answer": "Savanna is an online learning platform that connects learners with high-quality courses.",
        "source": "offline_faq",
    },
    {
        "question": "How do I enroll in a course?",
        "answer": "Browse the course catalog, click on a course, and press the Enroll button.",
        "source": "offline_faq",
    },
    {
        "question": "What languages are supported?",
        "answer": "Savanna supports English and Amharic (አማርኛ).",
        "source": "offline_faq",
    },
    {
        "question": "How do I get a certificate?",
        "answer": "Complete all required modules and assessments in a course to receive your certificate.",
        "source": "offline_faq",
    },
    {
        "question": "Who do I contact for support?",
        "answer": "For technical support, please use the in-platform chat or email support@savanna.example.com.",
        "source": "offline_faq",
    },
]


def _load_faq() -> list[dict]:
    """Load FAQ from disk, falling back to built-in defaults."""
    for path_str in _FAQ_SEARCH_PATHS:
        path = Path(path_str).resolve()
        if path.exists():
            try:
                with path.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    if isinstance(data, list):
                        logger.info("Loaded offline FAQ from %s (%d entries)", path, len(data))
                        return data
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to load FAQ from %s: %s", path, exc)
    logger.warning("No offline_faq.json found — using built-in defaults.")
    return _DEFAULT_FAQ


def _keyword_score(query: str, entry: dict) -> int:
    """Simple keyword overlap score between the query and a FAQ entry."""
    query_tokens = set(query.lower().split())
    target = (entry.get("question", "") + " " + entry.get("answer", "")).lower()
    return sum(1 for token in query_tokens if token in target)


class OfflineProvider(AIProvider):
    def __init__(self, settings: "Settings") -> None:
        self._settings = settings
        self._faq: list[dict] = _load_faq()

    @property
    def name(self) -> str:
        return "offline"

    async def chat(
        self,
        message: str,
        language: str,
        context_chunks: list[dict],
        history: list[ChatMessage],
        simple_mode: bool = False,
    ) -> tuple[str, list[Citation]]:
        note = _OFFLINE_NOTE_AM if language == "am" else _OFFLINE_NOTE_EN
        mode_prefix = ("💡 [ቀላል ሁነታ — አጭር ማብራሪያ]\n\n" if language == "am" else "💡 [Simple Mode — Plain Language]\n\n") if simple_mode else ""

        # If RAG context is provided, return the top chunk directly
        if context_chunks:
            top = context_chunks[0]
            raw_text = top['text']
            if simple_mode:
                # Keep first 2 sentences for simple mode brevity
                sentences = raw_text.split(". ")
                raw_text = ". ".join(sentences[:2]) + ("." if not sentences[0].endswith(".") else "")
            text = f"{mode_prefix}{note}\n\n{raw_text}"
            citation = Citation(
                id=top["id"],
                source=top["source"],
                excerpt=top["text"][:200],
            )
            return text, [citation]

        # Otherwise, do keyword search over the built-in FAQ
        best_entry: dict | None = None
        best_score = -1
        for entry in self._faq:
            score = _keyword_score(message, entry)
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_entry is None or best_score == 0:
            fallback_text = (
                f"{note}\n\nI don't have specific information about that in offline mode. "
                "Please try again when you're connected to the internet."
            )
            return fallback_text, []

        answer = best_entry.get("answer", "No answer available.")
        source = best_entry.get("source", "offline_faq")
        chunk_id = f"faq_{self._faq.index(best_entry)}"
        text = f"{note}\n\n{answer}"
        citation = Citation(
            id=chunk_id,
            source=source,
            excerpt=answer[:200],
        )
        return text, [citation]
