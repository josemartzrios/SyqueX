import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import date, time, datetime, timezone
from pydantic import BaseModel
from typing import List, Optional

from database import get_db, AvailabilitySlot, Patient
from api.auth import get_current_psychologist, Psychologist
from api.limiter import limiter
from starlette.requests import Request
from crypto import decrypt_if_set
from services.email import send_booking_cancellation

router = APIRouter(tags=["calendar"])

class SlotCreate(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int = 50

class SlotOut(BaseModel):
    id: uuid.UUID
    slot_date: date
    start_time: time
    duration_minutes: int
    status: str
    patient_name: Optional[str] = None
    patient_id: Optional[uuid.UUID] = None

@router.get("/slots", response_model=List[SlotOut])
async def get_slots(
    month: str, # Format YYYY-MM
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    try:
        y, m = map(int, month.split('-'))
        start_date = date(y, m, 1)
        next_m = m + 1 if m < 12 else 1
        next_y = y if m < 12 else y + 1
        end_date = date(next_y, next_m, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de mes inválido (YYYY-MM)")

    res = await db.execute(
        select(AvailabilitySlot, Patient)
        .outerjoin(Patient, AvailabilitySlot.booked_by_patient_id == Patient.id)
        .where(
            AvailabilitySlot.psychologist_id == psychologist.id,
            AvailabilitySlot.slot_date >= start_date,
            AvailabilitySlot.slot_date < end_date
        )
        .order_by(AvailabilitySlot.slot_date, AvailabilitySlot.start_time)
    )
    
    slots = []
    for slot, patient in res.all():
        slots.append(SlotOut(
            id=slot.id,
            slot_date=slot.slot_date,
            start_time=slot.start_time,
            duration_minutes=slot.duration_minutes,
            status=slot.status,
            patient_name=patient.name if patient else None,
            patient_id=patient.id if patient else None
        ))
    return slots

@router.post("/slots", response_model=SlotOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/hour")
async def create_slot(
    request: Request,
    payload: SlotCreate,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    if payload.slot_date < date.today():
        raise HTTPException(status_code=400, detail="No puedes crear slots en el pasado")
        
    slot = AvailabilitySlot(
        psychologist_id=psychologist.id,
        slot_date=payload.slot_date,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        status="available"
    )
    db.add(slot)
    try:
        await db.commit()
        await db.refresh(slot)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="El slot ya existe o es inválido")
        
    return SlotOut(
        id=slot.id, slot_date=slot.slot_date, start_time=slot.start_time, 
        duration_minutes=slot.duration_minutes, status=slot.status
    )

@router.delete("/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: uuid.UUID,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(AvailabilitySlot).where(AvailabilitySlot.id == slot_id, AvailabilitySlot.psychologist_id == psychologist.id))
    slot = res.scalars().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot no encontrado")
        
    if slot.status == 'booked' and slot.booked_by_patient_id:
        patient = await db.get(Patient, slot.booked_by_patient_id)
        if patient and patient.email:
            await send_booking_cancellation(
                patient.email, psychologist.email, patient.name, psychologist.name, 
                slot.slot_date, slot.start_time, canceled_by="psychologist"
            )
            
    await db.delete(slot)
    await db.commit()
