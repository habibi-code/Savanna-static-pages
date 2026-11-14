"""
Jobs router

GET  /jobs                  — list all jobs (optional ?keyword=&?type= filters)
GET  /jobs/{job_id}         — single job detail
POST /job-alert             — subscribe to job alerts (stored in Redis)
POST /jobs/{job_id}/answer  — RAG-powered Q&A about a specific job
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query

from config import get_settings
from models import Job, JobAlertRequest, JobAlertResponse, ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# Path to the jobs data file (relative to the api/ directory)
_JOBS_PATH = Path(__file__).parent.parent.parent / "docs" / "jobs" / "jobs.json"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_jobs() -> list[dict]:
    """Load and return the raw jobs list from disk."""
    try:
        with open(_JOBS_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        logger.error("jobs.json not found at %s", _JOBS_PATH)
        return []
    except json.JSONDecodeError as exc:
        logger.error("jobs.json is malformed: %s", exc)
        return []


def _get_redis() -> Optional[aioredis.Redis]:
    try:
        return aioredis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:
        logger.warning("Redis unavailable: %s", exc)
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[Job], summary="List all available jobs")
async def list_jobs(
    keyword: Optional[str] = Query(None, description="Filter by keyword in title, description, or skills"),
    type: Optional[str] = Query(None, description="Filter by job type (full-time, part-time, contract, remote)"),
) -> list[Job]:
    """
    Return all jobs from jobs.json.  Supports optional `keyword` and `type`
    query-string filters.  Keyword matching is case-insensitive and checks the
    job title, description, and skills list.
    """
    raw_jobs = _load_jobs()
    jobs: list[Job] = []
    for raw in raw_jobs:
        try:
            jobs.append(Job.model_validate(raw))
        except Exception as exc:
            logger.warning("Skipping malformed job entry: %s", exc)

    # Apply keyword filter
    if keyword:
        kw = keyword.lower()
        jobs = [
            j for j in jobs
            if kw in j.title.lower()
            or kw in j.description.lower()
            or any(kw in s.lower() for s in j.skills)
            or kw in j.company.lower()
            or kw in j.location.lower()
        ]

    # Apply type filter
    if type:
        jobs = [j for j in jobs if j.type.lower() == type.lower()]

    # Return newest first
    jobs.sort(key=lambda j: j.posted_at, reverse=True)
    return jobs


@router.get("/{job_id}", response_model=Job, summary="Get a single job by ID")
async def get_job(job_id: str) -> Job:
    """Return a specific job entry by its ID."""
    raw_jobs = _load_jobs()
    for raw in raw_jobs:
        if raw.get("id") == job_id:
            return Job.model_validate(raw)
    raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")


@router.post(
    "/{job_id}/answer",
    summary="Answer questions about a specific job using RAG",
)
async def answer_job_question(job_id: str, body: ChatRequest) -> dict:
    """
    Use the RAG retriever (domain='jobs') to answer questions about a specific job.
    Returns the answer text and any relevant citations.
    """
    import asyncio

    # Fetch the job to include its data as context
    raw_jobs = _load_jobs()
    job_raw = next((r for r in raw_jobs if r.get("id") == job_id), None)
    if not job_raw:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    job_context = (
        f"Job Title: {job_raw.get('title')}\n"
        f"Company: {job_raw.get('company')}\n"
        f"Location: {job_raw.get('location')}\n"
        f"Type: {job_raw.get('type')}\n"
        f"Description: {job_raw.get('description')}\n"
        f"Skills: {', '.join(job_raw.get('skills', []))}"
    )

    # RAG retrieval
    try:
        from rag.retriever import retrieve
        chunks: list[dict] = await retrieve(body.message, body.language, n_results=5, domain="jobs")
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        chunks = []

    context_texts = [job_context] + [c.get("text", "") for c in chunks]

    # AI answer
    try:
        from ai.factory import get_provider
        provider = get_provider()
        context_chunks = [
            {"id": f"job_{job_id}", "text": job_context, "source": f"Job: {job_raw.get('title')}"}
        ] + chunks
        answer, job_cites = await provider.chat(
            body.message,
            body.language,
            context_chunks,
            body.history,
        )
        if job_cites:
            citations = [
                {"id": c.id, "source": c.source, "excerpt": c.excerpt}
                for c in job_cites
            ]
        else:
            citations = [
                {"id": c.get("id"), "source": c.get("source"), "excerpt": c.get("text", "")[:200]}
                for c in chunks
            ]
    except Exception as exc:
        logger.error("AI provider error in job answer: %s", exc)
        answer = "Sorry, I could not generate an answer right now. Please try again."
        citations = []

    return {
        "job_id": job_id,
        "answer": answer,
        "language": body.language,
        "citations": citations,
    }


# ── Job alerts ────────────────────────────────────────────────────────────────

alert_router = APIRouter()


@router.post("/alert", response_model=JobAlertResponse, operation_id="subscribe_job_alert_jobs_alert", summary="Subscribe to job alerts (/jobs/alert)")
@alert_router.post("", response_model=JobAlertResponse, operation_id="subscribe_job_alert_root", summary="Subscribe to job alerts (/job-alert)")
async def subscribe_job_alert(body: JobAlertRequest) -> JobAlertResponse:
    """
    Store a job-alert subscription in Redis. The alert scheduler
    (api/jobs/alerts.py) picks up these subscriptions every 6 hours.
    """
    sub_id = str(uuid.uuid4())
    sub_data = {
        "subscription_id": sub_id,
        **body.model_dump(),
    }

    redis = _get_redis()
    if redis:
        try:
            async with redis:
                await redis.set(f"job_alert:{sub_id}", json.dumps(sub_data))
        except Exception as exc:
            logger.warning("Could not persist job alert subscription: %s", exc)
    else:
        logger.warning("Redis unavailable — job alert subscription %s not persisted", sub_id)

    channel_desc = {
        "telegram": "Telegram",
        "sms": "SMS",
        "both": "Telegram and SMS",
    }.get(body.channel, body.channel)

    return JobAlertResponse(
        subscription_id=sub_id,
        message=(
            f"You are now subscribed to job alerts via {channel_desc}. "
            f"Subscription ID: {sub_id}"
        ),
    )
