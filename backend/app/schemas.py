from datetime import date, datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    name: str
    date_of_birth: date
    primary_condition: str
    payer: str
    workflow_status: str = "new"
    risk_level: Literal["low", "medium", "high"] = "low"


class PatientUpdate(BaseModel):
    name: str | None = None
    primary_condition: str | None = None
    payer: str | None = None
    workflow_status: str | None = None
    risk_level: Literal["low", "medium", "high"] | None = None


class PatientRead(PatientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    is_demo: bool
    created_at: datetime


class PatientDetail(PatientRead):
    diagnoses: list[dict[str, Any]]
    medications: list[dict[str, Any]]
    labs: list[dict[str, Any]]
    notes: list[dict[str, Any]]
    insurance: dict[str, Any]
    payer_rules: list[dict[str, Any]]


class Evidence(BaseModel):
    source_type: str
    source_id: str
    label: str
    excerpt: str


class FindingCreate(BaseModel):
    issue: str
    why_it_matters: str
    evidence: list[Evidence] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    recommended_action: str


class FindingRead(FindingCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    patient_id: str
    status: Literal["pending", "approved", "rejected"]
    review_note: str | None
    created_at: datetime


class FindingEdit(BaseModel):
    recommended_action: str = Field(min_length=3)


class Rejection(BaseModel):
    reason: str = Field(min_length=3)
