"""
Africa's Talking SMS helper

send_sms(to, message, settings) → bool
send_sms_bulk(recipients, message, settings) → dict

• Uses httpx.AsyncClient for all HTTP calls.
• Sandbox mode is activated when settings.at_username == "sandbox"
  (logs instead of making real API calls).
• Retries up to 3 times on network or 5xx errors.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

AT_API_URL = "https://api.africastalking.com/version1/messaging"
AT_SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging"

MAX_RETRIES = 3
RETRY_BACKOFF = [0.5, 1.0, 2.0]  # seconds


def _is_sandbox(settings) -> bool:
    return getattr(settings, "at_username", "sandbox").lower() == "sandbox"


def _api_url(settings) -> str:
    return AT_SANDBOX_URL if _is_sandbox(settings) else AT_API_URL


async def _post_with_retry(url: str, headers: dict, data: dict) -> dict[str, Any]:
    """
    POST to the AT API with up to MAX_RETRIES attempts.
    Returns the parsed JSON response or raises on final failure.
    """
    import asyncio

    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in range(MAX_RETRIES):
            try:
                resp = await client.post(url, headers=headers, data=data)
                if resp.status_code < 500:
                    resp.raise_for_status()
                    return resp.json()
                # 5xx — retry
                logger.warning(
                    "AT API returned %s on attempt %d/%d",
                    resp.status_code,
                    attempt + 1,
                    MAX_RETRIES,
                )
                last_exc = httpx.HTTPStatusError(
                    f"Status {resp.status_code}", request=resp.request, response=resp
                )
            except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
                logger.warning(
                    "AT API network error on attempt %d/%d: %s",
                    attempt + 1,
                    MAX_RETRIES,
                    exc,
                )
                last_exc = exc

            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_BACKOFF[attempt])

    raise last_exc or RuntimeError("AT API request failed after retries")


async def send_sms(to: str, message: str, settings) -> bool:
    """
    Send a single SMS via Africa's Talking.

    Returns True on success, False on failure.
    In sandbox mode (at_username == 'sandbox'), logs the message instead.
    """
    if _is_sandbox(settings):
        logger.info(
            "[SMS SANDBOX] To: %s | Message: %s",
            to,
            message[:160],
        )
        return True

    headers = {
        "Accept": "application/json",
        "apiKey": settings.at_api_key,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data: dict[str, str] = {
        "username": settings.at_username,
        "to": to,
        "message": message[:160],  # enforce SMS limit
    }
    if settings.at_sender_id:
        data["from"] = settings.at_sender_id

    try:
        result = await _post_with_retry(_api_url(settings), headers, data)
        sms_data = result.get("SMSMessageData", {})
        recipients = sms_data.get("Recipients", [])
        if recipients and recipients[0].get("statusCode") == 101:
            logger.info("SMS sent to %s: messageId=%s", to, recipients[0].get("messageId"))
            return True
        logger.warning("SMS to %s may have failed: %s", to, sms_data)
        return False
    except Exception as exc:
        logger.error("Failed to send SMS to %s: %s", to, exc)
        return False


async def send_sms_bulk(recipients: list[str], message: str, settings) -> dict:
    """
    Send the same message to multiple recipients via a single AT API call.

    Returns a dict with 'success', 'failed', and 'raw' keys.
    """
    if not recipients:
        return {"success": [], "failed": [], "raw": {}}

    if _is_sandbox(settings):
        logger.info(
            "[SMS SANDBOX BULK] To: %s | Message: %s",
            recipients,
            message[:160],
        )
        return {"success": recipients, "failed": [], "raw": {"sandbox": True}}

    headers = {
        "Accept": "application/json",
        "apiKey": settings.at_api_key,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data: dict[str, str] = {
        "username": settings.at_username,
        "to": ",".join(recipients),
        "message": message[:160],
    }
    if settings.at_sender_id:
        data["from"] = settings.at_sender_id

    try:
        raw = await _post_with_retry(_api_url(settings), headers, data)
        sms_data = raw.get("SMSMessageData", {})
        all_recipients = sms_data.get("Recipients", [])
        success = [r["number"] for r in all_recipients if r.get("statusCode") == 101]
        failed = [r["number"] for r in all_recipients if r.get("statusCode") != 101]
        logger.info(
            "Bulk SMS: %d sent, %d failed out of %d",
            len(success),
            len(failed),
            len(recipients),
        )
        return {"success": success, "failed": failed, "raw": raw}
    except Exception as exc:
        logger.error("Bulk SMS failed: %s", exc)
        return {"success": [], "failed": recipients, "raw": {"error": str(exc)}}
