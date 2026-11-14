"""
LTI 1.3 router — using pylti1p3

Endpoints:
  GET  /lti/login   — OIDC login initiation (tool → platform redirect)
  POST /lti/login   — OIDC login response handler
  POST /lti/launch  — LTI 1.3 resource launch
  GET  /lti/jwks    — Tool's JSON Web Key Set (public key for the platform)

LTI 1.3 flow overview:
  ┌─────────────────────────────────────────────────────────────────┐
  │  1. Platform (LMS) opens the tool's login URL (GET /lti/login). │
  │  2. Tool redirects to the platform's OIDC auth endpoint.        │
  │  3. Platform authenticates the user and POSTs an id_token to    │
  │     the tool's launch URL (POST /lti/launch).                   │
  │  4. Tool validates the id_token (JWT) using the platform's JWKS.│
  │  5. Tool extracts the LTI launch context (course, user, role).  │
  │  6. Tool redirects the browser to the widget iframe with the    │
  │     context embedded as query params.                           │
  └─────────────────────────────────────────────────────────────────┘

Configuration:
  - Tool config is loaded from /app/lti_config.json (auto-created if absent).
  - RSA key pair must exist at the paths set in Settings
    (lti_tool_private_key_path / lti_tool_public_key_path).
  - Use `openssl genrsa -out /app/lti_private.pem 2048 && \
           openssl rsa -in /app/lti_private.pem -pubout -out /app/lti_public.pem`
    to generate keys if they do not exist.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# ── LTI config file ───────────────────────────────────────────────────────────

LTI_CONFIG_PATH = os.getenv("LTI_CONFIG_PATH", "/app/lti_config.json")

_DEFAULT_LTI_CONFIG = {
    "https://platform.example.com": [  # Replace with actual platform issuer
        {
            "default": True,
            "client_id": "CHANGE_ME_CLIENT_ID",
            "auth_login_url": "https://platform.example.com/api/lti/authorize_redirect",
            "auth_token_url": "https://platform.example.com/login/oauth2/token",
            "key_set_url": "https://platform.example.com/api/lti/security/jwks",
            "key_set": None,
            "deployment_ids": ["1"],
        }
    ]
}


def _ensure_lti_config() -> dict:
    """Return the LTI config, creating a default file if none exists."""
    cfg_path = Path(LTI_CONFIG_PATH)
    if not cfg_path.exists():
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        cfg_path.write_text(json.dumps(_DEFAULT_LTI_CONFIG, indent=2))
        logger.warning(
            "Created default LTI config at %s — update with real platform values before use.",
            cfg_path,
        )
    with open(cfg_path, "r") as fh:
        return json.load(fh)


# ── Key helpers ───────────────────────────────────────────────────────────────

def _load_private_key() -> str:
    path = settings.lti_tool_private_key_path
    if not os.path.exists(path):
        local_path = os.path.join(os.path.dirname(__file__), "..", "lti_private.pem")
        if os.path.exists(local_path):
            return Path(local_path).read_text()
        raise FileNotFoundError(
            f"LTI private key not found at {path} or {local_path}. "
            "Generate with: make lti-keys"
        )
    return Path(path).read_text()


def _load_public_key() -> str:
    path = settings.lti_tool_public_key_path
    if not os.path.exists(path):
        local_path = os.path.join(os.path.dirname(__file__), "..", "lti_public.pem")
        if os.path.exists(local_path):
            return Path(local_path).read_text()
        raise FileNotFoundError(
            f"LTI public key not found at {path} or {local_path}. "
            "Generate with: make lti-keys"
        )
    return Path(path).read_text()


# ── Tool configuration helper (pylti1p3) ─────────────────────────────────────

def _get_tool_conf():
    """
    Build a pylti1p3 ToolConf from the JSON config file.
    Returns None (with a warning) if pylti1p3 is not installed.
    """
    try:
        from pylti1p3.tool_config import ToolConfJsonFile
        return ToolConfJsonFile(LTI_CONFIG_PATH)
    except ImportError:
        logger.warning("pylti1p3 not installed — LTI endpoints will return 501")
        return None


def _get_launch_data_storage():
    """Return a Redis or in-memory launch data storage for pylti1p3."""
    try:
        from pylti1p3.contrib.django.lti1p3_tool_config.models import (
            LtiToolConfig,
        )
    except ImportError:
        pass

    try:
        from pylti1p3.launch_data_storage.cache import CacheDataStorage
        import redis as sync_redis
        r = sync_redis.from_url(settings.redis_url)
        return CacheDataStorage(r)
    except Exception:
        pass

    # Fallback: in-memory (not suitable for multi-process, but fine for dev)
    try:
        from pylti1p3.launch_data_storage.memory import MemoryDataStorage
        return MemoryDataStorage()
    except Exception:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/login", summary="LTI 1.3 OIDC login initiation (GET)")
@router.post("/login", summary="LTI 1.3 OIDC login initiation (POST)")
async def lti_login(request: Request):
    """
    Step 1 of the LTI 1.3 launch: receive the OIDC login hint from the
    platform and redirect back to the platform's authorisation endpoint.

    The platform must be configured to send the user here before the launch.
    """
    tool_conf = _get_tool_conf()
    if tool_conf is None:
        return JSONResponse({"error": "pylti1p3 not installed"}, status_code=501)

    _ensure_lti_config()

    try:
        from pylti1p3.contrib.fastapi import FastApiOIDCLogin

        # Collect form data or query params
        if request.method == "POST":
            form = await request.form()
            params = dict(form)
        else:
            params = dict(request.query_params)

        oidc_login = FastApiOIDCLogin(
            request=request,
            tool_conf=tool_conf,
            launch_data_storage=_get_launch_data_storage(),
        )
        redirect_obj = oidc_login.enable_check_cookies().redirect(
            # The redirect_uri must match what was registered with the platform
            f"{settings.api_base_url}/lti/launch"
        )
        return redirect_obj
    except Exception as exc:
        logger.error("LTI login error: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=400)


@router.post("/launch", summary="LTI 1.3 resource launch")
async def lti_launch(request: Request):
    """
    Step 2 of the LTI 1.3 launch: validate the id_token JWT posted by the
    platform and redirect the browser to the widget with LTI context params.

    The widget URL is built from api_base_url; adjust as needed.
    """
    tool_conf = _get_tool_conf()
    if tool_conf is None:
        return JSONResponse({"error": "pylti1p3 not installed"}, status_code=501)

    _ensure_lti_config()

    try:
        from pylti1p3.contrib.fastapi import FastApiMessageLaunch

        message_launch = FastApiMessageLaunch(
            request=request,
            tool_conf=tool_conf,
            launch_data_storage=_get_launch_data_storage(),
        )
        # This validates the JWT signature against the platform JWKS and
        # raises an exception if anything is wrong.
        launch_data: dict[str, Any] = message_launch.get_launch_data()

        # Extract useful LTI context
        sub = launch_data.get("sub", "")           # user id
        name = launch_data.get("name", "Student")
        email = launch_data.get("email", "")
        course_id = (
            launch_data
            .get("https://purl.imsglobal.org/spec/lti/claim/context", {})
            .get("id", "")
        )
        roles: list[str] = launch_data.get(
            "https://purl.imsglobal.org/spec/lti/claim/roles", []
        )
        role = "instructor" if any("Instructor" in r for r in roles) else "learner"

        # Build redirect URL to the embedded widget
        import urllib.parse
        widget_params = urllib.parse.urlencode(
            {
                "lti": "1",
                "user_id": sub,
                "name": name,
                "email": email,
                "course_id": course_id,
                "role": role,
            }
        )
        widget_url = f"{settings.api_base_url}/widget/index.html?{widget_params}"
        logger.info(
            "LTI launch: user=%s course=%s role=%s → %s", sub, course_id, role, widget_url
        )
        return RedirectResponse(url=widget_url, status_code=302)

    except Exception as exc:
        logger.error("LTI launch error: %s", exc, exc_info=True)
        return JSONResponse(
            {
                "error": "LTI launch failed",
                "detail": str(exc),
            },
            status_code=400,
        )


@router.get("/jwks", summary="Tool JSON Web Key Set (public key)")
async def lti_jwks():
    """
    Return the tool's public RSA key as a JWK Set so the platform can verify
    tokens signed by this tool (e.g. for Deep Linking responses).
    """
    try:
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
            load_pem_private_key,
        )
        from cryptography.hazmat.backends import default_backend
        import base64, struct

        pem = _load_private_key().encode()
        private_key = load_pem_private_key(pem, password=None, backend=default_backend())
        public_key = private_key.public_key()
        pub_numbers = public_key.public_key().public_numbers() if hasattr(public_key, "public_key") else public_key.public_numbers()

        def _int_to_b64(n: int) -> str:
            length = (n.bit_length() + 7) // 8
            return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()

        jwk = {
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "savanna-lti-key-1",
            "n": _int_to_b64(pub_numbers.n),
            "e": _int_to_b64(pub_numbers.e),
        }
        return JSONResponse({"keys": [jwk]})

    except FileNotFoundError as exc:
        logger.warning("LTI key file missing: %s", exc)
        return JSONResponse(
            {"error": "LTI keys not configured", "detail": str(exc)},
            status_code=503,
        )
    except Exception as exc:
        logger.error("JWKS error: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=500)
