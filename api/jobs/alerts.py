"""Job alert scheduler — sends alerts via Telegram and SMS."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
import httpx
import redis.asyncio as aioredis

from config import get_settings
from channels.sms_handler import send_sms

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


async def _get_redis() -> aioredis.Redis | None:
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.ping()
        return r
    except Exception as exc:
        logger.warning("Redis unavailable for job alerts: %s", exc)
        return None


def load_jobs() -> list[dict[str, Any]]:
    docs_path = Path(settings.docs_path)
    jobs_file = docs_path / "jobs" / "jobs.json"
    if not jobs_file.exists():
        # Try relative fallback
        jobs_file = Path(__file__).parent.parent.parent / "docs" / "jobs" / "jobs.json"
    if jobs_file.exists():
        try:
            return json.loads(jobs_file.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("Failed to read jobs file: %s", exc)
    return []


async def load_subscriptions(r: aioredis.Redis) -> list[dict[str, Any]]:
    subscriptions = []
    try:
        keys = await r.keys("job_alert:*")
        for key in keys:
            val = await r.get(key)
            if val:
                try:
                    subscriptions.append(json.loads(val))
                except Exception:
                    pass
    except Exception as exc:
        logger.error("Error loading subscriptions from Redis: %s", exc)
    return subscriptions


def filter_jobs_for_sub(jobs: list[dict[str, Any]], sub: dict[str, Any]) -> list[dict[str, Any]]:
    keywords = [kw.lower() for kw in sub.get("keywords", []) if kw]
    if not keywords:
        return jobs[:3]
    matched = []
    for job in jobs:
        text = f"{job.get('title', '')} {job.get('description', '')} {' '.join(job.get('skills', []))}".lower()
        if any(kw in text for kw in keywords):
            matched.append(job)
    return matched[:3]


async def send_telegram_alert(chat_id: str, job: dict[str, Any], lang: str = "en") -> bool:
    if not settings.telegram_bot_token:
        logger.warning("Telegram bot token not configured.")
        return False

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    if lang == "am":
        text = (
            f"🔔 *አዲስ የሥራ ማስታወቂያ!*\n\n"
            f"💼 *{job.get('title')}*\n"
            f"🏢 {job.get('company')} ({job.get('location', '')})\n"
            f"📝 {job.get('description', '')[:200]}...\n\n"
            f"🔗 [ዝርዝሩን ይመልከቱ]({job.get('url', '#')})"
        )
    else:
        text = (
            f"🔔 *New Job Opportunity!*\n\n"
            f"💼 *{job.get('title')}*\n"
            f"🏢 {job.get('company')} ({job.get('location', '')})\n"
            f"📝 {job.get('description', '')[:200]}...\n\n"
            f"🔗 [View and Apply]({job.get('url', '#')})"
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": False
            })
            return resp.status_code == 200
    except Exception as exc:
        logger.error("Failed to send Telegram alert: %s", exc)
        return False


async def send_sms_alert(phone: str, job: dict[str, Any], lang: str = "en") -> bool:
    title = job.get("title", "")[:30]
    company = job.get("company", "")[:20]
    url = job.get("url", "")
    if lang == "am":
        msg = f"አዲስ ሥራ: {title} በ {company}። ማመልከቻ: {url}"
    else:
        msg = f"NEW JOB: {title} at {company}. Apply: {url}"
    return await send_sms(phone, msg[:160], settings)


async def check_and_send_alerts():
    logger.info("Running job alert check...")
    r = await _get_redis()
    if not r:
        logger.info("Skipping alert check: Redis unavailable.")
        return

    jobs = load_jobs()
    if not jobs:
        logger.info("No jobs found in store.")
        return

    subscriptions = await load_subscriptions(r)
    logger.info("Found %d active job alert subscriptions.", len(subscriptions))

    for sub in subscriptions:
        user_id = sub.get("user_id", "unknown")
        channel = sub.get("channel", "both")
        contact = sub.get("contact", "")
        lang = sub.get("language", "en")
        if not contact:
            continue

        relevant_jobs = filter_jobs_for_sub(jobs, sub)
        for job in relevant_jobs:
            job_id = job.get("id", "")
            sent_key = f"job_sent:{user_id}:{job_id}"
            already_sent = await r.get(sent_key)
            if already_sent:
                continue

            success = False
            if channel in ("telegram", "both") and contact.isdigit():
                # Telegram numeric chat id
                success = await send_telegram_alert(contact, job, lang)
            elif channel in ("sms", "both"):
                success = await send_sms_alert(contact, job, lang)

            if success:
                # Remember sent job for 7 days
                await r.set(sent_key, "1", ex=7 * 86400)
                logger.info("Sent job alert %s to %s via %s", job_id, contact, channel)


async def main():
    logger.info("Starting Savanna Job Alert Worker (interval: every 6h)...")
    scheduler = AsyncIOScheduler()
    scheduler.add_job(check_and_send_alerts, "interval", hours=6, next_run_time=datetime.now(timezone.utc))
    scheduler.start()
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
