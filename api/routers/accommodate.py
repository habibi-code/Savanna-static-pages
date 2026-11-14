"""
Accommodation router — POST /accommodate

Flow:
  1. Generate a reference number ACC-{year}-{random 4 digits}.
  2. Send a Telegram notification to the operator channel (or log if not set).
  3. Return AccommodationResponse with language-appropriate message and next_steps.
"""
from __future__ import annotations

import logging
import os
import random
import string
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter

from config import get_settings
from models import AccommodationRequest, AccommodationResponse

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

ESCALATION_OPERATOR_CHAT_ID: Optional[str] = os.getenv("ESCALATION_OPERATOR_CHAT_ID")

# ── Copy ──────────────────────────────────────────────────────────────────────

_NEXT_STEPS = {
    "en": [
        "Your request has been received",
        "An accessibility coordinator will contact you within 2 business days",
        "Please have your interview details ready",
    ],
    "am": [
        "ጥያቄዎ ተቀብሏል",
        "የተደራሽነት አስተባባሪ በ2 የሥራ ቀናት ውስጥ ያነጋግርዎታል",
        "የቃለ-ምልልሱ ዝርዝሮችዎን ዝግጁ ያድርጉ",
    ],
}

_CONFIRM_MSG = {
    "en": (
        "Thank you, {name}. Your accommodation request ({ref}) has been received. "
        "We will contact you at {email} within 2 business days."
    ),
    "am": (
        "አመሰግናለሁ፣ {name}። የተደራሽነት ጥያቄዎ ({ref}) ተቀብሏል። "
        "በ{email} በ2 የሥራ ቀናት ውስጥ እናናግርዎታለን።"
    ),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_reference() -> str:
    year = datetime.now(timezone.utc).year
    digits = "".join(random.choices(string.digits, k=4))
    return f"ACC-{year}-{digits}"


async def _notify_operator(ref: str, body: AccommodationRequest) -> None:
    """
    Send a Telegram message to the operator, or log if not configured.
    """
    if not ESCALATION_OPERATOR_CHAT_ID or not settings.telegram_bot_token:
        logger.info(
            "[ACCOMMODATION] ref=%s name=%s email=%s type=%s",
            ref,
            body.name,
            body.email,
            body.accommodation_type,
        )
        return

    text = (
        f"♿ *Accommodation Request*\n"
        f"Ref: `{ref}`\n"
        f"Name: {body.name}\n"
        f"Email: {body.email}\n"
        f"Phone: {body.phone or 'N/A'}\n"
        f"Type: {body.accommodation_type}\n"
        f"Interview Date: {body.interview_date or 'Not specified'}\n"
        f"Notes: {body.notes or 'None'}\n"
        f"Language: {body.language.upper()}\n"
        f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    )

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json={
                    "chat_id": ESCALATION_OPERATOR_CHAT_ID,
                    "text": text,
                    "parse_mode": "Markdown",
                },
            )
            resp.raise_for_status()
    except Exception as exc:
        logger.error("Telegram notification for accommodation failed: %s", exc)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=AccommodationResponse,
    summary="Submit an accessibility / accommodation request",
)
async def accommodate(body: AccommodationRequest) -> AccommodationResponse:
    """
    Record an accommodation request and notify the accessibility coordinator.
    Responds in the requested language (EN or AM).
    """
    lang = body.language if body.language in ("en", "am") else "en"
    ref = _generate_reference()

    await _notify_operator(ref, body)

    message = _CONFIRM_MSG[lang].format(name=body.name, ref=ref, email=body.email)
    next_steps = _NEXT_STEPS[lang]

    return AccommodationResponse(reference=ref, message=message, next_steps=next_steps)
