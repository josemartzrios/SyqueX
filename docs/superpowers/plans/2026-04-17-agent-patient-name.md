# Agent Patient Name Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente (Claude) siempre conoce el nombre del paciente activo sin que el usuario lo mencione.

**Architecture:** Pasar `patient_name` desde el route (donde ya existe en `patient.name`) hasta `_get_patient_context`, donde se inyecta como primera línea del bloque de contexto clínico que ya se envía a Claude en cada llamada.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, Anthropic SDK, pytest + pytest-asyncio

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/agent/agent.py` | Añadir `patient_name` a firmas de `_get_patient_context` y `process_session`; inicializar bloque de perfil con el nombre |
| `backend/api/routes.py` | Pasar `patient_name=patient.name` a `process_session` en línea 473 |
| `backend/tests/test_agent_process.py` | Añadir tests para la inyección del nombre |

---

## Task 1: Inyectar nombre en `_get_patient_context` y `process_session`

**Archivos:**
- Modify: `backend/agent/agent.py:82` (`_get_patient_context`)
- Modify: `backend/agent/agent.py:201` (`process_session`)
- Modify: `backend/agent/agent.py:213` (llamada interna a `_get_patient_context`)
- Test: `backend/tests/test_agent_process.py`

- [ ] **Step 1: Escribir tests que fallen**

Agregar la siguiente clase al final de `backend/tests/test_agent_process.py`:

```python
# ---------------------------------------------------------------------------
# _get_patient_context — patient name injection
# ---------------------------------------------------------------------------

class TestGetPatientContextNameInjection:
    @pytest.mark.asyncio
    async def test_name_appears_in_context_when_no_profile(self):
        """Patient name is injected even when there is no PatientProfile."""
        db = AsyncMock()

        profile_result = MagicMock()
        profile_result.scalar_one_or_none.return_value = None

        session_result = MagicMock()
        session_result.scalars.return_value.all.return_value = []

        db.execute.side_effect = [profile_result, session_result]

        context = await agent_module._get_patient_context(db, "patient-1", "Ana García")

        assert len(context) == 2
        user_turn = context[0]
        assert user_turn["role"] == "user"
        assert "Ana García" in user_turn["content"]

    @pytest.mark.asyncio
    async def test_name_appears_as_first_line_of_profile_block(self):
        """'Nombre del paciente: X.' is the first line of the profile block."""
        db = AsyncMock()

        profile = MagicMock()
        profile.patient_summary = "Ansiedad crónica."
        profile.recurring_themes = ["ansiedad"]
        profile.risk_factors = []
        profile.protective_factors = []

        profile_result = MagicMock()
        profile_result.scalar_one_or_none.return_value = profile

        session_result = MagicMock()
        session_result.scalars.return_value.all.return_value = []

        db.execute.side_effect = [profile_result, session_result]

        context = await agent_module._get_patient_context(db, "patient-1", "Luis Pérez")

        user_turn_content = context[0]["content"]
        # Name line must come before clinical summary
        name_pos = user_turn_content.find("Luis Pérez")
        summary_pos = user_turn_content.find("Ansiedad crónica.")
        assert name_pos != -1
        assert name_pos < summary_pos

    @pytest.mark.asyncio
    async def test_empty_patient_name_does_not_produce_broken_line(self):
        """If patient_name is empty, the broken 'Nombre del paciente: .' line is not emitted."""
        db = AsyncMock()

        profile_result = MagicMock()
        profile_result.scalar_one_or_none.return_value = None

        session_result = MagicMock()
        session_result.scalars.return_value.all.return_value = []

        db.execute.side_effect = [profile_result, session_result]

        context = await agent_module._get_patient_context(db, "patient-1", "")

        # The broken "Nombre del paciente: ." line must not appear
        all_content = " ".join(m.get("content", "") for m in context)
        assert "Nombre del paciente: ." not in all_content

    @pytest.mark.asyncio
    async def test_process_session_passes_name_to_context(self):
        """process_session accepts patient_name and the name ends up in messages sent to Claude."""
        db = AsyncMock()

        profile_result = MagicMock()
        profile_result.scalar_one_or_none.return_value = None

        session_result = MagicMock()
        session_result.scalars.return_value.all.return_value = []

        db.execute.side_effect = [profile_result, session_result]

        mock_response = MagicMock()
        block = MagicMock()
        block.type = "text"
        block.text = "Nota generada."
        mock_response.content = [block]

        with patch("agent.agent.AsyncAnthropic") as mock_cls:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_cls.return_value = mock_client

            await agent_module.process_session(
                db, "patient-1", "Sesión normal.", "session-1",
                patient_name="María Torres"
            )

            call_kwargs = mock_client.messages.create.call_args.kwargs
            messages_sent = call_kwargs["messages"]
            # Name must appear in the first context message (the clinical profile block)
            assert "María Torres" in messages_sent[0]["content"]
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
cd backend
pytest tests/test_agent_process.py::TestGetPatientContextNameInjection -v
```

Resultado esperado: 4 FAILED (`_get_patient_context() takes 2 positional arguments but 3 were given` o similar)

- [ ] **Step 3: Implementar cambios en `backend/agent/agent.py`**

**Cambio 1 — firma de `_get_patient_context` (línea 82):**
```python
# Antes
async def _get_patient_context(db, patient_id: str) -> list:

# Después
async def _get_patient_context(db, patient_id: str, patient_name: str = "") -> list:
```

**Cambio 2 — inicializar `profile_block_parts` con el nombre (línea 96-105):**
```python
# Antes
    profile_block_parts = []
    if profile:
        if profile.patient_summary:
            profile_block_parts.append(f"Resumen clínico del paciente:\n{profile.patient_summary}")
        ...

# Después
    profile_block_parts = [f"Nombre del paciente: {patient_name}."] if patient_name else []
    if profile:
        if profile.patient_summary:
            profile_block_parts.append(f"Resumen clínico del paciente:\n{profile.patient_summary}")
        ...
```

**Cambio 3 — firma de `process_session` (línea 201):**
```python
# Antes
async def process_session(db, patient_id: str, raw_dictation: str, session_id: str, format_: str = "SOAP") -> dict:

# Después
async def process_session(db, patient_id: str, raw_dictation: str, session_id: str, format_: str = "SOAP", patient_name: str = "") -> dict:
```

**Cambio 4 — pasar `patient_name` a `_get_patient_context` (línea 213):**
```python
# Antes
    context_messages = await _get_patient_context(db, patient_id)

# Después
    context_messages = await _get_patient_context(db, patient_id, patient_name)
```

- [ ] **Step 4: Correr todos los tests del agente para verificar que pasan**

```bash
cd backend
pytest tests/test_agent_process.py -v
```

Resultado esperado: todos PASSED (los tests existentes siguen pasando porque `patient_name=""` por defecto)

- [ ] **Step 5: Commit**

```bash
git add backend/agent/agent.py backend/tests/test_agent_process.py
git commit -m "feat(agent): inject patient name into clinical context block"
```

---

## Task 2: Pasar `patient_name` desde el route

**Archivos:**
- Modify: `backend/api/routes.py:473`
- Test: `backend/tests/test_api_routes.py`

- [ ] **Step 1: Escribir test que verifique el wire-up route → agent**

Agregar la siguiente clase al final de `backend/tests/test_api_routes.py` (usa los fixtures `app`, `mock_db`, y `patient_uuid` que ya existen en ese archivo):

```python
# ---------------------------------------------------------------------------
# POST /api/v1/sessions/{patient_id}/process — patient_name wire-up
# ---------------------------------------------------------------------------

class TestProcessSessionEndpointPatientName:
    @pytest.mark.asyncio
    async def test_passes_patient_name_to_process_session(self, app, mock_db, patient_uuid):
        """Route must forward patient.name to process_session as patient_name kwarg."""
        # Override db.get to return a patient with a known name
        fake_patient = MagicMock()
        fake_patient.id = patient_uuid
        fake_patient.psychologist_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_patient.name = "Carlos Mendoza"
        fake_patient.deleted_at = None

        async def fake_get(model, obj_id):
            return fake_patient
        mock_db.get = AsyncMock(side_effect=fake_get)

        # Also patch execute for the session insert that follows process_session
        mock_db.execute.return_value = _result(scalar_one=0)

        with patch("api.routes.process_session", new_callable=AsyncMock) as mock_ps:
            mock_ps.return_value = {
                "text_fallback": "Nota generada.",
                "session_messages": [
                    {"role": "user", "content": "Paciente puntual."},
                    {"role": "assistant", "content": "Nota generada."},
                ],
            }

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    f"/api/v1/sessions/{patient_uuid}/process",
                    json={"raw_dictation": "Paciente puntual.", "format": "SOAP"},
                )

        assert response.status_code == 200
        _, kwargs = mock_ps.call_args
        assert kwargs.get("patient_name") == "Carlos Mendoza"
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend
pytest tests/test_api_routes.py::TestProcessSessionEndpointPatientName -v
```

Resultado esperado: FAILED con `AssertionError: assert None == 'Carlos Mendoza'` (el kwarg aún no se pasa)

- [ ] **Step 3: Actualizar la llamada a `process_session` (línea 473)**

```python
# Antes
    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format)

# Después
    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format, patient_name=patient.name)
```

`patient` ya está en scope (línea 470: `patient = await _get_owned_patient(db, psychologist.id, patient_id)`). Sin cambios adicionales.

- [ ] **Step 4: Correr suite completa de tests para verificar que no hay regresiones**

```bash
cd backend
pytest tests/ -v --tb=short
```

Resultado esperado: todos PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat(routes): pass patient name to process_session"
```

---

## Verificación manual

Con backend corriendo (`uvicorn main:app --reload`):

1. Login → seleccionar un paciente con nombre conocido (ej. "Ana López")
2. Dictar cualquier texto en el panel de dictado
3. Verificar que la respuesta del agente hace referencia a "Ana López" o la trata por nombre
4. Probar con un paciente nuevo (sin sesiones previas) — el agente debe igualmente conocer su nombre
