import json
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from database import get_db, Psychologist, Patient, Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from .auth import get_current_psychologist

router = APIRouter()

@router.get("/export")
async def export_data(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    # Obtener todos los pacientes
    patients_result = await db.execute(
        select(Patient).where(Patient.psychologist_id == psychologist.id)
    )
    patients = patients_result.scalars().all()
    
    export_data = {
        "psychologist": {
            "name": psychologist.name,
            "email": psychologist.email,
            "registered_at": psychologist.created_at.isoformat(),
            "accepted_privacy_at": psychologist.accepted_privacy_at.isoformat() if psychologist.accepted_privacy_at else None
        },
        "patients": []
    }
    
    for p in patients:
        sessions_result = await db.execute(
            select(Session).where(Session.patient_id == p.id)
        )
        sessions = sessions_result.scalars().all()
        
        patient_data = {
            "name": p.name,
            "created_at": p.created_at.isoformat(),
            "sessions": [
                {
                    "date": s.session_date.isoformat(),
                    "status": s.status,
                    "format": s.format,
                    "raw_dictation": s.raw_dictation,
                    "ai_response": s.ai_response,
                    "structured_note": s.structured_note
                } for s in sessions
            ]
        }
        export_data["patients"].append(patient_data)
        
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
    
    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=syquex_export_{datetime.now().strftime('%Y%m%d')}.json"
        }
    )
