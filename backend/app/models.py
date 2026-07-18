from datetime import date, datetime
from typing import Any
from uuid import uuid4
from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str]
    date_of_birth: Mapped[date] = mapped_column(Date)
    primary_condition: Mapped[str]
    payer: Mapped[str]
    workflow_status: Mapped[str] = mapped_column(default="new")
    risk_level: Mapped[str] = mapped_column(default="low")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    diagnoses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    medications: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    labs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    notes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    insurance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    payer_rules: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"))
    issue: Mapped[str]
    why_it_matters: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    confidence: Mapped[float] = mapped_column(Float)
    recommended_action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(default="pending")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
