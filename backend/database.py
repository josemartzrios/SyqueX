import uuid
import os
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import Column, String, Integer, DateTime, Date, ForeignKey, Text, Enum, JSON, Boolean
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
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # bcrypt hash
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="psychologist")


class AuditLog(Base):
    """Tabla de auditoría inmutable — solo recibe INSERTs, nunca UPDATEs."""
    __tablename__ = 'audit_logs'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    psychologist_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE | READ | UPDATE | DELETE | LOGIN | ACCESS_DENIED
    entity: Mapped[str] = mapped_column(String(50), nullable=False)  # patient | session | clinical_note | auth
    entity_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    # IMPORTANTE: nunca guardar datos clínicos aquí — solo IDs y contadores
    extra: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

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
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    messages: Mapped[list] = mapped_column(JSONB, default=list)  # Full conversation turns [{role, content}]
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
    patient_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient", back_populates="profile")

async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        # Migrate existing tables with new columns (safe — IF NOT EXISTS)
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]';"))
        await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS patient_summary TEXT;"))
        # Auth columns — nullable para compatibilidad con datos existentes
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS password_hash TEXT;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"))
        # Create hnsw index
        await conn.execute(text("CREATE INDEX IF NOT EXISTS clinical_notes_embedding_idx ON clinical_notes USING hnsw (embedding vector_cosine_ops);"))

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
