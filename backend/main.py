import os
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
from datetime import date, datetime
import uuid

from database import init_db, get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist
from agent import process_session
from tools import generate_evolution_report, search_patient_history
from embeddings import get_embedding

app = FastAPI(title="PsicoAgente MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()

# Models Request/Response
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

@app.post("/patients")
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

@app.post("/sessions/{patient_id}/process")
async def process_session_endpoint(patient_id: str, rec: ProcessSessionRequest, db: AsyncSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    # Llama al agente (Phase 3)
    response = await process_session(db, patient_id, rec.raw_dictation, session_id, rec.format)
    # Por ahora no guarda en DB hasta que no se confirme, pero guarda sesion en estado draft para tener ID
    
    patient_uuid = uuid.UUID(patient_id)
    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=0, # deberia calcular max
        session_date=date.today(),
        raw_dictation=rec.raw_dictation,
        status="draft"
    )
    db.add(new_session)
    await db.commit()
    
    return response

@app.post("/sessions/{session_id}/confirm")
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db)):
    session_uuid = uuid.UUID(session_id)
    res = await db.execute(select(Session).where(Session.id == session_uuid))
    sess = res.scalar_one_or_none()
    
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
        
    sess.status = "confirmed"
    
    note_data = req.edited_note or {}
    
    # Generate Embedding for logic
    text_to_embed = " ".join([str(v) for k,v in note_data.get("structured_note", {}).items() if v])
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
    
    # Update PatientProfile MVP
    pres = await db.execute(select(PatientProfile).where(PatientProfile.patient_id == sess.patient_id))
    profile = pres.scalar_one_or_none()
    if profile:
        profile.recurring_themes = list(set(profile.recurring_themes + note_data.get("detected_patterns", [])))
    
    await db.commit()
    return {"status": "ok", "note_id": cn.id}

@app.get("/patients/{patient_id}/profile")
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

@app.get("/patients/{patient_id}/sessions")
async def get_patient_sessions(patient_id: str, limit: int = 20, offset: int = 0, db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    res = await db.execute(
        select(Session, ClinicalNote)
        .outerjoin(ClinicalNote, Session.id == ClinicalNote.session_id)
        .where(Session.patient_id == puuid)
        .order_by(Session.session_date.desc())
        .limit(limit)
        .offset(offset)
    )
    
    out = []
    for s, c in res:
        out.append({
            "id": s.id,
            "session_number": s.session_number,
            "session_date": s.session_date,
            "status": s.status,
            "note": {"assessment": c.assessment if c else ""} if c else None
        })
    return out

@app.get("/patients/{patient_id}/report")
async def patient_report(patient_id: str, period: str = "quarterly", db: AsyncSession = Depends(get_db)):
    return await generate_evolution_report(db, patient_id, period)

@app.get("/patients/{patient_id}/search")
async def patient_search(patient_id: str, q: str = Query(...), db: AsyncSession = Depends(get_db)):
    return await search_patient_history(db, patient_id, q)
