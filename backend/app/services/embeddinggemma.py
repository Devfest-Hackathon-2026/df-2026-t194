"""Text-only EmbeddingGemma 2 helpers for route preference matching."""

from __future__ import annotations

import functools
import logging
import math
import os
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("uvicorn.error")
_ENGINE: Any | None = None
_ENGINE_ERROR: str | None = None
_ENGINE_LOCK = threading.RLock()


def _model_path() -> Path:
    return Path(os.getenv("EMBEDDINGGEMMA_MODEL_PATH", "/app/models/embeddinggemma-2-text-270m.litertlm"))


def _get_engine():
    global _ENGINE, _ENGINE_ERROR
    if _ENGINE is not None:
        return _ENGINE
    if _ENGINE_ERROR:
        raise RuntimeError("EmbeddingGemma 2 270M is unavailable")

    with _ENGINE_LOCK:
        if _ENGINE is not None:
            return _ENGINE
        if _ENGINE_ERROR:
            raise RuntimeError("EmbeddingGemma 2 270M is unavailable")
        path = _model_path()
        if not path.is_file():
            _ENGINE_ERROR = "model_file_missing"
            raise FileNotFoundError(f"EmbeddingGemma 2 model file not found: {path}")
        try:
            import litert_lm

            _ENGINE = litert_lm.EmbeddingEngine(str(path), backend=litert_lm.Backend.CPU())
            logger.info("EmbeddingGemma 2 text engine initialized from %s", path.name)
            return _ENGINE
        except Exception as exc:
            _ENGINE_ERROR = type(exc).__name__
            logger.exception("EmbeddingGemma 2 text engine initialization failed")
            raise


def _vector(result: Any) -> list[float]:
    return [float(value) for value in result.embedding]


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return -1.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return -1.0
    return dot / (left_norm * right_norm)


@functools.lru_cache(maxsize=256)
def _text_embedding(text: str) -> tuple[float, ...]:
    prepared = f"task: sentence similarity | text: {text.strip()}"
    with _ENGINE_LOCK:
        return tuple(_vector(_get_engine().compute_embedding(prepared)))


def score_route_options(preference: str, route_profiles: dict[str, str]) -> tuple[dict[str, float], str, float]:
    """Return relative similarity weights; these are not calibrated probabilities."""
    if not route_profiles:
        return {}, "", 0.0

    started = time.perf_counter()
    try:
        with _ENGINE_LOCK:
            query = _text_embedding(preference)
            keys = list(route_profiles)
            scores = [_cosine(list(query), list(_text_embedding(route_profiles[key]))) for key in keys]
    except Exception as exc:
        logger.warning("EmbeddingGemma route comparison unavailable: %s", type(exc).__name__)
        return {}, "", (time.perf_counter() - started) * 1000

    logits = [max(-1.0, min(1.0, score)) / 0.08 for score in scores]
    max_logit = max(logits)
    exp_scores = [math.exp(value - max_logit) for value in logits]
    total = sum(exp_scores) or 1.0
    weights = {key: value / total for key, value in zip(keys, exp_scores)}
    return weights, max(weights, key=weights.get), (time.perf_counter() - started) * 1000


def status() -> dict[str, Any]:
    path = _model_path()
    return {
        "enabled": path.is_file(),
        "model": "EmbeddingGemma 2 text 270M",
        "model_file_present": path.is_file(),
        "loaded": _ENGINE is not None,
        "error": _ENGINE_ERROR,
    }
