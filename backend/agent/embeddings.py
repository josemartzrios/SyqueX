import asyncio
import threading
from fastembed import TextEmbedding
from agent.interfaces import IEmbeddingService

MODEL_NAME = "BAAI/bge-m3"
EMBEDDING_DIMENSIONS = 1024
ZERO_VECTOR = [0.0] * EMBEDDING_DIMENSIONS  # fallback on error


class FastEmbedService(IEmbeddingService):
    """Local embeddings via FastEmbed — no data egress, LFPDPPP compliant."""

    _model: TextEmbedding | None = None
    _lock: threading.Lock = threading.Lock()

    def _get_model(self) -> TextEmbedding:
        # Double-checked locking — model instantiated exactly once across threads
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = TextEmbedding(MODEL_NAME)
        return self._model

    def _embed_sync(self, text: str) -> list[float]:
        model = self._get_model()
        # FastEmbed returns a generator of numpy.ndarray — convert to list[float]
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()

    async def get_embedding(self, text: str) -> list[float]:
        # FastEmbed is synchronous — run in default thread pool executor
        # to avoid blocking the FastAPI event loop
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._embed_sync, text)


# Module-level exports preserved for backward compatibility with all callers
embedding_service = FastEmbedService()


async def get_embedding(text: str) -> list[float]:
    return await embedding_service.get_embedding(text)
