import uuid
from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import Optional, List, Dict, Any
from datetime import date, datetime

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist
from agent import process_session, update_patient_profile_summary
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding
from api.limiter import limiter
from exceptions import InvalidUUIDError, SessionNotFoundError, PatientNotFoundError


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

router = APIRouter(tags=["clinical"])

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class PatientCreate(BaseModel):
    name: str
    date_of_birth: Optional[date] = None
    diagnosis_tags: Optional[List[str]] = []
    risk_level: str = "low"

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

    class Config:
        from_attributes = True

class SessionOut(BaseModel):
    id: uuid.UUID
    session_number: int
    session_date: Optional[date]
    raw_dictation: Optional[str]
    ai_response: Optional[str]
    status: str

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
async def list_patients(db: AsyncSession = Depends(get_db)):
    query = select(Patient).where(Patient.deleted_at.is_(None)).order_by(Patient.name)
    res = await db.execute(query)
    patients = res.scalars().all()

    if not patients:
        psy_query = select(Psychologist).limit(1)
        psy_res = await db.execute(psy_query)
        psy = psy_res.scalar_one_or_none()
        if not psy:
            psy = Psychologist(name="Dr. Default", email="dr@default.com")
            db.add(psy)
            await db.commit()
            await db.refresh(psy)

        default_patient = Patient(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            psychologist_id=psy.id,
            name="Paciente de Prueba",
            risk_level="low"
        )
        db.add(default_patient)
        db.add(PatientProfile(patient_id=default_patient.id))
        await db.commit()
        return [PatientOut(id=default_patient.id, name=default_patient.name, risk_level="low")]

    return [PatientOut(id=p.id, name=p.name, risk_level=p.risk_level) for p in patients]


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED, tags=["patients"])
async def create_patient(payload: PatientCreate, db: AsyncSession = Depends(get_db)):
    query = select(Psychologist).limit(1)
    res = await db.execute(query)
    psy = res.scalar_one_or_none()

    if not psy:
        psy = Psychologist(name="Dr. Default", email="dr@default.com")
        db.add(psy)
        await db.commit()

    patient = Patient(
        psychologist_id=psy.id,
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        diagnosis_tags=payload.diagnosis_tags,
        risk_level=payload.risk_level
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)

    db.add(PatientProfile(patient_id=patient.id))
    await db.commit()

    return PatientOut(
        id=patient.id,
        name=patient.name,
        risk_level=patient.risk_level,
        date_of_birth=patient.date_of_birth,
        diagnosis_tags=patient.diagnosis_tags or [],
    )


@router.get("/patients/{patient_id}/profile", response_model=ProfileOut, tags=["patients"])
async def get_patient_profile(patient_id: str, db: AsyncSession = Depends(get_db)):
    puuid = _parse_uuid(patient_id, "patient_id")
    res = await db.execute(select(PatientProfile).where(PatientProfile.patient_id == puuid))
    profile = res.scalar_one_or_none()

    res_s = await db.execute(
        select(Session, ClinicalNote)
        .join(ClinicalNote, Session.id == ClinicalNote.session_id)
        .where(Session.patient_id == puuid, Session.status == "confirmed")
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
    db: AsyncSession = Depends(get_db),
):
    puuid = _parse_uuid(patient_id, "patient_id")
    offset = (page - 1) * page_size

    total_res = await db.execute(
        select(func.count()).select_from(Session)
        .where(Session.patient_id == puuid, Session.is_archived == False)
    )
    total = total_res.scalar_one()

    res = await db.execute(
        select(Session)
        .where(Session.patient_id == puuid, Session.is_archived == False)
        .order_by(Session.created_at.asc())
        .limit(page_size)
        .offset(offset)
    )

    items = [
        SessionOut(
            id=s.id,
            session_number=s.session_number,
            session_date=s.session_date,
            raw_dictation=s.raw_dictation,
            ai_response=s.ai_response,
            status=s.status,
        )
        for s in res.scalars()
    ]

    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedSessions(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/patients/{patient_id}/report", tags=["patients"])
async def patient_report(patient_id: str, period: str = "quarterly", db: AsyncSession = Depends(get_db)):
    return await generate_evolution_report(db, patient_id, period)


@router.get("/patients/{patient_id}/search", tags=["patients"])
async def patient_search(patient_id: str, q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await search_patient_history(db, patient_id, q)

# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.post("/sessions/{patient_id}/process", response_model=ProcessSessionOut, tags=["sessions"])
@limiter.limit("30/hour")
async def process_session_endpoint(
    request: Request,
    patient_id: str,
    rec: ProcessSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    patient_uuid = _parse_uuid(patient_id, "patient_id")
    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format)

    # Chat messages are ephemeral — no Session created in DB
    if rec.format == "chat":
        return ProcessSessionOut(text_fallback=response.get("text_fallback"))

    # SOAP and other formats: persist as draft Session
    session_id = str(uuid.uuid4())

    res_last = await db.execute(
        select(Session)
        .where(Session.patient_id == patient_uuid)
        .order_by(Session.session_number.desc())
        .limit(1)
    )
    last_session = res_last.scalar_one_or_none()
    current_session_number = (last_session.session_number + 1) if last_session else 1

    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=current_session_number,
        session_date=date.today(),
        raw_dictation=rec.raw_dictation,
        ai_response=response.get("text_fallback"),
        messages=response.get("session_messages", []),
        status="draft",
    )
    db.add(new_session)
    await db.commit()

    return ProcessSessionOut(
        text_fallback=response.get("text_fallback"),
        session_id=session_id,
    )


@router.post("/sessions/{session_id}/confirm", response_model=ConfirmNoteOut, tags=["sessions"])
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db)):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(select(Session).where(Session.id == session_uuid))
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
    await update_patient_profile_summary(db, sess.patient_id, summary_data)

    return ConfirmNoteOut(id=cn.id)


@router.patch("/sessions/{session_id}/archive", response_model=ArchiveOut, tags=["sessions"])
async def archive_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(select(Session).where(Session.id == session_uuid))
    sess = res.scalar_one_or_none()

    if not sess:
        raise SessionNotFoundError("Sesión no encontrada.", code="SESSION_NOT_FOUND", details={"session_id": session_id})

    sess.is_archived = True
    await db.commit()

    return ArchiveOut(id=session_id)

# ---------------------------------------------------------------------------
# Conversations (cross-patient view)
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=PaginatedConversations, tags=["conversations"])
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
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
        ORDER BY p.id, s.created_at DESC NULLS LAST
    """)

    res = await db.execute(sql)
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
