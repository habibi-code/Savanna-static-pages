"""Vector retrieval from ChromaDB using multilingual-e5-small embeddings."""
from __future__ import annotations

import asyncio
import logging

from typing import Any

logger = logging.getLogger(__name__)

_EMBED_MODEL_NAME = "intfloat/multilingual-e5-small"
_COLLECTION_NAME = "savanna_docs"

# Module-level singletons — loaded once per process
_embed_model: Any = None
_chroma_client: Any = None
_chroma_path: str | None = None


def _get_embed_model():
    global _embed_model  # noqa: PLW0603
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading retriever embedding model %s …", _EMBED_MODEL_NAME)
        _embed_model = SentenceTransformer(_EMBED_MODEL_NAME)
    return _embed_model


def _get_chroma_client(chroma_path: str):
    global _chroma_client, _chroma_path  # noqa: PLW0603
    if _chroma_client is None or _chroma_path != chroma_path:
        import chromadb
        logger.info("Connecting to ChromaDB at %s …", chroma_path)
        _chroma_client = chromadb.PersistentClient(path=chroma_path)
        _chroma_path = chroma_path
    return _chroma_client


# ─── Sync retrieval (run via asyncio.to_thread) ───────────────────────────────

def _retrieve_sync(
    query: str,
    chroma_path: str,
    n_results: int,
    domain: str | None,
) -> list[dict]:
    model = _get_embed_model()
    client = _get_chroma_client(chroma_path)

    try:
        collection = client.get_collection(_COLLECTION_NAME)
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not get collection '%s': %s", _COLLECTION_NAME, exc)
        return []

    # multilingual-e5-small expects "query: " prefix for queries
    query_vec = model.encode(f"query: {query}", show_progress_bar=False).tolist()

    where: dict | None = None
    if domain:
        where = {"domain": {"$eq": domain}}

    try:
        results = collection.query(
            query_embeddings=[query_vec],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("ChromaDB query failed: %s", exc)
        return []

    output: list[dict] = []
    ids_list = results.get("ids", [[]])[0]
    docs_list = results.get("documents", [[]])[0]
    metas_list = results.get("metadatas", [[]])[0]
    distances_list = results.get("distances", [[]])[0]

    for chunk_id, text, meta, dist in zip(
        ids_list, docs_list, metas_list, distances_list
    ):
        output.append(
            {
                "id": chunk_id,
                "text": text,
                "source": meta.get("source", "unknown"),
                "distance": float(dist),
            }
        )

    return output


# ─── Public async API ─────────────────────────────────────────────────────────

async def retrieve(
    query: str,
    language: str = "en",
    chroma_path: str | None = None,
    n_results: int = 5,
    domain: str | None = None,
) -> list[dict]:
    """
    Embed *query* and retrieve the top *n_results* matching chunks.

    Parameters
    ----------
    query       : User query string (English or Amharic).
    language    : "en" or "am" — reserved for future language-aware filtering.
    chroma_path : Path to the ChromaDB persistent storage directory (optional, defaults to config).
    n_results   : Number of chunks to return.
    domain      : Optional filter — "course" or "jobs".

    Returns
    -------
    List of dicts: {"id": str, "text": str, "source": str, "distance": float}
    Sorted by ascending distance (most relevant first).
    """
    if not query.strip():
        return []

    if not chroma_path:
        from config import get_settings
        chroma_path = get_settings().chroma_path

    results = await asyncio.to_thread(
        _retrieve_sync, query, chroma_path, n_results, domain
    )
    return results
