# Dual-Mode DictationPanel + Agenda Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la Agenda en sección top-level de la app y permitir al psicólogo describir disponibilidad en texto libre para que el AI genere los slots de citas.

**Architecture:** Backend expone dos endpoints nuevos en `calendar_routes.py` (`/parse-availability` via Claude Haiku, `/slots/batch`). Frontend agrega `AvailabilityPanel.jsx` (5 estados: input→loading→preview→error→confirmed), `BottomNav.jsx` (nav móvil top-level), y conecta todo en `App.jsx` via estado `activeSection`.

**Tech Stack:** FastAPI + AsyncAnthropic (backend), React 18 + Tailwind CDN + Vitest + @testing-library/react (frontend), pytest (backend tests).

---

## File Map

**Crear:**
- `backend/api/calendar_ai.py` — lógica de parsing con Claude (SOLID: separado de routes)
- `backend/tests/test_calendar_ai.py` — unit tests del parser
- `backend/tests/test_calendar_routes_batch.py` — tests de los endpoints nuevos
- `frontend/src/components/AvailabilityPanel.jsx` — UI de disponibilidad (5 estados)
- `frontend/src/components/AvailabilityPanel.test.jsx` — tests del panel
- `frontend/src/components/BottomNav.jsx` — nav móvil top-level Pacientes|Agenda

**Modificar:**
- `backend/api/calendar_routes.py` — agregar `POST /parse-availability` y `POST /slots/batch`
- `frontend/src/api.js` — agregar `parseAvailability()` y `createCalendarSlotsBatch()`
- `frontend/src/components/CalendarScreen.jsx` — agregar prop `mode: 'modal'|'inline'`
- `frontend/src/components/DictationPanel.jsx` — agregar prop `panelMode`, delegar a `AvailabilityPanel`
- `frontend/src/App.jsx` — agregar `activeSection` state, sidebar Agenda, bottom nav, wiring

---

## Task 1: Backend — `calendar_ai.py` (parse de disponibilidad con Claude)

**Files:**
- Create: `backend/api/calendar_ai.py`
- Create: `backend/tests/test_calendar_ai.py`

- [ ] **Step 1.1: Escribir el test que falla**

```python
# backend/tests/test_calendar_ai.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, time
from api.calendar_ai import parse_availability, SlotProposal


class TestParseAvailability:
    @pytest.mark.asyncio
    async def test_returns_slots_for_valid_text(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='[{"slot_date":"2026-05-18","start_time":"09:00","duration_minutes":50},{"slot_date":"2026-05-18","start_time":"09:50","duration_minutes":50}]')]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes de 9 a 10:40", "2026-05-15")

        assert len(result) == 2
        assert result[0].slot_date == date(2026, 5, 18)
        assert result[0].start_time == time(9, 0)
        assert result[0].duration_minutes == 50

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_claude_returns_empty(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="[]")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto sin fechas", "2026-05-15")

        assert result == []

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_invalid_json(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="No puedo determinar las fechas")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto ambiguo", "2026-05-15")

        assert result == []
```

- [ ] **Step 1.2: Correr el test para verificar que falla**

```bash
cd backend && python -m pytest tests/test_calendar_ai.py -v
```
Expected: `ModuleNotFoundError: No module named 'api.calendar_ai'`

- [ ] **Step 1.3: Crear `backend/api/calendar_ai.py`**

```python
import json
import logging
from datetime import date, time
from typing import List
from pydantic import BaseModel, field_validator
from anthropic import AsyncAnthropic
from config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Eres un asistente de agenda para psicólogos. Cuando el psicólogo describe su disponibilidad en texto libre en español, extrae los días y horarios y genera slots de citas de 50 minutos consecutivos.

Devuelve ÚNICAMENTE un array JSON con objetos de la forma:
[{"slot_date": "YYYY-MM-DD", "start_time": "HH:MM", "duration_minutes": 50}, ...]

Reglas:
- Genera citas de 50 minutos que comiencen consecutivamente dentro de cada rango horario indicado
- Resuelve fechas relativas ("mañana", "el lunes", "esta semana") usando la fecha de hoy
- Si el texto no contiene fechas u horas identificables, devuelve []
- Devuelve SOLO el array JSON, sin texto adicional ni explicaciones"""


class SlotProposal(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int = 50

    @field_validator("start_time", mode="before")
    @classmethod
    def parse_time(cls, v):
        if isinstance(v, str):
            h, m = v.split(":")
            return time(int(h), int(m))
        return v


async def parse_availability(text: str, reference_date: str) -> List[SlotProposal]:
    """Llama a Claude para extraer slots de disponibilidad desde texto libre."""
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    user_message = f"Hoy es {reference_date}.\nDisponibilidad: \"{text}\""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        slots_data = json.loads(raw)
        if not isinstance(slots_data, list):
            return []
        return [SlotProposal(**s) for s in slots_data]
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning("parse_availability could not parse Claude response: %s", e)
        return []
    except Exception as e:
        logger.error("parse_availability unexpected error: %s", e)
        return []
```

- [ ] **Step 1.4: Correr los tests para verificar que pasan**

```bash
cd backend && python -m pytest tests/test_calendar_ai.py -v
```
Expected: `3 passed`

- [ ] **Step 1.5: Commit**

```bash
git add backend/api/calendar_ai.py backend/tests/test_calendar_ai.py
git commit -m "feat(backend): add calendar_ai module for parsing availability text with Claude"
```

---

## Task 2: Backend — nuevos endpoints en `calendar_routes.py`

**Files:**
- Modify: `backend/api/calendar_routes.py`
- Create: `backend/tests/test_calendar_routes_batch.py`

- [ ] **Step 2.1: Escribir los tests que fallan**

```python
# backend/tests/test_calendar_routes_batch.py
import pytest
from unittest.mock import AsyncMock, patch
from datetime import date, time
from api.calendar_ai import SlotProposal


class TestParseAvailabilityEndpoint:
    @pytest.mark.asyncio
    async def test_returns_slots_when_text_parseable(self, async_client, auth_headers):
        mock_slots = [
            SlotProposal(slot_date=date(2026, 5, 18), start_time=time(9, 0), duration_minutes=50),
        ]
        with patch("api.calendar_routes.parse_availability", AsyncMock(return_value=mock_slots)):
            response = await async_client.post(
                "/api/v1/calendar/parse-availability",
                json={"text": "Lunes de 9 a 10", "reference_date": "2026-05-15"},
                headers=auth_headers,
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data["slots"]) == 1
        assert data["slots"][0]["slot_date"] == "2026-05-18"
        assert data["slots"][0]["start_time"] == "09:00"

    @pytest.mark.asyncio
    async def test_returns_422_when_no_slots_found(self, async_client, auth_headers):
        with patch("api.calendar_routes.parse_availability", AsyncMock(return_value=[])):
            response = await async_client.post(
                "/api/v1/calendar/parse-availability",
                json={"text": "texto sin fechas", "reference_date": "2026-05-15"},
                headers=auth_headers,
            )
        assert response.status_code == 422
        assert "No se pudieron identificar" in response.json()["detail"]


class TestCreateSlotsBatch:
    @pytest.mark.asyncio
    async def test_creates_slots_and_returns_count(self, async_client, auth_headers, db_session):
        response = await async_client.post(
            "/api/v1/calendar/slots/batch",
            json={"slots": [
                {"slot_date": "2099-01-06", "start_time": "09:00", "duration_minutes": 50},
                {"slot_date": "2099-01-06", "start_time": "09:50", "duration_minutes": 50},
            ]},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["created"] == 2
        assert data["skipped"] == 0

    @pytest.mark.asyncio
    async def test_skips_duplicate_slots(self, async_client, auth_headers, db_session):
        payload = {"slots": [{"slot_date": "2099-02-10", "start_time": "10:00", "duration_minutes": 50}]}
        await async_client.post("/api/v1/calendar/slots/batch", json=payload, headers=auth_headers)
        response = await async_client.post("/api/v1/calendar/slots/batch", json=payload, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["skipped"] == 1

    @pytest.mark.asyncio
    async def test_returns_400_for_empty_array(self, async_client, auth_headers):
        response = await async_client.post(
            "/api/v1/calendar/slots/batch",
            json={"slots": []},
            headers=auth_headers,
        )
        assert response.status_code == 400
```

- [ ] **Step 2.2: Correr los tests para verificar que fallan**

```bash
cd backend && python -m pytest tests/test_calendar_routes_batch.py -v
```
Expected: fallos por endpoints inexistentes.

- [ ] **Step 2.3: Agregar los dos endpoints a `calendar_routes.py`**

Agregar al final de `backend/api/calendar_routes.py`, después de los imports existentes añadir:

```python
from sqlalchemy.exc import IntegrityError
from api.calendar_ai import parse_availability
```

Y agregar estas clases y endpoints al archivo:

```python
# --- Schemas nuevos ---

class ParseAvailabilityRequest(BaseModel):
    text: str
    reference_date: str  # YYYY-MM-DD

class SlotProposalOut(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int

class ParseAvailabilityResponse(BaseModel):
    slots: list[SlotProposalOut]

class SlotBatchItem(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int = 50

class SlotBatchCreate(BaseModel):
    slots: list[SlotBatchItem]

class SlotBatchResponse(BaseModel):
    created: int
    skipped: int


# --- Endpoints nuevos ---

@router.post("/parse-availability", response_model=ParseAvailabilityResponse)
@limiter.limit("30/hour")
async def parse_availability_endpoint(
    request: Request,
    payload: ParseAvailabilityRequest,
    psychologist: Psychologist = Depends(get_current_psychologist),
):
    slots = await parse_availability(payload.text, payload.reference_date)
    if not slots:
        raise HTTPException(
            status_code=422,
            detail="No se pudieron identificar fechas u horas. Intenta: 'Lunes de 9 a 2, sesiones 50 min'",
        )
    return ParseAvailabilityResponse(
        slots=[SlotProposalOut(slot_date=s.slot_date, start_time=s.start_time, duration_minutes=s.duration_minutes) for s in slots]
    )


@router.post("/slots/batch", response_model=SlotBatchResponse)
@limiter.limit("60/hour")
async def create_slots_batch(
    request: Request,
    payload: SlotBatchCreate,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    if not payload.slots:
        raise HTTPException(status_code=400, detail="El array de slots no puede estar vacío")

    today = date.today()
    created = 0
    skipped = 0

    for item in payload.slots:
        if item.slot_date < today:
            skipped += 1
            continue
        try:
            async with db.begin_nested():
                slot = AvailabilitySlot(
                    psychologist_id=psychologist.id,
                    slot_date=item.slot_date,
                    start_time=item.start_time,
                    duration_minutes=item.duration_minutes,
                    status="available",
                )
                db.add(slot)
                await db.flush()
            created += 1
        except IntegrityError:
            skipped += 1

    await db.commit()
    return SlotBatchResponse(created=created, skipped=skipped)
```

- [ ] **Step 2.4: Correr los tests**

```bash
cd backend && python -m pytest tests/test_calendar_routes_batch.py -v
```
Expected: tests pasan (los que usan fixtures pueden requerir conftest — si fallan por fixture missing, ver nota abajo).

> Nota: si no existe `conftest.py` con `async_client` y `auth_headers`, estos tests son de integración que requieren la DB. En ese caso, correr solo los unit tests del Task 1 y marcar los de integración como `@pytest.mark.integration` para correrlos manualmente con DB levantada.

- [ ] **Step 2.5: Commit**

```bash
git add backend/api/calendar_routes.py backend/tests/test_calendar_routes_batch.py
git commit -m "feat(backend): add parse-availability and slots/batch endpoints"
```

---

## Task 3: Frontend — agregar funciones a `api.js`

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 3.1: Agregar las dos funciones al final de la sección Calendar en `frontend/src/api.js`**

Localiza el bloque `// --- Calendar ---` que ya existe (línea ~306). Después de `deleteCalendarSlot`, agregar:

```js
export async function parseAvailability(text, referenceDate) {
  return _authFetch(`${API_BASE}/calendar/parse-availability`, {
    method: 'POST',
    body: JSON.stringify({ text, reference_date: referenceDate }),
  });
}

export async function createCalendarSlotsBatch(slots) {
  return _authFetch(`${API_BASE}/calendar/slots/batch`, {
    method: 'POST',
    body: JSON.stringify({ slots }),
  });
}
```

- [ ] **Step 3.2: Verificar que los exports existen**

```bash
cd frontend && grep -n "parseAvailability\|createCalendarSlotsBatch" src/api.js
```
Expected: dos líneas con `export async function`.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): add parseAvailability and createCalendarSlotsBatch to api.js"
```

---

## Task 4: Frontend — `CalendarScreen.jsx` inline mode

**Files:**
- Modify: `frontend/src/components/CalendarScreen.jsx`

- [ ] **Step 4.1: Escribir el test que falla**

Agregar al final de `frontend/src/components/CalendarScreen.test.jsx` (si no existe, crear con este contenido):

```jsx
// frontend/src/components/CalendarScreen.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CalendarScreen from './CalendarScreen';

vi.mock('../api', () => ({
  getCalendarSlots: vi.fn(() => Promise.resolve([])),
  createCalendarSlot: vi.fn(),
  deleteCalendarSlot: vi.fn(),
}));

describe('CalendarScreen', () => {
  it('renders close button in modal mode (default)', () => {
    render(<CalendarScreen onClose={() => {}} />);
    expect(screen.getByLabelText('Cerrar agenda')).toBeInTheDocument();
  });

  it('does not render close button in inline mode', () => {
    render(<CalendarScreen onClose={() => {}} mode="inline" />);
    expect(screen.queryByLabelText('Cerrar agenda')).not.toBeInTheDocument();
  });

  it('applies fixed positioning in modal mode', () => {
    const { container } = render(<CalendarScreen onClose={() => {}} />);
    expect(container.firstChild.className).toContain('fixed');
  });

  it('does not apply fixed positioning in inline mode', () => {
    const { container } = render(<CalendarScreen onClose={() => {}} mode="inline" />);
    expect(container.firstChild.className).not.toContain('fixed');
  });
});
```

- [ ] **Step 4.2: Correr el test para verificar que falla**

```bash
cd frontend && npx vitest run src/components/CalendarScreen.test.jsx
```
Expected: falla porque no existe aria-label en el botón de cierre ni prop `mode`.

- [ ] **Step 4.3: Modificar `CalendarScreen.jsx`**

Cambiar la función `CalendarScreen` para aceptar `mode`:

```jsx
export default function CalendarScreen({ onClose, mode = 'modal' }) {
```

Cambiar el div raíz (línea 125):

```jsx
  return (
    <div className={
      mode === 'modal'
        ? "fixed inset-0 z-50 bg-[#f4f4f2] flex flex-col md:flex-row overflow-hidden font-sans"
        : "flex flex-col md:flex-row h-full overflow-hidden font-sans bg-[#f4f4f2]"
    }>
```

Agregar `aria-label` al botón de cierre y condicionarlo (línea 130-132):

```jsx
          {mode === 'modal' && (
            <button
              onClick={onClose}
              aria-label="Cerrar agenda"
              className="p-2 bg-ink/[0.05] hover:bg-ink/[0.1] rounded-full text-ink-secondary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
```

- [ ] **Step 4.4: Correr los tests**

```bash
cd frontend && npx vitest run src/components/CalendarScreen.test.jsx
```
Expected: `4 passed`

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/components/CalendarScreen.jsx frontend/src/components/CalendarScreen.test.jsx
git commit -m "feat(frontend): add inline mode prop to CalendarScreen"
```

---

## Task 5: Frontend — `AvailabilityPanel.jsx`

**Files:**
- Create: `frontend/src/components/AvailabilityPanel.jsx`
- Create: `frontend/src/components/AvailabilityPanel.test.jsx`

- [ ] **Step 5.1: Escribir los tests que fallan**

```jsx
// frontend/src/components/AvailabilityPanel.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AvailabilityPanel from './AvailabilityPanel';

const mockSlots = [
  { slot_date: '2026-05-18', start_time: '09:00', duration_minutes: 50 },
  { slot_date: '2026-05-18', start_time: '09:50', duration_minutes: 50 },
];

describe('AvailabilityPanel', () => {
  it('renders input state by default', () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn()} onConfirmSlots={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Describe cuándo estás disponible/)).toBeInTheDocument();
    expect(screen.getByText('Interpretar disponibilidad →')).toBeInTheDocument();
  });

  it('shows loading state while parsing', async () => {
    const slowParse = () => new Promise(resolve => setTimeout(() => resolve(mockSlots), 100));
    render(<AvailabilityPanel onParseAvailability={slowParse} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText('Interpretando…')).toBeInTheDocument();
  });

  it('shows preview with parsed slots', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText('INTERPRETADO')).toBeInTheDocument();
    expect(screen.getByText('Confirmar 2 →')).toBeInTheDocument();
  });

  it('allows removing a slot from preview', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    await screen.findByText('INTERPRETADO');
    const removeButtons = screen.getAllByTitle('Eliminar slot');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText('Confirmar 1 →')).toBeInTheDocument();
  });

  it('shows error state when parse returns empty', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.reject(new Error('422')))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'texto sin sentido' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText(/No pude identificar/)).toBeInTheDocument();
  });

  it('calls onConfirmSlots with remaining slots on confirm', async () => {
    const onConfirm = vi.fn(() => Promise.resolve({ created: 2, skipped: 0 }));
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    await screen.findByText('INTERPRETADO');
    fireEvent.click(screen.getByText('Confirmar 2 →'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(mockSlots));
  });
});
```

- [ ] **Step 5.2: Correr los tests para verificar que fallan**

```bash
cd frontend && npx vitest run src/components/AvailabilityPanel.test.jsx
```
Expected: `Cannot find module './AvailabilityPanel'`

- [ ] **Step 5.3: Crear `frontend/src/components/AvailabilityPanel.jsx`**

```jsx
import { useState } from 'react';

const PANEL_STATES = { IDLE: 'idle', LOADING: 'loading', PREVIEW: 'preview', ERROR: 'error' };

function groupSlotsByDate(slots) {
  return slots.reduce((acc, slot) => {
    if (!acc[slot.slot_date]) acc[slot.slot_date] = [];
    acc[slot.slot_date].push(slot);
    return acc;
  }, {});
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AvailabilityPanel({ onParseAvailability, onConfirmSlots }) {
  const [state, setState] = useState(PANEL_STATES.IDLE);
  const [text, setText] = useState('');
  const [previewSlots, setPreviewSlots] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const todayISO = new Date().toISOString().split('T')[0];

  const handleParse = async () => {
    if (!text.trim()) return;
    setState(PANEL_STATES.LOADING);
    setErrorMsg('');
    try {
      const slots = await onParseAvailability(text.trim(), todayISO);
      setPreviewSlots(slots);
      setState(PANEL_STATES.PREVIEW);
    } catch {
      setState(PANEL_STATES.ERROR);
      setErrorMsg('No pude identificar fechas u horas. Intenta: "Lunes de 9 a 2, sesiones 50 min"');
    }
  };

  const handleRemoveSlot = (index) => {
    setPreviewSlots(prev => prev.filter((_, i) => i !== index));
  };

  const handleDiscard = () => {
    setState(PANEL_STATES.IDLE);
    setPreviewSlots([]);
  };

  const handleConfirm = async () => {
    await onConfirmSlots(previewSlots);
    setState(PANEL_STATES.IDLE);
    setText('');
    setPreviewSlots([]);
  };

  const grouped = groupSlotsByDate(previewSlots);
  const dateCount = Object.keys(grouped).length;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Disponibilidad · {today}
        </p>

        {state === PANEL_STATES.PREVIEW ? (
          <div>
            <button
              onClick={handleDiscard}
              className="text-[12px] text-ink-secondary hover:text-ink mb-4 flex items-center gap-1 transition-colors"
            >
              ← Editar texto
            </button>
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">Interpretado</p>
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {Object.entries(grouped).map(([dateStr, slots]) => (
                <div key={dateStr}>
                  <p className="text-[13px] font-medium text-ink mb-1.5 capitalize">{formatDate(dateStr)}</p>
                  <div className="space-y-1.5">
                    {slots.map((slot, idx) => {
                      const globalIdx = previewSlots.indexOf(slot);
                      return (
                        <div key={idx} className="flex items-center justify-between bg-[#f4f4f2] rounded-lg px-3 py-2">
                          <span className="text-[13px] text-ink">{slot.start_time.substring(0, 5)} · 50 min</span>
                          <button
                            onClick={() => handleRemoveSlot(globalIdx)}
                            title="Eliminar slot"
                            className="text-ink-tertiary hover:text-red-500 transition-colors p-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink-secondary mt-3">
              {previewSlots.length} horario{previewSlots.length !== 1 ? 's' : ''}{dateCount > 1 ? ` en ${dateCount} días` : ''}
            </p>
          </div>
        ) : (
          <div>
            <textarea
              className="w-full h-52 resize-none bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-[#18181b] outline-none focus:border-[#5a9e8a] focus:ring-0 transition-colors placeholder-ink-muted disabled:bg-slate-50 disabled:opacity-50"
              placeholder="Describe cuándo estás disponible — un día, varios o una semana…"
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={state === PANEL_STATES.LOADING}
            />
            <p className="text-[11px] text-ink-tertiary mt-1.5 mb-3">
              Ej: Lunes de 9 a 2, miércoles solo de 10 a 12
            </p>
            {state === PANEL_STATES.ERROR && (
              <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-red-700 leading-relaxed">{errorMsg}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex-shrink-0">
        {state === PANEL_STATES.PREVIEW ? (
          <div className="flex gap-2">
            <button
              onClick={handleDiscard}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-medium border border-ink/[0.1] text-ink-secondary hover:bg-ink/[0.02] transition-all"
            >
              Descartar
            </button>
            <button
              onClick={handleConfirm}
              disabled={previewSlots.length === 0}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-medium bg-[#5a9e8a] text-white hover:bg-[#4a8a78] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Confirmar {previewSlots.length} →
            </button>
          </div>
        ) : (
          <button
            onClick={handleParse}
            disabled={state === PANEL_STATES.LOADING || !text.trim()}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
              state === PANEL_STATES.LOADING || !text.trim()
                ? 'bg-[#5a9e8a] text-white opacity-40 cursor-not-allowed'
                : 'bg-[#5a9e8a] text-white hover:bg-[#4a8a78] active:scale-95'
            }`}
          >
            {state === PANEL_STATES.LOADING ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Interpretando…
              </>
            ) : (
              'Interpretar disponibilidad →'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Correr los tests**

```bash
cd frontend && npx vitest run src/components/AvailabilityPanel.test.jsx
```
Expected: `6 passed`

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/components/AvailabilityPanel.jsx frontend/src/components/AvailabilityPanel.test.jsx
git commit -m "feat(frontend): add AvailabilityPanel component with 5-state flow"
```

---

## Task 6: Frontend — `DictationPanel.jsx` acepta `panelMode`

**Files:**
- Modify: `frontend/src/components/DictationPanel.jsx`
- Modify: `frontend/src/components/DictationPanel.test.jsx`

- [ ] **Step 6.1: Escribir el test nuevo que falla**

Agregar al final de `DictationPanel.test.jsx`:

```jsx
  it('renders AvailabilityPanel when panelMode is disponibilidad', () => {
    render(
      <DictationPanel
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        loading={false}
        panelMode="disponibilidad"
        onParseAvailability={vi.fn()}
        onConfirmSlots={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/Describe cuándo estás disponible/)).toBeInTheDocument();
    expect(screen.queryByText('SOAP')).not.toBeInTheDocument();
  });

  it('renders note UI when panelMode is nota (default)', () => {
    render(
      <DictationPanel
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        loading={false}
        panelMode="nota"
      />
    );
    expect(screen.getByText('SOAP')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Describe cuándo estás disponible/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 6.2: Correr el test para verificar que falla**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```
Expected: fallan los 2 nuevos tests.

- [ ] **Step 6.3: Modificar `DictationPanel.jsx`**

Agregar el import al inicio del archivo:

```jsx
import AvailabilityPanel from './AvailabilityPanel';
```

Cambiar la firma de la función:

```jsx
export default function DictationPanel({ 
  value, 
  onChange, 
  onGenerate, 
  loading, 
  orphanedSessions = [], 
  onResumeOrphan, 
  onDiscardOrphan,
  noteFormat = 'soap',
  onFormatChange,
  onEditTemplate,
  panelMode = 'nota',
  onParseAvailability,
  onConfirmSlots,
}) {
```

Añadir al comienzo del `return` (antes del div raíz), como primera línea dentro de la función:

```jsx
  if (panelMode === 'disponibilidad') {
    return <AvailabilityPanel onParseAvailability={onParseAvailability} onConfirmSlots={onConfirmSlots} />;
  }
```

- [ ] **Step 6.4: Correr todos los tests de DictationPanel**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```
Expected: todos los tests pasan (incluyendo los existentes, que siguen funcionando porque `panelMode` default es `'nota'`).

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx
git commit -m "feat(frontend): add panelMode prop to DictationPanel, delegate to AvailabilityPanel"
```

---

## Task 7: Frontend — `BottomNav.jsx` (nav mobile top-level)

**Files:**
- Create: `frontend/src/components/BottomNav.jsx`

- [ ] **Step 7.1: Escribir el test que falla**

```jsx
// frontend/src/components/BottomNav.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BottomNav from './BottomNav';

describe('BottomNav', () => {
  it('renders Pacientes and Agenda tabs', () => {
    render(<BottomNav activeSection="patients" onSectionChange={() => {}} />);
    expect(screen.getByText('Pacientes')).toBeInTheDocument();
    expect(screen.getByText('Agenda')).toBeInTheDocument();
  });

  it('highlights active section', () => {
    render(<BottomNav activeSection="agenda" onSectionChange={() => {}} />);
    const agendaBtn = screen.getByText('Agenda').closest('button');
    expect(agendaBtn.className).toContain('text-[#5a9e8a]');
  });

  it('calls onSectionChange when tab is clicked', () => {
    const onChange = vi.fn();
    render(<BottomNav activeSection="patients" onSectionChange={onChange} />);
    fireEvent.click(screen.getByText('Agenda').closest('button'));
    expect(onChange).toHaveBeenCalledWith('agenda');
  });
});
```

- [ ] **Step 7.2: Correr el test para verificar que falla**

```bash
cd frontend && npx vitest run src/components/BottomNav.test.jsx
```
Expected: `Cannot find module './BottomNav'`

- [ ] **Step 7.3: Crear `frontend/src/components/BottomNav.jsx`**

```jsx
export default function BottomNav({ activeSection, onSectionChange }) {
  const tabs = [
    {
      id: 'patients',
      label: 'Pacientes',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'agenda',
      label: 'Agenda',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex border-t border-ink/[0.07] bg-white flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSectionChange(tab.id)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
            activeSection === tab.id
              ? 'text-[#5a9e8a]'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.4: Correr los tests**

```bash
cd frontend && npx vitest run src/components/BottomNav.test.jsx
```
Expected: `3 passed`

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/components/BottomNav.jsx frontend/src/components/BottomNav.test.jsx
git commit -m "feat(frontend): add BottomNav component for mobile top-level navigation"
```

---

## Task 8: Frontend — `App.jsx` integración completa

**Files:**
- Modify: `frontend/src/App.jsx`

Este task conecta todo. Los cambios son en cuatro áreas:
1. Estado `activeSection` + imports nuevos
2. Desktop sidebar: sección Agenda
3. Desktop: split view Agenda (DictationPanel disponibilidad + CalendarScreen inline)
4. Mobile: BottomNav permanente + sección Agenda con inner tabs

- [ ] **Step 8.1: Agregar imports y estado en `App.jsx`**

Al inicio de los imports, agregar:

```jsx
import BottomNav from './components/BottomNav';
import { parseAvailability, createCalendarSlotsBatch } from './api';
```

Dentro de la función `App`, junto a los otros `useState` (alrededor de línea 176), agregar:

```jsx
const [activeSection, setActiveSection] = useState('patients'); // 'patients' | 'agenda'
const [agendaMobileTab, setAgendaMobileTab] = useState('disponibilidad'); // 'disponibilidad' | 'calendario'
const [agendaCalendarKey, setAgendaCalendarKey] = useState(0); // para refrescar CalendarScreen inline
```

- [ ] **Step 8.2: Agregar handler para disponibilidad**

Dentro de la función `App`, antes del `return`, agregar:

```jsx
const handleParseAvailability = async (text, referenceDate) => {
  const result = await parseAvailability(text, referenceDate);
  return result.slots;
};

const handleConfirmSlots = async (slots) => {
  const formatted = slots.map(s => ({
    slot_date: s.slot_date,
    start_time: s.start_time.substring(0, 5),
    duration_minutes: s.duration_minutes,
  }));
  const result = await createCalendarSlotsBatch(formatted);
  setAgendaCalendarKey(k => k + 1);
  setToast(`${result.created} horario${result.created !== 1 ? 's' : ''} creado${result.created !== 1 ? 's' : ''}`);
  setTimeout(() => setToast(null), 3500);
};
```

- [ ] **Step 8.3: Actualizar `EmptyState` — "Mi Agenda" navega a tab Agenda**

Localiza la línea donde se renderiza `EmptyState` en el bloque desktop (alrededor de línea 913):

```jsx
<EmptyState 
  onOpenCalendar={() => setCalendarOpen(true)} 
  onNewPatient={() => setIsCreatingPatient(true)} 
/>
```

Cambiar `onOpenCalendar` en ambas ocurrencias (desktop y mobile):

```jsx
<EmptyState 
  onOpenCalendar={() => setActiveSection('agenda')} 
  onNewPatient={() => setIsCreatingPatient(true)} 
/>
```

- [ ] **Step 8.4: Agregar sección Agenda al sidebar desktop**

Localiza el componente `<Sidebar ... />` en el bloque desktop. Después del cierre del `<Sidebar>`, agregar un botón de Agenda en el sidebar. Busca el bloque del sidebar desktop y añade, dentro o inmediatamente después del sidebar, un botón de Agenda separado por un divider. Localiza el `<Sidebar>` (busca el className que incluye `w-64` o `sidebar`) y, justo antes de su cierre, agregar el botón de sección Agenda.

Busca la línea con `<PatientHeader` en el bloque desktop y antes del `PatientHeader`, agrega:

```jsx
{/* Desktop: Agenda section button in sidebar */}
```

En realidad, el lugar correcto es dentro del componente `Sidebar.jsx`. Sin embargo, para mantener los cambios mínimos en `Sidebar.jsx`, agrega el botón de Agenda directamente en `App.jsx` después del `<Sidebar>` existente dentro del mismo flex container del sidebar:

Localiza la estructura del sidebar desktop. El sidebar está en un div que contiene `<Sidebar>`. Encuentra ese contenedor y después del `<Sidebar ... />`, agrega:

```jsx
<div className="border-t border-ink/[0.07] p-3">
  <button
    onClick={() => setActiveSection('agenda')}
    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
      activeSection === 'agenda'
        ? 'bg-sage/10 text-sage'
        : 'text-ink-secondary hover:bg-ink/[0.04] hover:text-ink'
    }`}
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
    Mi Agenda
  </button>
</div>
```

- [ ] **Step 8.5: Agregar split view Agenda en desktop**

Localiza el bloque desktop que renderiza el split `session`/`review`. Busca la línea ~920 con `{!hasActivePatient ? (` y agrega antes de ese condicional:

```jsx
{/* Desktop: Agenda section */}
{activeSection === 'agenda' && (
  <div className="flex-1 flex overflow-hidden min-h-0">
    {/* Left: Availability dictation */}
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#f4f4f2]">
      <DictationPanel
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        loading={false}
        panelMode="disponibilidad"
        onParseAvailability={handleParseAvailability}
        onConfirmSlots={handleConfirmSlots}
      />
    </div>
    {/* Right: Calendar inline */}
    <div className="flex-1 overflow-hidden">
      <CalendarScreen key={agendaCalendarKey} mode="inline" onClose={() => {}} />
    </div>
  </div>
)}

{activeSection === 'patients' && (
```

Y cierra el condicional `activeSection === 'patients'` al final del bloque existente:

```jsx
)}  {/* end activeSection === 'patients' */}
```

- [ ] **Step 8.6: Agregar BottomNav y sección Agenda en mobile**

Localiza el bloque mobile (busca `{/* Mobile */}` o la estructura que contiene `md:hidden` o el área mobile). La estructura mobile tiene un header y luego el contenido. Al final del contenido mobile (antes del cierre del contenedor mobile principal), agregar el `BottomNav`.

Busca el final del bloque mobile (la última línea antes del cierre del `else` del bloque mobile/desktop) y modifica para agregar:

1. Envolver el contenido existente del mobile en un condicional `activeSection === 'patients'`
2. Agregar el bloque de Agenda mobile
3. Agregar el `BottomNav` al fondo

```jsx
{/* Mobile: section content */}
{activeSection === 'patients' && (
  <div className="flex flex-col flex-1 min-h-0">
    {/* ... todo el contenido mobile existente de pacientes ... */}
  </div>
)}

{activeSection === 'agenda' && (
  <div className="flex flex-col flex-1 min-h-0">
    {/* Inner tabs Agenda */}
    <div className="flex border-b border-ink/[0.07] bg-white flex-shrink-0">
      {['disponibilidad', 'calendario'].map(tab => (
        <button
          key={tab}
          onClick={() => setAgendaMobileTab(tab)}
          className={`flex-1 py-3 text-[12px] font-medium transition-colors border-b-2 capitalize ${
            agendaMobileTab === tab
              ? 'border-[#5a9e8a] text-[#5a9e8a]'
              : 'border-transparent text-ink-secondary hover:text-ink'
          }`}
        >
          {tab === 'disponibilidad' ? 'Disponibilidad' : 'Calendario'}
        </button>
      ))}
    </div>

    {agendaMobileTab === 'disponibilidad' && (
      <div className="flex flex-col flex-1 min-h-0 bg-[#f4f4f2]">
        <DictationPanel
          value=""
          onChange={() => {}}
          onGenerate={() => {}}
          loading={false}
          panelMode="disponibilidad"
          onParseAvailability={handleParseAvailability}
          onConfirmSlots={handleConfirmSlots}
        />
      </div>
    )}

    {agendaMobileTab === 'calendario' && (
      <div className="flex-1 overflow-hidden">
        <CalendarScreen key={agendaCalendarKey} mode="inline" onClose={() => {}} />
      </div>
    )}
  </div>
)}

{/* Bottom nav permanente */}
<BottomNav activeSection={activeSection} onSectionChange={setActiveSection} />
```

- [ ] **Step 8.7: Correr los tests existentes para verificar que no hay regresiones**

```bash
cd frontend && npx vitest run
```
Expected: todos los tests previos siguen pasando.

- [ ] **Step 8.8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): integrate Agenda section with BottomNav, AvailabilityPanel, and CalendarScreen inline"
```

---

## Task 9: Smoke test end-to-end manual

- [ ] **Step 9.1: Levantar la app**

Terminal 1:
```bash
docker-compose up -d postgres
.\start-backend.ps1
```

Terminal 2:
```bash
.\start-frontend.ps1
```

- [ ] **Step 9.2: Verificar flujo desktop**

1. Abrir `http://localhost:5173`
2. Login con credenciales de desarrollo
3. Verificar que el sidebar muestra botón "Mi Agenda" al fondo
4. Clic en "Mi Agenda" → split view cambia: izquierda muestra "Disponibilidad", derecha muestra calendar inline (sin modal)
5. Escribir: `"El lunes disponible de 9 a 11"` → clic "Interpretar disponibilidad →"
6. Verificar preview con 2 slots (09:00, 09:50)
7. Eliminar un slot con ✕ → Confirmar 1 → toast "1 horario creado"
8. Calendar inline se refresca mostrando el slot nuevo

- [ ] **Step 9.3: Verificar flujo mobile (DevTools 375px)**

1. Verificar que aparece BottomNav al fondo con "Pacientes" y "Agenda"
2. Clic en "Agenda" → inner tabs "Disponibilidad | Calendario"
3. Tab Disponibilidad → muestra AvailabilityPanel
4. Tab Calendario → muestra CalendarScreen inline
5. Clic en "Pacientes" → regresa a lista de pacientes normalmente
6. Botón "Mi Agenda" en empty state → navega a tab Agenda (no abre modal)

- [ ] **Step 9.4: Verificar flujo de error**

1. En AvailabilityPanel escribir texto sin fechas: `"hola"`
2. Clic "Interpretar disponibilidad →"
3. Verificar que aparece mensaje de error rojo con sugerencia

- [ ] **Step 9.5: Commit final**

```bash
git add .
git commit -m "feat: dual-mode DictationPanel and top-level Agenda navigation — complete"
```

---

## Checklist de spec coverage

| Requisito del spec | Task que lo cubre |
|---|---|
| Bottom nav mobile `Pacientes\|Agenda` | Task 7 (BottomNav), Task 8 (App) |
| Inner tabs Agenda `Disponibilidad\|Calendario` | Task 8.6 |
| Inner tabs Pacientes sin cambio | Conservados, no modificados |
| Botón "Mi Agenda" → navega a Agenda | Task 8.3 |
| Botón "Nuevo Expediente" sin cambio | No modificado |
| Sidebar desktop sección Agenda | Task 8.4 |
| CalendarScreen inline mode | Task 4 |
| DictationPanel panelMode prop | Task 6 |
| AvailabilityPanel 5 estados | Task 5 |
| `POST /parse-availability` | Task 2 |
| `POST /slots/batch` | Task 2 |
| `parseAvailability()` en api.js | Task 3 |
| `createCalendarSlotsBatch()` en api.js | Task 3 |
| calendar_ai.py separado (SOLID) | Task 1 |
| Toast "X horarios creados" | Task 8.2 |
| CalendarScreen inline refresca tras confirmar | Task 8.2 (agendaCalendarKey) |
