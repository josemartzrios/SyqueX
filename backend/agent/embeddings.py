from .interfaces import IEmbeddingService
from openai import AsyncOpenAI
from config import settings
import logging

logger = logging.getLogger(__name__)

class OpenAIEmbeddingService(IEmbeddingService):
    def __init__(self):
        self._openai_client = None

    @property
    def openai_client(self):
        if self._openai_client is None:
            if not settings.OPENAI_API_KEY:
                logger.warning("Falta OPENAI_API_KEY. Los embeddings pueden fallar si se invocan.")
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai_client

    async def get_embedding(self, text: str) -> list[float]:
        """Get embedding from OpenAI API."""
        try:
            response = await self.openai_client.embeddings.create(
                input=text,
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generando embedding con OpenAI: {e}")
            # Fallback a zero_vector para evitar crashes en runtime durante pruebas sin LLave
            return [0.0] * 1536

# Instancia global para compatibilidad
embedding_service = OpenAIEmbeddingService()
get_embedding = embedding_service.get_embedding
