from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi.security import OAuth2PasswordBearer
import jwt
import uuid

from database import get_db, PatientSummary
from config import settings
from crypto import decrypt_if_set
from datetime import datetime, timezone

router = APIRouter(tags=["patient-portal"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/patient/login")

async def get_current_patient(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        role = payload.get("role")
        patient_id = payload.get("patient_id")
        if role != "patient" or not patient_id:
            raise credentials_exc
        return patient_id
    except Exception:
        raise credentials_exc

@router.get("/summaries")
async def list_summaries(patient_id: str = Depends(get_current_patient), db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    res = await db.execute(
        select(PatientSummary)
        .where(PatientSummary.patient_id == puuid, PatientSummary.sent_at != None)
        .order_by(PatientSummary.sent_at.desc())
    )
    summaries = res.scalars().all()
    
    return [
        {
            "id": str(s.id),
            "session_id": str(s.session_id),
            "sent_at": s.sent_at,
            "viewed_at": s.viewed_at,
            "next_session_date": s.next_session_date,
            "topics_worked": decrypt_if_set(s.topics_worked),
        }
        for s in summaries
    ]

@router.get("/summaries/{summary_id}")
async def get_summary(summary_id: str, patient_id: str = Depends(get_current_patient), db: AsyncSession = Depends(get_db)):
    suuid = uuid.UUID(summary_id)
    puuid = uuid.UUID(patient_id)
    
    res = await db.execute(
        select(PatientSummary)
        .where(PatientSummary.id == suuid, PatientSummary.patient_id == puuid, PatientSummary.sent_at != None)
    )
    summary = res.scalar_one_or_none()
    
    if not summary:
        raise HTTPException(status_code=404, detail="Resumen no encontrado.")
        
    if not summary.viewed_at:
        summary.viewed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(summary)
        
    return {
        "id": str(summary.id),
        "session_id": str(summary.session_id),
        "topics_worked": decrypt_if_set(summary.topics_worked),
        "homework": decrypt_if_set(summary.homework),
        "next_session_date": summary.next_session_date,
        "sent_at": summary.sent_at,
        "viewed_at": summary.viewed_at,
    }
