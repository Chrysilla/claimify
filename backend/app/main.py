from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.ai.factory import get_ai_provider
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import Patient
from app.repositories.findings import FindingRepository
from app.repositories.patients import PatientRepository
from app.schemas import (
    FindingEdit,
    FindingRead,
    PatientCreate,
    PatientDetail,
    PatientRead,
    PatientUpdate,
    Rejection,
)
from app.services.demo import DemoService
from app.services.reviews import ReviewService


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
    return PatientRepository(db).list()


@app.get("/api/patients/{patient_id}", response_model=PatientDetail)
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = PatientRepository(db).get(patient_id)
    if not patient:
        raise missing_patient()
    return patient


@app.post("/api/patients", response_model=PatientRead, status_code=201)
def create_patient(data: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(**data.model_dump())
    return PatientRepository(db).save(patient)


@app.patch("/api/patients/{patient_id}", response_model=PatientRead)
def update_patient(patient_id: str, data: PatientUpdate, db: Session = Depends(get_db)):
    repository = PatientRepository(db)
    patient = repository.get(patient_id)
    if not patient:
        raise missing_patient()
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(patient, key, value)
    return repository.save(patient)


@app.post("/api/demo/reset")
def reset(db: Session = Depends(get_db)):
    return DemoService(db).reset()


@app.post("/api/demo/load")
def load(db: Session = Depends(get_db)):
    if db.scalar(select(Patient.id).limit(1)):
        return {"status": "unchanged", "patients_loaded": 0}
    return DemoService(db).reset()


@app.post("/api/patients/{patient_id}/review", response_model=list[FindingRead], status_code=201)
def run_review(patient_id: str, db: Session = Depends(get_db)):
    patient = PatientRepository(db).get(patient_id)
    if not patient:
        raise missing_patient()
    return ReviewService(FindingRepository(db), get_ai_provider()).run(patient)


@app.get("/api/findings", response_model=list[FindingRead])
def list_findings(patient_id: str | None = None, db: Session = Depends(get_db)):
    return FindingRepository(db).list(patient_id)


def get_finding(db: Session, finding_id: str):
    finding = FindingRepository(db).get(finding_id)
    if not finding:
        raise HTTPException(404, {"code": "finding_not_found", "message": "Finding not found"})
    return finding


@app.patch("/api/findings/{finding_id}", response_model=FindingRead)
def edit_finding(finding_id: str, data: FindingEdit, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    try:
        return ReviewService(FindingRepository(db), get_ai_provider()).edit(
            finding, data.recommended_action
        )
    except ValueError:
        raise HTTPException(
            409,
            {"code": "finding_already_reviewed", "message": "Only pending findings can be edited"},
        )


@app.post("/api/findings/{finding_id}/approve", response_model=FindingRead)
def approve_finding(finding_id: str, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    try:
        return ReviewService(FindingRepository(db), get_ai_provider()).decide(finding, "approved")
    except ValueError:
        raise HTTPException(
            409, {"code": "finding_already_reviewed", "message": "Finding already reviewed"}
        )


@app.post("/api/findings/{finding_id}/reject", response_model=FindingRead)
def reject_finding(finding_id: str, data: Rejection, db: Session = Depends(get_db)):
    finding = get_finding(db, finding_id)
    try:
        return ReviewService(FindingRepository(db), get_ai_provider()).decide(
            finding, "rejected", data.reason
        )
    except ValueError:
        raise HTTPException(
            409, {"code": "finding_already_reviewed", "message": "Finding already reviewed"}
        )
