"""
Teacher Analytics router — GET /teacher/analytics and GET /teacher/export

Privacy-Preserving Instructor View:
- Tracks learner questions completely anonymously (NO names, NO learner IDs, NO IPs).
- Aggregates questions by topic and frequency.
- Supports Ethiopian Calendar timestamps.
"""
from __future__ import annotations

import csv
import io
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from utils.ethiopian_calendar import gregorian_to_ethiopian

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Seeded initial questions for instructor demonstration ─────────────────────

_ANONYMOUS_LOG: list[dict] = [
    {
        "question": "What is the graduation threshold for WR 100?",
        "topic": "Grading & Certification",
        "language": "en",
        "timestamp": "2026-11-14T08:15:00Z",
    },
    {
        "question": "What is the graduation threshold for WR 100?",
        "topic": "Grading & Certification",
        "language": "en",
        "timestamp": "2026-11-14T08:45:00Z",
    },
    {
        "question": "ለምረቃ አስፈላጊው ደረጃ ስንት ነው?",
        "topic": "Grading & Certification",
        "language": "am",
        "timestamp": "2026-11-14T09:10:00Z",
    },
    {
        "question": "What is effective communication?",
        "topic": "Course Fundamentals",
        "language": "en",
        "timestamp": "2026-11-14T09:20:00Z",
    },
    {
        "question": "How do I request sign language accommodation for an interview?",
        "topic": "Career & Accommodations",
        "language": "en",
        "timestamp": "2026-11-14T09:35:00Z",
    },
    {
        "question": "የቃለ-ምልልስ ማስተካከያ እንዴት መጠየቅ እችላለሁ?",
        "topic": "Career & Accommodations",
        "language": "am",
        "timestamp": "2026-11-14T09:50:00Z",
    },
    {
        "question": "Are there remote entry-level jobs available?",
        "topic": "Career & Jobs",
        "language": "en",
        "timestamp": "2026-11-14T10:05:00Z",
    },
    {
        "question": "How do I share my screen with a human tutor?",
        "topic": "Live Help & Support",
        "language": "en",
        "timestamp": "2026-11-14T10:15:00Z",
    },
]


def _categorize_topic(question: str) -> str:
    """Classify question into a pedagogical category without collecting PII."""
    q = question.lower()
    if any(k in q for k in ["job", "career", "salary", "work", "apply", "ስራ"]):
        return "Career & Jobs"
    if any(k in q for k in ["accommodat", "screen reader", "interpreter", "blind", "deaf", "ማስተካከያ"]):
        return "Career & Accommodations"
    if any(k in q for k in ["threshold", "grade", "certificate", "pass", "70%", "ምረቃ"]):
        return "Grading & Certification"
    if any(k in q for k in ["help", "operator", "human", "screen", "stuck", "እርዳታ"]):
        return "Live Help & Support"
    return "Course Fundamentals"


def record_question(question: str, language: str) -> None:
    """Record an incoming question anonymously (NO user info)."""
    clean_q = question.strip()
    if not clean_q or len(clean_q) < 3:
        return
    topic = _categorize_topic(clean_q)
    now = datetime.now(timezone.utc)
    _ANONYMOUS_LOG.append({
        "question": clean_q,
        "topic": topic,
        "language": language,
        "timestamp": now.isoformat(),
    })
    # Keep rolling max 500 entries
    if len(_ANONYMOUS_LOG) > 500:
        _ANONYMOUS_LOG.pop(0)


# ── Schemas ───────────────────────────────────────────────────────────────────

class TopicCount(BaseModel):
    topic: str
    count: int
    percentage: float


class FrequentQuestion(BaseModel):
    question: str
    topic: str
    language: str
    count: int


class RecentQuestion(BaseModel):
    question: str
    topic: str
    language: str
    timestamp: str
    ethiopian_date: str


class TeacherAnalyticsResponse(BaseModel):
    total_questions: int
    languages_breakdown: dict[str, int]
    topics: list[TopicCount]
    most_asked: list[FrequentQuestion]
    recent: list[RecentQuestion]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/analytics", response_model=TeacherAnalyticsResponse, summary="Get anonymous teacher analytics")
async def get_analytics() -> TeacherAnalyticsResponse:
    """Return aggregated questions, top topics, and frequency without student identities."""
    total = len(_ANONYMOUS_LOG)
    if total == 0:
        return TeacherAnalyticsResponse(
            total_questions=0,
            languages_breakdown={},
            topics=[],
            most_asked=[],
            recent=[],
        )

    # 1. Topic breakdown
    topic_counter = Counter(entry["topic"] for entry in _ANONYMOUS_LOG)
    topics = [
        TopicCount(
            topic=t,
            count=c,
            percentage=round((c / total) * 100, 1),
        )
        for t, c in topic_counter.most_common()
    ]

    # 2. Languages
    lang_counter = Counter(entry["language"] for entry in _ANONYMOUS_LOG)

    # 3. Most asked questions
    q_counter = Counter(entry["question"] for entry in _ANONYMOUS_LOG)
    most_asked = []
    seen = set()
    for q_text, count in q_counter.most_common(10):
        if q_text not in seen:
            seen.add(q_text)
            sample = next(e for e in _ANONYMOUS_LOG if e["question"] == q_text)
            most_asked.append(FrequentQuestion(
                question=q_text,
                topic=sample["topic"],
                language=sample["language"],
                count=count,
            ))

    # 4. Recent questions with Ethiopian Calendar dates
    recent = []
    for item in reversed(_ANONYMOUS_LOG[-15:]):
        try:
            dt = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now()
        eth = gregorian_to_ethiopian(dt)
        eth_str = eth.format_am() if item["language"] == "am" else eth.format_en()
        recent.append(RecentQuestion(
            question=item["question"],
            topic=item["topic"],
            language=item["language"],
            timestamp=item["timestamp"],
            ethiopian_date=eth_str,
        ))

    return TeacherAnalyticsResponse(
        total_questions=total,
        languages_breakdown=dict(lang_counter),
        topics=topics,
        most_asked=most_asked,
        recent=recent,
    )


@router.get("/export", summary="Export anonymous questions to CSV")
async def export_csv() -> PlainTextResponse:
    """Download anonymous question dataset in CSV format."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Question", "Topic", "Language", "Timestamp_UTC", "Ethiopian_Date"])
    for item in _ANONYMOUS_LOG:
        try:
            dt = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now()
        eth = gregorian_to_ethiopian(dt)
        eth_str = eth.format_am() if item["language"] == "am" else eth.format_en()
        writer.writerow([item["question"], item["topic"], item["language"], item["timestamp"], eth_str])
    return PlainTextResponse(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=anonymous_teacher_questions.csv"},
    )
