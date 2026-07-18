from typing import Any
import httpx
from pydantic import TypeAdapter
from app.ai.base import AIProvider
from app.ai.prompts import review_prompt
from app.schemas import FindingCreate


class AnthropicProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def review(self, context: dict[str, Any]) -> list[FindingCreate]:
        system, user = review_prompt(context)
        adapter = TypeAdapter(list[FindingCreate])
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": 3000,
                "system": system,
                "messages": [{"role": "user", "content": user}],
                "tools": [
                    {
                        "name": "submit_findings",
                        "description": "Submit grounded review findings.",
                        "input_schema": {
                            "type": "object",
                            "properties": {"findings": adapter.json_schema()},
                            "required": ["findings"],
                        },
                    }
                ],
                "tool_choice": {"type": "tool", "name": "submit_findings"},
            },
            timeout=60,
        )
        response.raise_for_status()
        block = next(item for item in response.json()["content"] if item["type"] == "tool_use")
        return adapter.validate_python(block["input"]["findings"])
