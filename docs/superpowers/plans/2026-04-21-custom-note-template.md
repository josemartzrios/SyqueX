# Custom Note Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each psychologist define their own note structure (text, scale, checkbox, list, date fields); the AI agent fills it automatically via `tool_use` on every session.

**Architecture:** New `note_templates` table (one row per psychologist) stores a JSONB field array. When a template exists, `process_session()` builds a Claude `tool_use` tool from it and forces structured output via `tool_choice`. The confirm endpoint stores the filled values in a new nullable `custom_fields` JSONB column on `clinical_notes`. Frontend adds a setup modal (PDF upload primary, wizard fallback), a `CustomNoteDocument` renderer, and wires the existing desktop Sesión/Revisión toggle and pencil-icon expediente editor to mobile.

**Tech Stack:** Python 3.11 FastAPI + SQLAlchemy 2.0 async (PostgreSQL JSONB, no Alembic — idempotent `init_db()` migrations), Anthropic `claude-sonnet-4-6` tool_use, React 18 + Vite + Tailwind CDN.

---

## Pre-read: What is already implemented

Before touching any file, know what exists:

- **`PatientHeader`** desktop mode already renders the pencil-edit icon (`onEditPatient` prop) and the Sesión/Revisión segmented control (`onModeChange` prop).
- **`App.jsx`** already has `desktopMode` state, passes `onModeChange={setDesktopMode}` and `onEditPatient` to `PatientHeader`, and renders two different layouts for `'session'` vs `'review'`.
- **`PatientIntakeModal`** already supports `mode="edit"` with data prefill.
- **`MobileEvolucion`** already renders quick-question chips (white/sage border) — only the colors need updating.
- The **mobile `PatientHeader`** (compact mode) does NOT have a pencil icon yet.
- **`SoapNoteDocument`** is the desktop note renderer (not `NoteReview`). Both exist independently.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/database.py` | Add `NoteTemplate` model, `custom_fields` column on `ClinicalNote`, migrations |
| Modify | `backend/api/routes.py` | Add template endpoints, update confirm for custom fields |
| Create | `backend/agent/template_tool.py` | `build_fill_tool()` + `build_json_schema_for_field()` |
| Modify | `backend/agent/agent.py` | Branch to tool_use path when template exists |
| Create | `backend/tests/test_template_api.py` | Template CRUD + PDF analysis tests |
| Modify | `frontend/src/api.js` | `getTemplate`, `saveTemplate`, `analyzePdf` |
| Create | `frontend/src/components/CustomNoteDocument.jsx` | Renders typed fields (text/scale/checkbox/list/date) |
| Create | `frontend/src/components/TemplateFieldEditor.jsx` | Single-field editor (shared by wizard + PDF review) |
| Create | `frontend/src/components/TemplateWizard.jsx` | Path A — build template step-by-step |
| Create | `frontend/src/components/TemplatePdfUpload.jsx` | Path B — upload PDF, review extracted fields |
| Create | `frontend/src/components/TemplateSetupModal.jsx` | Entry modal (primary PDF / secondary wizard) |
| Modify | `frontend/src/App.jsx` | Template state, trigger modal, custom format flow, post-confirm |
| Modify | `frontend/src/components/SoapNoteDocument.jsx` | Add "Borrar nota", delegate to CustomNoteDocument for custom format |
| Modify | `frontend/src/components/PatientHeader.jsx` | Add pencil icon to compact (mobile) mode |
| Modify | `frontend/src/components/MobileEvolucion.jsx` | Alternating sage/amber chip colors |

---

## Task 1: NoteTemplate DB model + migrations

**Files:**
- Modify: `backend/database.py`
- Test: `backend/tests/test_template_api.py` (skeleton only — full tests in Task 6)

### Steps

- [ ] **1.1 — Add `NoteTemplate` SQLAlchemy model**

In `database.py`, after the `Psychologist` model and before `Patient`, add:

```python
class NoteTemplate(Base):
    __tablename__ = "note_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("psychologists.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    fields: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    psychologist: Mapped["Psychologist"] = relationship("Psychologist", back_populates="note_template")
```

Add the relationship on `Psychologist`:
```python
note_template: Mapped[Optional["NoteTemplate"]] = relationship("NoteTemplate", back_populates="psychologist", uselist=False)
```

- [ ] **1.2 — Add `custom_fields` column on `ClinicalNote`**

In `ClinicalNote`, add after the existing `evolution_delta` column:

```python
custom_fields: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
```

- [ ] **1.3 — Add idempotent migrations to `init_db()`**

In the `init_db()` async function, inside the migration block (after `create_all`), add:

```python
# note_templates table
await conn.execute(text("""
    CREATE TABLE IF NOT EXISTS note_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        psychologist_id UUID NOT NULL REFERENCES psychologists(id) ON DELETE CASCADE,
        fields JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (psychologist_id)
    )
"""))

# custom_fields on clinical_notes
await conn.execute(text("""
    ALTER TABLE clinical_notes
    ADD COLUMN IF NOT EXISTS custom_fields JSONB
"""))

# Expand format CHECK constraint on clinical_notes to include 'custom'
# Drop existing constraint first (idempotent — IF EXISTS), then re-add
await conn.execute(text("""
    ALTER TABLE clinical_notes
        DROP CONSTRAINT IF EXISTS chk_clinical_notes_format
"""))
await conn.execute(text("""
    ALTER TABLE clinical_notes
        ADD CONSTRAINT chk_clinical_notes_format
        CHECK (format IN ('SOAP', 'DAP', 'BIRP', 'custom'))
"""))
```

Also update the `CheckConstraint` in the `ClinicalNote` SQLAlchemy model to match:

```python
# In ClinicalNote.__table_args__ (or the CheckConstraint line), change:
CheckConstraint("format IN ('SOAP', 'DAP', 'BIRP')", name="chk_clinical_notes_format")
# to:
CheckConstraint("format IN ('SOAP', 'DAP', 'BIRP', 'custom')", name="chk_clinical_notes_format")
```
```

- [ ] **1.4 — Run the backend to verify migrations apply cleanly**

```bash
cd backend
uvicorn main:app --reload
```

Expected in logs: startup completes without error. Check DB:
```bash
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "\d note_templates"
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "\d clinical_notes" | grep custom_fields
```

- [ ] **1.5 — Commit**

```bash
git add backend/database.py
git commit -m "feat: add NoteTemplate model and custom_fields column with idempotent migrations"
```

---

## Task 2: Template API — GET/POST /template

**Files:**
- Modify: `backend/api/routes.py`

### Steps

- [ ] **2.1 — Add Pydantic schemas for template**

At the top of the schemas section in `routes.py`, add:

```python
class TemplateFieldSchema(BaseModel):
    id: str
    label: str
    type: str  # text | scale | checkbox | list | date
    options: list[str] = []
    guiding_question: str = ""
    order: int = 0

class SaveTemplateRequest(BaseModel):
    fields: list[TemplateFieldSchema]

class NoteTemplateOut(BaseModel):
    id: str
    fields: list[TemplateFieldSchema]
    created_at: datetime
    updated_at: datetime
```

- [ ] **2.2 — Write failing tests for GET and POST /template**

Create `backend/tests/test_template_api.py`:

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_template_returns_null_when_none(client: AsyncClient, auth_headers):
    r = await client.get("/api/v1/template", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() is None

@pytest.mark.asyncio
async def test_post_template_creates_and_returns(client: AsyncClient, auth_headers):
    payload = {"fields": [
        {"id": "f1", "label": "Estado afectivo", "type": "text", "options": [], "guiding_question": "", "order": 1}
    ]}
    r = await client.post("/api/v1/template", json=payload, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["fields"][0]["label"] == "Estado afectivo"

@pytest.mark.asyncio
async def test_get_template_returns_saved(client: AsyncClient, auth_headers):
    payload = {"fields": [{"id": "f1", "label": "Plan", "type": "text", "options": [], "guiding_question": "", "order": 1}]}
    await client.post("/api/v1/template", json=payload, headers=auth_headers)
    r = await client.get("/api/v1/template", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["fields"][0]["label"] == "Plan"
```

- [ ] **2.3 — Run tests to verify they fail**

```bash
cd backend
pytest tests/test_template_api.py -v
```

Expected: FAIL with 404 or attribute errors.

- [ ] **2.4 — Implement GET /template**

```python
@router.get("/template", response_model=NoteTemplateOut | None)
async def get_template(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    result = await db.execute(
        select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        return None
    return NoteTemplateOut(
        id=str(tmpl.id),
        fields=[TemplateFieldSchema(**f) for f in (tmpl.fields or [])],
        created_at=tmpl.created_at,
        updated_at=tmpl.updated_at,
    )
```

- [ ] **2.5 — Implement POST /template (upsert)**

```python
@router.post("/template", response_model=NoteTemplateOut)
async def save_template(
    body: SaveTemplateRequest,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    result = await db.execute(
        select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
    )
    tmpl = result.scalar_one_or_none()
    fields_data = [f.model_dump() for f in body.fields]
    if tmpl is None:
        tmpl = NoteTemplate(psychologist_id=psychologist.id, fields=fields_data)
        db.add(tmpl)
    else:
        tmpl.fields = fields_data
        tmpl.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(tmpl)
    return NoteTemplateOut(
        id=str(tmpl.id),
        fields=[TemplateFieldSchema(**f) for f in tmpl.fields],
        created_at=tmpl.created_at,
        updated_at=tmpl.updated_at,
    )
```

Add `NoteTemplate` to the imports at the top of `routes.py`.

- [ ] **2.6 — Run tests to verify they pass**

```bash
pytest tests/test_template_api.py::test_get_template_returns_null_when_none tests/test_template_api.py::test_post_template_creates_and_returns tests/test_template_api.py::test_get_template_returns_saved -v
```

Expected: all 3 PASS.

- [ ] **2.7 — Commit**

```bash
git add backend/api/routes.py backend/tests/test_template_api.py
git commit -m "feat: add GET/POST /template endpoints for note template management"
```

---

## Task 3: PDF Analysis Endpoint

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_template_api.py`

### Steps

- [ ] **3.1 — Write failing test for PDF analysis**

Add to `test_template_api.py`:

```python
import io

@pytest.mark.asyncio
async def test_analyze_pdf_returns_proposed_fields(client: AsyncClient, auth_headers, monkeypatch):
    # Mock anthropic call to return a known response
    async def mock_analyze(pdf_base64: str) -> list[dict]:
        return [{"id": "f1", "label": "Estado afectivo", "type": "text", "options": [], "guiding_question": "¿Cómo se siente?", "order": 1}]
    monkeypatch.setattr("api.routes.analyze_pdf_with_claude", mock_analyze)

    pdf_bytes = b"%PDF-1.4 mock content"
    files = {"file": ("nota.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = await client.post("/api/v1/template/analyze-pdf", files=files, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert data[0]["label"] == "Estado afectivo"

@pytest.mark.asyncio
async def test_analyze_pdf_too_large_returns_422(client: AsyncClient, auth_headers):
    big = b"x" * (5 * 1024 * 1024 + 1)
    files = {"file": ("nota.pdf", io.BytesIO(big), "application/pdf")}
    r = await client.post("/api/v1/template/analyze-pdf", files=files, headers=auth_headers)
    assert r.status_code == 422
```

- [ ] **3.2 — Run tests to verify they fail**

```bash
pytest tests/test_template_api.py::test_analyze_pdf_returns_proposed_fields tests/test_template_api.py::test_analyze_pdf_too_large_returns_422 -v
```

Expected: FAIL (endpoint not found).

- [ ] **3.3 — Implement `analyze_pdf_with_claude()` helper**

Add to `routes.py` (or a new `backend/api/pdf_analyzer.py` — keep it in routes for now):

```python
import base64
from anthropic import AsyncAnthropic

_PDF_EXTRACTION_PROMPT = """
You are analyzing a clinical psychologist's note template.
Extract the sections and fields from this PDF note.
For each section, return a JSON object with:
- id: a unique short slug (e.g. "estado_afectivo")
- label: the section name in Spanish
- type: one of "text", "scale", "checkbox", "list", "date"
  - Use "scale" if the field is numeric 1-10
  - Use "checkbox" if the field has multiple yes/no options
  - Use "list" if the field has a fixed set of single-choice options
  - Use "date" if the field captures a date
  - Default to "text"
- options: list of strings (required for checkbox and list types, empty otherwise)
- guiding_question: a question that helps the AI know what to extract from a dictation
- order: sequential integer starting at 1

Return ONLY a valid JSON array. No explanation, no markdown fences.
""".strip()

async def analyze_pdf_with_claude(pdf_base64: str) -> list[dict]:
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": pdf_base64,
                    },
                },
                {"type": "text", "text": _PDF_EXTRACTION_PROMPT},
            ],
        }],
    )
    import json
    text = response.content[0].text.strip()
    try:
        fields = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.")
    if not fields:
        raise HTTPException(status_code=422, detail="No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.")
    return fields
```

- [ ] **3.4 — Implement POST /template/analyze-pdf**

```python
from fastapi import UploadFile, File

MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB

@router.post("/template/analyze-pdf")
async def analyze_pdf(
    file: UploadFile = File(...),
    psychologist: Psychologist = Depends(get_current_psychologist),
):
    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=422, detail="El PDF no puede superar 5 MB.")
    pdf_b64 = base64.b64encode(content).decode("utf-8")
    fields = await analyze_pdf_with_claude(pdf_b64)
    # Validate and normalize
    result = []
    for i, f in enumerate(fields):
        result.append(TemplateFieldSchema(
            id=f.get("id", f"field_{i+1}"),
            label=f.get("label", f"Campo {i+1}"),
            type=f.get("type", "text"),
            options=f.get("options", []),
            guiding_question=f.get("guiding_question", ""),
            order=f.get("order", i + 1),
        ))
    return result
```

- [ ] **3.5 — Run tests to verify they pass**

```bash
pytest tests/test_template_api.py::test_analyze_pdf_returns_proposed_fields tests/test_template_api.py::test_analyze_pdf_too_large_returns_422 -v
```

Expected: both PASS.

- [ ] **3.6 — Commit**

```bash
git add backend/api/routes.py backend/tests/test_template_api.py
git commit -m "feat: add POST /template/analyze-pdf — Claude extracts template from PDF"
```

---

## Task 4: Agent — tool_use path

**Files:**
- Create: `backend/agent/template_tool.py`
- Modify: `backend/agent/agent.py`

### Steps

- [ ] **4.1 — Write failing test for `build_json_schema_for_field`**

Create `backend/tests/test_template_tool.py`:

```python
from agent.template_tool import build_json_schema_for_field

def test_text_field():
    schema = build_json_schema_for_field({"type": "text", "label": "Estado", "options": [], "guiding_question": ""})
    assert schema["type"] == "string"

def test_scale_field():
    schema = build_json_schema_for_field({"type": "scale", "label": "Intensidad", "options": [], "guiding_question": ""})
    assert schema["type"] == "integer"
    assert schema["minimum"] == 1
    assert schema["maximum"] == 10

def test_checkbox_field():
    schema = build_json_schema_for_field({"type": "checkbox", "label": "Conductas", "options": ["Llanto", "Ideación"], "guiding_question": ""})
    assert schema["type"] == "array"
    assert schema["items"]["enum"] == ["Llanto", "Ideación"]

def test_list_field():
    schema = build_json_schema_for_field({"type": "list", "label": "Técnica", "options": ["CBT", "DBT"], "guiding_question": ""})
    assert schema["type"] == "string"
    assert schema["enum"] == ["CBT", "DBT"]

def test_date_field():
    schema = build_json_schema_for_field({"type": "date", "label": "Fecha", "options": [], "guiding_question": ""})
    assert schema["type"] == "string"
    assert schema["format"] == "date"
```

- [ ] **4.2 — Run to verify failures**

```bash
pytest tests/test_template_tool.py -v
```

Expected: ImportError — module not found.

- [ ] **4.3 — Create `backend/agent/template_tool.py`**

```python
"""Builds Claude tool_use definitions from a psychologist's note template."""

def build_json_schema_for_field(field: dict) -> dict:
    """Convert a template field definition to a JSON Schema property dict."""
    ftype = field.get("type", "text")
    desc = field.get("guiding_question") or field.get("label", "")

    if ftype == "text":
        return {"type": "string", "description": desc}

    if ftype == "scale":
        return {"type": "integer", "minimum": 1, "maximum": 10, "description": desc}

    if ftype == "checkbox":
        options = field.get("options", [])
        return {
            "type": "array",
            "items": {"type": "string", "enum": options},
            "description": desc,
        }

    if ftype == "list":
        options = field.get("options", [])
        return {"type": "string", "enum": options, "description": desc}

    if ftype == "date":
        return {"type": "string", "format": "date", "description": desc}

    return {"type": "string", "description": desc}


def build_fill_tool(template_fields: list[dict]) -> dict:
    """Build the full fill_custom_note tool definition from template fields."""
    properties = {}
    for field in sorted(template_fields, key=lambda f: f.get("order", 0)):
        properties[field["id"]] = build_json_schema_for_field(field)

    return {
        "name": "fill_custom_note",
        "description": (
            "Fill all fields of the psychologist's clinical note from the session dictation. "
            "Extract information from the dictation for every field. "
            "If information for a field is not mentioned, make a reasonable clinical inference."
        ),
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": [f["id"] for f in template_fields],
        },
    }
```

- [ ] **4.4 — Run tests to verify they pass**

```bash
pytest tests/test_template_tool.py -v
```

Expected: all 5 PASS.

- [ ] **4.5 — Add custom-note system prompt constant to `agent.py`**

In `agent.py`, after `SOAP_SYSTEM_PROMPT`, add:

```python
CUSTOM_NOTE_SYSTEM_PROMPT = (
    "Eres un asistente clínico especializado. El psicólogo ha definido una estructura de nota personalizada. "
    "Tu tarea es llenar TODOS los campos de la nota usando la información del dictado de sesión. "
    "Extrae información directamente del dictado. Si un campo no se menciona explícitamente, "
    "realiza una inferencia clínica razonable basada en el contexto. "
    "Responde ÚNICAMENTE usando la herramienta fill_custom_note — no generes texto libre.\n\n"
    + _SHARED_RULES
)
```

- [ ] **4.6 — Add `process_session_custom()` to `agent.py`**

Add a new async function after `process_session`:

```python
async def process_session_custom(
    db,
    patient_id: str,
    raw_dictation: str,
    session_id: str,
    template_fields: list[dict],
    patient_name: str = "",
) -> dict:
    """
    Process a session using the psychologist's custom note template via tool_use.
    Returns {"custom_fields": dict, "text_fallback": str, "session_messages": list}.
    """
    from agent.template_tool import build_fill_tool

    # Build patient context (reuse existing helper)
    context_messages = await _get_patient_context(db, patient_id)

    messages = context_messages + [{"role": "user", "content": raw_dictation}]

    tool = build_fill_tool(template_fields)

    response = await anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        temperature=0,
        system=CUSTOM_NOTE_SYSTEM_PROMPT,
        tools=[tool],
        tool_choice={"type": "tool", "name": "fill_custom_note"},
        messages=messages,
    )

    # Extract tool_use block
    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        raise LLMServiceError("El agente no completó la nota. Intenta de nuevo.")

    custom_fields = tool_block.input  # dict keyed by field id

    # Build a human-readable text_fallback for display
    label_map = {f["id"]: f["label"] for f in template_fields}
    lines = []
    for fid, value in custom_fields.items():
        label = label_map.get(fid, fid)
        if isinstance(value, list):
            lines.append(f"{label}: {', '.join(value) or 'ninguno'}")
        else:
            lines.append(f"{label}: {value}")
    text_fallback = "\n".join(lines)

    session_messages = messages + [{"role": "assistant", "content": text_fallback}]

    return {
        "custom_fields": custom_fields,
        "text_fallback": text_fallback,
        "session_messages": session_messages,
    }
```

- [ ] **4.7 — Update `process_session()` to branch on template**

At the top of `process_session()`, after loading patient context, add a template check:

```python
async def process_session(db, patient_id, raw_dictation, session_id, format_="SOAP", patient_name=""):
    # Check if psychologist has a custom template
    # (template is passed in via session context — loaded in routes.py)
    # format_ == "custom" signals that custom_fields should be filled
    if format_ == "custom":
        # template_fields must be set by caller via a kwarg; handled in routes.py
        raise ValueError("Use process_session_custom() for custom format sessions")
    # ... existing SOAP/chat logic unchanged
```

The `process_session` signature stays the same. Custom sessions use `process_session_custom` directly from routes.py.

- [ ] **4.8 — Commit**

```bash
git add backend/agent/template_tool.py backend/agent/agent.py backend/tests/test_template_tool.py
git commit -m "feat: add template_tool.py and process_session_custom() with tool_use"
```

---

## Task 5: Update confirm endpoint for custom_fields

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_template_api.py`

### Steps

- [ ] **5.1 — Write failing test for custom confirm**

Add to `test_template_api.py`:

```python
@pytest.mark.asyncio
async def test_confirm_custom_session_stores_custom_fields(client, auth_headers, test_patient_id):
    # 1. Save a template
    tmpl = {"fields": [{"id": "f1", "label": "Estado", "type": "text", "options": [], "guiding_question": "", "order": 1}]}
    await client.post("/api/v1/template", json=tmpl, headers=auth_headers)

    # 2. Process a session (mock agent)  
    # In test setup, a pre-created draft session exists with format="custom"
    # Confirm it with custom_fields
    session_id = test_patient_id  # placeholder — use fixture

    payload = {"edited_note": {"format": "custom", "custom_fields": {"f1": "El paciente reporta mejoría"}}}
    r = await client.post(f"/api/v1/sessions/{session_id}/confirm", json=payload, headers=auth_headers)
    assert r.status_code == 200
```

Note: this test requires a fixture providing a draft session. Add to conftest or use the existing `test_session_delete.py` pattern.

- [ ] **5.2 — Update the `confirm` endpoint handler**

In the `POST /sessions/{session_id}/confirm` handler in `routes.py`, after extracting `edited_note`:

```python
note_format = edited_note.get("format", "SOAP") if edited_note else "SOAP"
custom_fields = edited_note.get("custom_fields") if edited_note else None

if note_format == "custom" and custom_fields is not None:
    # Store custom fields — no SOAP columns needed
    # Generate embedding from text_fallback (same try/except pattern as SOAP path)
    text_for_embedding = edited_note.get("text_fallback", "")
    try:
        embedding = await get_embedding(text_for_embedding) if text_for_embedding else ZERO_VECTOR
    except Exception:
        embedding = ZERO_VECTOR

    note = ClinicalNote(
        session_id=session.id,
        format="custom",
        custom_fields=custom_fields,
        detected_patterns=edited_note.get("detected_patterns", []),
        alerts=edited_note.get("alerts", []),
        suggested_next_steps=edited_note.get("suggested_next_steps", []),
        evolution_delta=edited_note.get("evolution_delta"),
        embedding=embedding,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return ConfirmNoteOut(clinical_note_id=str(note.id))
```

Keep the existing SOAP path intact after this block — only add the `if note_format == "custom"` branch before it.

- [ ] **5.3 — Update `SessionOut` schema to include `custom_fields`**

```python
class SessionOut(BaseModel):
    # ... existing fields ...
    custom_fields: Optional[dict] = None
    template_fields: Optional[list] = None  # filled from template when format=custom
```

In the session list endpoint, when `format == "custom"`, populate `custom_fields` from the `ClinicalNote`.

- [ ] **5.4 — Update `process_session` endpoint to call `process_session_custom` when template exists**

In `POST /sessions/{patient_id}/process`, after validating the patient, load the template:

```python
from database import NoteTemplate

tmpl_result = await db.execute(
    select(NoteTemplate).where(NoteTemplate.psychologist_id == psychologist.id)
)
template = tmpl_result.scalar_one_or_none()

if template and template.fields:
    result = await process_session_custom(
        db=db,
        patient_id=str(patient_id),
        raw_dictation=body.raw_dictation,
        session_id=None,
        template_fields=template.fields,
        patient_name=patient.name,
    )
    # Create draft session with format="custom"
    session = Session(
        patient_id=patient_id,
        format="custom",
        raw_dictation=encrypt_if_set(body.raw_dictation),
        ai_response=encrypt_if_set(result["text_fallback"]),
        status="draft",
        messages=encrypt_if_set(json.dumps(result["session_messages"])),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return ProcessSessionOut(
        text_fallback=result["text_fallback"],
        session_id=str(session.id),
        format="custom",
        custom_fields=result["custom_fields"],
        template_fields=template.fields,
    )
# ... else: existing SOAP path
```

Add `custom_fields` and `template_fields` to `ProcessSessionOut`:

```python
class ProcessSessionOut(BaseModel):
    text_fallback: str
    session_id: str
    format: str = "SOAP"
    custom_fields: Optional[dict] = None
    template_fields: Optional[list] = None
```

- [ ] **5.5 — Commit**

```bash
git add backend/api/routes.py backend/tests/test_template_api.py
git commit -m "feat: process_session and confirm handle custom format with template tool_use"
```

---

## Task 6: Backend test coverage

**Files:**
- Modify: `backend/tests/test_template_api.py`
- Modify: `backend/tests/test_template_tool.py`

### Steps

- [ ] **6.1 — Run the full test suite to check for regressions**

```bash
cd backend
pytest tests/ -v --tb=short
```

Expected: all pre-existing tests still pass; new template tests pass.

- [ ] **6.2 — Add edge-case tests**

Add to `test_template_api.py`:

```python
@pytest.mark.asyncio
async def test_post_template_replaces_existing(client, auth_headers):
    payload1 = {"fields": [{"id": "f1", "label": "A", "type": "text", "options": [], "guiding_question": "", "order": 1}]}
    payload2 = {"fields": [{"id": "f2", "label": "B", "type": "scale", "options": [], "guiding_question": "", "order": 1}]}
    await client.post("/api/v1/template", json=payload1, headers=auth_headers)
    await client.post("/api/v1/template", json=payload2, headers=auth_headers)
    r = await client.get("/api/v1/template", headers=auth_headers)
    assert r.json()["fields"][0]["id"] == "f2"

@pytest.mark.asyncio
async def test_template_requires_auth(client):
    r = await client.get("/api/v1/template")
    assert r.status_code == 401
```

- [ ] **6.3 — Commit**

```bash
git add backend/tests/
git commit -m "test: template API edge cases and regression coverage"
```

---

## Task 7: Frontend — api.js new functions

**Files:**
- Modify: `frontend/src/api.js`

### Steps

- [ ] **7.1 — Add template functions**

In `api.js`, after the `updatePatient` function, add:

```javascript
async getTemplate() {
  return _authFetch(`${API_BASE}/template`);
},

async saveTemplate(fields) {
  return _authFetch(`${API_BASE}/template`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
},

async analyzePdf(file) {
  // Use fetch() directly — _authFetch always sets Content-Type: application/json
  // which breaks multipart/form-data. Let the browser set the boundary automatically.
  const formData = new FormData();
  formData.append('file', file);
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/template/analyze-pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    // No Content-Type header — browser sets multipart/form-data with correct boundary
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || 'Error al analizar el PDF', res.status);
  }
  return res.json();
},
```

- [ ] **7.2 — Verify import works**

```bash
cd frontend
npm run build 2>&1 | head -30
```

Expected: build succeeds (no import errors).

- [ ] **7.3 — Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add getTemplate, saveTemplate, analyzePdf to api client"
```

---

## Task 8: CustomNoteDocument component

**Files:**
- Create: `frontend/src/components/CustomNoteDocument.jsx`

### Steps

- [ ] **8.1 — Create the component**

```jsx
// frontend/src/components/CustomNoteDocument.jsx
// Renders a custom-template clinical note with typed fields.
// Props:
//   templateFields: array of {id, label, type, options, order}
//   values: object keyed by field id — values from agent
//   onConfirm: async () => void  (called after successful confirm)
//   onDelete: async () => void   (called after delete confirmation)
//   readOnly: boolean

import { useState } from 'react';

function ScaleField({ value, max = 10 }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
            n === value
              ? 'bg-[#5a9e8a] text-white'
              : 'bg-[#f4f4f2] text-[#9ca3af]'
          }`}
        >
          {n}
        </div>
      ))}
    </div>
  );
}

function CheckboxField({ options, selected = [] }) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={selectedSet.has(opt)}
            readOnly
            className="accent-[#5a9e8a] w-4 h-4"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

export default function CustomNoteDocument({ templateFields = [], values = {}, onConfirm, onDelete, readOnly = false }) {
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sorted = [...templateFields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm?.();
      setConfirmed(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6 font-sans">

      <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink/[0.06]">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#5a9e8a] font-bold">
          Nota Clínica · Personalizada
        </span>
      </div>

      <div className="space-y-5 mb-4">
        {sorted.map((field) => {
          const value = values[field.id];
          return (
            <div key={field.id}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#9ca3af] mb-2">
                {field.label}
              </p>
              {field.type === 'text' && (
                <p className="font-serif text-[14px] leading-relaxed text-ink-secondary whitespace-pre-wrap">
                  {value || <span className="italic text-ink-tertiary">Sin información</span>}
                </p>
              )}
              {field.type === 'scale' && (
                <ScaleField value={value} />
              )}
              {field.type === 'checkbox' && (
                <CheckboxField options={field.options || []} selected={value || []} />
              )}
              {field.type === 'list' && (
                <span className="inline-block bg-[#f4f4f2] text-[#18181b] text-[13px] px-3 py-1 rounded-full">
                  {value || '—'}
                </span>
              )}
              {field.type === 'date' && (
                <span className="text-[13px] text-ink-secondary">{value || '—'}</span>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 border-t border-ink/[0.06] pt-4 mt-4">
          {!confirmed && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2 mr-auto">
                  <span className="text-[12px] text-red-600">¿Eliminar nota?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[12px] text-red-600 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-[12px] text-ink-muted px-2 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="mr-auto text-[13px] font-medium text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors"
                >
                  Borrar nota
                </button>
              )}

              <span className="bg-parchment-dark text-ink-tertiary text-[11px] font-semibold tracking-[0.06em] rounded-full px-3 py-1">
                BORRADOR
              </span>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className={`bg-[#5a9e8a] text-white text-[13px] font-medium rounded-xl px-4 py-2 transition-colors ${
                  saving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4a8a78]'
                }`}
              >
                {saving ? 'Registrando...' : '✓ Confirmar en Expediente'}
              </button>
            </>
          )}
          {confirmed && (
            <span className="text-emerald-600 text-[13px] font-medium flex items-center gap-1 px-4 py-2 ml-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Guardado
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **8.2 — Verify build**

```bash
npm run build 2>&1 | grep -E "error|warn" | head -20
```

Expected: no errors.

- [ ] **8.3 — Commit**

```bash
git add frontend/src/components/CustomNoteDocument.jsx
git commit -m "feat: CustomNoteDocument — renders typed note fields with confirm/delete"
```

---

## Task 9: TemplateFieldEditor component

**Files:**
- Create: `frontend/src/components/TemplateFieldEditor.jsx`

### Steps

- [ ] **9.1 — Create the component**

```jsx
// frontend/src/components/TemplateFieldEditor.jsx
// Edits a single template field. Used in both wizard and PDF review.
// Props:
//   field: {id, label, type, options, guiding_question, order}
//   onChange: (updatedField) => void
//   onDelete: () => void

const FIELD_TYPES = [
  { value: 'text',     label: 'Texto libre' },
  { value: 'scale',    label: 'Escala 1–10' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'list',     label: 'Lista opciones' },
  { value: 'date',     label: 'Fecha' },
];

const inputCls = 'w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all';

export default function TemplateFieldEditor({ field, onChange, onDelete }) {
  const needsOptions = field.type === 'checkbox' || field.type === 'list';

  const update = (key) => (e) => onChange({ ...field, [key]: e.target.value });

  const updateOptions = (e) => {
    const options = e.target.value.split('\n').filter(Boolean);
    onChange({ ...field, options });
  };

  return (
    <div className="border border-ink/[0.08] rounded-xl p-4 flex flex-col gap-3 bg-white">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={field.label}
          onChange={update('label')}
          placeholder="Nombre del campo…"
          className={inputCls}
          maxLength={120}
        />
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-2 rounded-lg text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Eliminar campo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FIELD_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange({ ...field, type: t.value, options: field.options })}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              field.type === t.value
                ? 'bg-[#5a9e8a] text-white'
                : 'bg-[#f4f4f2] text-[#555] hover:bg-[#e8e8e6]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {needsOptions && (
        <div>
          <p className="text-[11px] text-ink-muted mb-1">Opciones (una por línea)</p>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={updateOptions}
            placeholder={"Opción A\nOpción B\nOpción C"}
            rows={3}
            className={inputCls}
          />
        </div>
      )}

      <input
        type="text"
        value={field.guiding_question || ''}
        onChange={update('guiding_question')}
        placeholder="Pregunta guía para el agente (opcional)…"
        className={inputCls}
        maxLength={300}
      />
    </div>
  );
}
```

- [ ] **9.2 — Build check**

```bash
npm run build 2>&1 | grep -E "error" | head -10
```

- [ ] **9.3 — Commit**

```bash
git add frontend/src/components/TemplateFieldEditor.jsx
git commit -m "feat: TemplateFieldEditor — single-field editor shared by wizard and PDF review"
```

---

## Task 10: TemplateWizard component (Path A)

**Files:**
- Create: `frontend/src/components/TemplateWizard.jsx`

### Steps

- [ ] **10.1 — Create the component**

```jsx
// frontend/src/components/TemplateWizard.jsx
// Step-by-step wizard for creating a note template from scratch.
// Props:
//   onSave: (fields) => void   — called with final field array
//   onCancel: () => void

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TemplateFieldEditor from './TemplateFieldEditor';

function emptyField(order) {
  return { id: uuidv4(), label: '', type: 'text', options: [], guiding_question: '', order };
}

export default function TemplateWizard({ onSave, onCancel }) {
  const [fields, setFields] = useState([emptyField(1)]);
  const [saving, setSaving] = useState(false);

  const addField = () =>
    setFields((prev) => [...prev, emptyField(prev.length + 1)]);

  const updateField = (idx, updated) =>
    setFields((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeField = (idx) =>
    setFields((prev) => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 })));

  const canSave = fields.length > 0 && fields.every((f) => f.label.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-secondary">
        Define los campos de tu nota. El agente los llenará automáticamente desde el dictado.
      </p>

      <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
        {fields.map((field, idx) => (
          <TemplateFieldEditor
            key={field.id}
            field={field}
            onChange={(updated) => updateField(idx, updated)}
            onDelete={() => removeField(idx)}
          />
        ))}
      </div>

      <button
        onClick={addField}
        className="w-full border border-dashed border-ink/20 rounded-xl py-3 text-[13px] text-ink-muted hover:border-[#5a9e8a]/50 hover:text-[#5a9e8a] transition-colors"
      >
        + Agregar campo
      </button>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`flex-2 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all ${
            !canSave || saving ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed' : 'bg-[#5a9e8a] hover:bg-[#4a8a78]'
          }`}
          style={{ flex: 2 }}
        >
          {saving ? 'Guardando…' : 'Guardar template'}
        </button>
      </div>
    </div>
  );
}
```

Note: `uuid` package — verify it's available. If not: `npm install uuid` in `/frontend`.

- [ ] **10.2 — Install uuid dependency**

```bash
cd frontend && npm install uuid
```

`uuid` is used in TemplateWizard and TemplatePdfUpload for client-side field ID generation. Install unconditionally — npm is idempotent if it's already present.

- [ ] **10.3 — Build check**

```bash
npm run build 2>&1 | grep -E "error" | head -10
```

- [ ] **10.4 — Commit**

```bash
git add frontend/src/components/TemplateWizard.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: TemplateWizard — step-by-step field builder for Path A"
```

---

## Task 11: TemplatePdfUpload component (Path B)

**Files:**
- Create: `frontend/src/components/TemplatePdfUpload.jsx`

### Steps

- [ ] **11.1 — Create the component**

```jsx
// frontend/src/components/TemplatePdfUpload.jsx
// Upload a PDF note sample → agent analyzes → psychologist reviews + saves.
// Props:
//   onSave: (fields) => void
//   onCancel: () => void

import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { analyzePdf, saveTemplate } from '../api';
import TemplateFieldEditor from './TemplateFieldEditor';

export default function TemplatePdfUpload({ onSave, onCancel }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'review'
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El PDF no puede superar 5 MB.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const proposed = await analyzePdf(file);
      const normalized = proposed.map((f, i) => ({
        ...f,
        id: f.id || uuidv4(),
        order: f.order ?? i + 1,
        options: f.options || [],
        guiding_question: f.guiding_question || '',
      }));
      setFields(normalized);
      setStep('review');
    } catch (err) {
      setError(err.message || 'No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateField = (idx, updated) =>
    setFields((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeField = (idx) =>
    setFields((prev) => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 })));

  const addField = () =>
    setFields((prev) => [...prev, { id: uuidv4(), label: '', type: 'text', options: [], guiding_question: '', order: prev.length + 1 }]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  if (step === 'upload') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-ink-muted">
          El agente solo aprende la estructura, no guarda el contenido de la nota.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[#5a9e8a]/40 rounded-xl p-10 text-center cursor-pointer hover:border-[#5a9e8a] hover:bg-[#f0f8f5] transition-colors"
        >
          <p className="text-[14px] font-medium text-ink">Arrastra tu PDF aquí</p>
          <p className="text-[12px] text-ink-muted mt-1">o haz clic para seleccionar · Máx 5 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {analyzing && (
          <p className="text-[13px] text-[#5a9e8a] text-center animate-pulse">
            Analizando nota con agente…
          </p>
        )}

        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button onClick={onCancel} className="text-[13px] text-ink-muted underline text-center">
          Cancelar
        </button>
      </div>
    );
  }

  // Step: review
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#f0f8f5] border border-[#b3d9ce] rounded-lg px-3 py-2 text-[12px] text-[#3d7a65]">
        ✓ El agente detectó {fields.length} campos. Revisa, ajusta o agrega más.
      </div>

      <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-1">
        {fields.map((field, idx) => (
          <TemplateFieldEditor
            key={field.id}
            field={field}
            onChange={(updated) => updateField(idx, updated)}
            onDelete={() => removeField(idx)}
          />
        ))}
      </div>

      <button
        onClick={addField}
        className="w-full border border-dashed border-ink/20 rounded-xl py-3 text-[13px] text-ink-muted hover:border-[#5a9e8a]/50 hover:text-[#5a9e8a] transition-colors"
      >
        + Agregar campo
      </button>

      <div className="flex gap-3">
        <button
          onClick={() => setStep('upload')}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={handleSave}
          disabled={saving || fields.length === 0}
          className="py-2.5 rounded-xl text-[14px] font-medium text-white bg-[#5a9e8a] hover:bg-[#4a8a78] disabled:opacity-40 transition-colors"
          style={{ flex: 2 }}
        >
          {saving ? 'Guardando…' : 'Guardar template'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **11.2 — Build check**

```bash
npm run build 2>&1 | grep error | head -10
```

- [ ] **11.3 — Commit**

```bash
git add frontend/src/components/TemplatePdfUpload.jsx
git commit -m "feat: TemplatePdfUpload — PDF upload + agent analysis + field review for Path B"
```

---

## Task 12: TemplateSetupModal component

**Files:**
- Create: `frontend/src/components/TemplateSetupModal.jsx`

### Steps

- [ ] **12.1 — Create the component**

```jsx
// frontend/src/components/TemplateSetupModal.jsx
// Entry point modal for template configuration.
// Props:
//   open: boolean
//   onClose: () => void            (user skips / cancels)
//   onSaved: (template) => void    (template saved successfully)

import { useState } from 'react';
import { saveTemplate } from '../api';
import TemplateWizard from './TemplateWizard';
import TemplatePdfUpload from './TemplatePdfUpload';

export default function TemplateSetupModal({ open, onClose, onSaved }) {
  const [path, setPath] = useState(null); // null | 'pdf' | 'wizard'

  if (!open) return null;

  const handleSave = async (fields) => {
    const saved = await saveTemplate(fields);
    onSaved?.(saved);
    onClose();
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-3 sm:px-4"
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between flex-shrink-0 border-b border-ink/[0.06]">
          <div>
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold block mb-0.5">
              {path ? (path === 'pdf' ? 'Subir nota de muestra' : 'Diseñar nota') : 'Tu nota clínica'}
            </span>
            <h2 className="text-[#18181b] text-lg font-semibold leading-snug">
              {path ? 'Configura tu nota' : '¿Cómo quieres documentar tus sesiones?'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#18181b] hover:bg-black/[0.04] transition-colors ml-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {path === null && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-secondary mb-2">
                SyqueX aprenderá tu estilo clínico y generará cada nota automáticamente.
              </p>

              {/* Primary: PDF */}
              <button
                onClick={() => setPath('pdf')}
                className="w-full border-2 border-[#5a9e8a] rounded-xl p-5 text-left flex items-center gap-4 bg-[#f0f8f5] hover:bg-[#e8f5f0] transition-colors"
              >
                <svg className="w-8 h-8 text-[#5a9e8a] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold text-[#18181b] text-[14px]">Subir una nota que ya uso</p>
                  <p className="text-[12px] text-[#555] mt-0.5">Sube un PDF de ejemplo — el agente aprende tu estructura en segundos</p>
                </div>
                <span className="flex-shrink-0 bg-[#5a9e8a] text-white text-[11px] font-bold rounded-md px-2.5 py-1">
                  Recomendado
                </span>
              </button>

              {/* Secondary: Wizard */}
              <button
                onClick={() => setPath('wizard')}
                className="w-full border border-ink/[0.10] rounded-xl p-4 text-left flex items-center gap-4 bg-white hover:bg-[#fafafa] transition-colors"
              >
                <svg className="w-7 h-7 text-[#9ca3af] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-medium text-[#18181b] text-[14px]">No tengo notas en PDF — diseñar desde cero</p>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Elige secciones y tipos de campo paso a paso</p>
                </div>
              </button>

              <button onClick={onClose} className="text-[11px] text-[#bbb] text-center mt-2 underline">
                Usar formato SOAP por ahora — configurar después
              </button>
            </div>
          )}

          {path === 'pdf' && (
            <TemplatePdfUpload
              onSave={handleSave}
              onCancel={() => setPath(null)}
            />
          )}

          {path === 'wizard' && (
            <TemplateWizard
              onSave={handleSave}
              onCancel={() => setPath(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **12.2 — Build check**

```bash
npm run build 2>&1 | grep error | head -10
```

- [ ] **12.3 — Commit**

```bash
git add frontend/src/components/TemplateSetupModal.jsx
git commit -m "feat: TemplateSetupModal — PDF primary / wizard fallback template entry modal"
```

---

## Task 13: App.jsx — template state, wiring, and post-confirm flow

**Files:**
- Modify: `frontend/src/App.jsx`

### Steps

- [ ] **13.1 — Add template state and load on auth**

After the `desktopMode` state declaration (around line 153), add:

```javascript
const [template, setTemplate] = useState(null);           // null = not loaded | {} = no template | {fields:[...]} = configured
const [showTemplateSetup, setShowTemplateSetup] = useState(false);
const [newlyConfirmedSessionId, setNewlyConfirmedSessionId] = useState(null); // for "Nueva" badge
```

Add template fetch inside the effect that runs after login / on `conversations` load:

```javascript
// Load template once user is authenticated
useEffect(() => {
  if (!isAuthenticated()) return;
  getTemplate().then(setTemplate).catch(() => setTemplate({}));
}, []);
```

Import `getTemplate` and `saveTemplate` from `../api` (already added in Task 7).

- [ ] **13.2 — Pass custom format to `handleSendDictation` when template exists**

Modify `handleSendDictation` to detect if a template is configured:

```javascript
const handleSendDictation = async (dictation, format) => {
  const activeFormat = (template && template.fields?.length > 0) ? 'custom' : format;
  // ... rest unchanged, but use activeFormat instead of format
  const noteData = await processSession(selectedPatientId, dictation, activeFormat);
  // ...
};
```

- [ ] **13.3 — Render `CustomNoteDocument` for custom format notes**

In the desktop note panel (around line 651), after the `type === 'bot'` check, add:

```javascript
) : currentSessionNote.type === 'bot' && currentSessionNote.noteData?.format === 'custom' ? (
  <CustomNoteDocument
    templateFields={currentSessionNote.noteData.template_fields || template?.fields || []}
    values={currentSessionNote.noteData.custom_fields || {}}
    onConfirm={async () => {
      const sid = currentSessionNote.noteData.session_id;
      await confirmNote(sid, {
        format: 'custom',
        custom_fields: currentSessionNote.noteData.custom_fields,
      });
      setNewlyConfirmedSessionId(sid);
      fetchPatientSessions(selectedPatientId);
      fetchConversations();
      // Switch to review mode and clear workspace
      setDesktopMode('review');
      setCurrentSessionNote(null);
    }}
    onDelete={async () => {
      const sid = currentSessionNote.noteData.session_id;
      await deleteSession(sid);
      setCurrentSessionNote(null);
      fetchPatientSessions(selectedPatientId);
    }}
  />
) : currentSessionNote.type === 'bot' && currentSessionNote.noteData ? (
  <SoapNoteDocument ... />   // existing block, unchanged
```

Import `CustomNoteDocument` at the top of `App.jsx`.

- [ ] **13.4 — Trigger TemplateSetupModal on first confirm when no template**

Wrap the `confirmNote` call in `SoapNoteDocument`'s `onConfirm` handler. Actually: trigger the modal proactively — when `currentSessionNote` becomes non-null and `template` is `null` or empty, show the setup modal.

Add a `useEffect`:

```javascript
useEffect(() => {
  if (
    currentSessionNote?.type === 'bot' &&
    currentSessionNote?.noteData &&
    template !== null &&
    (!template.fields || template.fields.length === 0)
  ) {
    setShowTemplateSetup(true);
  }
}, [currentSessionNote, template]);
```

Render `TemplateSetupModal` in the JSX:

```jsx
<TemplateSetupModal
  open={showTemplateSetup}
  onClose={() => setShowTemplateSetup(false)}
  onSaved={(saved) => {
    setTemplate(saved);
    setShowTemplateSetup(false);
  }}
/>
```

Import `TemplateSetupModal` at the top.

- [ ] **13.5 — "Nueva" badge in Revisión history panel**

In the session card rendering in Revisión mode (around line 691), add the badge:

```jsx
{String(s.id) === newlyConfirmedSessionId && (
  <span className="text-[9px] font-bold bg-[#5a9e8a] text-white rounded-full px-2 py-0.5">
    Nueva
  </span>
)}
```

Clear `newlyConfirmedSessionId` on patient change:

```javascript
useEffect(() => { setNewlyConfirmedSessionId(null); }, [selectedPatientId]);
```

- [ ] **13.6 — Post-confirm toast in Sesión mode**

After `setCurrentSessionNote(null)` on confirm, show a toast. Add simple toast state:

```javascript
const [toast, setToast] = useState(null);
```

After confirming, set:
```javascript
setToast('Sesión confirmada — nota guardada en historial');
setTimeout(() => setToast(null), 3500);
```

In the JSX, add a toast overlay (fixed bottom-center):
```jsx
{toast && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181b] text-white text-[13px] font-medium px-5 py-3 rounded-xl shadow-lg animate-fade-in">
    {toast}
  </div>
)}
```

- [ ] **13.7 — Build and smoke test**

```bash
npm run build
npm run dev
```

Open http://localhost:5173 — verify no console errors, template modal opens, custom note renders.

- [ ] **13.8 — Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire template state, custom note rendering, post-confirm flow, and template setup modal trigger"
```

---

## Task 14: SoapNoteDocument — add "Borrar nota" button

**Files:**
- Modify: `frontend/src/components/SoapNoteDocument.jsx`

### Steps

- [ ] **14.1 — Add `onDelete` prop and "Borrar nota" UI**

`SoapNoteDocument` is only shown for SOAP notes. Add `onDelete` prop and the delete button. The delete flow is the same as `CustomNoteDocument`: confirm dialog → call `onDelete()`.

In `SoapNoteDocument`, add to props:

```javascript
export default function SoapNoteDocument({ noteData, onConfirm, onDelete, readOnly = false, compact = false }) {
```

Add state:
```javascript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [deleting, setDeleting] = useState(false);
```

In the CTA bar (before the `BORRADOR` pill), add:

```jsx
{!confirmed && !readOnly && (
  showDeleteConfirm ? (
    <div className="flex items-center gap-2 mr-auto">
      <span className="text-[12px] text-red-600">¿Eliminar nota?</span>
      <button onClick={handleDelete} disabled={deleting}
        className="text-[12px] text-red-600 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
      </button>
      <button onClick={() => setShowDeleteConfirm(false)}
        className="text-[12px] text-ink-muted px-2 py-1.5">Cancelar</button>
    </div>
  ) : (
    <button onClick={() => setShowDeleteConfirm(true)}
      className="mr-auto text-[13px] font-medium text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors">
      Borrar nota
    </button>
  )
)}
```

Add the delete handler:
```javascript
const handleDelete = async () => {
  if (!onDelete) return;
  setDeleting(true);
  try { await onDelete(); } finally { setDeleting(false); setShowDeleteConfirm(false); }
};
```

- [ ] **14.2 — Wire `onDelete` in App.jsx**

Where `SoapNoteDocument` is rendered in App.jsx (around line 652), pass:

```jsx
onDelete={async () => {
  const sid = currentSessionNote.noteData?.session_id || currentSessionNote.sessionId;
  if (!sid) return;
  await deleteSession(sid);
  setCurrentSessionNote(null);
  fetchPatientSessions(selectedPatientId);
}}
```

- [ ] **14.3 — Build check**

```bash
npm run build 2>&1 | grep error | head -10
```

- [ ] **14.4 — Commit**

```bash
git add frontend/src/components/SoapNoteDocument.jsx frontend/src/App.jsx
git commit -m "feat: add Borrar nota button to SoapNoteDocument with confirm dialog"
```

---

## Task 15: Mobile pencil icon + MobileEvolucion chip colors

**Files:**
- Modify: `frontend/src/components/PatientHeader.jsx`
- Modify: `frontend/src/components/MobileEvolucion.jsx`
- Modify: `frontend/src/App.jsx`

### Steps

- [ ] **15.1 — Add pencil icon to PatientHeader compact (mobile)**

In `PatientHeader`, in the `if (compact)` branch, add the pencil icon after the patient name div:

```jsx
if (compact) {
  return (
    <div className="px-5 py-3 bg-[#f4f4f2] border-b border-ink/[0.06] flex items-center gap-3 flex-shrink-0">
      <div className="w-9 h-9 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-semibold text-[#18181b] leading-tight">{patientName}</p>
        <p className="text-[11px] text-ink-tertiary">
          {sessionCount} {sessionCount === 1 ? 'sesión confirmada' : 'sesiones confirmadas'}
        </p>
      </div>
      {onEditPatient && patientId && (
        <button
          onClick={() => onEditPatient(patientId)}
          className="p-2 rounded-lg text-[#9ca3af] hover:text-[#5a9e8a] hover:bg-black/[0.04] transition-colors flex-shrink-0"
          aria-label="Editar expediente"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **15.2 — Wire `onEditPatient` to mobile PatientHeader in App.jsx**

Find the mobile `<PatientHeader ... compact />` (around line 794) and add:

```jsx
<PatientHeader
  patientName={selectedPatientName}
  sessionCount={confirmedSessions.length}
  compact
  patientId={selectedPatientId}
  onEditPatient={(id) => setEditingPatientId(id)}
/>
```

- [ ] **15.3 — Update MobileEvolucion chip colors**

In `MobileEvolucion.jsx`, replace the quick-question chip button className:

```jsx
// Before:
className="px-3 py-1.5 bg-white border border-sage/30 rounded-full text-[12px] font-medium text-sage-dark ..."

// After — alternate sage and amber:
className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors disabled:opacity-40 ${
  i % 2 === 0
    ? 'bg-[#f0f8f5] border border-[#b3d9ce] text-[#3d7a65] hover:bg-[#e4f4ef]'
    : 'bg-[#fdf6ee] border border-[#e8c99a] text-[#9a6630] hover:bg-[#faecd8]'
}`}
```

Change the `QUICK_QUESTIONS.map` to include index:
```jsx
{QUICK_QUESTIONS.map((q, i) => (
  <button key={q} onClick={() => handleSend(q)} disabled={loading} className={...}>
    {q}
  </button>
))}
```

- [ ] **15.4 — Build and manual test**

```bash
npm run build && npm run dev
```

On mobile viewport (DevTools): verify pencil icon appears in patient header, chips alternate sage/amber.

- [ ] **15.5 — Commit**

```bash
git add frontend/src/components/PatientHeader.jsx frontend/src/components/MobileEvolucion.jsx frontend/src/App.jsx
git commit -m "feat: add pencil icon to mobile PatientHeader and alternating chip colors in MobileEvolucion"
```

---

## Task 16: Final integration test

### Steps

- [ ] **16.1 — Run full backend test suite**

```bash
cd backend
pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **16.2 — Smoke test the happy path (manual)**

1. Start backend: `uvicorn main:app --reload`
2. Start frontend: `npm run dev`
3. Login as a test user
4. Select a patient → dictate a session → click "Generar nota"
5. Verify: TemplateSetupModal appears (no template configured yet)
6. Choose "Subir nota de muestra" → upload a real PDF → verify fields appear
7. Save the template
8. Dictate a new session → verify agent fills custom fields
9. Confirm the note → verify workspace clears, history tab shows note with "Nueva" badge
10. Switch to Revisión mode → verify history + Evolution chat visible
11. Click pencil icon (desktop and mobile) → verify PatientIntakeModal opens pre-filled

- [ ] **16.3 — Final commit**

```bash
git add .
git commit -m "chore: final integration — custom note template feature complete"
```

---

## Implementation Order Summary

```
Task 1  → DB model + migrations
Task 2  → Template GET/POST API
Task 3  → PDF analysis endpoint
Task 4  → Agent tool_use (template_tool.py)
Task 5  → Confirm endpoint + process_session for custom format
Task 6  → Backend test coverage
Task 7  → Frontend api.js
Task 8  → CustomNoteDocument
Task 9  → TemplateFieldEditor
Task 10 → TemplateWizard
Task 11 → TemplatePdfUpload
Task 12 → TemplateSetupModal
Task 13 → App.jsx wiring (heaviest task)
Task 14 → SoapNoteDocument "Borrar nota"
Task 15 → Mobile pencil + chip colors
Task 16 → Final integration test
```
