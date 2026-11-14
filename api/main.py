"""FastAPI application factory."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import chat, escalate, jobs, accommodate, lti, sms as sms_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ingest documents if the vector store is empty."""
    logger.info("Starting Savanna Multilingual Assistant API …")
    try:
        from rag.ingest import ensure_ingested
        await ensure_ingested(settings.docs_path, settings.chroma_path)
        logger.info("RAG corpus ready.")
    except Exception as exc:
        logger.warning("RAG ingest skipped: %s", exc)
    yield
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Savanna Multilingual Assistant",
        version="1.0.0",
        description=(
            "Voice and text AI tutor in Amharic and English. "
            "Answers questions from course content, escalates to humans, "
            "and surfaces career opportunities."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],           # Restrict to widget_origin in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(chat.router,        prefix="/chat",        tags=["Chat"])
    app.include_router(escalate.router,    prefix="/escalate",    tags=["Escalation"])
    app.include_router(jobs.router,        prefix="/jobs",        tags=["Career Gateway"])
    app.include_router(jobs.alert_router,  prefix="/job-alert",   tags=["Career Gateway"])
    app.include_router(accommodate.router, prefix="/accommodate", tags=["Accommodation"])
    app.include_router(lti.router,         prefix="/lti",         tags=["LTI 1.3"])
    app.include_router(sms_router.router,  prefix="/webhook",     tags=["SMS Webhook"])

    # ── Health ────────────────────────────────────────────────────────────────
    from models import HealthResponse

    @app.get("/health", response_model=HealthResponse, tags=["Health"])
    async def health():
        return HealthResponse(
            status="ok",
            version="1.0.0",
            ai_provider=settings.ai_provider,
        )

    # ── Widget script (Level 1 drop-in) ───────────────────────────────────────
    import os
    from fastapi.staticfiles import StaticFiles
    base_dir = os.path.dirname(__file__)
    widget_dir = os.path.join(base_dir, "widget")
    if not os.path.isdir(widget_dir):
        widget_dir = os.path.join(base_dir, "..", "widget")
    if os.path.isdir(widget_dir):
        app.mount("/widget", StaticFiles(directory=widget_dir, html=True), name="widget")

    operator_dir = os.path.join(base_dir, "operator")
    if not os.path.isdir(operator_dir):
        operator_dir = os.path.join(base_dir, "..", "operator")
    if os.path.isdir(operator_dir):
        app.mount("/operator", StaticFiles(directory=operator_dir, html=True), name="operator")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
