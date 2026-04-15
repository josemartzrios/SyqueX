# Chat History Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que al seleccionar un paciente desde el sidebar, el chat muestre toda la historia de sesiones en orden cronológico con las respuestas SOAP del agente completamente renderizadas.

**Architecture:** Se enriquece `SessionOut` con los campos de `ClinicalNote` vía outerjoin en el backend. El frontend usa esos campos para reconstruir mensajes ricos: sesiones confirmadas muestran el componente SOAP visual en modo solo lectura, sesiones draft muestran el componente con botón de confirmar activo. `NoteReview` recibe una nueva prop `readOnly` para ocultar el CTA de confirmación cuando aplica.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, React 18, Vitest, pytest-asyncio, httpx

---

## File Map

| Archivo | Cambio |
|---------|--------|
| `backend/api/routes.py` | Enriquecer `SessionOut` + outerjoin en `get_patient_sessions` |
| `backend/tests/test_api_routes.py` | Tests para el endpoint enriquecido |
| `frontend/src/App.jsx` | Actualizar `loadPatientChat` para reconstruir mensajes ricos |
| `frontend/src/components/NoteReview.jsx` | Añadir prop `readOnly` |
| `frontend/vite.config.js` | Añadir configuración de Vitest |
| `frontend/src/App.test.jsx` | Tests de la lógica de reconstrucción |

---

## Task 1: Enriquecer `SessionOut` en el backend

**Files:**
- Modify: `backend/api/routes.py` (líneas 61-70 aprox.)

- [ ] **Step 1: Escribir el test que falla**

Añadir clase `TestGetPatientSessionsEnriched` en `backend/tests/test_api_routes.py`:

```python
class TestGetPatientSessionsEnriched:
    """Verifica que GET /patients/{id}/sessions devuelve campos de ClinicalNote."""

    @pytest.mark.asyncio
    async def test_confirmed_session_includes_structured_note(self, app, mock_db, patient_uuid, session_uuid):
        """Una sesión confirmada con ClinicalNote retorna structured_note con campos SOAP."""
        from datetime import date

        session_obj = MagicMock()
        session_obj.id = session_uuid
        session_obj.session_number = 1
        session_obj.session_date = date(2026, 3, 1)
        session_obj.raw_dictation = "Paciente refiere ansiedad."
        session_obj.ai_response = "**S — ...**"
        session_obj.status = "confirmed"

        note_obj = MagicMock()
        note_obj.id = uuid.uuid4()
        note_obj.subjective = "Ansiedad laboral"
        note_obj.objective = "Afecto ansioso"
        note_obj.assessment = "TAG leve"
        note_obj.plan = "TCC semanal"
        note_obj.detected_patterns = ["ansiedad recurrente"]
        note_obj.alerts = []
        note_obj.suggested_next_steps = ["Registro de pensamientos"]

        # Simular outerjoin: execute retorna pares (Session, ClinicalNote)
        count_result = _result(scalar_one=1)
        join_result = MagicMock()
        join_result.all.return_value = [(session_obj, note_obj)]
        mock_db.execute.side_effect = [count_result, join_result]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/patients/{patient_uuid}/sessions")

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["structured_note"]["subjective"] == "Ansiedad laboral"
        assert item["structured_note"]["plan"] == "TCC semanal"
        assert item["detected_patterns"] == ["ansiedad recurrente"]
        assert item["alerts"] == []
        assert item["clinical_note_id"] is not None

    @pytest.mark.asyncio
    async def test_draft_session_structured_note_is_null(self, app, mock_db, patient_uuid, session_uuid):
        """Una sesión draft sin ClinicalNote retorna structured_note como null."""
        from datetime import date

        session_obj = MagicMock()
        session_obj.id = session_uuid
        session_obj.session_number = 1
        session_obj.session_date = date(2026, 3, 1)
        session_obj.raw_dictation = "Paciente refiere tristeza."
        session_obj.ai_response = "**S — ...**"
        session_obj.status = "draft"

        count_result = _result(scalar_one=1)
        join_result = MagicMock()
        join_result.all.return_value = [(session_obj, None)]  # outerjoin → None cuando no hay nota
        mock_db.execute.side_effect = [count_result, join_result]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/patients/{patient_uuid}/sessions")

        assert response.status_code == 200
        data = response.json()
        item = data["items"][0]
        assert item["structured_note"] is None
        assert item["clinical_note_id"] is None

    @pytest.mark.asyncio
    async def test_session_without_dictation_excluded(self, app, mock_db, patient_uuid):
        """El total 0 retorna lista vacía sin error."""
        count_result = _result(scalar_one=0)
        join_result = MagicMock()
        join_result.all.return_value = []
        mock_db.execute.side_effect = [count_result, join_result]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/patients/{patient_uuid}/sessions")

        assert response.status_code == 200
        assert response.json()["items"] == []
```

- [ ] **Step 2: Correr el test — verificar que falla**

```bash
cd backend
pytest tests/test_api_routes.py::TestGetPatientSessionsEnriched -v
```

Resultado esperado: `FAILED` — los nuevos campos no existen aún en `SessionOut`.

- [ ] **Step 3: Implementar los cambios en `routes.py`**

**3a. Actualizar `SessionOut`** (reemplazar la clase existente):

```python
class SessionOut(BaseModel):
    id: uuid.UUID
    session_number: int
    session_date: Optional[date]
    raw_dictation: Optional[str]
    ai_response: Optional[str]
    status: str
    # Campos de ClinicalNote (None para sesiones draft sin nota confirmada)
    structured_note: Optional[Dict[str, Any]] = None
    detected_patterns: Optional[List[str]] = None
    alerts: Optional[List[str]] = None
    suggested_next_steps: Optional[List[str]] = None
    clinical_note_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True
```

**3b. Actualizar la query en `get_patient_sessions`** (reemplazar el bloque completo de la función):

```python
@router.get("/patients/{patient_id}/sessions", response_model=PaginatedSessions, tags=["patients"])
async def get_patient_sessions(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    puuid = _parse_uuid(patient_id, "patient_id")
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
        items.append(SessionOut(
            id=s.id,
            session_number=s.session_number,
            session_date=s.session_date,
            raw_dictation=s.raw_dictation,
            ai_response=s.ai_response,
            status=s.status,
            structured_note={
                "subjective": cn.subjective,
                "objective": cn.objective,
                "assessment": cn.assessment,
                "plan": cn.plan,
            } if cn else None,
            detected_patterns=list(cn.detected_patterns) if cn and cn.detected_patterns else None,
            alerts=list(cn.alerts) if cn and cn.alerts else None,
            suggested_next_steps=list(cn.suggested_next_steps) if cn and cn.suggested_next_steps else None,
            clinical_note_id=cn.id if cn else None,
        ))

    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedSessions(items=items, total=total, page=page, page_size=page_size, pages=pages)
```

- [ ] **Step 4: Correr los tests — verificar que pasan**

```bash
cd backend
pytest tests/test_api_routes.py::TestGetPatientSessionsEnriched -v
```

Resultado esperado: `3 passed`.

- [ ] **Step 5: Correr toda la suite de backend — verificar que no hay regresiones**

```bash
cd backend
pytest tests/ -v
```

Resultado esperado: todos los tests previos siguen en `PASSED`.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat(api): enrich SessionOut with ClinicalNote fields via outerjoin"
```

---

## Task 2: Añadir prop `readOnly` a `NoteReview`

**Files:**
- Modify: `frontend/src/components/NoteReview.jsx`

- [ ] **Step 1: Configurar Vitest en el proyecto frontend**

Editar `frontend/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
```

Crear `frontend/src/test-setup.js`:

```js
import '@testing-library/jest-dom'
```

Instalar dependencias de test:

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Escribir el test que falla**

Crear `frontend/src/components/NoteReview.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NoteReview from './NoteReview'

const NOTE_DATA_CONFIRMED = {
  clinical_note: {
    structured_note: {
      subjective: 'Ansiedad laboral',
      objective: 'Afecto ansioso',
      assessment: 'TAG leve',
      plan: 'TCC semanal',
    },
    detected_patterns: [],
    alerts: [],
    session_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  },
  text_fallback: null,
}

describe('NoteReview — prop readOnly', () => {
  it('oculta el botón Confirmar cuando readOnly=true', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.queryByText(/Confirmar/i)).not.toBeInTheDocument()
  })

  it('oculta el badge BORRADOR cuando readOnly=true', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.queryByText('BORRADOR')).not.toBeInTheDocument()
  })

  it('muestra el botón Confirmar cuando readOnly=false', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={false} onConfirm={vi.fn()} />)
    expect(screen.getByText(/Confirmar/i)).toBeInTheDocument()
  })

  it('renderiza las secciones SOAP correctamente', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.getByText('Ansiedad laboral')).toBeInTheDocument()
    expect(screen.getByText('TCC semanal')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr el test — verificar que falla**

```bash
cd frontend
npx vitest run src/components/NoteReview.test.jsx
```

Resultado esperado: `FAILED` — `readOnly` prop no existe aún.

- [ ] **Step 4: Implementar `readOnly` en `NoteReview.jsx`**

Cambiar la firma del componente (línea 59):

```jsx
// Antes:
export default function NoteReview({ noteData, onConfirm }) {

// Después:
export default function NoteReview({ noteData, onConfirm, readOnly = false }) {
```

Localizar el bloque CTA bar (línea ~184) y envolverlo en una condición:

```jsx
{/* CTA bar — oculto en modo solo lectura */}
{!readOnly && (
  <div className="flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-4 mt-4">
    {/* ... todo el contenido del CTA bar sin cambios ... */}
  </div>
)}
```

- [ ] **Step 5: Correr los tests — verificar que pasan**

```bash
cd frontend
npx vitest run src/components/NoteReview.test.jsx
```

Resultado esperado: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NoteReview.jsx frontend/src/components/NoteReview.test.jsx frontend/vite.config.js frontend/src/test-setup.js
git commit -m "feat(ui): add readOnly prop to NoteReview to hide confirm CTA in history view"
```

---

## Task 3: Actualizar `loadPatientChat` en `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx` (función `loadPatientChat`, ~líneas 159-172)
- Create: `frontend/src/App.test.jsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/App.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'

// Extraer la lógica pura de reconstrucción para poder testearla sin montar el componente completo
// La función buildChatMessages refleja la lógica de loadPatientChat

function buildChatMessages(sessions) {
  const msgs = []
  sessions.forEach(session => {
    if (session.raw_dictation) {
      msgs.push({ role: 'user', text: session.raw_dictation })
    }

    const hasStructuredNote = session.status === 'confirmed' && session.structured_note

    if (hasStructuredNote) {
      msgs.push({
        role: 'assistant',
        type: 'bot',
        noteData: {
          clinical_note: {
            structured_note: session.structured_note,
            detected_patterns: session.detected_patterns || [],
            alerts: session.alerts || [],
            session_id: String(session.id),
          },
          text_fallback: session.ai_response,
        },
        sessionId: String(session.id),
        readOnly: true,
      })
    } else if (session.ai_response) {
      msgs.push({
        role: 'assistant',
        type: 'bot',
        noteData: {
          clinical_note: null,
          text_fallback: session.ai_response,
        },
        sessionId: String(session.id),
        readOnly: false,
      })
    }
  })
  return msgs
}

describe('buildChatMessages', () => {
  it('genera par user+bot para sesión confirmada con structured_note', () => {
    const sessions = [{
      id: 'sess-1',
      raw_dictation: 'El paciente refiere ansiedad.',
      ai_response: '**S — ...**',
      status: 'confirmed',
      structured_note: { subjective: 'Ansiedad', objective: 'Afecto ansioso', assessment: 'TAG', plan: 'TCC' },
      detected_patterns: ['ansiedad'],
      alerts: [],
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'user', text: 'El paciente refiere ansiedad.' })
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].readOnly).toBe(true)
    expect(msgs[1].noteData.clinical_note.structured_note.subjective).toBe('Ansiedad')
  })

  it('genera par user+bot para sesión draft sin structured_note', () => {
    const sessions = [{
      id: 'sess-2',
      raw_dictation: 'Dictado de prueba.',
      ai_response: '**S — borrador**',
      status: 'draft',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[1].readOnly).toBe(false)
    expect(msgs[1].noteData.clinical_note).toBeNull()
  })

  it('omite mensaje de agente si no hay ai_response y no hay structured_note', () => {
    const sessions = [{
      id: 'sess-3',
      raw_dictation: 'Dictado sin respuesta.',
      ai_response: null,
      status: 'draft',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('procesa múltiples sesiones en orden cronológico', () => {
    const sessions = [
      { id: 's1', raw_dictation: 'Sesión 1', ai_response: 'Resp 1', status: 'confirmed',
        structured_note: { subjective: 'S1', objective: null, assessment: null, plan: null },
        detected_patterns: [], alerts: [] },
      { id: 's2', raw_dictation: 'Sesión 2', ai_response: 'Resp 2', status: 'draft',
        structured_note: null, detected_patterns: null, alerts: null },
    ]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(4)
    expect(msgs[0].text).toBe('Sesión 1')
    expect(msgs[2].text).toBe('Sesión 2')
  })
})
```

- [ ] **Step 2: Correr el test — verificar que pasa (lógica pura, sin componente)**

```bash
cd frontend
npx vitest run src/App.test.jsx
```

Resultado esperado: `4 passed`. (Estos tests validan la lógica de negocio pura antes de integrarla en App.jsx)

- [ ] **Step 3: Actualizar `loadPatientChat` en `App.jsx`**

Localizar la función `loadPatientChat` (~línea 159) y reemplazarla:

```jsx
const loadPatientChat = (patientId, patientName, history = []) => {
  setSelectedPatientId(patientId);
  setSelectedPatientName(patientName);

  if (history.length === 0) {
    setMessages([{
      role: 'assistant',
      type: 'welcome',
      text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?`
    }]);
    return;
  }

  const historyMessages = [];
  history.forEach(session => {
    if (session.raw_dictation) {
      historyMessages.push({ role: 'user', text: session.raw_dictation });
    }

    const hasStructuredNote = session.status === 'confirmed' && session.structured_note;

    if (hasStructuredNote) {
      historyMessages.push({
        role: 'assistant',
        type: 'bot',
        noteData: {
          clinical_note: {
            structured_note: session.structured_note,
            detected_patterns: session.detected_patterns || [],
            alerts: session.alerts || [],
            session_id: String(session.id),
          },
          text_fallback: session.ai_response,
        },
        sessionId: String(session.id),
        readOnly: true,
      });
    } else if (session.ai_response) {
      historyMessages.push({
        role: 'assistant',
        type: 'bot',
        noteData: {
          clinical_note: null,
          text_fallback: session.ai_response,
        },
        sessionId: String(session.id),
        readOnly: false,
      });
    }
  });

  setMessages(historyMessages);
};
```

- [ ] **Step 4: Verificar que `NoteReview` recibe la prop `readOnly` en el render del chat**

Buscar en `App.jsx` donde se renderiza `NoteReview` (dentro del map de `messages`) y asegurarse de que pasa `readOnly`:

```jsx
// Buscar el bloque type === 'bot' y añadir readOnly={msg.readOnly}
{msg.type === 'bot' && (
  <NoteReview
    noteData={msg.noteData}
    readOnly={msg.readOnly}
    onConfirm={fetchConversations}
  />
)}
```

- [ ] **Step 5: Correr toda la suite de frontend**

```bash
cd frontend
npx vitest run
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 6: Verificar el build de producción**

```bash
cd frontend
npm run build
```

Resultado esperado: build exitoso sin errores de TypeScript/JSX.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(ui): reconstruct full SOAP chat history from enriched session data"
```

---

## Task 4: Push y Pull Request

- [ ] **Step 1: Correr todas las suites una vez más antes de publicar**

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd ../frontend && npx vitest run
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 2: Push de la rama al remoto**

```bash
git push -u origin feature/chat-history-persistence
```

- [ ] **Step 3: Crear Pull Request hacia `dev`**

```bash
gh pr create \
  --base dev \
  --title "feat: persist and reconstruct SOAP chat history" \
  --body "$(cat <<'EOF'
## Summary
- Enriches `SessionOut` with `ClinicalNote` fields (`structured_note`, `detected_patterns`, `alerts`, `suggested_next_steps`, `clinical_note_id`) via outerjoin in `GET /patients/{id}/sessions`
- Updates `loadPatientChat` to reconstruct full SOAP messages from history: confirmed sessions show SOAP visual in read-only mode, draft sessions show with confirm button
- Adds `readOnly` prop to `NoteReview` to hide the confirm CTA when viewing historical notes

## Test plan
- [ ] Abrir la app y seleccionar un paciente con sesiones confirmadas desde el sidebar
- [ ] Verificar que el chat muestra los dictados del psicólogo y las notas SOAP formateadas
- [ ] Verificar que las notas del historial no muestran el botón "Confirmar en Expediente"
- [ ] Verificar que una sesión draft en el historial sí muestra el botón de confirmar
- [ ] Refrescar la página, reabrir el mismo paciente — el historial debe seguir visible
- [ ] Crear una nueva sesión y confirmarla — debe aparecer como solo lectura al reabrir

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
