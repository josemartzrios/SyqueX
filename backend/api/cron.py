import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from database import get_db, Subscription, Psychologist
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from config import settings

router = APIRouter()
UTC = timezone.utc

@router.get("/daily")
async def daily_cron(request: Request, db: AsyncSession = Depends(get_db)):
    auth_header = request.headers.get("Authorization")
    cron_secret = settings.INTERNAL_API_KEY
    
    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="No autorizado")

    now = datetime.now(UTC)
    warning_date = now + timedelta(days=2) # Faltan 48 horas

    # Buscar suscripciones trialing que terminen en las próximas 48 horas
    query = select(Subscription, Psychologist).join(
        Psychologist, Subscription.psychologist_id == Psychologist.id
    ).where(
        and_(
            Subscription.status == 'trialing',
            Subscription.trial_end != None,
            Subscription.trial_end > now,
            Subscription.trial_end <= warning_date
        )
    )
    
    result = await db.execute(query)
    records = result.all()
    
    emails_sent = 0
    from services.email import send_trial_ending_email
    
    for sub, psy in records:
        if await send_trial_ending_email(psy.email):
            emails_sent += 1
            
    return {"status": "ok", "emails_sent": emails_sent}
