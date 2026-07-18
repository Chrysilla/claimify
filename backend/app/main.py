from contextlib import asynccontextmanager
from datetime import date
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.ai.factory import get_ai_provider
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import Finding, Patient
from app.schemas import (
    FindingEdit,
    FindingRead,
    PatientCreate,
    PatientDetail,
    PatientRead,
    PatientUpdate,
    Rejection,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="CareFlow API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error(_, exc: HTTPException):
    detail = (
        exc.detail
        if isinstance(exc.detail, dict)
        else {"code": "request_error", "message": str(exc.detail)}
    )
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


def missing_patient():
    return HTTPException(404, {"code": "patient_not_found", "message": "Patient not found"})


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "careflow-api",
        "mock_ai": isinstance(
            get_ai_provider(), __import__("app.ai.mock", fromlist=["MockAIProvider"]).MockAIProvider
        ),
    }


@app.get("/api/patients", response_model=list[PatientRead])
def list_patients(db: Session = Depends(get_db)):
    return db.scalars(select(Patient).order_by(Patient.created_at)).all()


@app.get("/api/patients/{patient_id}", response_model=PatientDetail)
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise missing_patient()
    return patient


@app.post("/api/patients", response_model=PatientRead, status_code=201)
def create_patient(data: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(**data.model_dump())
    db.add(patient)
    db.commit()
    return patient


@app.patch("/api/patients/{patient_id}", response_model=PatientRead)
def update_patient(patient_id: str, data: PatientUpdate, db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise missing_patient()
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(patient, key, value)
    db.commit()
    return patient


def demo_patients():
    return [
        Patient(
            id="maya-thompson",
            name="Maya Thompson",
            date_of_birth=date(1979, 2, 18),
            primary_condition="Lumbar radiculopathy",
            payer="Northstar Health",
            workflow_status="authorization review",
            risk_level="high",
            is_demo=True,
            diagnoses=[{"code": "M54.16", "name": "Lumbar radiculopathy"}],
            medications=[{"name": "Naproxen", "dose": "500 mg", "frequency": "twice daily"}],
            labs=[
                {
                    "id": "lab-maya-cr",
                    "name": "Creatinine",
                    "value": "0.8",
                    "unit": "mg/dL",
                    "date": "2026-07-10",
                }
            ],
            notes=[
                {
                    "id": "note-maya-2026-07-11",
                    "title": "Orthopedics follow-up",
                    "date": "2026-07-11",
                    "author": "Dr. Priya Shah",
                    "text": "Persistent low back pain radiating to the left leg. Patient has tried physical therapy and NSAIDs without adequate relief. Lumbar MRI requested.",
                }
            ],
            insurance={
                "member_id": "NSH-DEMO-1042",
                "plan": "Northstar Choice PPO",
                "authorization": "Required",
            },
            payer_rules=[
                {
                    "id": "rule-northstar-lumbar-mri",
                    "title": "Lumbar MRI medical necessity",
                    "requirement": "Document at least six weeks of conservative therapy, including dates and response.",
                }
            ],
        ),
        Patient(
            id="daniel-cho",
            name="Daniel Cho",
            date_of_birth=date(1962, 8, 9),
            primary_condition="Type 2 diabetes",
            payer="HarborCare",
            workflow_status="monitoring",
            risk_level="medium",
            is_demo=True,
            diagnoses=[{"code": "E11.9", "name": "Type 2 diabetes"}],
            medications=[{"name": "Metformin", "dose": "1000 mg", "frequency": "twice daily"}],
            labs=[
                {
                    "id": "lab-daniel-a1c",
                    "name": "A1c",
                    "value": "7.4",
                    "unit": "%",
                    "date": "2026-07-02",
                }
            ],
            notes=[
                {
                    "id": "note-daniel-2026-07-02",
                    "title": "Primary care follow-up",
                    "date": "2026-07-02",
                    "author": "Dr. Leo Grant",
                    "text": "A1c improved. Continue current therapy and repeat labs in three months.",
                }
            ],
            insurance={
                "member_id": "HC-DEMO-883",
                "plan": "HarborCare Gold",
                "authorization": "Not required",
            },
            payer_rules=[],
        ),
        Patient(
            id="elena-rodriguez",
            name="Elena Rodriguez",
            date_of_birth=date(1991, 11, 23),
            primary_condition="Right knee pain",
            payer="Summit Mutual",
            workflow_status="coding review",
            risk_level="medium",
            is_demo=True,
            diagnoses=[{"code": "M25.569", "name": "Pain in unspecified knee"}],
            medications=[{"name": "Ibuprofen", "dose": "400 mg", "frequency": "as needed"}],
            labs=[],
            notes=[
                {
                    "id": "note-elena-2026-07-15",
                    "title": "Sports medicine consult",
                    "date": "2026-07-15",
                    "author": "Dr. Nina Park",
                    "text": "Persistent right knee pain and swelling after injury. Arthroscopy evaluation planned.",
                }
            ],
            insurance={
                "member_id": "SM-DEMO-451",
                "plan": "Summit Standard",
                "authorization": "Procedure dependent",
            },
            payer_rules=[
                {
                    "id": "rule-summit-laterality",
                    "title": "Diagnosis specificity",
                    "requirement": "Diagnosis laterality must match the requested procedure.",
                }
            ],
        ),
    ]


def reset_demo(db: Session):
    db.query(Finding).delete()
    db.query(Patient).delete()
    db.add_all(demo_patients())
    db.commit()
    return {"status": "reset", "patients_loaded": 3, "findings_cleared": True}


@app.post("/api/demo/reset")
def reset(db: Session = Depends(get_db)):
    return reset_demo(db)


@app.post("/api/demo/load")
def load(db: Session = Depends(get_db)):
    if db.scalar(select(Patient.id).limit(1)):
        return {"status": "unchanged", "patients_loaded": 0}
    return reset_demo(db)


@app.post("/api/patients/{patient_id}/review", response_model=list[FindingRead], status_code=201)
def run_review(patient_id: str, db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise missing_patient()
    data = PatientDetail.model_validate(patient).model_dump(mode="json")
    findings = [
        Finding(patient_id=patient_id, **item.model_dump(mode="json"))
        for item in get_ai_provider().review({"patient": data})
    ]
    db.add_all(findings)
    db.commit()
    return findings


@app.get("/api/findings", response_model=list[FindingRead])
def list_findings(patient_id: str | None = None, db: Session = Depends(get_db)):
    query = select(Finding).order_by(Finding.created_at.desc())
    if patient_id:
        query = query.where(Finding.patient_id == patient_id)
    return db.scalars(query).all()


def get_finding(db: Session, finding_id: str):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(404, {"code": "finding_not_found", "message": "Finding not found"})
    return finding


@app.patch("/api/findings/{finding_id}", response_model=FindingRead)
def edit_finding(finding_id: str, data: FindingEdit, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    if finding.status != "pending":
        raise HTTPException(
            409,
            {"code": "finding_already_reviewed", "message": "Only pending findings can be edited"},
        )
    finding.recommended_action = data.recommended_action
    db.commit()
    return finding


@app.post("/api/findings/{finding_id}/approve", response_model=FindingRead)
def approve_finding(finding_id: str, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    finding.status = "approved"
    db.commit()
    return finding


@app.post("/api/findings/{finding_id}/reject", response_model=FindingRead)
def reject_finding(finding_id: str, data: Rejection, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    finding.status = "rejected"
    finding.review_note = data.reason
    db.commit()
    return finding
