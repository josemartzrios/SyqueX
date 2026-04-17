import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import Optional, List, Dict, Any, Literal
from datetime import date, datetime

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist, AsyncSessionLocal
from agent import process_session, update_patient_profile_summary
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding
from api.limiter import limiter
from exceptions import InvalidUUIDError, SessionNotFoundError, PatientNotFoundError, UnauthorizedAccessError
from api.auth import get_current_psychologist
from api.audit import log_audit


def _parse_uuid(value: str, label: str = "ID") -> uuid.UUID:
    """Parse a UUID string, raising a domain error on invalid format."""
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        raise InvalidUUIDError(
            f"{label} no es un UUID válido.",
            code="INVALID_UUID",
            details={"value": value},
        )

logger = logging.getLogger(__name__)

router = APIRouter(tags=["clinical"])


# ---------------------------------------------------------------------------
# Ownership verification — OWASP A01 Broken Access Control
# ---------------------------------------------------------------------------

async def _get_owned_patient(
    db: AsyncSession, psychologist_id: uuid.UUID, patient_id: str
) -> Patient:
    """Verifica que el paciente exista y pertenezca al psicólogo autenticado."""
    puuid = _parse_uuid(patient_id, "patient_id")
    patient = await db.get(Patient, puuid)
    if not patient or patient.deleted_at is not None:
        raise PatientNotFoundError("Paciente no encontrado.", code="PATIENT_NOT_FOUND")
    if patient.psychologist_id != psychologist_id:
        raise UnauthorizedAccessError("Acceso no autorizado a este paciente.", code="FORBIDDEN")
    return patient


@router.get("/health", tags=["ops"])
async def health():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

MaritalStatus = Literal[
    "soltero", "casado", "divorciado", "viudo", "union_libre", "otro"
]


class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    relationship: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=7, max_length=20)


class PatientCreate(BaseModel):
    # Obligatorios (flujo híbrido)
    name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    reason_for_consultation: str = Field(..., min_length=1, max_length=2000)

    # Opcionales
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)

    # Pre-existentes
    diagnosis_tags: Optional[List[str]] = []
    risk_level: str = "low"

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v


class PatientUpdate(BaseModel):
    # Todos opcionales — PATCH parcial. Los 3 campos mínimos validan min_length=1
    # cuando se envían (no se pueden limpiar con "").
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    date_of_birth: Optional[date] = None
    reason_for_consultation: Optional[str] = Field(None, min_length=1, max_length=2000)
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)
    diagnosis_tags: Optional[List[str]] = None
    risk_level: Optional[str] = None

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: Optional[date]) -> Optional[date]:
        if v is None:
            return v
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v

class ProcessSessionRequest(BaseModel):
    raw_dictation: str
    format: Optional[str] = "SOAP"

class ConfirmNoteRequest(BaseModel):
    edited_note: Optional[Dict[str, Any]] = None

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class PatientOut(BaseModel):
    id: uuid.UUID
    name: str
    risk_level: Optional[str] = None
    date_of_birth: Optional[date] = None
    diagnosis_tags: Optional[List[str]] = []

    # Intake
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[Dict[str, Any]] = None
    reason_for_consultation: Optional[str] = None
    medical_history: Optional[str] = None
    psychological_history: Optional[str] = None

    class Config:
        from_attributes = True

class SessionOut(BaseModel):
    id: uuid.UUID
    session_number: int
    session_date: Optional[date]
    raw_dictation: Optional[str]
    ai_response: Optional[str]
    status: str
    format: str = "SOAP"
    structured_note: Optional[Dict[str, Any]] = None
    detected_patterns: Optional[List[str]] = None
    alerts: Optional[List[str]] = None
    suggested_next_steps: Optional[List[str]] = None
    clinical_note_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True

class PaginatedSessions(BaseModel):
    items: List[SessionOut]
    total: int
    page: int
    page_size: int
    pages: int

class ConversationOut(BaseModel):
    id: Optional[str]             # session id — None if patient has no sessions
    patient_id: str
    patient_name: str
    session_number: Optional[int]
    session_date: Optional[date]
    dictation_preview: Optional[str]
    status: Optional[str]
    message_count: Optional[int]

    class Config:
        from_attributes = True

class PaginatedConversations(BaseModel):
    items: List[ConversationOut]
    total: int
    page: int
    page_size: int
    pages: int

class ProcessSessionOut(BaseModel):
    text_fallback: Optional[str]
    session_id: Optional[str] = None

class ConfirmNoteOut(BaseModel):
    id: uuid.UUID
    status: str = "confirmed"

class ArchiveOut(BaseModel):
    id: str
    archived: bool = True

class ProfileOut(BaseModel):
    profile: Dict[str, Any]
    recent_sessions: List[Dict[str, Any]]

# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

@router.get("/patients", response_model=List[PatientOut], tags=["patients"])
async def list_patients(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    query = select(Patient).where(
        Patient.psychologist_id == psychologist.id,
        Patient.deleted_at.is_(None),
    ).order_by(Patient.name)
    res = await db.execute(query)
    patients = res.scalars().all()

    return [PatientOut(id=p.id, name=p.name, risk_level=p.risk_level) for p in patients]


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED, tags=["patients"])
async def create_patient(
    payload: PatientCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    patient = Patient(
        psychologist_id=current_user.id,
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        diagnosis_tags=payload.diagnosis_tags or [],
        risk_level=payload.risk_level,
        marital_status=payload.marital_status,
        occupation=payload.occupation,
        address=payload.address,
        emergency_contact=payload.emergency_contact.model_dump() if payload.emergency_contact else None,
        reason_for_consultation=payload.reason_for_consultation,
        medical_history=payload.medical_history,
        psychological_history=payload.psychological_history,
    )
    db.add(patient)
    await db.flush()  # populate patient.id

    db.add(PatientProfile(patient_id=patient.id))

    # Audit: nombres de campos enviados (solo los set explícitamente), sin valores
    fields_set = sorted(payload.model_fields_set)
    await log_audit(
        db=db,
        action="CREATE",
        entity="patient",
        entity_id=str(patient.id),
        psychologist_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
        metadata={"fields_set": fields_set},
    )

    await db.commit()
    await db.refresh(patient)

    return PatientOut.model_validate(patient)


@router.get("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    puuid = _parse_uuid(patient_id, "patient_id")
    res = await db.execute(
        select(Patient).where(
            Patient.id == puuid,
            Patient.deleted_at.is_(None),
        )
    )
    patient = res.scalar_one_or_none()

    # Ownership: no revelar existencia de pacientes ajenos
    if not patient or patient.psychologist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    return PatientOut.model_validate(patient)


@router.patch("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    puuid = _parse_uuid(patient_id, "patient_id")
    res = await db.execute(
        select(Patient).where(
            Patient.id == puuid,
            Patient.deleted_at.is_(None),
        )
    )
    patient = res.scalar_one_or_none()

    if not patient or patient.psychologist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    # Solo los campos explícitamente enviados — permite setear null en opcionales
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        if field == "emergency_contact":
            # Pydantic ya validó la sub-estructura; persistir como dict (o None)
            setattr(
                patient,
                field,
                value.model_dump() if hasattr(value, "model_dump") else value,
            )
        else:
            setattr(patient, field, value)

    fields_changed = sorted(updates.keys())
    await log_audit(
        db=db,
        action="UPDATE",
        entity="patient",
        entity_id=str(patient.id),
        psychologist_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
        metadata={"fields_changed": fields_changed},
    )

    await db.commit()
    await db.refresh(patient)
    return PatientOut.model_validate(patient)


@router.get("/patients/{patient_id}/profile", response_model=ProfileOut, tags=["patients"])
async def get_patient_profile(
    patient_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    res = await db.execute(select(PatientProfile).where(PatientProfile.patient_id == patient.id))
    profile = res.scalar_one_or_none()

    res_s = await db.execute(
        select(Session, ClinicalNote)
        .join(ClinicalNote, Session.id == ClinicalNote.session_id)
        .where(Session.patient_id == patient.id, Session.status == "confirmed")
        .order_by(Session.session_date.desc())
        .limit(3)
    )
    recent_sessions = [{"session_date": s.session_date, "assessment": c.assessment} for s, c in res_s]

    return ProfileOut(
        profile={
            "recurring_themes": profile.recurring_themes if profile else [],
            "protective_factors": profile.protective_factors if profile else [],
            "risk_factors": profile.risk_factors if profile else [],
            "progress_indicators": profile.progress_indicators if profile else {},
        },
        recent_sessions=recent_sessions,
    )


@router.get("/patients/{patient_id}/sessions", response_model=PaginatedSessions, tags=["patients"])
async def get_patient_sessions(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    puuid = patient.id
    offset = (page - 1) * page_size

    total_res = await db.execute(
        select(func.count()).select_from(Session)
        .where(Session.patient_id == puuid, Session.is_archived == False)
    )
    total = total_res.scalar_one()

    res = await db.execute(
        select(Session, ClinicalNote)
        .outerjoin(ClinicalNote, Session.id == ClinicalNote.session_id)
        .where(Session.patient_id == puuid, Session.is_archived == False)
        .order_by(Session.created_at.asc())
        .limit(page_size)
        .offset(offset)
    )

    items = []
    for s, cn in res.all():
        items.append(SessionOut(
            id=s.id,
            session_number=s.session_number,
            session_date=s.session_date,
            raw_dictation=s.raw_dictation,
            ai_response=s.ai_response,
            status=s.status,
            format=s.format,
            structured_note={
                "subjective": cn.subjective,
                "objective": cn.objective,
                "assessment": cn.assessment,
                "plan": cn.plan,
            } if cn else None,
            detected_patterns=list(cn.detected_patterns) if cn and cn.detected_patterns is not None else None,
            alerts=list(cn.alerts) if cn and cn.alerts is not None else None,
            suggested_next_steps=list(cn.suggested_next_steps) if cn and cn.suggested_next_steps is not None else None,
            clinical_note_id=cn.id if cn else None,
        ))

    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedSessions(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/patients/{patient_id}/report", tags=["patients"])
async def patient_report(
    patient_id: str,
    period: str = "quarterly",
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    return await generate_evolution_report(db, str(patient.id), period)


@router.get("/patients/{patient_id}/search", tags=["patients"])
async def patient_search(
    patient_id: str,
    q: str = Query(..., min_length=1),
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    return await search_patient_history(db, str(patient.id), q)

# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.post("/sessions/{patient_id}/process", response_model=ProcessSessionOut, tags=["sessions"])
@limiter.limit("30/hour")
async def process_session_endpoint(
    request: Request,
    patient_id: str,
    rec: ProcessSessionRequest,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    patient_uuid = patient.id

    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format)

    session_id = str(uuid.uuid4())

    res_last = await db.execute(
        select(Session)
        .where(Session.patient_id == patient_uuid)
        .order_by(Session.session_number.desc())
        .limit(1)
    )
    last_session = res_last.scalar_one_or_none()
    current_session_number = (last_session.session_number + 1) if last_session else 1

    # Chat sessions are confirmed immediately (no confirmation step needed)
    session_format = rec.format or "SOAP"
    session_status = "confirmed" if session_format.lower() == "chat" else "draft"

    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=current_session_number,
        session_date=date.today(),
        raw_dictation=rec.raw_dictation,
        format=session_format,
        ai_response=response.get("text_fallback"),
        messages=response.get("session_messages", []),
        status=session_status,
    )
    db.add(new_session)
    await db.commit()

    return ProcessSessionOut(
        text_fallback=response.get("text_fallback"),
        session_id=session_id,
    )


async def _background_update_profile(patient_id: uuid.UUID, session_note: dict) -> None:
    """Runs after the HTTP response is sent. Opens its own DB session."""
    async with AsyncSessionLocal() as db:
        try:
            await update_patient_profile_summary(db, patient_id, session_note)
        except Exception as e:
            logger.error(f"Background profile update failed: {e}")


@router.post("/sessions/{session_id}/confirm", response_model=ConfirmNoteOut, tags=["sessions"])
async def confirm_session(
    session_id: str,
    req: ConfirmNoteRequest,
    background_tasks: BackgroundTasks,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(
        select(Session).join(Patient).where(
            Session.id == session_uuid,
            Patient.psychologist_id == psychologist.id,
        )
    )
    sess = res.scalar_one_or_none()

    if not sess:
        raise SessionNotFoundError("Sesión no encontrada.", code="SESSION_NOT_FOUND", details={"session_id": session_id})

    sess.status = "confirmed"
    note_data = req.edited_note or {}

    text_to_embed = " ".join([str(v) for k, v in note_data.get("structured_note", {}).items() if v])
    embedding = await get_embedding(text_to_embed)

    cn = ClinicalNote(
        session_id=sess.id,
        format=note_data.get("format", "SOAP"),
        subjective=note_data.get("structured_note", {}).get("subjective"),
        objective=note_data.get("structured_note", {}).get("objective"),
        assessment=note_data.get("structured_note", {}).get("assessment"),
        plan=note_data.get("structured_note", {}).get("plan"),
        detected_patterns=note_data.get("detected_patterns", []),
        alerts=note_data.get("alerts", []),
        suggested_next_steps=note_data.get("suggested_next_steps", []),
        evolution_delta=note_data.get("evolution_delta", {}),
        embedding=embedding,
    )
    db.add(cn)
    await db.commit()

    summary_data = {
        "text_fallback": sess.ai_response or "",
        "detected_patterns": note_data.get("detected_patterns", []),
        "alerts": note_data.get("alerts", []),
        "suggested_next_steps": note_data.get("suggested_next_steps", []),
    }
    background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)

    return ConfirmNoteOut(id=cn.id)


@router.patch("/sessions/{session_id}/archive", response_model=ArchiveOut, tags=["sessions"])
async def archive_session(
    session_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(
        select(Session).join(Patient).where(
            Session.id == session_uuid,
            Patient.psychologist_id == psychologist.id,
        )
    )
    sess = res.scalar_one_or_none()

    if not sess:
        raise SessionNotFoundError("Sesión no encontrada.", code="SESSION_NOT_FOUND", details={"session_id": session_id})

    sess.is_archived = True
    await db.commit()

    return ArchiveOut(id=session_id)


@router.patch("/patients/{patient_id}/sessions/archive", response_model=ArchiveOut, tags=["sessions"])
async def archive_patient_sessions(
    patient_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Archive all sessions for a patient so they disappear from the conversations list."""
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    patient_uuid = patient.id
    res = await db.execute(
        select(Session).where(Session.patient_id == patient_uuid, Session.is_archived == False)
    )
    sessions = res.scalars().all()
    for sess in sessions:
        sess.is_archived = True
    await db.commit()
    return ArchiveOut(id=patient_id)

# ---------------------------------------------------------------------------
# Conversations (cross-patient view)
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=PaginatedConversations, tags=["conversations"])
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    # One entry per patient: most recent Session with real content via DISTINCT ON (PostgreSQL)
    # INNER JOIN ensures only patients with at least one non-empty, non-archived session appear
    sql = text("""
        SELECT DISTINCT ON (p.id)
            p.id            AS patient_id,
            p.name          AS patient_name,
            s.id            AS session_id,
            s.session_number,
            s.session_date,
            s.raw_dictation AS dictation_preview,
            s.status,
            s.messages
        FROM patients p
        INNER JOIN sessions s
            ON s.patient_id = p.id
            AND s.is_archived = FALSE
            AND s.raw_dictation IS NOT NULL
        WHERE p.deleted_at IS NULL
          AND p.psychologist_id = :psy_id
        ORDER BY p.id, s.created_at DESC NULLS LAST
    """)

    res = await db.execute(sql, {"psy_id": psychologist.id})
    rows = res.mappings().all()

    items = []
    for row in rows:
        raw = row.get("dictation_preview")
        preview = (raw[:120] + "...") if raw and len(raw) > 120 else raw
        messages = row.get("messages") or []

        items.append(ConversationOut(
            id=str(row["session_id"]) if row["session_id"] else None,
            patient_id=str(row["patient_id"]),
            patient_name=row["patient_name"],
            session_number=row.get("session_number"),
            session_date=row.get("session_date"),
            dictation_preview=preview,
            status=row.get("status"),
            message_count=len(messages) if isinstance(messages, list) else 0,
        ))

    total = len(items)
    offset = (page - 1) * page_size
    paged = items[offset: offset + page_size]
    pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedConversations(
        items=paged, total=total, page=page, page_size=page_size, pages=pages
    )
