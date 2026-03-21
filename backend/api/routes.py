import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
from datetime import date, datetime

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist
from sqlalchemy import update
from agent import process_session, update_patient_profile_summary
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding

router = APIRouter()

# --- Schemas ---

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

# --- Routes ---

@router.get("/patients")
async def list_patients(db: AsyncSession = Depends(get_db)):
    query = select(Patient).order_by(Patient.name)
    res = await db.execute(query)
    patients = res.scalars().all()

    # Si no hay pacientes, crear uno por defecto para el MVP
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

        # Profile
        db.add(PatientProfile(patient_id=default_patient.id))
        await db.commit()
        return [{"id": default_patient.id, "name": default_patient.name}]

    return [{"id": p.id, "name": p.name} for p in patients]

@router.post("/patients")
async def create_patient(payload: PatientCreate, db: AsyncSession = Depends(get_db)):
    # Asume psicologo por defecto para MVP
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

    # Crear profile vacio
    profile = PatientProfile(patient_id=patient.id)
    db.add(profile)
    await db.commit()

    return {"patient_id": patient.id}

@router.post("/sessions/{patient_id}/process")
async def process_session_endpoint(patient_id: str, rec: ProcessSessionRequest, db: AsyncSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    response = await process_session(db, patient_id, rec.raw_dictation, session_id, rec.format)

    patient_uuid = uuid.UUID(patient_id)

    # Calcular verdadero numero de sesion
    res_last = await db.execute(select(Session).where(Session.patient_id == patient_uuid).order_by(Session.session_number.desc()).limit(1))
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
        status="draft"
    )
    db.add(new_session)
    await db.commit()

    return {
        "text_fallback": response.get("text_fallback"),
        "session_id": session_id,
    }

@router.post("/sessions/{session_id}/confirm")
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db)):
    session_uuid = uuid.UUID(session_id)
    res = await db.execute(select(Session).where(Session.id == session_uuid))
    sess = res.scalar_one_or_none()

    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    sess.status = "confirmed"

    note_data = req.edited_note or {}

    # Generate Embedding for logic
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
        embedding=embedding
    )
    db.add(cn)

    await db.commit()

    # Generate/update compact clinical summary and profile fields async
    summary_data = {
        "text_fallback": sess.ai_response or "",
        "detected_patterns": note_data.get("detected_patterns", []),
        "alerts": note_data.get("alerts", []),
        "suggested_next_steps": note_data.get("suggested_next_steps", []),
    }
    await update_patient_profile_summary(db, sess.patient_id, summary_data)

    return {"status": "ok", "note_id": cn.id}

@router.get("/patients/{patient_id}/profile")
async def get_patient_profile(patient_id: str, db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    res = await db.execute(select(PatientProfile).where(PatientProfile.patient_id == puuid))
    profile = res.scalar_one_or_none()

    # get last 3 sessions
    res_s = await db.execute(
        select(Session, ClinicalNote)
        .join(ClinicalNote, Session.id == ClinicalNote.session_id)
        .where(Session.patient_id == puuid, Session.status == 'confirmed')
        .order_by(Session.session_date.desc())
        .limit(3)
    )
    recent_sessions = [{"session_date": s.session_date, "assessment": c.assessment} for s, c in res_s]

    return {
        "profile": {
            "recurring_themes": profile.recurring_themes if profile else [],
            "protective_factors": profile.protective_factors if profile else [],
            "risk_factors": profile.risk_factors if profile else [],
            "progress_indicators": profile.progress_indicators if profile else {}
        },
        "recent_sessions": recent_sessions
    }

@router.get("/patients/{patient_id}/sessions")
async def get_patient_sessions(patient_id: str, limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    res = await db.execute(
        select(Session)
        .where(Session.patient_id == puuid, Session.is_archived == False)
        .order_by(Session.created_at.asc())
        .limit(limit)
        .offset(offset)
    )

    out = []
    for s in res.scalars():
        out.append({
            "id": s.id,
            "session_number": s.session_number,
            "session_date": s.session_date,
            "raw_dictation": s.raw_dictation,
            "ai_response": s.ai_response,
            "status": s.status
        })
    return out

@router.get("/patients/{patient_id}/report")
async def patient_report(patient_id: str, period: str = "quarterly", db: AsyncSession = Depends(get_db)):
    return await generate_evolution_report(db, patient_id, period)

@router.get("/patients/{patient_id}/search")
async def patient_search(patient_id: str, q: str = Query(...), db: AsyncSession = Depends(get_db)):
    return await search_patient_history(db, patient_id, q)

@router.get("/conversations")
async def list_conversations(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Session, Patient.name.label("patient_name"))
        .join(Patient, Session.patient_id == Patient.id)
        .where(Session.is_archived == False)
        .order_by(Session.created_at.desc())
    )
    return [
        {
            "id": str(s.id),
            "patient_id": str(s.patient_id),
            "patient_name": patient_name,
            "session_number": s.session_number,
            "session_date": s.session_date,
            "dictation_preview": (s.raw_dictation[:120] + "...") if s.raw_dictation and len(s.raw_dictation) > 120 else s.raw_dictation,
            "status": s.status,
            "message_count": len(s.messages) if s.messages else 0,
        }
        for s, patient_name in res.all()
    ]

@router.patch("/sessions/{session_id}/archive")
async def archive_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session_uuid = uuid.UUID(session_id)
    res = await db.execute(select(Session).where(Session.id == session_uuid))
    sess = res.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    sess.is_archived = True
    await db.commit()
    return {"status": "ok"}
