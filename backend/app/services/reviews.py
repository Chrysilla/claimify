from app.ai.base import AIProvider
from app.models import Finding, Patient
from app.repositories.findings import FindingRepository
from app.schemas import PatientDetail


class ReviewService:
    def __init__(self, findings: FindingRepository, provider: AIProvider):
        self.findings = findings
        self.provider = provider

    def run(self, patient: Patient) -> list[Finding]:
        context = PatientDetail.model_validate(patient).model_dump(mode="json")
        generated = [
            Finding(patient_id=patient.id, **item.model_dump(mode="json"))
            for item in self.provider.review({"patient": context})
        ]
        return self.findings.save_all(generated)

    def edit(self, finding: Finding, action: str) -> Finding:
        if finding.status != "pending":
            raise ValueError("finding_already_reviewed")
        finding.recommended_action = action
        return self.findings.save(finding)

    def decide(self, finding: Finding, status: str, note: str | None = None) -> Finding:
        if finding.status != "pending":
            raise ValueError("finding_already_reviewed")
        finding.status = status
        finding.review_note = note
        return self.findings.save(finding)
