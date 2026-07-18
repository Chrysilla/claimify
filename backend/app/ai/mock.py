from typing import Any
from app.ai.base import AIProvider
from app.schemas import Evidence, FindingCreate


class MockAIProvider(AIProvider):
    def review(self, context: dict[str, Any]) -> list[FindingCreate]:
        patient_id = context["patient"]["id"]
        if patient_id == "maya-thompson":
            return [
                FindingCreate(
                    issue="Conservative-treatment duration is not documented",
                    why_it_matters="The fictional payer rule requires six weeks of conservative treatment before lumbar MRI authorization; the note only says treatment was attempted.",
                    evidence=[
                        Evidence(
                            source_type="clinical_note",
                            source_id="note-maya-2026-07-11",
                            label="Orthopedics note · Jul 11",
                            excerpt="Patient has tried physical therapy and NSAIDs without adequate relief.",
                        ),
                        Evidence(
                            source_type="payer_rule",
                            source_id="rule-northstar-lumbar-mri",
                            label="Northstar lumbar MRI policy",
                            excerpt="Document at least six weeks of conservative therapy, including dates and response.",
                        ),
                    ],
                    confidence=0.96,
                    recommended_action="Add physical-therapy start and end dates, NSAID duration, and response to the authorization note before submission.",
                )
            ]
        if patient_id == "elena-rodriguez":
            return [
                FindingCreate(
                    issue="Diagnosis code lacks laterality",
                    why_it_matters="The procedure request describes the right knee, but the diagnosis is recorded without laterality, creating a coding mismatch.",
                    evidence=[
                        Evidence(
                            source_type="clinical_note",
                            source_id="note-elena-2026-07-15",
                            label="Sports medicine note · Jul 15",
                            excerpt="Persistent right knee pain and swelling after injury.",
                        )
                    ],
                    confidence=0.89,
                    recommended_action="Confirm the diagnosis and update the code with right-side specificity before claim submission.",
                )
            ]
        return []
