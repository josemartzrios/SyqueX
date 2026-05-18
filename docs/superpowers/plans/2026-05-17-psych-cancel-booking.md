# Psicólogo Cancela Cita del Paciente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el hard-delete de slots a soft-cancel, y mostrar en el portal del paciente una card de "cita cancelada" que persiste hasta que el paciente la descarte. El psicólogo no recibe notificación pero su calendario se refresca automáticamente al enfocar la ventana.

**Architecture:** Se añaden dos columnas (`cancelled_by`, `acknowledged`) al modelo `AvailabilitySlot` ya existente. El endpoint `DELETE /slots/{id}` cambia de hard-delete a soft-cancel. El portal del paciente consulta `cancelled_booking` en `GET /portal/availability` y llama `POST /portal/booking/{id}/acknowledge` al descartar. El `CalendarScreen` filtra slots cancelados y recarga al enfocar la ventana.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy 2.0 async (backend), React 18 / Vite / Tailwind CDN (frontend), pytest + httpx (backend tests), Vitest + Testing Library (frontend tests).

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modify | `backend/database.py` |
| Modify | `backend/api/calendar_routes.py` |
| Modify | `backend/api/patient_portal.py` |
| Create | `backend/tests/test_psych_cancel_booking.py` |
| Modify | `frontend/src/patientApi.js` |
| Modify | `frontend/src/patientApi.test.js` |
| Create | `frontend/src/components/CancelledBookingCard.jsx` |
| Create | `frontend/src/components/CancelledBookingCard.test.jsx` |
| Modify | `frontend/src/pages/PatientPortal.jsx` |
| Modify | `frontend/src/components/CalendarScreen.jsx` |
| Modify | `frontend/src/components/CalendarScreen.test.jsx` |

---

## Task 1: DB Schema — añadir cancelled_by y acknowledged

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Añadir columnas al modelo AvailabilitySlot**

En `backend/database.py`, en la clase `AvailabilitySlot`, añadir dos campos **después de `booked_at`** (línea ~275):

```python
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

El import de `Boolean` ya existe en el archivo (`from sqlalchemy import ... Boolean`). Verificar que `Optional` está importado desde `typing` — ya existe en el archivo.

El bloque final del modelo debe verse así:

```python
    booked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)
```

- [ ] **Step 2: Commit**

```bash
git add backend/database.py
git commit -m "feat(db): add cancelled_by and acknowledged columns to AvailabilitySlot"
```

---

## Task 2: Backend — soft-cancel en DELETE /slots/{id} + filtrar GET /slots

**Files:**
- Modify: `backend/api/calendar_routes.py`
- Create: `backend/tests/test_psych_cancel_booking.py`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/tests/test_psych_cancel_booking.py`:

```python
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, time, datetime, timezone
from httpx import AsyncClient, ASGITransport


@pytest.fixture
async def async_client(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer fake-token"}


class TestSoftCancelSlot:
    @pytest.mark.asyncio
    async def test_delete_booked_slot_soft_cancels(self, async_client, auth_headers, mock_db):
        slot_id = uuid.uuid4()
        patient_id = uuid.uuid4()

        mock_slot = MagicMock()
        mock_slot.id = slot_id
        mock_slot.status = "booked"
        mock_slot.booked_by_patient_id = patient_id
        mock_slot.psychologist_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        mock_slot.slot_date = date(2026, 6, 1)
        mock_slot.start_time = time(10, 0)

        mock_patient = MagicMock()
        mock_patient.email = "paciente@test.com"
        mock_patient.name = "Ana García"

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_slot
        mock_db.execute.return_value = mock_result
        mock_db.get.return_value = mock_patient

        with patch("api.calendar_routes.send_booking_cancellation", new=AsyncMock()):
            response = await async_client.delete(
                f"/api/v1/calendar/slots/{slot_id}",
                headers=auth_headers,
            )

        assert response.status_code == 204
        # Debe soft-cancelar, no borrar
        mock_db.delete.assert_not_called()
        assert mock_slot.status == "cancelled"
        assert mock_slot.cancelled_by == "psychologist"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_available_slot_still_hard_deletes(self, async_client, auth_headers, mock_db):
        """Slots disponibles (no reservados) siguen borrándose con hard delete."""
        slot_id = uuid.uuid4()

        mock_slot = MagicMock()
        mock_slot.id = slot_id
        mock_slot.status = "available"
        mock_slot.booked_by_patient_id = None
        mock_slot.psychologist_id = uuid.UUID("99999999-9999-9999-9999-999999999999")

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_slot
        mock_db.execute.return_value = mock_result

        response = await async_client.delete(
            f"/api/v1/calendar/slots/{slot_id}",
            headers=auth_headers,
        )

        assert response.status_code == 204
        mock_db.delete.assert_called_once_with(mock_slot)
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py -v
```

Esperado: `FAILED` — `assert mock_db.delete.assert_not_called()` falla porque el código actual llama `db.delete(slot)`.

- [ ] **Step 3: Implementar soft-cancel en calendar_routes.py**

En `backend/api/calendar_routes.py`, reemplazar el endpoint `delete_slot` completo (líneas ~104-124):

```python
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
        slot.status = 'cancelled'
        slot.cancelled_by = 'psychologist'
        await db.commit()
    else:
        await db.delete(slot)
        await db.commit()
```

También actualizar `GET /slots` para excluir slots cancelados. En la query del endpoint `get_slots` (línea ~49), añadir el filtro de status:

```python
    res = await db.execute(
        select(AvailabilitySlot, Patient)
        .outerjoin(Patient, AvailabilitySlot.booked_by_patient_id == Patient.id)
        .where(
            AvailabilitySlot.psychologist_id == psychologist.id,
            AvailabilitySlot.slot_date >= start_date,
            AvailabilitySlot.slot_date < end_date,
            AvailabilitySlot.status != 'cancelled'
        )
        .order_by(AvailabilitySlot.slot_date, AvailabilitySlot.start_time)
    )
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py -v
```

Esperado: `2 passed`.

- [ ] **Step 5: Correr suite completa para detectar regresiones**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Esperado: todos los tests previos siguen en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/api/calendar_routes.py backend/tests/test_psych_cancel_booking.py
git commit -m "feat(calendar): soft-cancel booked slots instead of hard delete"
```

---

## Task 3: Backend — GET /portal/availability incluye cancelled_booking

**Files:**
- Modify: `backend/api/patient_portal.py`
- Modify: `backend/tests/test_psych_cancel_booking.py`

- [ ] **Step 1: Añadir tests de availability con cancelled_booking**

Añadir al final de `backend/tests/test_psych_cancel_booking.py`:

```python
class TestAvailabilityCancelledBooking:
    @pytest.mark.asyncio
    async def test_get_availability_returns_cancelled_booking(self):
        patient_id = str(uuid.uuid4())
        slot_id = uuid.uuid4()
        psych_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.psychologist_id = psych_id

        mock_cancelled_slot = MagicMock()
        mock_cancelled_slot.id = slot_id
        mock_cancelled_slot.slot_date = date(2026, 6, 1)
        mock_cancelled_slot.start_time = time(10, 0)
        mock_cancelled_slot.duration_minutes = 60

        mock_db = AsyncMock()
        # db.get devuelve el paciente
        mock_db.get.return_value = mock_patient

        # Primera query: slots disponibles → vacía
        available_result = MagicMock()
        available_result.scalars.return_value.all.return_value = []

        # Segunda query: upcoming_booking → None
        upcoming_result = MagicMock()
        upcoming_result.scalar_one_or_none.return_value = None

        # Tercera query: cancelled_booking → mock_cancelled_slot
        cancelled_result = MagicMock()
        cancelled_result.scalar_one_or_none.return_value = mock_cancelled_slot

        mock_db.execute.side_effect = [available_result, upcoming_result, cancelled_result]

        from main import app
        from api.patient_portal import get_current_patient
        from database import get_db

        async def override_patient():
            return patient_id

        async def override_db():
            yield mock_db

        app.dependency_overrides[get_current_patient] = override_patient
        app.dependency_overrides[get_db] = override_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/api/v1/portal/availability?month=2026-06")

            assert response.status_code == 200
            data = response.json()
            assert "cancelled_booking" in data
            assert data["cancelled_booking"]["id"] == str(slot_id)
            assert data["upcoming_booking"] is None
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_availability_cancelled_booking_null_when_acknowledged(self):
        patient_id = str(uuid.uuid4())
        psych_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.psychologist_id = psych_id

        mock_db = AsyncMock()
        mock_db.get.return_value = mock_patient

        available_result = MagicMock()
        available_result.scalars.return_value.all.return_value = []

        upcoming_result = MagicMock()
        upcoming_result.scalar_one_or_none.return_value = None

        # No hay cancelled_booking sin acknowledger
        cancelled_result = MagicMock()
        cancelled_result.scalar_one_or_none.return_value = None

        mock_db.execute.side_effect = [available_result, upcoming_result, cancelled_result]

        from main import app
        from api.patient_portal import get_current_patient
        from database import get_db

        async def override_patient():
            return patient_id

        async def override_db():
            yield mock_db

        app.dependency_overrides[get_current_patient] = override_patient
        app.dependency_overrides[get_db] = override_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/api/v1/portal/availability?month=2026-06")

            assert response.status_code == 200
            data = response.json()
            assert data["cancelled_booking"] is None
        finally:
            app.dependency_overrides.clear()
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py::TestAvailabilityCancelledBooking -v
```

Esperado: `FAILED` — `"cancelled_booking" not in data` porque el endpoint aún no devuelve ese campo.

- [ ] **Step 3: Actualizar GET /portal/availability**

En `backend/api/patient_portal.py`, reemplazar el cuerpo de `get_availability` desde la línea de `# Get upcoming booking` hasta el `return`:

```python
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

    # Get cancelled booking (psychologist-cancelled, not yet acknowledged)
    can_res = await db.execute(
        select(AvailabilitySlot)
        .where(
            AvailabilitySlot.booked_by_patient_id == puuid,
            AvailabilitySlot.status == 'cancelled',
            AvailabilitySlot.cancelled_by == 'psychologist',
            AvailabilitySlot.acknowledged == False
        ).order_by(AvailabilitySlot.slot_date.desc()).limit(1)
    )
    cancelled = can_res.scalar_one_or_none()

    return {
        "slots": [{"id": str(s.id), "slot_date": s.slot_date, "start_time": s.start_time, "duration_minutes": s.duration_minutes} for s in slots],
        "upcoming_booking": {"id": str(upcoming.id), "slot_date": upcoming.slot_date, "start_time": upcoming.start_time, "duration_minutes": upcoming.duration_minutes} if upcoming else None,
        "cancelled_booking": {"id": str(cancelled.id), "slot_date": cancelled.slot_date, "start_time": cancelled.start_time, "duration_minutes": cancelled.duration_minutes} if cancelled else None,
    }
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py::TestAvailabilityCancelledBooking -v
```

Esperado: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/api/patient_portal.py backend/tests/test_psych_cancel_booking.py
git commit -m "feat(portal): return cancelled_booking in GET /portal/availability"
```

---

## Task 4: Backend — POST /portal/booking/{id}/acknowledge

**Files:**
- Modify: `backend/api/patient_portal.py`
- Modify: `backend/tests/test_psych_cancel_booking.py`

- [ ] **Step 1: Añadir tests del endpoint acknowledge**

Añadir al final de `backend/tests/test_psych_cancel_booking.py`:

```python
class TestAcknowledgeCancellation:
    @pytest.mark.asyncio
    async def test_acknowledge_sets_acknowledged_true(self):
        patient_id = str(uuid.uuid4())
        slot_id = uuid.uuid4()

        mock_slot = MagicMock()
        mock_slot.id = slot_id
        mock_slot.status = "cancelled"
        mock_slot.booked_by_patient_id = uuid.UUID(patient_id)
        mock_slot.acknowledged = False

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_slot
        mock_db.execute.return_value = mock_result

        from main import app
        from api.patient_portal import get_current_patient
        from database import get_db

        async def override_patient():
            return patient_id

        async def override_db():
            yield mock_db

        app.dependency_overrides[get_current_patient] = override_patient
        app.dependency_overrides[get_db] = override_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post(f"/api/v1/portal/booking/{slot_id}/acknowledge")

            assert response.status_code == 200
            assert mock_slot.acknowledged == True
            mock_db.commit.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_acknowledge_returns_404_for_wrong_patient(self):
        patient_id = str(uuid.uuid4())
        slot_id = uuid.uuid4()

        mock_db = AsyncMock()
        mock_result = MagicMock()
        # El filtro booked_by_patient_id == puuid no encuentra el slot
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        from main import app
        from api.patient_portal import get_current_patient
        from database import get_db

        async def override_patient():
            return patient_id

        async def override_db():
            yield mock_db

        app.dependency_overrides[get_current_patient] = override_patient
        app.dependency_overrides[get_db] = override_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post(f"/api/v1/portal/booking/{slot_id}/acknowledge")

            assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py::TestAcknowledgeCancellation -v
```

Esperado: `FAILED` — 404 / 405 porque el endpoint no existe.

- [ ] **Step 3: Implementar el endpoint en patient_portal.py**

Añadir al final de `backend/api/patient_portal.py` (después del endpoint `cancel_booking`):

```python
@router.post("/booking/{slot_id}/acknowledge", status_code=status.HTTP_200_OK)
async def acknowledge_cancellation(
    slot_id: str,
    patient_id: str = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db)
):
    puuid = uuid.UUID(patient_id)
    suuid = uuid.UUID(slot_id)

    res = await db.execute(
        select(AvailabilitySlot)
        .where(
            AvailabilitySlot.id == suuid,
            AvailabilitySlot.booked_by_patient_id == puuid,
            AvailabilitySlot.status == 'cancelled'
        )
    )
    slot = res.scalar_one_or_none()

    if not slot:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    slot.acknowledged = True
    await db.commit()
    return {"status": "ok"}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd backend && python -m pytest tests/test_psych_cancel_booking.py -v
```

Esperado: todos los tests del archivo en verde.

- [ ] **Step 5: Suite completa**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Esperado: sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add backend/api/patient_portal.py backend/tests/test_psych_cancel_booking.py
git commit -m "feat(portal): add POST /booking/{id}/acknowledge endpoint"
```

---

## Task 5: Frontend — patientApi.js + test

**Files:**
- Modify: `frontend/src/patientApi.js`
- Modify: `frontend/src/patientApi.test.js`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `frontend/src/patientApi.test.js`:

```js
describe('acknowledgeBookingCancellation', () => {
  it('calls POST /portal/booking/:id/acknowledge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })

    const { acknowledgeBookingCancellation } = await import('./patientApi')
    await acknowledgeBookingCancellation('slot-abc')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/portal/booking/slot-abc/acknowledge'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 2: Verificar que el test falla**

```bash
cd frontend && npx vitest run src/patientApi.test.js
```

Esperado: `FAILED` — `acknowledgeBookingCancellation is not a function`.

- [ ] **Step 3: Añadir la función a patientApi.js**

Añadir al final de `frontend/src/patientApi.js`:

```js
export async function acknowledgeBookingCancellation(slotId) {
  return patientFetch(`/portal/booking/${slotId}/acknowledge`, {
    method: 'POST'
  })
}
```

- [ ] **Step 4: Verificar que el test pasa**

```bash
cd frontend && npx vitest run src/patientApi.test.js
```

Esperado: todos en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/patientApi.js frontend/src/patientApi.test.js
git commit -m "feat(patientApi): add acknowledgeBookingCancellation"
```

---

## Task 6: Frontend — CancelledBookingCard componente

**Files:**
- Create: `frontend/src/components/CancelledBookingCard.jsx`
- Create: `frontend/src/components/CancelledBookingCard.test.jsx`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/components/CancelledBookingCard.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CancelledBookingCard from './CancelledBookingCard';

const mockBooking = {
  id: 'slot-999',
  slot_date: '2026-06-01',
  start_time: '10:00:00',
  duration_minutes: 60,
};

describe('CancelledBookingCard', () => {
  it('no renderiza nada cuando booking es null', () => {
    const { container } = render(
      <CancelledBookingCard booking={null} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra label "Cita cancelada"', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/cita cancelada/i)).toBeInTheDocument();
  });

  it('muestra fecha, hora y duración formateadas', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/1 de junio/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00 am · 60 min/i)).toBeInTheDocument();
  });

  it('muestra mensaje de cancelación por psicólogo', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/tu psicólogo canceló esta cita/i)).toBeInTheDocument();
  });

  it('llama onAcknowledge con el id correcto al presionar Enterado', () => {
    const onAcknowledge = vi.fn();
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={onAcknowledge} acknowledging={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: /enterado/i }));
    expect(onAcknowledge).toHaveBeenCalledWith('slot-999');
  });

  it('muestra spinner y deshabilita botón cuando acknowledging es true', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={true} />
    );
    expect(screen.getByText(/procesando/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enterado/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
cd frontend && npx vitest run src/components/CancelledBookingCard.test.jsx
```

Esperado: `FAILED` — componente no existe.

- [ ] **Step 3: Crear CancelledBookingCard.jsx**

Crear `frontend/src/components/CancelledBookingCard.jsx`:

```jsx
import { useState } from 'react';

export default function CancelledBookingCard({ booking, onAcknowledge, acknowledging }) {
  if (!booking) return null;

  const formattedDate = new Date(booking.slot_date + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const [h = '00', m = '00'] = (booking.start_time ?? '00:00').split(':');
  const formattedTime = `${h}:${m} ${parseInt(h, 10) < 12 ? 'am' : 'pm'}`;

  return (
    <div className="bg-white rounded-2xl border border-[#18181b]/[0.08] p-4 mb-3">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#c4935a]/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="#c4935a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest text-[#c4935a] uppercase">
            Cita cancelada
          </span>
          <span className="text-sm font-semibold font-serif text-[#18181b] mt-0.5">
            {formattedDate}
          </span>
          <span className="text-xs text-[#9ca3af] mt-0.5">
            {formattedTime} · {booking.duration_minutes} min
          </span>
        </div>
      </div>
      <p className="text-xs text-[#9ca3af] mb-3">Tu psicólogo canceló esta cita.</p>
      <button
        onClick={() => onAcknowledge(booking.id)}
        disabled={acknowledging}
        aria-label="Marcar como enterado de la cancelación"
        className="w-full min-h-[44px] rounded-xl py-2.5 bg-[#5a9e8a] hover:bg-[#4a8271] text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {acknowledging ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block" />
            Procesando…
          </span>
        ) : 'Enterado'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd frontend && npx vitest run src/components/CancelledBookingCard.test.jsx
```

Esperado: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CancelledBookingCard.jsx frontend/src/components/CancelledBookingCard.test.jsx
git commit -m "feat(ui): add CancelledBookingCard component"
```

---

## Task 7: Frontend — PatientPortal estado + render con prioridad

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Actualizar imports**

En `frontend/src/pages/PatientPortal.jsx`, línea 2, añadir `acknowledgeBookingCancellation` al import de patientApi:

```js
import { clearPatientToken, getPatientSummaries, getPatientSummaryDetail, getPatientAvailability, cancelPatientBooking, acknowledgeBookingCancellation } from '../patientApi';
```

Y añadir el import del nuevo componente (línea 6, después de `UpcomingBookingCard`):

```js
import CancelledBookingCard from '../components/CancelledBookingCard';
```

- [ ] **Step 2: Añadir estado cancelledBooking y acknowledging**

Después de la línea `const [cancelError, setCancelError] = useState(null);` (línea ~20), añadir:

```js
  const [cancelledBooking, setCancelledBooking] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
```

- [ ] **Step 3: Actualizar loadUpcomingBooking para leer cancelled_booking**

Reemplazar la función `loadUpcomingBooking` (líneas ~39-44) completa:

```js
  const loadUpcomingBooking = () => {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return getPatientAvailability(month)
      .then(data => {
        setUpcomingBooking(data.upcoming_booking ?? null);
        setCancelledBooking(data.cancelled_booking ?? null);
        setCancelError(null);
      })
      .catch(() => {});
  };
```

- [ ] **Step 4: Añadir handleAcknowledge**

Después de la función `handleCancelBooking` (línea ~72), añadir:

```js
  const handleAcknowledge = async (slotId) => {
    setAcknowledging(true);
    try {
      await acknowledgeBookingCancellation(slotId);
      setCancelledBooking(null);
    } catch {
      // La card queda visible si falla — el paciente puede reintentar
    } finally {
      setAcknowledging(false);
    }
  };
```

- [ ] **Step 5: Actualizar el render — prioridad de card y CTA**

Reemplazar la sección del portal (líneas ~169-198) que contiene `<UpcomingBookingCard ...>` y el botón "Agendar cita":

```jsx
            {/* Próxima cita / cancelación */}
            {cancelledBooking ? (
              <CancelledBookingCard
                booking={cancelledBooking}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging}
              />
            ) : (
              <UpcomingBookingCard
                booking={upcomingBooking}
                onCancel={handleCancelBooking}
                canceling={cancelingBooking}
                error={cancelError}
              />
            )}

            {/* Booking CTA — solo visible cuando no hay cita activa ni cancelación pendiente */}
            {!cancelledBooking && !upcomingBooking && (
              <button
                onClick={() => setBookingModalOpen(true)}
                className="w-full mb-5 flex items-center gap-3 bg-[#5a9e8a] hover:bg-[#4a8271] active:scale-[0.98] text-white rounded-xl px-4 py-3 transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold leading-tight">Agendar cita</div>
                  <div className="text-[11px] text-white/70 leading-tight mt-0.5">
                    Ver disponibilidad del psicólogo
                  </div>
                </div>
                <svg className="w-4 h-4 ml-auto text-white/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
```

- [ ] **Step 6: Verificar tests existentes siguen pasando**

```bash
cd frontend && npx vitest run src/pages/PatientPortal.auth.test.jsx
```

Esperado: en verde (los tests de auth no tocan el estado de booking).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat(portal): show CancelledBookingCard when psychologist cancels booking"
```

---

## Task 8: Frontend — CalendarScreen focus refetch

**Files:**
- Modify: `frontend/src/components/CalendarScreen.jsx`
- Modify: `frontend/src/components/CalendarScreen.test.jsx`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `frontend/src/components/CalendarScreen.test.jsx`:

```jsx
import { getCalendarSlots } from '../api';

describe('CalendarScreen — focus refetch', () => {
  it('recarga los slots al enfocar la ventana', async () => {
    const { getCalendarSlots: mockGetSlots } = await import('../api');
    render(<CalendarScreen onClose={() => {}} />);

    const callsBefore = mockGetSlots.mock.calls.length;
    window.dispatchEvent(new Event('focus'));

    // Esperar micro-tick para que el handler async resuelva
    await new Promise(r => setTimeout(r, 0));

    expect(mockGetSlots.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
```

- [ ] **Step 2: Verificar que el test falla**

```bash
cd frontend && npx vitest run src/components/CalendarScreen.test.jsx
```

Esperado: `FAILED` — `expect(mockGetSlots.mock.calls.length).toBeGreaterThan(callsBefore)` falla porque el foco no dispara recarga.

- [ ] **Step 3: Añadir el useEffect de focus en CalendarScreen.jsx**

En `frontend/src/components/CalendarScreen.jsx`, después del `useEffect` existente que llama `loadSlots` al cambiar `currentMonthStr` (líneas ~19-23), añadir:

```js
  useEffect(() => {
    const onFocus = () => loadSlots();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [currentMonthStr]);
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd frontend && npx vitest run src/components/CalendarScreen.test.jsx
```

Esperado: todos en verde.

- [ ] **Step 5: Suite completa de frontend**

```bash
cd frontend && npx vitest run
```

Esperado: sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CalendarScreen.jsx frontend/src/components/CalendarScreen.test.jsx
git commit -m "feat(calendar): refetch slots on window focus for real-time patient cancellation updates"
```

---

## Verificación final

- [ ] Levantar el stack completo y probar el flujo de extremo a extremo:

```bash
# Terminal 1
docker-compose up -d postgres
.\start-backend.ps1

# Terminal 2
.\start-frontend.ps1
```

Pasos del flujo:
1. Psicólogo agenda un slot disponible
2. Paciente reserva ese slot en su portal
3. Psicólogo cancela el slot desde el CalendarScreen (botón naranja "Cancelar cita")
4. Verificar que el slot desaparece del calendario del psicólogo
5. Paciente recarga su portal → ve `CancelledBookingCard` con la fecha/hora de la cita cancelada y botón "Enterado"
6. Paciente presiona "Enterado" → la card desaparece, aparece el botón "Agendar cita"
7. Enfocar ventana del psicólogo → el calendario se refresca automáticamente

- [ ] **Commit final de cualquier ajuste residual**

```bash
git add -p
git commit -m "fix: final adjustments for psych-cancel-booking feature"
```
