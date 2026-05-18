# Calendario y Agenda Nativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a native scheduling system with a calendar view for psychologists and booking capabilities for patients within the portal, fully replacing the old dashboard empty state.

**Architecture:** We add an `AvailabilitySlot` model in PostgreSQL with RLS. The backend handles CRUD for slots via `/api/v1/calendar/slots` and patient bookings via `/api/v1/portal/booking`. `SELECT ... FOR UPDATE` is used to prevent race conditions during booking. The frontend introduces a `CalendarScreen` component and integrates calendar view in `PatientPortal.jsx`. Emails with `.ics` files are sent using the existing `services/email.py`.

**Tech Stack:** FastAPI, SQLAlchemy (asyncpg), React, TailwindCSS.

---

### Task 1: Database Model & Migrations

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Add the `AvailabilitySlot` model**
Add the model after `PatientUser` or `Subscription`.

```python
from sqlalchemy import Time

class AvailabilitySlot(Base):
    __tablename__ = 'availability_slots'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('psychologists.id', ondelete='CASCADE'), nullable=False)
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='available', nullable=False)
    booked_by_patient_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('patients.id', ondelete='SET NULL'), nullable=True)
    booked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    psychologist = relationship("Psychologist", back_populates="availability_slots")
    booked_patient = relationship("Patient")

    __table_args__ = (
        CheckConstraint("status IN ('available', 'booked', 'cancelled')", name='chk_slot_status'),
        CheckConstraint("duration_minutes >= 15 AND duration_minutes <= 180", name='chk_slot_duration'),
        Index('idx_slots_psychologist_date', 'psychologist_id', 'slot_date'),
        Index('idx_slots_psychologist_status', 'psychologist_id', 'status'),
        Index('idx_slots_booked_patient', 'booked_by_patient_id'),
    )

# Note: Also add `availability_slots = relationship("AvailabilitySlot", back_populates="psychologist")` to `Psychologist` class.
```

- [ ] **Step 2: Add migration logic in `init_db()`**
Inside `init_db()` in `database.py`:

```python
        # availability_slots table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS availability_slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                psychologist_id UUID NOT NULL REFERENCES psychologists(id) ON DELETE CASCADE,
                slot_date DATE NOT NULL,
                start_time TIME NOT NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 50,
                status VARCHAR(20) NOT NULL DEFAULT 'available',
                booked_by_patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
                booked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chk_slot_status CHECK (status IN ('available', 'booked', 'cancelled')),
                CONSTRAINT chk_slot_duration CHECK (duration_minutes >= 15 AND duration_minutes <= 180),
                UNIQUE (psychologist_id, slot_date, start_time)
            )
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_slots_psychologist_date ON availability_slots(psychologist_id, slot_date)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_slots_psychologist_status ON availability_slots(psychologist_id, status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_slots_booked_patient ON availability_slots(booked_by_patient_id)"))
```

- [ ] **Step 3: Run pytest to ensure models load correctly**
Run: `pytest backend/tests/test_agent.py -v` (or any basic backend test that imports models).
Expected: Tests run without import/SQLAlchemy errors.

- [ ] **Step 4: Commit**
```bash
git add backend/database.py
git commit -m "feat: add AvailabilitySlot model and migrations"
```

---

### Task 2: Email Service & ICS Generation

**Files:**
- Modify: `backend/services/email.py`

- [ ] **Step 1: Write `.ics` generator and add email templates**
Add to `services/email.py`:

```python
def generate_ics(slot_date: date, start_time: time, duration_minutes: int, summary: str, description: str) -> str:
    from datetime import datetime, timedelta
    start_dt = datetime.combine(slot_date, start_time)
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    
    # Format: YYYYMMDDThhmmss
    start_str = start_dt.strftime("%Y%m%dT%H%M%00")
    end_str = end_dt.strftime("%Y%m%dT%H%M%00")
    
    return f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SyqueX//Sesion//ES
BEGIN:VEVENT
DTSTART:{start_str}
DTEND:{end_str}
SUMMARY:{summary}
DESCRIPTION:{description}
END:VEVENT
END:VCALENDAR"""

async def send_booking_confirmation(patient_email: str, psych_email: str, patient_name: str, psych_name: str, slot_date: date, start_time: time, duration_minutes: int):
    ics_content = generate_ics(
        slot_date, start_time, duration_minutes, 
        f"Sesión con {psych_name}", 
        "Sesión de psicoterapia agendada vía SyqueX"
    )
    
    # Send to Patient
    await send_email(
        to_email=patient_email,
        subject="Tu sesión está confirmada",
        html_content=f"<p>Hola {patient_name}, tu sesión con {psych_name} está confirmada para el {slot_date} a las {start_time.strftime('%H:%M')}.</p>",
        attachments=[("sesion.ics", ics_content.encode('utf-8'), "text/calendar")]
    )
    
    # Send to Psychologist
    ics_content_psych = generate_ics(
        slot_date, start_time, duration_minutes, 
        f"Sesión con {patient_name}", 
        "Sesión de psicoterapia agendada vía SyqueX"
    )
    await send_email(
        to_email=psych_email,
        subject="Nueva sesión agendada",
        html_content=f"<p>El paciente {patient_name} ha agendado una sesión para el {slot_date} a las {start_time.strftime('%H:%M')}.</p>",
        attachments=[("sesion.ics", ics_content_psych.encode('utf-8'), "text/calendar")]
    )

async def send_booking_cancellation(patient_email: str, patient_name: str, psych_name: str, slot_date: date, start_time: time, canceled_by: str = "psychologist"):
    who = "tu psicólogo" if canceled_by == "psychologist" else "ti"
    subject = "Sesión cancelada"
    html = f"<p>Hola {patient_name}, la sesión con {psych_name} del {slot_date} a las {start_time.strftime('%H:%M')} fue cancelada por {who}.</p>"
    await send_email(to_email=patient_email, subject=subject, html_content=html)
```

- [ ] **Step 2: Commit**
```bash
git add backend/services/email.py
git commit -m "feat: add ICS generation and booking email templates"
```

---

### Task 3: Psychologist Calendar Endpoints

**Files:**
- Create: `backend/api/calendar_routes.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create Calendar Endpoints**
In `calendar_routes.py`:

```python
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
    res = await db.execute(select(AvailabilitySlot).outerjoin(Patient).where(AvailabilitySlot.id == slot_id, AvailabilitySlot.psychologist_id == psychologist.id))
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Slot no encontrado")
        
    slot = row[0]
    if slot.status == 'booked' and slot.booked_by_patient_id:
        patient = await db.get(Patient, slot.booked_by_patient_id)
        if patient and patient.email:
            await send_booking_cancellation(
                patient.email, patient.name, psychologist.name, 
                slot.slot_date, slot.start_time, canceled_by="psychologist"
            )
            
    await db.delete(slot)
    await db.commit()
```

- [ ] **Step 2: Add router to main.py**
In `main.py`:
```python
from api.calendar_routes import router as calendar_router

# near the bottom:
app.include_router(calendar_router, prefix="/api/v1/calendar")
```

- [ ] **Step 3: Commit**
```bash
git add backend/api/calendar_routes.py backend/main.py
git commit -m "feat: add calendar API endpoints for psychologists"
```

---

### Task 4: Patient Portal Booking Endpoints

**Files:**
- Modify: `backend/api/patient_portal.py`

- [ ] **Step 1: Add Booking Routes**
In `patient_portal.py`:

```python
from database import AvailabilitySlot, Patient, Psychologist
from sqlalchemy import and_
from services.email import send_booking_confirmation, send_booking_cancellation
from datetime import date, time, datetime, timezone
from pydantic import BaseModel

@router.get("/availability")
async def get_availability(month: str, patient_id: str = Depends(get_current_patient), db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    patient = await db.get(Patient, puuid)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
    try:
        y, m = map(int, month.split('-'))
        start_date = date(y, m, 1)
        next_m = m + 1 if m < 12 else 1
        next_y = y if m < 12 else y + 1
        end_date = date(next_y, next_m, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Mes inválido")

    res = await db.execute(
        select(AvailabilitySlot)
        .where(
            AvailabilitySlot.psychologist_id == patient.psychologist_id,
            AvailabilitySlot.slot_date >= start_date,
            AvailabilitySlot.slot_date < end_date,
            AvailabilitySlot.status == 'available'
        ).order_by(AvailabilitySlot.slot_date, AvailabilitySlot.start_time)
    )
    slots = res.scalars().all()
    
    # Get upcoming booking
    up_res = await db.execute(
        select(AvailabilitySlot)
        .where(
            AvailabilitySlot.booked_by_patient_id == puuid,
            AvailabilitySlot.status == 'booked',
            AvailabilitySlot.slot_date >= date.today()
        ).order_by(AvailabilitySlot.slot_date, AvailabilitySlot.start_time).limit(1)
    )
    upcoming = up_res.scalar_one_or_none()
    
    return {
        "slots": [{"id": str(s.id), "slot_date": s.slot_date, "start_time": s.start_time, "duration_minutes": s.duration_minutes} for s in slots],
        "upcoming_booking": {"id": str(upcoming.id), "slot_date": upcoming.slot_date, "start_time": upcoming.start_time, "duration_minutes": upcoming.duration_minutes} if upcoming else None
    }

class BookRequest(BaseModel):
    slot_id: str

@router.post("/book")
async def book_slot(payload: BookRequest, patient_id: str = Depends(get_current_patient), db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    suuid = uuid.UUID(payload.slot_id)
    
    patient = await db.get(Patient, puuid)
    
    # SELECT FOR UPDATE to prevent race conditions
    res = await db.execute(
        select(AvailabilitySlot)
        .where(AvailabilitySlot.id == suuid)
        .with_for_update()
    )
    slot = res.scalar_one_or_none()
    
    if not slot or slot.status != 'available' or slot.psychologist_id != patient.psychologist_id:
        raise HTTPException(status_code=400, detail="El horario ya no está disponible")
        
    slot.status = 'booked'
    slot.booked_by_patient_id = puuid
    slot.booked_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(slot)
    
    # Send emails
    psych = await db.get(Psychologist, slot.psychologist_id)
    if psych and patient.email:
        await send_booking_confirmation(
            patient.email, psych.email, patient.name, psych.name,
            slot.slot_date, slot.start_time, slot.duration_minutes
        )
        
    return {"status": "ok", "message": "Cita confirmada"}

@router.delete("/booking/{slot_id}")
async def cancel_booking(slot_id: str, patient_id: str = Depends(get_current_patient), db: AsyncSession = Depends(get_db)):
    puuid = uuid.UUID(patient_id)
    suuid = uuid.UUID(slot_id)
    
    res = await db.execute(select(AvailabilitySlot).where(AvailabilitySlot.id == suuid, AvailabilitySlot.booked_by_patient_id == puuid))
    slot = res.scalar_one_or_none()
    
    if not slot:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
        
    slot.status = 'available'
    slot.booked_by_patient_id = None
    slot.booked_at = None
    
    await db.commit()
    
    patient = await db.get(Patient, puuid)
    psych = await db.get(Psychologist, slot.psychologist_id)
    if psych and patient.email:
        await send_booking_cancellation(
            psych.email, patient.name, psych.name,
            slot.slot_date, slot.start_time, canceled_by="patient"
        )
        
    return {"status": "ok"}
```

- [ ] **Step 2: Commit**
```bash
git add backend/api/patient_portal.py
git commit -m "feat: add patient portal booking endpoints with FOR UPDATE locks"
```

---

### Task 5: Frontend API Clients

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/patientApi.js`

- [ ] **Step 1: Add to `api.js`**
```javascript
export async function getCalendarSlots(month) {
  return await _authFetch(`${API_BASE}/calendar/slots?month=${month}`);
}

export async function createSlot(data) {
  return await _authFetch(`${API_BASE}/calendar/slots`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function deleteSlot(slotId) {
  return await _authFetch(`${API_BASE}/calendar/slots/${slotId}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Add to `patientApi.js`**
```javascript
export async function getAvailability(month) {
  return await patientFetch(`/portal/availability?month=${month}`);
}

export async function bookSlot(slotId) {
  return await patientFetch(`/portal/book`, {
    method: 'POST',
    body: JSON.stringify({ slot_id: slotId })
  });
}

export async function cancelBooking(slotId) {
  return await patientFetch(`/portal/booking/${slotId}`, { method: 'DELETE' });
}
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/api.js frontend/src/patientApi.js
git commit -m "feat: add frontend api clients for calendar and booking"
```

---

### Task 6: Psychologist Action Buttons (App.jsx)

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Replace EMPTY_STATE**
In `App.jsx`, replace `EMPTY_STATE` constant with a function that takes callbacks:

```javascript
const getEmptyState = (onOpenAgenda, onNewPatient) => (
  <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 bg-[#f4f4f2]">
    <div className="flex items-center gap-6">
      <button 
        onClick={onOpenAgenda}
        className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white border border-ink/[0.07] hover:border-sage hover:shadow-sm transition-all group w-48"
      >
        <div className="w-12 h-12 rounded-full bg-ink/[0.03] text-ink-muted group-hover:bg-sage/10 group-hover:text-sage flex items-center justify-center transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-ink font-semibold tracking-tight">Mi Agenda</span>
      </button>

      <button 
        onClick={onNewPatient}
        className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white border border-ink/[0.07] hover:border-sage hover:shadow-sm transition-all group w-48"
      >
        <div className="w-12 h-12 rounded-full bg-ink/[0.03] text-ink-muted group-hover:bg-sage/10 group-hover:text-sage flex items-center justify-center transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <span className="text-ink font-semibold tracking-tight">Nuevo Expediente</span>
      </button>
    </div>
  </div>
);
```

- [ ] **Step 2: Update Layout**
Remove the mobile header `+ Nuevo` button.
Replace uses of `EMPTY_STATE` with `getEmptyState(() => setShowCalendar(true), () => setIsCreatingPatient(true))`.
Add `const [showCalendar, setShowCalendar] = useState(false);`
Render `<CalendarScreen onClose={() => setShowCalendar(false)} />` right before the closing `</div>` of the main `App` layout if `showCalendar` is true.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/App.jsx
git commit -m "feat: replace empty state with action buttons and wire calendar toggle"
```

---

### Task 7: CalendarScreen Component

**Files:**
- Create: `frontend/src/components/CalendarScreen.jsx`
- Create: `frontend/src/components/AddSlotModal.jsx`

- [ ] **Step 1: Create AddSlotModal**
Create a simple modal to pick a date (default today) and time (HTML `type="time"`). Calls `createSlot({ slot_date, start_time })`.

- [ ] **Step 2: Create CalendarScreen**
A full screen overlay (like `BillingScreen`).
- State: `month` (e.g. '2026-05'), `slots` (array), `selectedDate` (date string).
- Layout: Topbar with back button.
- Body: Month view grid showing dots for days with slots.
- Sidebar/Bottom panel: Lists slots for `selectedDate`.
- Connects to `getCalendarSlots(month)` and `deleteSlot(id)`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/CalendarScreen.jsx frontend/src/components/AddSlotModal.jsx
git commit -m "feat: implement psychologist calendar screen"
```

---

### Task 8: Patient Portal Booking UI

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Update Patient Portal Layout**
Add state: `availability` (from API), `selectedDate`, `bookingLoading`.
Call `getAvailability()` on mount.
Render the upcoming booking banner at the top if one exists.
Render a simple horizontal scrollable list of available dates or a month grid.
When a date is selected, show time slots for that date.
Clicking a time slot opens a confirmation step: `bookSlot(id)` → updates state to show banner.

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat: implement booking flow in patient portal"
```
