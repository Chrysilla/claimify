from abc import ABC, abstractmethod
from typing import Any
from app.schemas import FindingCreate


class AIProvider(ABC):
    @abstractmethod
    def review(self, context: dict[str, Any]) -> list[FindingCreate]: ...
