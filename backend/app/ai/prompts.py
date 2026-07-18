import json
from pathlib import Path
from typing import Any


PROMPT_DIR = Path(__file__).resolve().parents[3] / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPT_DIR / name).read_text(encoding="utf-8")


def review_prompt(context: dict[str, Any]) -> tuple[str, str]:
    system = "\n\n".join([load_prompt("system.md"), load_prompt("safety.md")])
    user = "\n\n".join(
        [
            load_prompt("patient-review.md"),
            load_prompt("structured-output.md"),
            "# Supplied context\n" + json.dumps(context, indent=2),
        ]
    )
    return system, user
