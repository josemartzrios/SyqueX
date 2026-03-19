from .interfaces import IEmbeddingService
from openai import AsyncOpenAI
from .config import settings

class OpenAIEmbeddingService(IEmbeddingService):
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_embedding(self, text: str) -> list[float]:
        """Get embedding from OpenAI API."""
        response = await self.openai_client.embeddings.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
