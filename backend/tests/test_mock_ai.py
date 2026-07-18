from app.ai.mock import MockAIProvider


def test_mock_ai_is_deterministic_and_structured():
    provider = MockAIProvider()
    context = {"patient": {"id": "maya-thompson", "name": "Maya Thompson"}}
    first = provider.review(context)
    second = provider.review(context)
    assert first == second
    assert first[0].confidence == 0.96
    assert first[0].evidence[0].source_id.startswith("note-")
