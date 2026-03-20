import uuid
import os
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import Column, String, Integer, DateTime, Date, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import declarative_base, relationship, mapped_column, Mapped
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from pgvector.sqlalchemy import Vector
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class Psychologist(Base):
    __tablename__ = 'psychologists'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="psychologist")

class Patient(Base):
    __tablename__ = 'patients'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('psychologists.id'), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    diagnosis_tags: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    risk_level: Mapped[str] = mapped_column(String, nullable=False) # CHECK IN ('low','medium','high')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    psychologist = relationship("Psychologist", back_populates="patients")
    sessions = relationship("Session", back_populates="patient")
    profile = relationship("PatientProfile", back_populates="patient", uselist=False)

class Session(Base):
    __tablename__ = 'sessions'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('patients.id'), nullable=False)
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    raw_dictation: Mapped[str] = mapped_column(Text, nullable=False)
    ai_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False) # CHECK IN ('draft','confirmed')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="sessions")
    clinical_note = relationship("ClinicalNote", back_populates="session", uselist=False)

class ClinicalNote(Base):
    __tablename__ = 'clinical_notes'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sessions.id'), unique=True, nullable=False)
    format: Mapped[str] = mapped_column(String, nullable=False) # 'SOAP', 'DAP', 'BIRP'
    
    # SOAP specific
    subjective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # DAP specific
    data_field: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # avoiding 'data' keyword
    
    detected_patterns: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    alerts: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    suggested_next_steps: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    evolution_delta: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    embedding = mapped_column(Vector(1536))

    session = relationship("Session", back_populates="clinical_note")

class PatientProfile(Base):
    __tablename__ = 'patient_profiles'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('patients.id'), unique=True, nullable=False)
    recurring_themes: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    protective_factors: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    risk_factors: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    progress_indicators: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient", back_populates="profile")

async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        # Create hnsw index
        await conn.execute(text("CREATE INDEX IF NOT EXISTS clinical_notes_embedding_idx ON clinical_notes USING hnsw (embedding vector_cosine_ops);"))

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
