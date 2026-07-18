from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Finding


class FindingRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, patient_id: str | None = None) -> list[Finding]:
        query = select(Finding).order_by(Finding.created_at.desc())
        if patient_id:
            query = query.where(Finding.patient_id == patient_id)
        return list(self.db.scalars(query).all())

    def get(self, finding_id: str) -> Finding | None:
        return self.db.get(Finding, finding_id)

    def save(self, finding: Finding) -> Finding:
        self.db.add(finding)
        self.db.commit()
        return finding

    def save_all(self, findings: list[Finding]) -> list[Finding]:
        self.db.add_all(findings)
        self.db.commit()
        return findings
