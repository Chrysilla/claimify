from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Patient


class PatientRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[Patient]:
        return list(self.db.scalars(select(Patient).order_by(Patient.created_at)).all())

    def get(self, patient_id: str) -> Patient | None:
        return self.db.get(Patient, patient_id)

    def save(self, patient: Patient) -> Patient:
        self.db.add(patient)
        self.db.commit()
        return patient
