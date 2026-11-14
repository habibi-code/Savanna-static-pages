"""
SMS webhook router

POST /webhook/sms            — Africa's Talking inbound SMS webhook
POST /webhook/sms/delivery   — delivery report handler (log + 200)

Routing logic:
  • Starts with JOB / KAZI → return a job listing summary (≤160 chars/SMS)
  • Anything else → pass to chat logic, reply truncated to 160 chars

Helpers:
  truncate_sms(text, page=1) — paginate into 155-char chunks with "(1/N)" prefix
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, Form, Request, Response

from config import get_settings
from models import SMSInbound

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# ── SMS helpers ───────────────────────────────────────────────────────────────

SMS_MAX = 160
SMS_PAGE_CONTENT = 155  # leaves room for "(1/N)" prefix


def truncate_sms(text: str, page: int = 1) -> str:
    """
    Split *text* into 155-char chunks and return the chunk at *page* (1-based).
    Prepends a "(page/total)" indicator, e.g. "(1/3)".
    """
    # Split into chunks of SMS_PAGE_CONTENT chars
    chunks = [text[i: i + SMS_PAGE_CONTENT] for i in range(0, len(text), SMS_PAGE_CONTENT)]
    if not chunks:
        return ""
    total = len(chunks)
    idx = max(0, min(page - 1, total - 1))
    return f"({idx + 1}/{total}){chunks[idx]}"


_STRIP_PREFIXES = re.compile(
    r"^(HELP|JOB|KAZI|CHAT|HABARI|INFO|MSAADA|START|STOP|YES|NO)\s*",
    re.IGNORECASE,
)


def _strip_prefix(text: str) -> tuple[str, Optional[str]]:
    """
    Returns (stripped_text, prefix_upper_or_None).
    """
    m = _STRIP_PREFIXES.match(text.strip())
    if m:
        prefix = m.group(1).upper()
        return text[m.end():].strip(), prefix
    return text.strip(), None


def _job_summary() -> str:
    """Return a compact job listing that fits in one SMS."""
    import json
    from pathlib import Path

    jobs_path = Path(__file__).parent.parent.parent / "docs" / "jobs" / "jobs.json"
    try:
        with open(jobs_path, "r", encoding="utf-8") as fh:
            jobs = json.load(fh)
    except Exception:
        return "No jobs available. Visit our website for more info."

    # Sort newest first, take top 3
    jobs_sorted = sorted(jobs, key=lambda j: j.get("posted_at", ""), reverse=True)[:3]
    lines = ["JOBS:"]
    for j in jobs_sorted:
        line = f"{j.get('title', 'Role')} @ {j.get('company', 'Co')} ({j.get('type', '')})"
        lines.append(line[:50])  # keep each line short

    lines.append("Reply HELP for support.")
    summary = " | ".join(lines)
    return summary[:SMS_MAX]


# ── Language detection ────────────────────────────────────────────────────────

def _detect_language(text: str) -> str:
    try:
        from langdetect import detect, LangDetectException
        code = detect(text)
        return "am" if code == "am" else "en"
    except Exception:
        return "en"


# ── Chat via API logic (reuses chat router logic directly) ───────────────────

async def _chat_reply(text: str, language: str) -> str:
    """Run the chat pipeline and return a truncated SMS reply."""
    import asyncio

    # RAG retrieval
    try:
        from rag.retriever import retrieve
        chunks: list[dict] = await retrieve(text, language, n_results=3)
    except Exception:
        chunks = []

    # AI response
    try:
        from ai.factory import get_provider
        provider = get_provider()
        reply_tuple = await provider.chat(
            text,
            language,
            chunks,
            [],
        )
        reply = reply_tuple[0] if isinstance(reply_tuple, tuple) else str(reply_tuple)
    except Exception as exc:
        logger.error("AI provider error in SMS handler: %s", exc)
        reply = (
            "Sorry, I could not answer right now. Try again later."
            if language == "en"
            else "ይቅርታ፣ ምላሽ አልሰጠሁም። ቆይተው ይሞክሩ።"
        )

    # Truncate to one SMS
    return truncate_sms(reply, page=1)


# ── Send reply via Africa's Talking ──────────────────────────────────────────

async def _send_sms_reply(to: str, message: str) -> None:
    """Fire-and-forget: send reply via the AT SMS helper."""
    try:
        from channels.sms_handler import send_sms
        success = await send_sms(to, message, settings)
        if not success:
            logger.warning("SMS reply to %s failed", to)
    except Exception as exc:
        logger.error("SMS send error: %s", exc)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sms", summary="Africa's Talking inbound SMS webhook")
async def sms_inbound(request: Request):
    """
    Receive an inbound SMS from Africa's Talking and reply appropriately.

    AT sends the payload as application/x-www-form-urlencoded with fields:
      from, to, text, date, id, linkId, networkCode
    """
    form = await request.form()
    raw = {
        "from": form.get("from", ""),
        "to": form.get("to", ""),
        "text": form.get("text", ""),
        "date": form.get("date"),
        "id": form.get("id"),
    }

    try:
        inbound = SMSInbound.model_validate(raw)
    except Exception as exc:
        logger.error("Could not parse SMS inbound: %s — raw=%s", exc, raw)
        return Response(content="OK", media_type="text/plain")

    logger.info("SMS from %s: %s", inbound.from_, inbound.text)

    language = _detect_language(inbound.text)
    stripped, prefix = _strip_prefix(inbound.text)

    # Route based on keyword prefix
    if prefix in ("JOB", "KAZI"):
        reply = _job_summary()
    else:
        reply = await _chat_reply(stripped or inbound.text, language)

    # Send the reply
    await _send_sms_reply(inbound.from_, reply)

    # AT expects a plain-text 200 response
    return Response(content="OK", media_type="text/plain")


@router.post("/sms/delivery", summary="Africa's Talking SMS delivery report")
async def sms_delivery(request: Request):
    """
    Receive delivery status reports from Africa's Talking.
    We log the payload and always return 200 OK as AT expects.
    """
    form = await request.form()
    logger.info(
        "SMS delivery report: id=%s status=%s network=%s",
        form.get("id"),
        form.get("status"),
        form.get("networkCode"),
    )
    return Response(content="OK", media_type="text/plain")
