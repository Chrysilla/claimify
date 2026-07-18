import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any
from sqlalchemy.orm import Session
from app.models import Finding, Patient


DEMO_DIR = Path(__file__).resolve().parents[3] / "demo"


def _read(name: str) -> list[dict[str, Any]]:
    with (DEMO_DIR / name).open(encoding="utf-8") as fixture:
        return json.load(fixture)


class DemoService:
    def __init__(self, db: Session):
        self.db = db

    def reset(self) -> dict[str, Any]:
        labs: dict[str, list[dict[str, Any]]] = defaultdict(list)
        notes: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in _read("labs.json"):
            labs[item.pop("patient_id")].append(item)
        for item in _read("clinical-notes.json"):
            notes[item.pop("patient_id")].append(item)
        insurance = {item["patient_id"]: item for item in _read("insurance.json")}
        rules = {item["id"]: item for item in _read("payer-rules.json")}

        patients = []
        for item in _read("patients.json"):
            item = item.copy()
            patient_id = item["id"]
            date_of_birth = date.fromisoformat(item.pop("date_of_birth"))
            coverage = insurance[patient_id]
            rule_ids = coverage.pop("payer_rule_ids")
            coverage.pop("patient_id")
            patients.append(
                Patient(
                    **item,
                    date_of_birth=date_of_birth,
                    is_demo=True,
                    labs=labs[patient_id],
                    notes=notes[patient_id],
                    insurance=coverage,
                    payer_rules=[rules[rule_id] for rule_id in rule_ids],
                )
            )

        self.db.query(Finding).delete()
        self.db.query(Patient).delete()
        self.db.add_all(patients)
        self.db.commit()
        return {"status": "reset", "patients_loaded": len(patients), "findings_cleared": True}
