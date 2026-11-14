"""
Chat router — POST /chat and GET /chat/history/{session_id}

Flow:
  1. Auto-detect language if not provided (langdetect).
  2. Retrieve relevant context chunks from RAG.
  3. Call AI provider with message + context + history.
  4. Persist the exchange to Redis (key: chat:{session_id}).
  5. Return ChatResponse with citations.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Request
from langdetect import detect, LangDetectException

from config import get_settings
from models import ChatRequest, ChatResponse, ChatMessage, Citation
from routers.teacher import record_question
from utils.ethiopian_calendar import gregorian_to_ethiopian

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# ── Redis helper ──────────────────────────────────────────────────────────────

def _get_redis() -> Optional[aioredis.Redis]:
    """Return a lazy Redis client, or None if unavailable."""
    try:
        return aioredis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:
        logger.warning("Redis unavailable: %s", exc)
        return None


# ── Language detection ────────────────────────────────────────────────────────

def _detect_language(text: str) -> str:
    """Return 'am' or 'en'; falls back to 'en' on failure."""
    try:
        code = detect(text)
        # langdetect uses 'am' for Amharic
        return "am" if code == "am" else "en"
    except LangDetectException:
        return "en"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse, summary="Send a chat message")
async def chat(body: ChatRequest) -> ChatResponse:
    """
    Accept a chat message, run RAG retrieval, call the AI provider,
    and return a structured response with citations.

    A 500 ms timeout guard wraps the AI call; if it fires we return a
    graceful error response rather than hanging the client.
    """
    # 1. Language detection
    language = body.language
    if not language or language not in ("en", "am"):
        language = _detect_language(body.message)

    # Record question anonymously for instructor analytics (NO user info)
    record_question(body.message, language)

    # Ethiopian calendar calculation for response timestamp
    eth_date = gregorian_to_ethiopian(datetime.now())
    eth_str = eth_date.format_am() if language == "am" else eth_date.format_en()

    # 2. RAG retrieval
    try:
        from rag.retriever import retrieve
        chunks: list[dict] = await retrieve(body.message, language, n_results=5)
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        chunks = []

    # 3. Build citations from chunks
    citations: list[Citation] = [
        Citation(
            id=c.get("id", str(uuid.uuid4())),
            source=c.get("source", "unknown"),
            excerpt=c.get("text", "")[:200],
            url=c.get("url"),
        )
        for c in chunks
    ]

    # 4. Call AI provider (with 30-second timeout guard)
    response_id = str(uuid.uuid4())
    provider_name = settings.ai_provider

    try:
        from ai.factory import get_provider
        provider = get_provider()
        provider_name = getattr(provider, "name", type(provider).__name__)

        reply_text, ai_citations = await asyncio.wait_for(
            provider.chat(
                body.message,
                language,
                chunks,
                body.history,
                simple_mode=body.simple_mode,
            ),
            timeout=30.0,
        )
        if ai_citations:
            citations = ai_citations
    except asyncio.TimeoutError:
        reply_text = (
            "I'm taking longer than expected. Please try again in a moment."
            if language == "en"
            else "ትንሽ ጊዜ ወስዷል። እባክዎ እንደገና ይሞክሩ።"
        )
        logger.warning("AI provider timed out for session %s", body.session_id)
    except Exception as exc:
        logger.error("AI provider error: %s", exc)
        reply_text = (
            "An error occurred while generating a response. Please try again."
            if language == "en"
            else "ምላሽ ሲፈጥር ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።"
        )

    response = ChatResponse(
        id=response_id,
        text=reply_text,
        language=language,
        citations=citations,
        provider=provider_name,
        timestamp=datetime.now(timezone.utc),
        ethiopian_date=eth_str,
    )

    # 5. Persist to Redis
    if body.session_id:
        redis = _get_redis()
        if redis:
            try:
                key = f"chat:{body.session_id}"
                # Append user message + assistant reply to history list
                async with redis:
                    for msg in [
                        ChatMessage(role="user", content=body.message, language=language),
                        ChatMessage(role="assistant", content=reply_text, language=language),
                    ]:
                        await redis.rpush(key, msg.model_dump_json())
                    await redis.expire(key, 60 * 60 * 24)  # 24-hour TTL
            except Exception as exc:
                logger.warning("Could not persist chat history: %s", exc)

    return response


@router.get(
    "/history/{session_id}",
    summary="Retrieve chat history for a session",
    response_model=list[ChatMessage],
)
async def get_history(session_id: str) -> list[ChatMessage]:
    """
    Return the stored message history for *session_id*.
    Returns an empty list if Redis is unavailable or the key does not exist.
    """
    redis = _get_redis()
    if not redis:
        return []
    try:
        async with redis:
            raw_messages: list[str] = await redis.lrange(f"chat:{session_id}", 0, -1)
        return [ChatMessage.model_validate_json(m) for m in raw_messages]
    except Exception as exc:
        logger.warning("Could not retrieve chat history: %s", exc)
        return []
