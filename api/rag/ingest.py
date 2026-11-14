"""Document ingestion pipeline for ChromaDB.

Ingests:
  - HTML files from {docs_path}/course-content/ and ../pages/
  - JSON job listings from {docs_path}/jobs/jobs.json

Chunks text into ~512 character segments with ~50 character overlap and
embeds them using intfloat/multilingual-e5-small.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 512
_CHUNK_OVERLAP = 50
_EMBED_MODEL = "intfloat/multilingual-e5-small"
_COLLECTION_NAME = "savanna_docs"

# Module-level singleton so the model is only loaded once
_embed_model: Any = None


def _get_embed_model():
    global _embed_model  # noqa: PLW0603
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model %s …", _EMBED_MODEL)
        _embed_model = SentenceTransformer(_EMBED_MODEL)
    return _embed_model


# ─── Text chunking ────────────────────────────────────────────────────────────

def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """Split *text* into overlapping chunks of approximately *size* characters."""
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks


# ─── Parsers ──────────────────────────────────────────────────────────────────

def _html_to_text(html: str) -> str:
    """Extract visible text from an HTML document."""
    soup = BeautifulSoup(html, "html.parser")
    # Remove script/style noise
    for tag in soup(["script", "style", "noscript", "meta", "head"]):
        tag.decompose()
    return " ".join(soup.get_text(separator=" ").split())


def _stable_id(source: str, chunk_index: int) -> str:
    """Generate a deterministic chunk ID."""
    raw = f"{source}::{chunk_index}"
    return "chunk_" + hashlib.md5(raw.encode()).hexdigest()[:12]


# ─── Sync ingestion helpers ───────────────────────────────────────────────────

def _collect_documents(docs_path: Path) -> list[dict]:
    """
    Walk the doc directories and return a list of:
        {"text": str, "source": str, "domain": "course" | "jobs"}
    """
    documents: list[dict] = []

    # 1. HTML course-content inside docs_path
    course_dir = docs_path / "course-content"
    if course_dir.exists():
        for html_file in course_dir.rglob("*.html"):
            try:
                text = _html_to_text(html_file.read_text(encoding="utf-8", errors="replace"))
                if text:
                    documents.append({"text": text, "source": html_file.name, "domain": "course"})
            except OSError as exc:
                logger.warning("Skipping %s: %s", html_file, exc)

    # 2. HTML pages (frozen Savanna pages at ../pages/ relative to docs_path)
    pages_dir = docs_path.parent / "pages"
    if pages_dir.exists():
        for html_file in pages_dir.rglob("*.html"):
            try:
                text = _html_to_text(html_file.read_text(encoding="utf-8", errors="replace"))
                if text:
                    documents.append({"text": text, "source": html_file.name, "domain": "course"})
            except OSError as exc:
                logger.warning("Skipping %s: %s", html_file, exc)

    # 3. Jobs JSON
    jobs_file = docs_path / "jobs" / "jobs.json"
    if jobs_file.exists():
        try:
            jobs = json.loads(jobs_file.read_text(encoding="utf-8"))
            if isinstance(jobs, list):
                for job in jobs:
                    parts = [
                        job.get("title", ""),
                        job.get("company", ""),
                        job.get("location", ""),
                        job.get("type", ""),
                        job.get("description", ""),
                        "Skills: " + ", ".join(job.get("skills", [])),
                    ]
                    text = " | ".join(p for p in parts if p)
                    if text:
                        documents.append({
                            "text": text,
                            "source": f"jobs:{job.get('id', 'unknown')}",
                            "domain": "jobs",
                        })
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load jobs.json: %s", exc)

    logger.info("Collected %d raw documents from %s", len(documents), docs_path)
    return documents


def _ingest_sync(docs_path: Path, chroma_path: str, force: bool) -> None:
    """Synchronous ingestion — called via asyncio.to_thread."""
    import chromadb
    client = chromadb.PersistentClient(path=chroma_path)

    # Check if already ingested
    existing = [c.name for c in client.list_collections()]
    if _COLLECTION_NAME in existing and not force:
        logger.info("Collection '%s' already exists — skipping ingestion.", _COLLECTION_NAME)
        return

    if _COLLECTION_NAME in existing and force:
        logger.info("Force re-ingestion — deleting existing collection.")
        client.delete_collection(_COLLECTION_NAME)

    collection = client.create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    model = _get_embed_model()
    documents = _collect_documents(docs_path)

    ids: list[str] = []
    texts: list[str] = []
    embeddings: list[list[float]] = []
    metadatas: list[dict] = []

    for doc in documents:
        chunks = _chunk_text(doc["text"])
        for idx, chunk in enumerate(chunks):
            chunk_id = _stable_id(doc["source"], idx)
            ids.append(chunk_id)
            texts.append(chunk)
            metadatas.append({
                "source": doc["source"],
                "chunk_index": idx,
                "domain": doc["domain"],
            })

    if not ids:
        logger.warning("No documents found to ingest. Check docs_path: %s", docs_path)
        return

    logger.info("Embedding %d chunks…", len(ids))
    # multilingual-e5-small works best with query/passage prefixes
    passage_texts = [f"passage: {t}" for t in texts]
    vecs = model.encode(passage_texts, batch_size=64, show_progress_bar=False)
    embeddings = [v.tolist() for v in vecs]

    # ChromaDB has a max batch size; upsert in batches of 500
    batch_size = 500
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        collection.upsert(
            ids=ids[start:end],
            documents=texts[start:end],
            embeddings=embeddings[start:end],
            metadatas=metadatas[start:end],
        )
        logger.debug("Upserted batch %d–%d", start, end)

    logger.info("Ingestion complete — %d chunks stored in '%s'.", len(ids), _COLLECTION_NAME)


# ─── Public async API ─────────────────────────────────────────────────────────

async def ensure_ingested(
    docs_path: str | Path,
    chroma_path: str,
    force: bool = False,
) -> None:
    """
    Ensure the ChromaDB collection is populated.

    If the collection already exists and *force* is False, this is a no-op.
    Pass force=True to re-index from scratch.
    """
    docs_path = Path(docs_path).resolve()
    await asyncio.to_thread(_ingest_sync, docs_path, chroma_path, force)
