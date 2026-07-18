from typing import Any
from app.ai.base import AIProvider
from app.schemas import FindingCreate


class OpenAIProvider(AIProvider):
    def review(self, context: dict[str, Any]) -> list[FindingCreate]:
        raise RuntimeError(
            "OpenAI live mode is an adapter seam; enable it after selecting the hackathon workflow."
        )
