import json
from typing import Any
import httpx
from pydantic import TypeAdapter
from app.ai.base import AIProvider
from app.ai.prompts import review_prompt
from app.schemas import FindingCreate


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def review(self, context: dict[str, Any]) -> list[FindingCreate]:
        system, user = review_prompt(context)
        adapter = TypeAdapter(list[FindingCreate])
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "instructions": system,
                "input": user,
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "findings",
                        "strict": True,
                        "schema": adapter.json_schema(),
                    }
                },
            },
            timeout=60,
        )
        response.raise_for_status()
        content = next(
            part["text"]
            for item in response.json()["output"]
            for part in item.get("content", [])
            if part.get("type") == "output_text"
        )
        return adapter.validate_python(json.loads(content))
