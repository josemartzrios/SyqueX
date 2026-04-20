import uuid
import os
import ssl as _ssl
from datetime import datetime, date, timezone
from typing import List, Optional

UTC = timezone.utc

from sqlalchemy import (
    Column, String, Integer, DateTime, Date, ForeignKey, Text,
    Boolean, Index, CheckConstraint, event
)
from sqlalchemy.orm import declarative_base, relationship, mapped_column, Mapped
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from pgvector.sqlalchemy import Vector
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente")

# MED-02: Enforce SSL for production (Supabase / Railway)
# Supabase's connection pooler uses a self-signed cert in its chain;
# we require encryption but skip verification (cert is from a known host we configure).
_connect_args = {"statement_cache_size": 0}
if "supabase" in DATABASE_URL or "railway" in DATABASE_URL:
    _ssl_ctx = _ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl"] = _ssl_ctx

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
    connect_args=_connect_args,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


class Psychologist(Base):
    __tablename__ = 'psychologists'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # bcrypt hash
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    # Campos de onboarding (LFPDPPP)
    cedula_profesional: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    specialty: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    accepted_privacy_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_terms_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    privacy_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    terms_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Trial
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Stripe
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    patients = relationship("Patient", back_populates="psychologist")
    subscription = relationship("Subscription", back_populates="psychologist", uselist=False)


class AuditLog(Base):
    """Tabla de auditoría inmutable — solo recibe INSERTs, nunca UPDATEs."""
    __tablename__ = 'audit_logs'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    psychologist_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    # CREATE | READ | UPDATE | DELETE | LOGIN | ACCESS_DENIED
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    # patient | session | clinical_note | auth
    entity: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    # IMPORTANTE: nunca guardar datos clínicos aquí — solo IDs y contadores
    extra: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        Index('idx_audit_logs_psychologist_id', 'psychologist_id'),
        Index('idx_audit_logs_timestamp', 'timestamp'),
        Index('idx_audit_logs_entity', 'entity'),
        Index('idx_audit_logs_action', 'action'),
        # Composite: buscar acciones de un psicólogo en un período
        Index('idx_audit_logs_psych_timestamp', 'psychologist_id', 'timestamp'),
    )


class Subscription(Base):
    __tablename__ = 'subscriptions'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='RESTRICT'), nullable=False
    )
    plan_slug: Mapped[str] = mapped_column(String(50), nullable=False)
    price_mxn_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    stripe_price_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    canceled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('trialing','active','past_due','canceled','unpaid')",
            name='chk_subscriptions_status'
        ),
        Index('idx_subscriptions_psychologist_id', 'psychologist_id'),
        Index('idx_subscriptions_status', 'status'),
    )

    psychologist = relationship("Psychologist", back_populates="subscription")


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='CASCADE'), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        Index('idx_refresh_tokens_token_hash', 'token_hash'),
        Index('idx_refresh_tokens_psychologist_id', 'psychologist_id'),
    )


class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='CASCADE'), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        Index('idx_password_reset_tokens_hash', 'token_hash'),
    )


class ProcessedStripeEvent(Base):
    __tablename__ = 'processed_stripe_events'

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # event.id de Stripe
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)


class Patient(Base):
    __tablename__ = 'patients'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='RESTRICT'), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    diagnosis_tags: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    # Intake clínico — todos nullable (obligatoriedad vive en Pydantic)
    marital_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    occupation: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # { "name": str, "relationship": str, "phone": str } (stored as encrypted JSON string)
    reason_for_consultation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    psychological_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)
    # Soft delete — LFPDPPP: permite anonimización en lugar de borrado físico
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("risk_level IN ('low', 'medium', 'high')", name='chk_patients_risk_level'),
        Index('idx_patients_psychologist_id', 'psychologist_id'),
        # Partial index: solo pacientes activos (más común en queries)
        Index('idx_patients_active', 'psychologist_id', postgresql_where=text("deleted_at IS NULL")),
    )

    psychologist = relationship("Psychologist", back_populates="patients")
    sessions = relationship("Session", back_populates="patient")
    profile = relationship("PatientProfile", back_populates="patient", uselist=False)


class Session(Base):
    __tablename__ = 'sessions'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('patients.id', ondelete='RESTRICT'), nullable=False
    )
    session_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    raw_dictation: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False, default="SOAP")
    ai_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    messages: Mapped[str] = mapped_column(Text, default="[]")  # Full conversation turns [{role, content}] (stored as encrypted JSON string)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'confirmed')", name='chk_sessions_status'),
        Index('idx_sessions_patient_id', 'patient_id'),
        Index('idx_sessions_session_date', 'session_date'),
        # Composite: historial de un paciente ordenado cronológicamente
        Index('idx_sessions_patient_date', 'patient_id', 'session_date'),
        # Partial index: sesiones activas (no archivadas)
        Index('idx_sessions_active', 'patient_id', postgresql_where=text("is_archived = FALSE")),
    )

    patient = relationship("Patient", back_populates="sessions")
    clinical_note = relationship("ClinicalNote", back_populates="session", uselist=False)


class ClinicalNote(Base):
    __tablename__ = 'clinical_notes'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('sessions.id', ondelete='CASCADE'), unique=True, nullable=False
    )
    format: Mapped[str] = mapped_column(String(20), nullable=False)

    # SOAP fields
    subjective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # DAP fields
    data_field: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # avoiding 'data' keyword

    detected_patterns: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    alerts: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    suggested_next_steps: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    evolution_delta: Mapped[dict] = mapped_column(JSONB, default=dict)

    embedding = mapped_column(Vector(1024))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        CheckConstraint("format IN ('SOAP', 'DAP', 'BIRP')", name='chk_clinical_notes_format'),
        # session_id ya tiene UNIQUE → índice automático; agregamos idx explícito solo por claridad ORM
    )

    session = relationship("Session", back_populates="clinical_note")


class PatientProfile(Base):
    __tablename__ = 'patient_profiles'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('patients.id', ondelete='CASCADE'), unique=True, nullable=False
    )
    recurring_themes: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    protective_factors: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    risk_factors: Mapped[List[str]] = mapped_column(ARRAY(Text), default=list)
    progress_indicators: Mapped[dict] = mapped_column(JSONB, default=dict)
    patient_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        Index('idx_patient_profiles_patient_id', 'patient_id'),
    )

    patient = relationship("Patient", back_populates="profile")


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)

        # ── Migraciones seguras (IF NOT EXISTS / IF NOT EXISTS) ──────────────
        # Sessions
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"))
        # session_number is NULL for chat sessions — drop NOT NULL constraint if still present
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='sessions' AND column_name='session_number'
                      AND is_nullable='NO'
                ) THEN
                    ALTER TABLE sessions ALTER COLUMN session_number DROP NOT NULL;
                END IF;
            END$$;
        """))
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages TEXT NOT NULL DEFAULT '[]';"))
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();"))
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'SOAP';"))

        # PatientProfile — renombrar last_updated → updated_at
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='patient_profiles' AND column_name='last_updated'
                ) THEN
                    ALTER TABLE patient_profiles RENAME COLUMN last_updated TO updated_at;
                END IF;
            END$$;
        """))
        await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS patient_summary TEXT;"))
        await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();"))

        # Psychologists
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS password_hash TEXT;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS cedula_profesional VARCHAR(20);"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS specialty VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS accepted_privacy_at TIMESTAMP WITH TIME ZONE;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMP WITH TIME ZONE;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(10);"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS terms_version VARCHAR(10);"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;"))
        await conn.execute(text("ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(50);"))

        # Patients — migrate timestamps to TIMESTAMPTZ (asyncpg rejects aware datetimes into TIMESTAMP)
        for col in ("created_at", "updated_at", "deleted_at"):
            await conn.execute(text(f"""
                DO $$ BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='patients' AND column_name='{col}'
                          AND data_type='timestamp without time zone'
                    ) THEN
                        ALTER TABLE patients ALTER COLUMN {col}
                            TYPE TIMESTAMP WITH TIME ZONE
                            USING {col} AT TIME ZONE 'UTC';
                    END IF;
                END$$;
            """))

        # Patients — soft delete
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;"))

        # Patients — intake clínico (nullable para pacientes legacy)
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status VARCHAR(30);"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(120);"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact JSONB;"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS reason_for_consultation TEXT;"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_history TEXT;"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS psychological_history TEXT;"))

        # Encryption: JSONB → Text (idempotente)
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='patients' AND column_name='emergency_contact'
                      AND data_type='jsonb'
                ) THEN
                    ALTER TABLE patients ALTER COLUMN emergency_contact TYPE TEXT
                        USING emergency_contact::text;
                END IF;
            END$$;
        """))
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='sessions' AND column_name='messages'
                      AND data_type='jsonb'
                ) THEN
                    ALTER TABLE sessions ALTER COLUMN messages TYPE TEXT
                        USING messages::text;
                END IF;
            END$$;
        """))

        # ClinicalNote — timestamps (add if missing, then migrate to TIMESTAMPTZ)
        await conn.execute(text("ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();"))
        await conn.execute(text("ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();"))

        # Migrate all remaining TIMESTAMP → TIMESTAMPTZ columns
        _tz_migrations = {
            "psychologists": ["created_at", "updated_at"],
            "audit_logs": ["timestamp"],
            "sessions": ["created_at", "updated_at"],
            "clinical_notes": ["created_at", "updated_at"],
            "patient_profiles": ["updated_at"],
        }
        for table, cols in _tz_migrations.items():
            for col in cols:
                await conn.execute(text(f"""
                    DO $$ BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='{table}' AND column_name='{col}'
                              AND data_type='timestamp without time zone'
                        ) THEN
                            ALTER TABLE {table} ALTER COLUMN {col}
                                TYPE TIMESTAMP WITH TIME ZONE
                                USING {col} AT TIME ZONE 'UTC';
                        END IF;
                    END$$;
                """))

        # ── CHECK constraints (idempotente) ──────────────────────────────────
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_risk_level'
                ) THEN
                    ALTER TABLE patients ADD CONSTRAINT chk_patients_risk_level
                        CHECK (risk_level IN ('low', 'medium', 'high'));
                END IF;
            END$$;
        """))
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sessions_status'
                ) THEN
                    ALTER TABLE sessions ADD CONSTRAINT chk_sessions_status
                        CHECK (status IN ('draft', 'confirmed'));
                END IF;
            END$$;
        """))
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clinical_notes_format'
                ) THEN
                    ALTER TABLE clinical_notes ADD CONSTRAINT chk_clinical_notes_format
                        CHECK (format IN ('SOAP', 'DAP', 'BIRP'));
                END IF;
            END$$;
        """))

        # ── Indexes ──────────────────────────────────────────────────────────
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_patients_psychologist_id ON patients(psychologist_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(psychologist_id) WHERE deleted_at IS NULL;"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_session_date ON sessions(session_date);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_patient_date ON sessions(patient_id, session_date);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(patient_id) WHERE is_archived = FALSE;"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_patient_profiles_patient_id ON patient_profiles(patient_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_psychologist_id ON audit_logs(psychologist_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_psych_timestamp ON audit_logs(psychologist_id, timestamp);"))

        # ── Embedding dimension migration: 1536 → 1024 (FastEmbed BAAI/bge-m3) ──
        await conn.execute(text("DROP INDEX IF EXISTS clinical_notes_embedding_idx;"))
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'clinical_notes'
                      AND column_name = 'embedding'
                ) THEN
                    ALTER TABLE clinical_notes ALTER COLUMN embedding TYPE vector(1024);
                END IF;
            END$$;
        """))

        # Vector search — HNSW (cosine distance)
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS clinical_notes_embedding_idx "
            "ON clinical_notes USING hnsw (embedding vector_cosine_ops);"
        ))

        # ── RLS — Row Level Security ─────────────────────────────────────────
        # NOTA: La tabla `psychologists` NO recibe RLS. Las rutas de auth
        # (/login, /register) la consultan sin app.psychologist_id seteado;
        # habilitarla bloquearía el acceso. La seguridad de esa tabla está
        # garantizada por la lógica de auth (JWT + bcrypt).
        # NOTA 2: Si DATABASE_URL usa el usuario `postgres` (superuser de
        # Supabase), ese rol tiene BYPASSRLS implícito. Para enforcement real
        # crear un rol no-superuser es un paso post-MVP.
        for _tbl in [
            "patients", "sessions", "clinical_notes", "patient_profiles",
            "subscriptions", "refresh_tokens", "audit_logs",
        ]:
            await conn.execute(text(f"ALTER TABLE {_tbl} ENABLE ROW LEVEL SECURITY;"))

        # Políticas de aislamiento por psicólogo — idempotentes via DO blocks
        _rls_policies = [
            ("patients_isolation", "patients",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("sessions_isolation", "sessions",
             "patient_id IN (SELECT id FROM patients WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("clinical_notes_isolation", "clinical_notes",
             "session_id IN (SELECT s.id FROM sessions s JOIN patients p ON s.patient_id = p.id WHERE p.psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("patient_profiles_isolation", "patient_profiles",
             "patient_id IN (SELECT id FROM patients WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("subscriptions_isolation", "subscriptions",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("refresh_tokens_isolation", "refresh_tokens",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("audit_logs_isolation", "audit_logs",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid OR psychologist_id IS NULL"),
        ]
        for _name, _table, _using in _rls_policies:
            await conn.execute(text(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_policies
                        WHERE tablename = '{_table}' AND policyname = '{_name}'
                    ) THEN
                        CREATE POLICY {_name} ON {_table} USING ({_using});
                    END IF;
                END$$;
            """))



async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
