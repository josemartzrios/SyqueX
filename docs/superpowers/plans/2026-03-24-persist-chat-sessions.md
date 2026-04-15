# Persist Chat Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar los mensajes de chat (format='chat') en la base de datos para que el historial de conversación persista entre sesiones del navegador.

**Architecture:** Se añade una columna `format` a la tabla `sessions` para distinguir sesiones SOAP de chat. El backend elimina el early return que descartaba los chats y los persiste con `status='confirmed'` (sin paso de confirmación). El campo `format` se expone en `SessionOut` y el frontend usa ese campo en `loadPatientChat` para reconstruir mensajes de chat (`type: 'chat'`) correctamente.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, React 18, Vitest, pytest-asyncio, httpx

---

## File Map

| Archivo | Cambio |
|---------|--------|
| `backend/database.py` | Añadir columna `format` al modelo `Session` + migración |
| `backend/api/routes.py` | Eliminar early return para chat; persistir sesiones chat; añadir `format` a `SessionOut` |
| `backend/tests/test_api_routes.py` | Tests: chat crea Session en BD, `format` se expone en GET sessions |
| `frontend/src/App.jsx` | `loadPatientChat` renderiza sesiones chat como `type:'chat'`; `fetchConversations()` siempre |
| `frontend/src/App.test.jsx` | Tests: `buildChatMessages` maneja sesiones con `format:'chat'` |

---

## Task 1: Añadir columna `format` al modelo Session

**Files:**
- Modify: `backend/database.py`

La tabla `sessions` necesita distinguir entre sesiones SOAP y chat. Se añade `format VARCHAR(20) NOT NULL DEFAULT 'SOAP'` con migración idempotente.

- [ ] **Step 1: Modificar el modelo `Session` en `database.py`**

Localizar el modelo `Session` (línea ~92) y añadir la columna `format` después de `raw_dictation`:

```python
# Después de raw_dictation y antes de ai_response:
format: Mapped[str] = mapped_column(String(20), nullable=False, default="SOAP")
```

El bloque completo de columnas relevantes queda:

```python
raw_dictation: Mapped[str] = mapped_column(Text, nullable=False)
format: Mapped[str] = mapped_column(String(20), nullable=False, default="SOAP")
ai_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Añadir migración en `init_db()` de `database.py`**

Localizar el bloque `# Sessions` en `init_db()` (~línea 187) y añadir después de las migraciones existentes:

```python
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'SOAP';"))
```

El bloque completo quedará:

```python
# Sessions
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"))
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]';"))
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();"))
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'SOAP';"))
```

- [ ] **Step 3: Commit**

```bash
git add backend/database.py
git commit -m "feat(db): add format column to sessions table"
```

---

## Task 2: Persistir sesiones chat en el backend

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_api_routes.py`

**Problema actual** (`routes.py` líneas 288-290):
```python
# Chat messages are ephemeral — no Session created in DB
if rec.format == "chat":
    return ProcessSessionOut(text_fallback=response.get("text_fallback"))
```
Esta lógica descarta los mensajes de chat antes de persistirlos. La solución es eliminar el early return y crear la sesión con `status='confirmed'` y `format=rec.format`.

- [ ] **Step 1: Actualizar los tests existentes que contradicen el nuevo comportamiento**

`TestProcessSessionFormat` en `backend/tests/test_api_routes.py` tiene dos tests que afirman el comportamiento actual (ephemeral). Estos tests fallarán después de la implementación. Hay que actualizarlos ANTES de escribir los nuevos tests.

**1a. Actualizar la docstring de la clase** (línea 617):
```python
# Antes:
class TestProcessSessionFormat:
    """Chat format must not create a Session; SOAP format must."""

# Después:
class TestProcessSessionFormat:
    """Both chat and SOAP formats must create a Session in DB."""
```

**1b. Actualizar `test_chat_format_returns_no_session_id`** (líneas 635-656).

El test necesita 3 side_effects ahora (profile + sessions_history + last_session para session_number), y las aserciones se invierten:

```python
@pytest.mark.asyncio
async def test_chat_format_returns_session_id(self, app, mock_db, patient_uuid):
    """format='chat' → response includes session_id (session is now persisted)."""
    mock_db.execute.side_effect = [
        _result(scalar_one_or_none=None),  # _get_patient_context: profile
        _result(scalars_all=[]),            # _get_patient_context: sessions
        _result(scalar_one_or_none=None),  # last session (session_number)
    ]

    patcher = self._mock_claude()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/sessions/{patient_uuid}/process",
                json={"raw_dictation": "El paciente llegó tranquilo.", "format": "chat"},
            )
    finally:
        patcher.stop()

    assert response.status_code == 200
    data = response.json()
    assert data["text_fallback"] is not None
    assert data.get("session_id") is not None   # ← invertido: chat ahora persiste
```

**1c. Actualizar `test_chat_format_does_not_persist_session`** (líneas 658-676):

```python
@pytest.mark.asyncio
async def test_chat_format_persists_session(self, app, mock_db, patient_uuid):
    """format='chat' → db.add() is called once to persist the session."""
    mock_db.execute.side_effect = [
        _result(scalar_one_or_none=None),  # profile
        _result(scalars_all=[]),            # sessions history
        _result(scalar_one_or_none=None),  # last session
    ]

    patcher = self._mock_claude()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                f"/api/v1/sessions/{patient_uuid}/process",
                json={"raw_dictation": "Sesión de seguimiento.", "format": "chat"},
            )
    finally:
        patcher.stop()

    mock_db.add.assert_called_once()   # ← invertido: ahora debe llamarse
```

- [ ] **Step 2: Correr los tests actualizados — verificar que aún fallan (comportamiento antiguo)**

```bash
cd backend
pytest tests/test_api_routes.py::TestProcessSessionFormat -v
```

Resultado esperado: `FAILED` — los dos tests actualizados fallan porque el código aún tiene el early return para chat.

- [ ] **Step 3: Añadir clase `TestChatSessionPersistence` al final del archivo de tests**

Añadir después de `TestProcessSessionFormat`:

```python
# ---------------------------------------------------------------------------
# POST /api/v1/sessions/{patient_id}/process — chat persistence (integration)
# ---------------------------------------------------------------------------

class TestChatSessionPersistence:
    """Verifica que chat y SOAP crean Session con el status correcto."""

    @pytest.mark.asyncio
    async def test_chat_session_created_with_confirmed_status(self, app, mock_db, patient_uuid):
        """format='chat' debe crear Session con status='confirmed' (sin paso de confirmación)."""
        mock_db.execute.side_effect = [
            _result(scalar_one_or_none=None),
            _result(scalars_all=[]),
            _result(scalar_one_or_none=None),
        ]

        with patch("api.routes.process_session", new=AsyncMock(return_value={
            "text_fallback": "Observación clínica breve.",
            "session_messages": [
                {"role": "user", "content": "El paciente menciona insomnio."},
                {"role": "assistant", "content": "Observación clínica breve."},
            ],
        })):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/sessions/{patient_uuid}/process",
                    json={"raw_dictation": "El paciente menciona insomnio.", "format": "chat"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] is not None

        # Verificar que el objeto Session fue creado con status='confirmed'
        added_session = mock_db.add.call_args[0][0]
        assert added_session.status == "confirmed"
        assert added_session.format == "chat"
```

- [ ] **Step 4: Correr el nuevo test — verificar que falla**

```bash
cd backend
pytest tests/test_api_routes.py::TestChatSessionPersistence -v
```

Resultado esperado: `FAILED` — el código aún tiene el early return para chat.

- [ ] **Step 5: Implementar el cambio en `routes.py`**

Localizar el endpoint `process_session_endpoint` (~línea 277). Reemplazar el bloque completo del endpoint:

```python
@router.post("/sessions/{patient_id}/process", response_model=ProcessSessionOut, tags=["sessions"])
@limiter.limit("30/hour")
async def process_session_endpoint(
    request: Request,
    patient_id: str,
    rec: ProcessSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    patient_uuid = _parse_uuid(patient_id, "patient_id")
    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format)

    session_id = str(uuid.uuid4())

    res_last = await db.execute(
        select(Session)
        .where(Session.patient_id == patient_uuid)
        .order_by(Session.session_number.desc())
        .limit(1)
    )
    last_session = res_last.scalar_one_or_none()
    current_session_number = (last_session.session_number + 1) if last_session else 1

    # Chat sessions are confirmed immediately (no confirmation step needed)
    session_status = "confirmed" if rec.format == "chat" else "draft"

    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=current_session_number,
        session_date=date.today(),
        raw_dictation=rec.raw_dictation,
        format=rec.format or "SOAP",
        ai_response=response.get("text_fallback"),
        messages=response.get("session_messages", []),
        status=session_status,
    )
    db.add(new_session)
    await db.commit()

    return ProcessSessionOut(
        text_fallback=response.get("text_fallback"),
        session_id=session_id,
    )
```

- [ ] **Step 6: Correr todos los tests afectados — verificar que pasan**

```bash
cd backend
pytest tests/test_api_routes.py::TestProcessSessionFormat tests/test_api_routes.py::TestChatSessionPersistence -v
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 7: Correr toda la suite de backend — verificar que no hay regresiones**

```bash
cd backend
pytest tests/ -v
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 8: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat(api): persist chat sessions to DB instead of returning ephemerally"
```

---

## Task 3: Exponer `format` en `SessionOut`

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_api_routes.py`

El frontend necesita saber si una sesión es `'chat'` o `'SOAP'` para renderizar correctamente. `SessionOut` debe exponer el campo `format`.

- [ ] **Step 1: Escribir el test que falla**

Añadir clase `TestSessionOutFormat` en `backend/tests/test_api_routes.py`:

```python
# ---------------------------------------------------------------------------
# GET /api/v1/patients/{patient_id}/sessions — format field
# ---------------------------------------------------------------------------

class TestSessionOutFormat:
    """Verifica que GET /patients/{id}/sessions expone el campo format en cada sesión."""

    @pytest.mark.asyncio
    async def test_soap_session_returns_format_soap(self, app, mock_db, patient_uuid, session_uuid):
        """Una sesión SOAP retorna format='SOAP'."""
        from datetime import date

        session_obj = MagicMock()
        session_obj.id = session_uuid
        session_obj.session_number = 1
        session_obj.session_date = date(2026, 3, 1)
        session_obj.raw_dictation = "Paciente refiere ansiedad."
        session_obj.ai_response = "**S — Ansiedad**"
        session_obj.status = "confirmed"
        session_obj.format = "SOAP"

        count_result = _result(scalar_one=1)
        join_result = MagicMock()
        join_result.all.return_value = [(session_obj, None)]
        mock_db.execute.side_effect = [count_result, join_result]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/patients/{patient_uuid}/sessions")

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["format"] == "SOAP"

    @pytest.mark.asyncio
    async def test_chat_session_returns_format_chat(self, app, mock_db, patient_uuid, session_uuid):
        """Una sesión chat retorna format='chat'."""
        from datetime import date

        session_obj = MagicMock()
        session_obj.id = session_uuid
        session_obj.session_number = 1
        session_obj.session_date = date(2026, 3, 1)
        session_obj.raw_dictation = "¿Qué técnicas para ansiedad recomiendas?"
        session_obj.ai_response = "Puedo sugerirte técnicas de respiración diafragmática."
        session_obj.status = "confirmed"
        session_obj.format = "chat"

        count_result = _result(scalar_one=1)
        join_result = MagicMock()
        join_result.all.return_value = [(session_obj, None)]
        mock_db.execute.side_effect = [count_result, join_result]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/patients/{patient_uuid}/sessions")

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["format"] == "chat"
        assert item["structured_note"] is None
```

- [ ] **Step 2: Correr el test — verificar que falla**

```bash
cd backend
pytest tests/test_api_routes.py::TestSessionOutFormat -v
```

Resultado esperado: `FAILED` — `format` no está en `SessionOut`.

- [ ] **Step 3: Añadir `format = "SOAP"` a los mocks de `TestGetPatientSessionsEnriched` en `test_api_routes.py`**

Los mocks de `session_obj` en `TestGetPatientSessionsEnriched` no tienen `.format` definido explícitamente. `MagicMock` devuelve un objeto Mock para atributos indefinidos — Pydantic lo convierte a una cadena de texto extraña. Añadir el atributo a los dos mocks existentes:

En `test_confirmed_session_includes_structured_note` (después de `session_obj.status = "confirmed"`):
```python
session_obj.format = "SOAP"   # ← añadir esta línea
```

En `test_draft_session_structured_note_is_null` (después de `session_obj.status = "draft"`):
```python
session_obj.format = "SOAP"   # ← añadir esta línea
```

- [ ] **Step 4: Añadir `format` a `SessionOut` en `routes.py`**

Localizar `class SessionOut` (~línea 61) y añadir el campo `format`:

```python
class SessionOut(BaseModel):
    id: uuid.UUID
    session_number: int
    session_date: Optional[date]
    raw_dictation: Optional[str]
    ai_response: Optional[str]
    status: str
    format: str = "SOAP"                          # ← añadir esta línea
    structured_note: Optional[Dict[str, Any]] = None
    detected_patterns: Optional[List[str]] = None
    alerts: Optional[List[str]] = None
    suggested_next_steps: Optional[List[str]] = None
    clinical_note_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True
```

Luego localizar la función `get_patient_sessions` y añadir `format=s.format` al constructor de `SessionOut` dentro del loop `for s, cn in res.all()`:

```python
items.append(SessionOut(
    id=s.id,
    session_number=s.session_number,
    session_date=s.session_date,
    raw_dictation=s.raw_dictation,
    ai_response=s.ai_response,
    status=s.status,
    format=s.format,                              # ← añadir esta línea
    structured_note={
        "subjective": cn.subjective,
        "objective": cn.objective,
        "assessment": cn.assessment,
        "plan": cn.plan,
    } if cn else None,
    detected_patterns=list(cn.detected_patterns) if cn and cn.detected_patterns is not None else None,
    alerts=list(cn.alerts) if cn and cn.alerts is not None else None,
    suggested_next_steps=list(cn.suggested_next_steps) if cn and cn.suggested_next_steps is not None else None,
    clinical_note_id=cn.id if cn else None,
))
```

- [ ] **Step 4: Correr los tests — verificar que pasan**

```bash
cd backend
pytest tests/test_api_routes.py::TestSessionOutFormat -v
```

Resultado esperado: `2 passed`.

- [ ] **Step 5: Correr toda la suite de backend**

```bash
cd backend
pytest tests/ -v
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat(api): expose format field in SessionOut for chat/SOAP distinction"
```

---

## Task 4: Renderizar historial de chat en el frontend

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

El frontend recibe `format` en cada sesión pero `loadPatientChat` no lo usa: trata todas las sesiones como SOAP. Hay que renderizar sesiones con `format='chat'` como mensajes `type: 'chat'` (texto plano) en lugar de `type: 'bot'` (componente NoteReview).

También: `handleSendDictation` llama `fetchConversations()` solo para SOAP. Si el paciente solo tiene chats, nunca aparecería en el sidebar tras la primera sesión.

- [ ] **Step 1: Escribir el test que falla**

Abrir `frontend/src/App.test.jsx`. El archivo ya existe con una versión de `buildChatMessages` sin soporte de `format` y 4 tests SOAP. Hay que **reemplazar** el contenido del archivo completo (NO añadir al final) con la versión actualizada que soporta `format: 'chat'`.

El archivo completo reemplazado queda así:

```jsx
import { describe, it, expect } from 'vitest'
import { markPendingNotesReadOnly } from './App'

// Refleja la lógica de loadPatientChat — se testea sin montar el componente completo
function buildChatMessages(sessions) {
  const msgs = []
  sessions.forEach(session => {
    if (session.raw_dictation) {
      msgs.push({ role: 'user', text: session.raw_dictation })
    }

    if (session.format === 'chat') {
      if (session.ai_response) {
        msgs.push({ role: 'assistant', type: 'chat', text: session.ai_response })
      }
      return
    }

    // SOAP y otros formatos estructurados
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
          session_id: String(session.id),
        },
        sessionId: String(session.id),
        readOnly: false,
      })
    }
  })
  return msgs
}

describe('buildChatMessages', () => {
  it('renderiza sesión chat como type:chat con texto plano', () => {
    const sessions = [{
      id: 'sess-1',
      format: 'chat',
      raw_dictation: '¿Qué técnicas usas para el insomnio?',
      ai_response: 'Higiene del sueño y TCC-I.',
      status: 'confirmed',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'user', text: '¿Qué técnicas usas para el insomnio?' })
    expect(msgs[1]).toEqual({ role: 'assistant', type: 'chat', text: 'Higiene del sueño y TCC-I.' })
  })

  it('renderiza sesión SOAP confirmada como type:bot readOnly', () => {
    const sessions = [{
      id: 'sess-2',
      format: 'SOAP',
      raw_dictation: 'Paciente con ansiedad.',
      ai_response: '**S — Ansiedad**',
      status: 'confirmed',
      structured_note: { subjective: 'Ansiedad', objective: 'Observado', assessment: 'TAG', plan: 'TCC' },
      detected_patterns: ['ansiedad'],
      alerts: [],
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[1].type).toBe('bot')
    expect(msgs[1].readOnly).toBe(true)
    expect(msgs[1].noteData.clinical_note.structured_note.subjective).toBe('Ansiedad')
  })

  it('renderiza sesión SOAP draft como type:bot no readOnly', () => {
    const sessions = [{
      id: 'sess-3',
      format: 'SOAP',
      raw_dictation: 'Dictado sin confirmar.',
      ai_response: '**S — borrador**',
      status: 'draft',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs[1].type).toBe('bot')
    expect(msgs[1].readOnly).toBe(false)
  })

  it('omite mensaje del agente si chat sin ai_response', () => {
    const sessions = [{
      id: 'sess-4',
      format: 'chat',
      raw_dictation: 'Mensaje sin respuesta.',
      ai_response: null,
      status: 'confirmed',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('mezcla correctamente sesiones SOAP y chat en orden cronológico', () => {
    const sessions = [
      {
        id: 's1', format: 'SOAP', raw_dictation: 'Dictado SOAP', ai_response: '**S — ...**',
        status: 'confirmed',
        structured_note: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
        detected_patterns: [], alerts: [],
      },
      {
        id: 's2', format: 'chat', raw_dictation: 'Consulta rápida', ai_response: 'Respuesta rápida.',
        status: 'confirmed', structured_note: null, detected_patterns: null, alerts: null,
      },
    ]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(4)
    expect(msgs[0].text).toBe('Dictado SOAP')
    expect(msgs[1].type).toBe('bot')
    expect(msgs[2].text).toBe('Consulta rápida')
    expect(msgs[3].type).toBe('chat')
  })
})

describe('markPendingNotesReadOnly', () => {
  it('pone readOnly:true en mensajes bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Dictado' },
      { role: 'assistant', type: 'bot', noteData: { clinical_note: null, text_fallback: 'S — ...' }, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0]).toEqual(messages[0])
    expect(result[1].readOnly).toBe(true)
  })

  it('no modifica mensajes que no son bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Hola' },
      { role: 'assistant', type: 'chat', text: 'Respuesta libre' },
      { role: 'assistant', type: 'error', text: 'Error' },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result).toEqual(messages)
  })

  it('marca múltiples notas SOAP pendientes en el mismo chat', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
      { role: 'user', text: 'Segundo dictado' },
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
    expect(result[2].readOnly).toBe(true)
  })

  it('no rompe notas ya confirmadas (readOnly:true)', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: true },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test — verificar que falla**

```bash
cd frontend
npx vitest run src/App.test.jsx
```

Resultado esperado: los 5 nuevos tests sobre `buildChatMessages` con `format` fallan (la función aún no existe en `App.jsx`).

- [ ] **Step 3: Actualizar `loadPatientChat` en `App.jsx`**

Localizar la función `loadPatientChat` (~línea 168) y reemplazarla por completo:

```jsx
const loadPatientChat = (patientId, patientName, history = []) => {
  setSelectedPatientId(patientId);
  setSelectedPatientName(patientName);

  if (history.length === 0) {
    setMessages([{ role: 'assistant', type: 'welcome', text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?` }]);
    return;
  }

  const historyMessages = [];
  history.forEach(session => {
    if (session.raw_dictation) {
      historyMessages.push({ role: 'user', text: session.raw_dictation });
    }

    // Chat sessions: render as plain text, no NoteReview component
    if (session.format === 'chat') {
      if (session.ai_response) {
        historyMessages.push({ role: 'assistant', type: 'chat', text: session.ai_response });
      }
      return;
    }

    // SOAP and other structured formats
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
          session_id: String(session.id),
        },
        sessionId: String(session.id),
        readOnly: false,
      });
    }
  });

  setMessages(historyMessages);
};
```

- [ ] **Step 4: Actualizar `handleSendDictation` para refrescar el sidebar también en chats**

Localizar `handleSendDictation` (~línea 267). Cambiar la línea que llama `fetchConversations`:

```jsx
// Antes:
if (format === 'SOAP') fetchConversations();

// Después:
fetchConversations();
```

Esto asegura que el paciente aparezca en el sidebar después de su primer chat, aunque no tenga sesiones SOAP.

- [ ] **Step 5: Correr los tests del frontend**

```bash
cd frontend
npx vitest run src/App.test.jsx
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 6: Correr toda la suite de frontend**

```bash
cd frontend
npx vitest run
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 7: Verificar el build de producción**

```bash
cd frontend
npm run build
```

Resultado esperado: build exitoso sin errores.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(ui): render chat session history from DB on patient load"
```

---

## Task 5: Verificación end-to-end y Pull Request

- [ ] **Step 1: Correr todas las suites**

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd ../frontend && npx vitest run
```

Resultado esperado: todos los tests en `PASSED`.

- [ ] **Step 2: Verificar manualmente el flujo completo**

1. Iniciar backend: `uvicorn main:app --reload` (desde `/backend`)
2. Iniciar frontend: `npm run dev` (desde `/frontend`)
3. Abrir `http://localhost:5173`
4. Seleccionar (o crear) un paciente
5. Enviar un mensaje de chat (Enter o botón Chat)
6. Verificar que el mensaje aparece en el chat
7. **Recargar la página** (F5)
8. Volver a seleccionar el mismo paciente
9. ✅ El historial de chat debe estar visible
10. Enviar un dictado SOAP y verificar que el historial mixto (SOAP + chat) se muestra correctamente

- [ ] **Step 3: Push de la rama**

```bash
git push -u origin dev
```

---

## Resumen de cambios

| Archivo | Líneas cambiadas | Descripción |
|---------|-----------------|-------------|
| `backend/database.py` | +2 | Columna `format` en modelo + migración |
| `backend/api/routes.py` | ~15 | Eliminar early return chat; añadir `format` a `Session` y `SessionOut` |
| `backend/tests/test_api_routes.py` | +60 | 4 tests nuevos para persistencia y campo format |
| `frontend/src/App.jsx` | ~5 | `loadPatientChat` con branch chat; `fetchConversations()` siempre |
| `frontend/src/App.test.jsx` | +90 | 6 tests nuevos para `buildChatMessages` con formato chat |
