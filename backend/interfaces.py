from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class IEmbeddingService(ABC):
    @abstractmethod
    async def get_embedding(self, text: str) -> List[float]:
        pass

class BaseTool(ABC):
    name: str
    description: str
    input_schema: Dict[str, Any]

    @abstractmethod
    async def execute(self, **kwargs) -> Any:
        pass
