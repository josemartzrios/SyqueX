import uuid
import logging
import base64
import re
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks, UploadFile, File
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Dict, Any, Literal
from datetime import date, datetime, timezone

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist, AsyncSessionLocal, NoteTemplate
from config import settings
import json as _json
from crypto import encrypt_if_set, decrypt_if_set
from agent import process_session, update_patient_profile_summary, process_session_custom
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding, ZERO_VECTOR
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


async def get_db_with_user(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """DB session con RLS: inyecta psychologist_id como session variable de PostgreSQL."""
    from sqlalchemy import text as _text
    await db.execute(
        _text("SELECT set_config('app.psychologist_id', :pid, false)"),
        {"pid": str(psychologist.id)},
    )
    yield db


router = APIRouter(tags=["clinical"])


def _encrypt_patient_fields(patient_orm, payload_sensitive: dict) -> None:
    """Cifra in-place los campos sensibles en el ORM patient antes de commit."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address"]:
        if field in payload_sensitive:
            setattr(patient_orm, field, encrypt_if_set(payload_sensitive[field]))
    if "emergency_contact" in payload_sensitive:
        ec = payload_sensitive["emergency_contact"]
        if ec is not None:
            if isinstance(ec, dict):
                ec = _json.dumps(ec)
            elif hasattr(ec, "model_dump"):
                ec = _json.dumps(ec.model_dump())
            setattr(patient_orm, "emergency_contact", encrypt_if_set(ec))
        else:
            setattr(patient_orm, "emergency_contact", None)


def _decrypt_patient_orm(patient) -> None:
    """Descifra in-place los campos sensibles de un ORM Patient antes de serializar."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity", "phone"]:
        setattr(patient, field, decrypt_if_set(getattr(patient, field, None)))
    ec = getattr(patient, "emergency_contact", None)
    if ec is not None:
        decrypted = decrypt_if_set(ec)
        if decrypted and isinstance(decrypted, str):
            try:
                decrypted = _json.loads(decrypted)
            except (_json.JSONDecodeError, TypeError):
                pass
        setattr(patient, "emergency_contact", decrypted)


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

GenderIdentity = Literal["hombre", "mujer", "no_binario", "otro"]

_PHONE_RE = re.compile(r'^[0-9\s\+\-\(\)\.]+$')


def _validate_phone_value(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if not _PHONE_RE.match(v):
        raise ValueError('Número inválido: solo se permiten dígitos, espacios y los símbolos + - ( )')
    digits = re.sub(r'[^\d]', '', v)
    if len(digits) < 10:
        raise ValueError('Número inválido: mínimo 10 dígitos')
    return v


class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    relationship: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=7, max_length=20)


class PatientCreate(BaseModel):
    # Obligatorios (flujo híbrido)
    name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    reason_for_consultation: str = Field(..., min_length=1, max_length=2000)

    # Obligatorios adicionales
    phone: str = Field(..., max_length=20)

    # Opcionales
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)

    # Pre-existentes
    diagnosis_tags: Optional[List[str]] = []
    risk_level: str = "low"

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _validate_phone_value(v)

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v


class TemplateFieldSchema(BaseModel):
    id: str
    label: str
    type: str  # text | scale | checkbox | list | date
    options: list[str] = []
    guiding_question: str = ""
    order: int = 0

class SaveTemplateRequest(BaseModel):
    fields: list[TemplateFieldSchema]

class NoteTemplateOut(BaseModel):
    id: str
    fields: list[TemplateFieldSchema]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# PDF analysis helper
# ---------------------------------------------------------------------------

_PDF_EXTRACTION_PROMPT = """
You are analyzing a clinical psychologist's note template.
Extract the sections and fields from this PDF note.
For each section, return a JSON object with:
- id: a unique short slug (e.g. "estado_afectivo")
- label: the section name in Spanish
- type: one of "text", "scale", "checkbox", "list", "date"
  - Use "scale" if the field is numeric 1-10
  - Use "checkbox" if the field has multiple yes/no options
  - Use "list" if the field has a fixed set of single-choice options
  - Use "date" if the field captures a date
  - Default to "text"
- options: list of strings (required for checkbox and list types, empty otherwise)
- guiding_question: a question that helps the AI know what to extract from a dictation
- order: sequential integer starting at 1

Return ONLY a valid JSON array. No explanation, no markdown fences.
""".strip()

MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB


async def analyze_pdf_with_claude(pdf_base64: str) -> list[dict]:
    import json as _json2
    _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": pdf_base64,
                    },
                },
                {"type": "text", "text": _PDF_EXTRACTION_PROMPT},
            ],
        }],
    )
    text = response.content[0].text.strip()
    try:
        fields = _json2.loads(text)
    except _json2.JSONDecodeError:
        raise HTTPException(status_code=422, detail="No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.")
    if not fields:
        raise HTTPException(status_code=422, detail="No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.")
    return fields


# ---------------------------------------------------------------------------
# Note Templates
# ---------------------------------------------------------------------------

@router.get("/template", response_model=NoteTemplateOut | None, tags=["clinical"])
async def get_template(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    result = await db.execute(
        select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        return None
    return NoteTemplateOut(
        id=str(tmpl.id),
        fields=[TemplateFieldSchema(**f) for f in (tmpl.fields or [])],
        created_at=tmpl.created_at,
        updated_at=tmpl.updated_at,
    )

@router.post("/template", response_model=NoteTemplateOut, tags=["clinical"])
async def save_template(
    body: SaveTemplateRequest,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    result = await db.execute(
        select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
    )
    tmpl = result.scalar_one_or_none()
    fields_data = [f.model_dump() for f in body.fields]
    if tmpl is None:
        tmpl = NoteTemplate(psychologist_id=psychologist.id, fields=fields_data)
        db.add(tmpl)
    else:
        tmpl.fields = fields_data
        tmpl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tmpl)
    return NoteTemplateOut(
        id=str(tmpl.id),
        fields=[TemplateFieldSchema(**f) for f in tmpl.fields],
        created_at=tmpl.created_at,
        updated_at=tmpl.updated_at,
    )


@router.post("/template/analyze-pdf", tags=["clinical"])
async def analyze_pdf_endpoint(
    file: UploadFile = File(...),
    psychologist: Psychologist = Depends(get_current_psychologist),
):
    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=422, detail="El PDF no puede superar 5 MB.")
    pdf_b64 = base64.b64encode(content).decode("utf-8")
    fields = await analyze_pdf_with_claude(pdf_b64)
    result = []
    for i, f in enumerate(fields):
        result.append(TemplateFieldSchema(
            id=f.get("id", f"field_{i+1}"),
            label=f.get("label", f"Campo {i+1}"),
            type=f.get("type", "text"),
            options=f.get("options", []),
            guiding_question=f.get("guiding_question", ""),
            order=f.get("order", i + 1),
        ))
    return result


class PatientUpdate(BaseModel):
    # Todos opcionales — PATCH parcial. Los 3 campos mínimos validan min_length=1
    # cuando se envían (no se pueden limpiar con "").
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    date_of_birth: Optional[date] = None
    reason_for_consultation: Optional[str] = Field(None, min_length=1, max_length=2000)
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    phone: Optional[str] = Field(None, max_length=20)
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)
    diagnosis_tags: Optional[List[str]] = None
    risk_level: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        return _validate_phone_value(v)

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
    gender_identity: Optional[str] = None
    phone: Optional[str] = None
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
    session_number: Optional[int] = None
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
    custom_fields: Optional[dict] = None
    template_fields: Optional[list] = None

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
    format: str = "SOAP"
    custom_fields: Optional[dict] = None
    template_fields: Optional[list] = None


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
@limiter.limit("120/hour")
async def list_patients(
    request: Request,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    query = select(Patient).where(
        Patient.psychologist_id == psychologist.id,
        Patient.deleted_at.is_(None),
    ).order_by(Patient.name)
    res = await db.execute(query)
    patients = res.scalars().all()

    return [PatientOut(id=p.id, name=p.name, risk_level=p.risk_level) for p in patients]


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED, tags=["patients"])
@limiter.limit("30/hour")
async def create_patient(
    payload: PatientCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_with_user),
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
        address=encrypt_if_set(payload.address),
        emergency_contact=encrypt_if_set(
            _json.dumps(payload.emergency_contact.model_dump()) if payload.emergency_contact else None
        ),
        reason_for_consultation=encrypt_if_set(payload.reason_for_consultation),
        medical_history=encrypt_if_set(payload.medical_history),
        psychological_history=encrypt_if_set(payload.psychological_history),
        gender_identity=encrypt_if_set(payload.gender_identity),
        phone=encrypt_if_set(payload.phone),
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
    _decrypt_patient_orm(patient)
    return PatientOut.model_validate(patient)


@router.get("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db_with_user),
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

    _decrypt_patient_orm(patient)
    return PatientOut.model_validate(patient)


@router.patch("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_with_user),
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

    _PATIENT_SENSITIVE = {"medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity", "phone"}
    for field, value in updates.items():
        if field == "emergency_contact":
            ec = value.model_dump() if hasattr(value, "model_dump") else value
            setattr(patient, field, encrypt_if_set(_json.dumps(ec)) if ec is not None else None)
        elif field in _PATIENT_SENSITIVE:
            setattr(patient, field, encrypt_if_set(value))
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
    _decrypt_patient_orm(patient)
    return PatientOut.model_validate(patient)


@router.get("/patients/{patient_id}/profile", response_model=ProfileOut, tags=["patients"])
async def get_patient_profile(
    patient_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
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
    recent_sessions = [
        {"session_date": s.session_date, "assessment": decrypt_if_set(c.assessment)}
        for s, c in res_s
    ]

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
    db: AsyncSession = Depends(get_db_with_user),
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
        is_custom = cn and cn.format == "custom"
        items.append(SessionOut(
            id=s.id,
            session_number=s.session_number,
            session_date=s.session_date,
            raw_dictation=decrypt_if_set(s.raw_dictation),
            ai_response=decrypt_if_set(s.ai_response),
            status=s.status,
            format=s.format,
            structured_note=None if is_custom else ({
                "subjective": decrypt_if_set(cn.subjective),
                "objective": decrypt_if_set(cn.objective),
                "assessment": decrypt_if_set(cn.assessment),
                "plan": decrypt_if_set(cn.plan),
            } if cn else None),
            custom_fields=cn.custom_fields if is_custom else None,
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
    db: AsyncSession = Depends(get_db_with_user),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    return await generate_evolution_report(db, str(patient.id), period)


@router.get("/patients/{patient_id}/search", tags=["patients"])
async def patient_search(
    patient_id: str,
    q: str = Query(..., min_length=1),
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
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
    db: AsyncSession = Depends(get_db_with_user),
):
    patient = await _get_owned_patient(db, psychologist.id, patient_id)
    patient_uuid = patient.id

    # Load psychologist's note template
    tmpl_result = await db.execute(
        select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
    )
    template = tmpl_result.scalar_one_or_none()

    if template and template.fields and rec.format.lower() == "custom":
        result = await process_session_custom(
            db=db,
            patient_id=str(patient_uuid),
            raw_dictation=rec.raw_dictation,
            session_id=None,
            template_fields=template.fields,
            patient_name=patient.name,
        )

        # Determine session_number for custom (non-chat) sessions
        res_last = await db.execute(
            select(Session)
            .where(Session.patient_id == patient_uuid, Session.format != "chat")
            .order_by(Session.session_number.desc())
            .limit(1)
        )
        last_session = res_last.scalar_one_or_none()
        current_session_number = (last_session.session_number + 1) if last_session else 1

        custom_session = Session(
            patient_id=patient_uuid,
            session_number=current_session_number,
            session_date=date.today(),
            format="custom",
            raw_dictation=encrypt_if_set(rec.raw_dictation),
            ai_response=encrypt_if_set(result["text_fallback"]),
            status="draft",
            messages=encrypt_if_set(_json.dumps(result["session_messages"])),
        )
        db.add(custom_session)
        await db.commit()
        await db.refresh(custom_session)
        return ProcessSessionOut(
            text_fallback=result["text_fallback"],
            session_id=str(custom_session.id),
            format="custom",
            custom_fields=result["custom_fields"],
            template_fields=template.fields,
        )

    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format, patient_name=patient.name)

    session_id = str(uuid.uuid4())

    # Chat sessions are confirmed immediately (no confirmation step needed)
    _fmt_raw = rec.format or "SOAP"
    _fmt_lower = _fmt_raw.lower()
    session_format = "chat" if _fmt_lower == "chat" else ("custom" if _fmt_lower == "custom" else _fmt_raw.upper())
    session_status = "confirmed" if session_format.lower() == "chat" else "draft"

    # Only SOAP sessions get a session_number; chat sessions are not clinical sessions
    if session_format.lower() != "chat":
        res_last = await db.execute(
            select(Session)
            .where(Session.patient_id == patient_uuid, Session.format != "chat")
            .order_by(Session.session_number.desc())
            .limit(1)
        )
        last_session = res_last.scalar_one_or_none()
        current_session_number = (last_session.session_number + 1) if last_session else 1
    else:
        current_session_number = None

    session_messages = response.get("session_messages", [])
    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=current_session_number,
        session_date=date.today(),
        raw_dictation=encrypt_if_set(rec.raw_dictation),
        format=session_format,
        ai_response=encrypt_if_set(response.get("text_fallback")),
        messages=encrypt_if_set(_json.dumps(session_messages)),
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
    db: AsyncSession = Depends(get_db_with_user),
):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(
        select(Session).join(Patient).where(
            Session.id == session_uuid,
            Patient.psychologist_id == psychologist.id,
        ).with_for_update()
    )
    sess = res.scalar_one_or_none()

    if not sess:
        raise SessionNotFoundError("Sesión no encontrada.", code="SESSION_NOT_FOUND", details={"session_id": session_id})

    if sess.status != "draft":
        from exceptions import DomainError
        raise DomainError(
            "Solo sesiones en borrador pueden confirmarse.",
            code="INVALID_SESSION_STATUS",
            http_status=409,
        )

    note_data = req.edited_note or {}
    note_format = note_data.get("format", "SOAP")
    custom_fields_data = note_data.get("custom_fields") if req.edited_note else None

    if note_format == "custom":
        # Ensure custom_fields is never None — fall back to empty dict
        custom_fields_data = custom_fields_data if custom_fields_data is not None else {}
        text_for_embedding = note_data.get("text_fallback", "")
        try:
            embedding = await get_embedding(text_for_embedding) if text_for_embedding else ZERO_VECTOR
        except Exception:
            embedding = ZERO_VECTOR

        note = ClinicalNote(
            session_id=sess.id,
            format="custom",
            custom_fields=custom_fields_data,
            detected_patterns=note_data.get("detected_patterns", []),
            alerts=note_data.get("alerts", []),
            suggested_next_steps=note_data.get("suggested_next_steps", []),
            evolution_delta=note_data.get("evolution_delta"),
            embedding=embedding,
        )
        db.add(note)
        sess.status = "confirmed"
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            from exceptions import DomainError
            raise DomainError(
                "Esta sesión ya fue confirmada.",
                code="DUPLICATE_NOTE",
                http_status=409,
            )
        await db.refresh(note)

        ai_response_text = decrypt_if_set(sess.ai_response) or ""
        summary_data = {
            "text_fallback": ai_response_text,
            "detected_patterns": note_data.get("detected_patterns", []),
            "alerts": note_data.get("alerts", []),
            "suggested_next_steps": note_data.get("suggested_next_steps", []),
        }
        background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)

        return ConfirmNoteOut(id=note.id)

    sess.status = "confirmed"
    structured = note_data.get("structured_note", {})

    # Read ai_response before commit (attribute expires after commit)
    ai_response_text = decrypt_if_set(sess.ai_response) or ""

    # 1. Embedding del texto plano ANTES de cifrar
    text_to_embed = " ".join([str(v) for v in structured.values() if v])
    try:
        embedding = await get_embedding(text_to_embed)
    except Exception as e:
        logger.warning("Embedding failed for session %s, using zero vector fallback: %s", session_id, e)
        embedding = ZERO_VECTOR

    # 2. Cifrar campos SOAP
    cn = ClinicalNote(
        session_id=sess.id,
        format=note_data.get("format", "SOAP"),
        subjective=encrypt_if_set(structured.get("subjective")),
        objective=encrypt_if_set(structured.get("objective")),
        assessment=encrypt_if_set(structured.get("assessment")),
        plan=encrypt_if_set(structured.get("plan")),
        data_field=encrypt_if_set(structured.get("data_field")),
        detected_patterns=note_data.get("detected_patterns", []),
        alerts=note_data.get("alerts", []),
        suggested_next_steps=note_data.get("suggested_next_steps", []),
        evolution_delta=note_data.get("evolution_delta", {}),
        embedding=embedding,
    )
    db.add(cn)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        from exceptions import DomainError
        raise DomainError(
            "Esta sesión ya fue confirmada.",
            code="DUPLICATE_NOTE",
            http_status=409,
        )

    # 3. Actualizar perfil del paciente en background
    summary_data = {
        "text_fallback": ai_response_text,
        "detected_patterns": note_data.get("detected_patterns", []),
        "alerts": note_data.get("alerts", []),
        "suggested_next_steps": note_data.get("suggested_next_steps", []),
    }
    background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)

    return ConfirmNoteOut(id=cn.id)


@router.delete("/sessions/{session_id}", status_code=204, tags=["sessions"])
async def delete_draft_session(
    session_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
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
        raise SessionNotFoundError(
            "Sesión no encontrada.",
            code="SESSION_NOT_FOUND",
            details={"session_id": session_id},
        )

    if sess.status == "confirmed":
        from exceptions import DomainError
        raise DomainError(
            "Las sesiones confirmadas no pueden eliminarse.",
            code="INVALID_SESSION_STATUS",
            http_status=409,
        )

    await db.delete(sess)
    await db.commit()


@router.patch("/sessions/{session_id}/archive", response_model=ArchiveOut, tags=["sessions"])
async def archive_session(
    session_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
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
    db: AsyncSession = Depends(get_db_with_user),
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
    db: AsyncSession = Depends(get_db_with_user),
):
    # One entry per patient: most recent non-archived session via DISTINCT ON (PostgreSQL).
    # LEFT JOIN so patients without any session still appear in the list.
    sql = text("""
        SELECT DISTINCT ON (p.id)
            p.id            AS patient_id,
            p.name          AS patient_name,
            s.id            AS session_id,
            s.session_number,
            s.session_date,
            s.raw_dictation AS dictation_preview,
            s.status,
            s.messages,
            s.created_at    AS last_activity
        FROM patients p
        JOIN sessions s
            ON s.patient_id = p.id
            AND s.is_archived = FALSE
            AND s.raw_dictation IS NOT NULL
            AND (s.format IS NULL OR s.format != 'chat')
        WHERE p.deleted_at IS NULL
          AND p.psychologist_id = :psy_id
        ORDER BY p.id, s.created_at DESC NULLS LAST
    """)

    res = await db.execute(sql, {"psy_id": psychologist.id})
    rows = res.mappings().all()

    items = []
    for row in rows:
        raw = decrypt_if_set(row.get("dictation_preview"))
        patient_name = decrypt_if_set(row.get("patient_name"))
        preview = (raw[:120] + "...") if raw and len(raw) > 120 else raw
        messages_raw = decrypt_if_set(row.get("messages"))
        try:
            messages = _json.loads(messages_raw) if messages_raw else []
        except (_json.JSONDecodeError, TypeError):
            messages = []

        items.append(ConversationOut(
            id=str(row["session_id"]) if row["session_id"] else None,
            patient_id=str(row["patient_id"]),
            patient_name=patient_name,
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
