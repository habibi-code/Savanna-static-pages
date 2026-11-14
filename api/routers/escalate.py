"""
Escalation router — POST /escalate and GET /escalate/{ticket_id}

Flow:
  1. Generate a UUID4 ticket_id.
  2. Store ticket JSON in Redis with a 24-hour TTL.
  3. Send a Telegram notification to the operator channel.
  4. If an SDP offer is included (WebRTC signalling), store it and return a
     stub sdp_answer — full negotiation is handled by the widget.
  5. Return EscalateResponse.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException

from config import get_settings
from models import EscalateRequest, EscalateResponse

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# Operator Telegram chat-id (set via env var)
ESCALATION_OPERATOR_CHAT_ID: Optional[str] = os.getenv("ESCALATION_OPERATOR_CHAT_ID")


# ── Redis helper ──────────────────────────────────────────────────────────────

def _get_redis() -> Optional[aioredis.Redis]:
    try:
        return aioredis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:
        logger.warning("Redis unavailable: %s", exc)
        return None


# ── Telegram notification ─────────────────────────────────────────────────────

async def _notify_operator(ticket_id: str, body: EscalateRequest) -> bool:
    """
    Send a Telegram message to the operator chat.
    Falls back to logging if the chat_id or token is not configured.
    """
    if not ESCALATION_OPERATOR_CHAT_ID or not settings.telegram_bot_token:
        logger.info(
            "[ESCALATION] ticket=%s session=%s reason=%s",
            ticket_id,
            body.session_id,
            body.reason,
        )
        return False

    text = (
        f"🚨 *Escalation Request*\n"
        f"Ticket ID: `{ticket_id}`\n"
        f"Session: `{body.session_id}`\n"
        f"User: `{body.user_id or 'anonymous'}`\n"
        f"Reason: {body.reason or 'Not specified'}\n"
        f"WebRTC: {'Yes' if body.sdp_offer else 'No'}\n"
        f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    )

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": ESCALATION_OPERATOR_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Telegram notification failed: %s", exc)
        return False


# ── Endpoints ─────────────────────────────────────────────────────────────────

# In-memory ticket fallback when Redis is offline
_in_memory_tickets: dict[str, dict] = {}


@router.post("", response_model=EscalateResponse, summary="Escalate session to human operator")
async def escalate(body: EscalateRequest) -> EscalateResponse:
    """
    Create an escalation ticket. Optionally stores a WebRTC SDP offer for
    screen-sharing sessions (the widget completes the negotiation).
    """
    ticket_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    ticket_data = {
        "ticket_id": ticket_id,
        "session_id": body.session_id,
        "user_id": body.user_id,
        "reason": body.reason,
        "has_sdp": bool(body.sdp_offer),
        "sdp_offer": body.sdp_offer,
        "status": "open",
        "created_at": created_at,
    }

    # Always keep in memory as fallback
    _in_memory_tickets[ticket_id] = ticket_data

    # Persist to Redis
    redis = _get_redis()
    if redis:
        try:
            async with redis:
                await redis.set(
                    f"escalation:{ticket_id}",
                    json.dumps(ticket_data),
                    ex=60 * 60 * 24,  # 24-hour TTL
                )
        except Exception as exc:
            logger.warning("Could not persist escalation ticket: %s", exc)
    else:
        logger.warning("Redis unavailable — escalation ticket %s stored in-memory", ticket_id)

    # Notify operator via Telegram
    operator_notified = await _notify_operator(ticket_id, body)

    # Stub SDP answer (widget handles full WebRTC signalling)
    sdp_answer: Optional[str] = None
    if body.sdp_offer:
        sdp_answer = None  # real answer is provided by the WebRTC peer on the operator side

    return EscalateResponse(
        ticket_id=ticket_id,
        operator_notified=operator_notified,
        sdp_answer=sdp_answer,
        message=(
            f"Your request has been escalated. Ticket ID: {ticket_id}. "
            "An operator will be with you shortly."
        ),
    )


@router.get("", summary="List recent escalation tickets")
async def list_tickets(limit: int = 50) -> list[dict]:
    """Return a list of recent escalation tickets for the operator dashboard."""
    redis = _get_redis()
    tickets = []
    if redis:
        try:
            keys = await redis.keys("escalation:*")
            for key in keys:
                raw = await redis.get(key)
                if raw:
                    data = json.loads(raw)
                    data.pop("sdp_offer", None)
                    data.pop("sdp_answer", None)
                    tickets.append(data)
        except Exception as exc:
            logger.warning("Error listing escalation tickets from Redis, using fallback: %s", exc)

    if not tickets and _in_memory_tickets:
        for t in _in_memory_tickets.values():
            d = dict(t)
            d.pop("sdp_offer", None)
            d.pop("sdp_answer", None)
            tickets.append(d)

    tickets.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return tickets[:limit]


@router.get("/{ticket_id}", summary="Check escalation ticket status")
async def get_ticket(ticket_id: str) -> dict:
    """Return the current status of an escalation ticket."""
    redis = _get_redis()
    if redis:
        try:
            raw = await redis.get(f"escalation:{ticket_id}")
            if raw:
                return json.loads(raw)
        except Exception:
            pass

    if ticket_id in _in_memory_tickets:
        return _in_memory_tickets[ticket_id]

    raise HTTPException(status_code=404, detail="Ticket not found")


@router.post("/{ticket_id}/answer", summary="Operator submits SDP answer")
async def set_ticket_answer(ticket_id: str, payload: dict) -> dict:
    """Save operator's WebRTC SDP answer and mark ticket active."""
    data = None
    redis = _get_redis()
    if redis:
        try:
            raw = await redis.get(f"escalation:{ticket_id}")
            if raw:
                data = json.loads(raw)
        except Exception:
            pass

    if not data and ticket_id in _in_memory_tickets:
        data = _in_memory_tickets[ticket_id]

    if not data:
        raise HTTPException(status_code=404, detail="Ticket not found")

    data["sdp_answer"] = payload.get("sdp_answer")
    data["status"] = "in-progress"
    _in_memory_tickets[ticket_id] = data

    if redis:
        try:
            await redis.set(f"escalation:{ticket_id}", json.dumps(data), ex=60 * 60 * 24)
        except Exception:
            pass

    return {"status": "ok", "ticket_id": ticket_id}

