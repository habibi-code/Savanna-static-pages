"""Pydantic request / response schemas shared across all routers."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ─── Chat ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    language: Literal["en", "am"] = "en"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4096)
    language: Literal["en", "am"] = "en"
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    simple_mode: bool = Field(default=False, description="Plain-language simple mode for cognitive accessibility")


class Citation(BaseModel):
    id: str
    source: str
    excerpt: str
    url: Optional[str] = None


class ChatResponse(BaseModel):
    id: str
    text: str
    language: Literal["en", "am"]
    citations: list[Citation] = []
    provider: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ethiopian_date: Optional[str] = None


# ─── Escalation ──────────────────────────────────────────────────────────────

class EscalateRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    reason: Optional[str] = None
    sdp_offer: Optional[str] = None      # WebRTC SDP offer for screen share


class EscalateResponse(BaseModel):
    ticket_id: str
    operator_notified: bool
    sdp_answer: Optional[str] = None
    message: str


# ─── Jobs ─────────────────────────────────────────────────────────────────────

class Job(BaseModel):
    id: str
    title: str
    company: str
    location: str
    type: str                             # full-time | part-time | contract | remote
    description: str
    skills: list[str] = []
    posted_at: datetime
    url: Optional[str] = None


class JobAlertRequest(BaseModel):
    user_id: str
    channel: Literal["telegram", "sms", "both"] = "both"
    contact: str                          # Telegram chat_id or phone number
    keywords: list[str] = []
    language: Literal["en", "am"] = "en"


class JobAlertResponse(BaseModel):
    subscription_id: str
    message: str


# ─── Accommodation ───────────────────────────────────────────────────────────

class AccommodationRequest(BaseModel):
    user_id: Optional[str] = None
    name: str
    email: str
    phone: Optional[str] = None
    accommodation_type: str = Field(
        ...,
        description="e.g. extra time, screen reader, sign language interpreter"
    )
    interview_date: Optional[str] = None
    notes: Optional[str] = None
    language: Literal["en", "am"] = "en"


class AccommodationResponse(BaseModel):
    reference: str
    message: str
    next_steps: list[str] = []
    ethiopian_date: Optional[str] = None


# ─── SMS webhook ─────────────────────────────────────────────────────────────

class SMSInbound(BaseModel):
    from_: str = Field(alias="from")
    to: str
    text: str
    date: Optional[str] = None
    id: Optional[str] = None

    model_config = {"populate_by_name": True}


# ─── Health ──────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    ai_provider: str
