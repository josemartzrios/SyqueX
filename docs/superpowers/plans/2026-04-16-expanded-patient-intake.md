# Expanded Patient Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar el alta de paciente con 9 campos clínicos (3 obligatorios + 6 opcionales), con UI reutilizable para crear y editar, y auditoría LFPDPPP compatible.

**Architecture:** Columnas tipadas en la tabla `patients` (pattern existente en el proyecto) con `nullable=True`. 3 endpoints (`POST /patients` ampliado, nuevos `GET /patients/{id}` y `PATCH /patients/{id}`), todos detrás de `get_current_psychologist` con ownership check → 404. Frontend usa un solo componente `PatientIntakeModal` en modos `create` / `edit`. Helper puro `calculateAge` para derivar edad de `date_of_birth`.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy async / PostgreSQL · React 18 / Vite / Vitest + RTL · pytest-asyncio + httpx.

**Branch:** `feature/expanded-patient-intake` (ya creada desde `dev`).

**Spec:** `docs/superpowers/specs/2026-04-16-expanded-patient-intake-design.md`.

---

## File Structure

### Archivos que se crean

| Path | Responsabilidad |
|---|---|
| `backend/tests/test_patient_create.py` | Tests de `POST /patients` (payload completo, mínimo, validaciones, auditoría) |
| `backend/tests/test_patient_get.py` | Tests de `GET /patients/{id}` (ownership, shape del response) |
| `backend/tests/test_patient_update.py` | Tests de `PATCH /patients/{id}` (partial update, ownership, auditoría, clearing semantics) |
| `frontend/src/utils/age.js` | Helper puro `calculateAge(dateOfBirth) → number \| null` |
| `frontend/src/utils/age.test.js` | Tests del helper |

### Archivos que se modifican

| Path | Cambio |
|---|---|
| `backend/database.py` | Modelo `Patient`: 7 columnas nuevas · `init_db()`: 7 `ALTER TABLE ADD COLUMN IF NOT EXISTS` |
| `backend/api/routes.py` | `EmergencyContact`, `MaritalStatus`, `PatientCreate` ampliado, `PatientUpdate` nuevo, `PatientOut` ampliado · `POST /patients` usa `get_current_psychologist` + persiste campos + audit · `GET /patients/{id}` nuevo · `PATCH /patients/{id}` nuevo |
| `backend/seed.py` | Pacientes demo con datos de intake |
| `backend/seed_demo.py` | Pacientes demo con datos de intake |
| `frontend/src/api.js` | `createPatient(payload)` — firma nueva · `getPatient(id)` nueva · `updatePatient(id, patch)` nueva |
| `frontend/src/App.jsx` | `handleSavePatient` y `handleModalPatientCreated`: firma nueva · `NewPatientModal` → `PatientIntakeModal` · Integración botón "Editar expediente" |
| `frontend/src/components/PatientHeader.jsx` | Botón "Editar expediente" (ícono lápiz) en modo desktop (no compact); prop opcional `onEditPatient` |
| `frontend/src/App.integration.test.jsx` | Update mock signature de `createPatient` |

### Archivos que se renombran

| De | A |
|---|---|
| `frontend/src/components/NewPatientModal.jsx` | `frontend/src/components/PatientIntakeModal.jsx` |
| `frontend/src/components/NewPatientModal.test.jsx` | `frontend/src/components/PatientIntakeModal.test.jsx` |

---

## Scope Notes — qué NO hace este plan

- **No refactoriza `GET /patients` ni `GET /patients/{id}/profile`** para usar `get_current_psychologist`. Esos endpoints ya tienen deuda de auth (pick-any-psychologist), pero es deuda pre-existente de toda la app — queda fuera del scope de este feature.
- **No toca `GET /patients/{id}/sessions`**, `POST /sessions/{patient_id}/process`, etc. Solo `POST`, `PATCH` y el nuevo `GET /patients/{id}`.
- **No agrega audit log en `GET /patients/{id}`** (decisión explícita del spec — single-tenant practitioner solo).

---

# FASE 1 — Base de datos

## Task 1: Agregar 7 columnas nullable a `patients`

**Files:**
- Modify: `backend/database.py` (modelo `Patient` en líneas 162-188; `init_db()` en líneas 279-394)

**Note:** Este cambio NO requiere tests nuevos — los índices de esta tabla ya están testeados indirectamente por los otros tests. Lo que sí valida el cambio es que el `init_db()` corra sin fallar (CI o `uvicorn main:app --reload` local).

- [ ] **Step 1: Agregar 7 columnas al modelo `Patient`**

Después de la línea con `diagnosis_tags` (línea 171) y antes de `risk_level`, agregar:

```python
# Intake clínico — todos nullable (obligatoriedad vive en Pydantic)
marital_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
occupation: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
emergency_contact: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
# { "name": str, "relationship": str, "phone": str }
reason_for_consultation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
medical_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
psychological_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Agregar 7 migraciones idempotentes en `init_db()`**

En `init_db()`, buscar el bloque `# Patients — soft delete` (línea 319) y agregar debajo:

```python
# Patients — intake clínico (nullable para pacientes legacy)
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status VARCHAR(30);"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(120);"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact JSONB;"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS reason_for_consultation TEXT;"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_history TEXT;"))
await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS psychological_history TEXT;"))
```

- [ ] **Step 3: Validar que init_db corre sin errores**

Run (desde `backend/`):
```bash
python -c "import asyncio; from database import init_db; asyncio.run(init_db())"
```
Expected: sin excepciones. Si no hay PostgreSQL corriendo → arrancar antes: `docker-compose up -d postgres`.

- [ ] **Step 4: Verificar columnas en BD**

Run:
```bash
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "\d patients"
```
Expected: las 7 columnas aparecen en el output (`marital_status`, `occupation`, `address`, `emergency_contact`, `reason_for_consultation`, `medical_history`, `psychological_history`).

- [ ] **Step 5: Commit**

```bash
git add backend/database.py
git commit -m "feat(db): add 7 intake columns to patients table

Nullable en BD, obligatoriedad en Pydantic. Pacientes legacy siguen
funcionando. Columnas: marital_status, occupation, address,
emergency_contact (JSONB), reason_for_consultation, medical_history,
psychological_history."
```

---

# FASE 2 — Backend API

## Task 2: Schemas Pydantic + ampliar `PatientOut`

**Files:**
- Modify: `backend/api/routes.py` (líneas 41-66 — bloque de schemas)

Solo cambios de schema, sin lógica todavía. Los tests vienen en Task 6.

- [ ] **Step 1: Agregar import de `field_validator` y `Literal`**

En la cabecera de `routes.py`, localizar el import de `pydantic` y ampliar:

```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Literal
```

- [ ] **Step 2: Agregar `MaritalStatus` + `EmergencyContact`**

Antes de `class PatientCreate`, insertar:

```python
MaritalStatus = Literal[
    "soltero", "casado", "divorciado", "viudo", "union_libre", "otro"
]


class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    relationship: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=7, max_length=20)
```

- [ ] **Step 3: Reemplazar `PatientCreate`**

Substituir la clase `PatientCreate` (líneas 41-45) por:

```python
class PatientCreate(BaseModel):
    # Obligatorios (flujo híbrido)
    name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    reason_for_consultation: str = Field(..., min_length=1, max_length=2000)

    # Opcionales
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)

    # Pre-existentes
    diagnosis_tags: Optional[List[str]] = []
    risk_level: str = "low"

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v
```

- [ ] **Step 4: Agregar `PatientUpdate`**

Justo debajo de `PatientCreate`:

```python
class PatientUpdate(BaseModel):
    # Todos opcionales — PATCH parcial. Los 3 campos mínimos validan min_length=1
    # cuando se envían (no se pueden limpiar con "").
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    date_of_birth: Optional[date] = None
    reason_for_consultation: Optional[str] = Field(None, min_length=1, max_length=2000)
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)
    diagnosis_tags: Optional[List[str]] = None
    risk_level: Optional[str] = None

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: Optional[date]) -> Optional[date]:
        if v is None:
            return v
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v
```

- [ ] **Step 5: Ampliar `PatientOut` con los 7 campos nuevos**

Reemplazar `PatientOut` (líneas 58-66) por:

```python
class PatientOut(BaseModel):
    id: uuid.UUID
    name: str
    risk_level: Optional[str] = None
    date_of_birth: Optional[date] = None
    diagnosis_tags: Optional[List[str]] = []

    # Intake
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[Dict[str, Any]] = None
    reason_for_consultation: Optional[str] = None
    medical_history: Optional[str] = None
    psychological_history: Optional[str] = None

    class Config:
        from_attributes = True
```

- [ ] **Step 6: Verificar que import compila**

Run (desde `backend/`):
```bash
python -c "from api.routes import PatientCreate, PatientUpdate, PatientOut, EmergencyContact; print('OK')"
```
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat(api): add PatientCreate/Update/Out schemas for intake fields

PatientCreate requires name + date_of_birth + reason_for_consultation.
PatientUpdate all-optional with min_length=1 on the 3 required fields
so clearing-with-empty-string is rejected. EmergencyContact sub-model
and MaritalStatus literal."
```

---

## Task 3: Ampliar `POST /patients` (auth + persist + audit)

**Files:**
- Modify: `backend/api/routes.py` (`create_patient` líneas 162-193)
- Modify: `backend/tests/test_api_routes.py` (`TestCreatePatient` línea ~125 — ajustar para incluir payload mínimo obligatorio y mockear auth)

**Important:** el endpoint actual usa `select(Psychologist).limit(1)` — hay que migrarlo a `get_current_psychologist`. Esto requiere actualizar los tests existentes para override la dependencia.

- [ ] **Step 1: Agregar imports**

En `routes.py`, agregar:

```python
from api.auth import get_current_psychologist
from api.audit import log_audit
```

- [ ] **Step 2: Reescribir `create_patient`**

Reemplazar la función completa `create_patient` (líneas 162-193) por:

```python
@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED, tags=["patients"])
async def create_patient(
    payload: PatientCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    patient = Patient(
        psychologist_id=current_user.id,
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        diagnosis_tags=payload.diagnosis_tags or [],
        risk_level=payload.risk_level,
        marital_status=payload.marital_status,
        occupation=payload.occupation,
        address=payload.address,
        emergency_contact=payload.emergency_contact.model_dump() if payload.emergency_contact else None,
        reason_for_consultation=payload.reason_for_consultation,
        medical_history=payload.medical_history,
        psychological_history=payload.psychological_history,
    )
    db.add(patient)
    await db.flush()  # populate patient.id

    db.add(PatientProfile(patient_id=patient.id))

    # Audit: nombres de campos enviados (solo los set explícitamente), sin valores
    fields_set = sorted(payload.model_fields_set)
    await log_audit(
        db=db,
        action="CREATE",
        entity="patient",
        entity_id=str(patient.id),
        psychologist_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
        metadata={"fields_set": fields_set},
    )

    await db.commit()
    await db.refresh(patient)

    return PatientOut.model_validate(patient)
```

- [ ] **Step 3: Actualizar fixtures en test_api_routes.py — override auth**

Localizar el fixture `app` (línea 32-44) y agregar el override de `get_current_psychologist`. Reemplazar por:

```python
@pytest.fixture
def app(mock_db):
    """FastAPI app with get_db overridden, auth mocked, init_db patched."""
    with patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db, Psychologist
        from api.auth import get_current_psychologist

        async def override_get_db():
            yield mock_db

        fake_psy = MagicMock(spec=Psychologist)
        fake_psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_psy.is_active = True

        async def override_current_user():
            return fake_psy

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()
```

- [ ] **Step 4: Actualizar `TestCreatePatient` — ajustar mocks y payload**

En `test_api_routes.py`, buscar `class TestCreatePatient` (línea ~125) y reemplazar la prueba `test_returns_patient_name` (o la primera prueba de create) por una versión que mande el payload mínimo. Ejemplo:

```python
class TestCreatePatient:
    @pytest.mark.asyncio
    async def test_create_with_minimum_payload(self, app, mock_db):
        from datetime import date

        created = MagicMock()
        created.id = uuid.uuid4()
        created.name = "Carlos Ruiz"
        created.risk_level = "low"
        created.date_of_birth = date(1990, 5, 20)
        created.diagnosis_tags = []
        created.marital_status = None
        created.occupation = None
        created.address = None
        created.emergency_contact = None
        created.reason_for_consultation = "Ansiedad laboral"
        created.medical_history = None
        created.psychological_history = None

        async def refresh(obj):
            for k, v in created.__dict__.items():
                if not k.startswith("_"):
                    setattr(obj, k, v)
        mock_db.refresh.side_effect = refresh

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/patients",
                json={
                    "name": "Carlos Ruiz",
                    "date_of_birth": "1990-05-20",
                    "reason_for_consultation": "Ansiedad laboral",
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Carlos Ruiz"
        assert body["reason_for_consultation"] == "Ansiedad laboral"
```

Eliminar o actualizar cualquier otra prueba de `TestCreatePatient` que falle porque ahora `name` solo no es suficiente.

- [ ] **Step 5: Correr tests de api_routes**

Run:
```bash
cd backend && pytest tests/test_api_routes.py -v -k "CreatePatient or ListPatients"
```
Expected: PASS. Si fallan `ListPatients`, es por el mismo fixture override — revisar que no se rompan esas pruebas (no deberían: el override solo afecta endpoints que usan `get_current_psychologist`).

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat(api): POST /patients uses current_user + persists intake + audit

Migrates create_patient from select-any-psychologist legacy to
get_current_psychologist dependency. Persists 7 intake columns and
writes audit_log with fields_set (names only, no values) per LFPDPPP
rule in database.py:73. Test fixture now overrides auth dependency."
```

---

## Task 4: `GET /patients/{id}` — leer expediente completo

**Files:**
- Modify: `backend/api/routes.py` (insertar endpoint nuevo antes de `get_patient_profile` línea 196)

- [ ] **Step 1: Agregar endpoint**

Antes de `@router.get("/patients/{patient_id}/profile", ...)` (línea 196), insertar:

```python
@router.get("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    puuid = _parse_uuid(patient_id, "patient_id")
    res = await db.execute(
        select(Patient).where(
            Patient.id == puuid,
            Patient.deleted_at.is_(None),
        )
    )
    patient = res.scalar_one_or_none()

    # Ownership: no revelar existencia de pacientes ajenos
    if not patient or patient.psychologist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    return PatientOut.model_validate(patient)
```

- [ ] **Step 2: Verificar compila**

Run:
```bash
cd backend && python -c "from api.routes import router; print([r.path for r in router.routes if 'patients' in r.path][:10])"
```
Expected: la lista incluye `/patients/{patient_id}`.

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat(api): GET /patients/{id} with ownership check

Returns full patient intake (all new + existing fields via PatientOut).
Not-owned or deleted patients → 404 (not 403) to avoid leaking existence.
No audit log for READ in MVP (single-tenant practitioner; spec decision)."
```

---

## Task 5: `PATCH /patients/{id}` — edición parcial

**Files:**
- Modify: `backend/api/routes.py` (insertar después del `GET /patients/{id}` de Task 4)

- [ ] **Step 1: Agregar endpoint**

```python
@router.patch("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Psychologist = Depends(get_current_psychologist),
):
    puuid = _parse_uuid(patient_id, "patient_id")
    res = await db.execute(
        select(Patient).where(
            Patient.id == puuid,
            Patient.deleted_at.is_(None),
        )
    )
    patient = res.scalar_one_or_none()

    if not patient or patient.psychologist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    # Solo los campos explícitamente enviados — permite setear null en opcionales
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        if field == "emergency_contact":
            # Pydantic ya validó la sub-estructura; persistir como dict (o None)
            setattr(
                patient,
                field,
                value.model_dump() if hasattr(value, "model_dump") else value,
            )
        else:
            setattr(patient, field, value)

    fields_changed = sorted(updates.keys())
    await log_audit(
        db=db,
        action="UPDATE",
        entity="patient",
        entity_id=str(patient.id),
        psychologist_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
        metadata={"fields_changed": fields_changed},
    )

    await db.commit()
    await db.refresh(patient)
    return PatientOut.model_validate(patient)
```

- [ ] **Step 2: Verificar compila**

Run:
```bash
cd backend && python -c "from api.routes import router; paths = {r.path for r in router.routes}; print('/api/v1/patients/{patient_id} PATCH' if any('/patients/{patient_id}' == r.path and 'PATCH' in r.methods for r in router.routes) else 'MISSING')"
```
Expected: no falla, `/patients/{patient_id}` está registrado como `GET` y `PATCH`.

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat(api): PATCH /patients/{id} partial update with audit

Accepts any subset of PatientUpdate fields. exclude_unset preserves
'no se envió' vs 'se envió null' semantics — optional fields can be
cleared via explicit null; the 3 required fields reject empty strings
via min_length=1. Ownership: 404 on not-owned. Audits fields_changed
(names only)."
```

---

## Task 6: Backend tests — create / get / update

**Files:**
- Create: `backend/tests/test_patient_create.py`
- Create: `backend/tests/test_patient_get.py`
- Create: `backend/tests/test_patient_update.py`

Estos tests dependen de poder mockear `log_audit` y `get_current_psychologist`. Usan los mismos fixtures que `test_api_routes.py` — lo más simple es copiar el pattern del fixture `app` allí.

- [ ] **Step 1: Crear shared helpers en conftest**

Leer `backend/tests/conftest.py`. Al final del archivo, agregar:

```python
from unittest.mock import patch as _patch
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def fake_psychologist():
    psy = MagicMock()
    psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
    psy.is_active = True
    return psy


@pytest.fixture
def authed_app(mock_db, fake_psychologist):
    """FastAPI app with DB + auth mocked for integration tests."""
    with _patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db
        from api.auth import get_current_psychologist

        async def override_get_db():
            yield mock_db

        async def override_current_user():
            return fake_psychologist

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()
```

- [ ] **Step 2: Crear `test_patient_create.py` — test del happy path**

```python
"""Tests for POST /patients — intake creation."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_full_payload_returns_201(authed_app, mock_db):
    """Payload con los 10 campos → 201, todos persisten."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        # Capturar el Patient que se inserta (el primero; el segundo es PatientProfile)
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    full_payload = {
        "name": "María López",
        "date_of_birth": "1985-03-15",
        "reason_for_consultation": "Ansiedad laboral",
        "marital_status": "casado",
        "occupation": "Ingeniera",
        "address": "Av. Reforma 123, CDMX",
        "emergency_contact": {
            "name": "Pedro López",
            "relationship": "esposo",
            "phone": "5512345678",
        },
        "medical_history": "Hipertensión controlada",
        "psychological_history": "TCC previo 2022",
    }

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post("/api/v1/patients", json=full_payload)

    assert res.status_code == 201
    p = captured["patient"]
    assert p.name == "María López"
    assert p.date_of_birth == date(1985, 3, 15)
    assert p.reason_for_consultation == "Ansiedad laboral"
    assert p.marital_status == "casado"
    assert p.emergency_contact == {
        "name": "Pedro López", "relationship": "esposo", "phone": "5512345678",
    }


@pytest.mark.asyncio
async def test_minimum_payload_returns_201(authed_app, mock_db):
    """Solo los 3 obligatorios → 201."""
    pid = uuid.uuid4()

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Depresión",
            },
        )

    assert res.status_code == 201


@pytest.mark.asyncio
async def test_missing_date_of_birth_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={"name": "X", "reason_for_consultation": "Y"},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_missing_reason_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={"name": "X", "date_of_birth": "1990-01-01"},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_future_dob_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "2099-01-01",
                "reason_for_consultation": "Y",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_too_old_dob_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1800-01-01",
                "reason_for_consultation": "Y",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_invalid_marital_status_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Y",
                "marital_status": "whatever",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_incomplete_emergency_contact_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Y",
                "emergency_contact": {"name": "Solo nombre"},
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_audit_log_written_without_clinical_values(authed_app, mock_db):
    pid = uuid.uuid4()
    added = []

    def capture_add(obj):
        added.append(obj)
        if type(obj).__name__ == "Patient":
            obj.id = pid
    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        await client.post(
            "/api/v1/patients",
            json={
                "name": "Audit Test",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Motivo",
                "medical_history": "DATO CLINICO PRIVADO",
            },
        )

    audit_entries = [o for o in added if type(o).__name__ == "AuditLog"]
    assert len(audit_entries) == 1
    a = audit_entries[0]
    assert a.action == "CREATE"
    assert a.entity == "patient"
    # Solo nombres, nunca valores
    import json
    extra_str = json.dumps(a.extra) if a.extra else ""
    assert "DATO CLINICO PRIVADO" not in extra_str
    assert "Motivo" not in extra_str
    assert "fields_set" in a.extra
    assert "medical_history" in a.extra["fields_set"]
```

- [ ] **Step 3: Correr test_patient_create.py**

Run:
```bash
cd backend && pytest tests/test_patient_create.py -v
```
Expected: 9 tests PASS.

- [ ] **Step 4: Crear `test_patient_get.py`**

```python
"""Tests for GET /patients/{id}."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


def _make_patient(psy_id, pid):
    p = MagicMock()
    p.id = pid
    p.psychologist_id = psy_id
    p.name = "Test"
    p.date_of_birth = date(1990, 1, 1)
    p.diagnosis_tags = []
    p.risk_level = "low"
    p.marital_status = "soltero"
    p.occupation = "Doc"
    p.address = "Addr"
    p.emergency_contact = {"name": "X", "relationship": "Y", "phone": "1234567"}
    p.reason_for_consultation = "Motivo"
    p.medical_history = None
    p.psychological_history = None
    p.deleted_at = None
    return p


@pytest.mark.asyncio
async def test_returns_full_patient(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{pid}")

    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Test"
    assert body["marital_status"] == "soltero"
    assert body["emergency_contact"] == {
        "name": "X", "relationship": "Y", "phone": "1234567",
    }


@pytest.mark.asyncio
async def test_returns_404_for_other_psychologist(authed_app, mock_db):
    other_psy = uuid.UUID("11111111-1111-1111-1111-111111111111")
    pid = uuid.uuid4()
    patient = _make_patient(other_psy, pid)  # dueño distinto
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{pid}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_returns_404_when_not_found(authed_app, mock_db):
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{uuid.uuid4()}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_returns_400_for_invalid_uuid(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get("/api/v1/patients/not-a-uuid")
    assert res.status_code == 400
```

- [ ] **Step 5: Correr test_patient_get.py**

Run:
```bash
cd backend && pytest tests/test_patient_get.py -v
```
Expected: 4 tests PASS.

- [ ] **Step 6: Crear `test_patient_update.py`**

```python
"""Tests for PATCH /patients/{id}."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


def _make_patient(psy_id, pid, **overrides):
    p = MagicMock()
    p.id = pid
    p.psychologist_id = psy_id
    p.name = "Orig"
    p.date_of_birth = date(1990, 1, 1)
    p.diagnosis_tags = []
    p.risk_level = "low"
    p.marital_status = None
    p.occupation = None
    p.address = None
    p.emergency_contact = None
    p.reason_for_consultation = "Motivo orig"
    p.medical_history = None
    p.psychological_history = None
    p.deleted_at = None
    for k, v in overrides.items():
        setattr(p, k, v)
    return p


@pytest.mark.asyncio
async def test_patch_single_field(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": "Nueva ocupación"},
        )

    assert res.status_code == 200
    # Campo modificado
    assert patient.occupation == "Nueva ocupación"
    # Campos no modificados intactos
    assert patient.name == "Orig"
    assert patient.reason_for_consultation == "Motivo orig"


@pytest.mark.asyncio
async def test_patch_clears_optional_field_with_null(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(
        fake_psychologist.id, pid,
        occupation="Antigua",
        emergency_contact={"name": "X", "relationship": "Y", "phone": "1234567"},
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": None, "emergency_contact": None},
        )

    assert res.status_code == 200
    assert patient.occupation is None
    assert patient.emergency_contact is None


@pytest.mark.asyncio
async def test_patch_cannot_clear_required_field(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        # String vacío → 422 por min_length=1
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"name": ""},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_other_psychologist_returns_404(authed_app, mock_db):
    other_psy = uuid.UUID("22222222-2222-2222-2222-222222222222")
    pid = uuid.uuid4()
    patient = _make_patient(other_psy, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": "X"},
        )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_audit_log_has_fields_changed_only(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    added = []
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result
    mock_db.add.side_effect = lambda o: added.append(o)

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        await client.patch(
            f"/api/v1/patients/{pid}",
            json={
                "occupation": "Nueva",
                "address": "Calle Secreta 42",  # valor sensible — no debe aparecer en audit
            },
        )

    audits = [o for o in added if type(o).__name__ == "AuditLog"]
    assert len(audits) == 1
    a = audits[0]
    assert a.action == "UPDATE"
    import json
    extra_str = json.dumps(a.extra)
    assert "Calle Secreta" not in extra_str
    assert "Nueva" not in extra_str
    assert set(a.extra["fields_changed"]) == {"occupation", "address"}
```

- [ ] **Step 7: Correr test_patient_update.py**

Run:
```bash
cd backend && pytest tests/test_patient_update.py -v
```
Expected: 5 tests PASS.

- [ ] **Step 8: Correr toda la suite backend**

Run:
```bash
cd backend && pytest -q
```
Expected: toda la suite PASS (incluyendo los tests pre-existentes — el fixture override de auth no debe romperlos).

- [ ] **Step 9: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_patient_create.py backend/tests/test_patient_get.py backend/tests/test_patient_update.py
git commit -m "test: backend coverage for patient intake CRUD

Shared authed_app + fake_psychologist fixtures. Create: payload min/full,
validation errors, audit-has-no-clinical-values. Get: ownership 404.
Update: single-field, clearing-with-null, required-not-clearable,
ownership 404, audit fields_changed-only."
```

---

# FASE 3 — Frontend

## Task 7: Helper `calculateAge` + tests

**Files:**
- Create: `frontend/src/utils/age.js`
- Create: `frontend/src/utils/age.test.js`

- [ ] **Step 1: Crear helper**

```js
// frontend/src/utils/age.js

/**
 * Returns age in years as an integer, or null for invalid inputs.
 * Accepts Date, ISO string "YYYY-MM-DD", or any value parseable by new Date().
 */
export function calculateAge(dateOfBirth) {
  if (dateOfBirth == null || dateOfBirth === '') return null;

  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  if (age < 0 || age > 120) return null;
  return age;
}
```

- [ ] **Step 2: Crear tests**

```js
// frontend/src/utils/age.test.js
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { calculateAge } from './age'

describe('calculateAge', () => {
  const FIXED_NOW = new Date('2026-04-16T12:00:00Z')

  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterAll(() => vi.useRealTimers())

  it('devuelve edad cumplida cuando el cumpleaños ya pasó', () => {
    expect(calculateAge('1990-01-01')).toBe(36)
  })

  it('resta un año cuando el cumpleaños aún no llega', () => {
    expect(calculateAge('1990-12-31')).toBe(35)
  })

  it('devuelve 0 para bebés nacidos hace meses', () => {
    expect(calculateAge('2026-01-01')).toBe(0)
  })

  it('acepta instancias Date', () => {
    expect(calculateAge(new Date('1985-05-15'))).toBe(40)
  })

  it('devuelve null para null', () => {
    expect(calculateAge(null)).toBe(null)
  })

  it('devuelve null para string vacío', () => {
    expect(calculateAge('')).toBe(null)
  })

  it('devuelve null para fecha inválida', () => {
    expect(calculateAge('no-es-fecha')).toBe(null)
  })

  it('devuelve null para fecha futura', () => {
    expect(calculateAge('2099-01-01')).toBe(null)
  })

  it('devuelve null para fecha hace > 120 años', () => {
    expect(calculateAge('1800-01-01')).toBe(null)
  })
})
```

- [ ] **Step 3: Correr los tests**

Run (desde `frontend/`):
```bash
npm test -- utils/age.test.js --run
```
Expected: 9 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/age.js frontend/src/utils/age.test.js
git commit -m "feat(ui): calculateAge helper for intake form

Pure function, handles null/empty/invalid/future/too-old as null.
9 unit tests, fake timers for deterministic current-date."
```

---

## Task 8: Ampliar `api.js` — createPatient nuevo + getPatient + updatePatient

**Files:**
- Modify: `frontend/src/api.js` (líneas 95-100)

- [ ] **Step 1: Reescribir `createPatient` y agregar helpers**

Reemplazar la función `createPatient` (líneas 95-100) por:

```js
/**
 * Create a patient with full intake payload.
 *
 * payload shape:
 *   {
 *     name: string,
 *     date_of_birth: "YYYY-MM-DD",
 *     reason_for_consultation: string,
 *     marital_status?: string,
 *     occupation?: string,
 *     address?: string,
 *     emergency_contact?: { name, relationship, phone },
 *     medical_history?: string,
 *     psychological_history?: string,
 *     risk_level?: string,
 *   }
 */
export async function createPatient(payload) {
  const body = { risk_level: 'low', ...payload };
  return await _authFetch(`${API_BASE}/patients`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getPatient(patientId) {
  return await _authFetch(`${API_BASE}/patients/${patientId}`);
}

export async function updatePatient(patientId, patch) {
  return await _authFetch(`${API_BASE}/patients/${patientId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
```

- [ ] **Step 2: Encontrar y actualizar todos los call sites de `createPatient(name)`**

Run:
```bash
grep -rn "createPatient(" frontend/src --include="*.jsx" --include="*.js"
```

Esperar resultados en `App.jsx:373` y en tests (que se actualizan en Task 9-10). Abrir `frontend/src/App.jsx` en la línea 370-390 y reemplazar `handleSavePatient`:

```js
const handleSavePatient = async () => {
  // Legacy chat-style inline patient creation — deprecated.
  // PatientIntakeModal is the primary creation path (see handleModalPatientCreated).
  if (!newPatientName.trim()) return;
  alert("Por favor usa el botón Nuevo Paciente — ahora pide datos clínicos adicionales.");
  setIsCreatingPatient(true);
};
```

**Nota:** El nuevo flujo obliga fecha de nacimiento + motivo de consulta; el inline input de chat ya no es suficiente. Reemplazar la función con el stub de arriba preserva la ruta de UI por si algo más invoca `handleSavePatient`, y fuerza al usuario al modal.

- [ ] **Step 3: Verificar que no hay llamadas directas a `createPatient(name)` que vayan a romper**

Run:
```bash
grep -rn "createPatient(" frontend/src --include="*.jsx" --include="*.js" | grep -v "\.test\." | grep -v "vi.fn"
```
Expected: solo ocurrencias dentro de componentes que manejen el payload completo (PatientIntakeModal después de Task 9).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js frontend/src/App.jsx
git commit -m "feat(ui): api.js wrappers for patient CRUD with full intake

createPatient now takes a payload object (was name-only). Adds
getPatient and updatePatient. App.jsx legacy inline-create path
redirects to the modal."
```

---

## Task 9: `PatientIntakeModal` — rename + ampliar

**Files:**
- Rename: `frontend/src/components/NewPatientModal.jsx` → `PatientIntakeModal.jsx`
- Rename: `frontend/src/components/NewPatientModal.test.jsx` → `PatientIntakeModal.test.jsx`
- Modify: ambos archivos renombrados
- Modify: `frontend/src/App.jsx` — import + uso

Vamos por TDD invertido aquí: primero renombrar y ampliar la lógica, después ampliar los tests (el componente es denso y los tests salen más naturales después de tener la UI definida).

- [ ] **Step 1: Renombrar los dos archivos (component + test)**

Run:
```bash
git mv frontend/src/components/NewPatientModal.jsx frontend/src/components/PatientIntakeModal.jsx
git mv frontend/src/components/NewPatientModal.test.jsx frontend/src/components/PatientIntakeModal.test.jsx
```

- [ ] **Step 2: Reescribir `PatientIntakeModal.jsx`**

Reemplazar todo el contenido del archivo por:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { createPatient, getPatient, updatePatient } from '../api';
import { calculateAge } from '../utils/age';

/**
 * PatientIntakeModal
 *
 * Reusable modal for creating OR editing a patient expediente.
 *
 * Props:
 *   - open: boolean
 *   - mode: "create" | "edit"
 *   - initialPatient: null | { id } — in edit mode, id used to GET full record
 *   - onClose: () => void
 *   - onSaved: (patient) => void
 */

const MARITAL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'soltero', label: 'Soltero/a' },
  { value: 'casado', label: 'Casado/a' },
  { value: 'divorciado', label: 'Divorciado/a' },
  { value: 'viudo', label: 'Viudo/a' },
  { value: 'union_libre', label: 'Unión libre' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_FORM = {
  name: '',
  date_of_birth: '',
  reason_for_consultation: '',
  marital_status: '',
  occupation: '',
  address: '',
  ec_name: '',
  ec_relationship: '',
  ec_phone: '',
  medical_history: '',
  psychological_history: '',
};

function toForm(patient) {
  if (!patient) return EMPTY_FORM;
  const ec = patient.emergency_contact || {};
  return {
    name: patient.name || '',
    date_of_birth: patient.date_of_birth || '',
    reason_for_consultation: patient.reason_for_consultation || '',
    marital_status: patient.marital_status || '',
    occupation: patient.occupation || '',
    address: patient.address || '',
    ec_name: ec.name || '',
    ec_relationship: ec.relationship || '',
    ec_phone: ec.phone || '',
    medical_history: patient.medical_history || '',
    psychological_history: patient.psychological_history || '',
  };
}

function buildPayload(form, { patchMode }) {
  const ec_any = form.ec_name || form.ec_relationship || form.ec_phone;
  const emergency_contact = ec_any
    ? { name: form.ec_name.trim(), relationship: form.ec_relationship.trim(), phone: form.ec_phone.trim() }
    : null;

  const base = {
    name: form.name.trim(),
    date_of_birth: form.date_of_birth || null,
    reason_for_consultation: form.reason_for_consultation.trim(),
    marital_status: form.marital_status || null,
    occupation: form.occupation.trim() || null,
    address: form.address.trim() || null,
    emergency_contact,
    medical_history: form.medical_history.trim() || null,
    psychological_history: form.psychological_history.trim() || null,
  };

  if (patchMode) return base; // PATCH acepta null explícitos para limpiar

  // CREATE: omitir nulls — Pydantic usa default
  const clean = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== null && v !== '') clean[k] = v;
  }
  return clean;
}

export default function PatientIntakeModal({ open, mode = 'create', initialPatient = null, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = mode === 'edit';
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!open) return;
    if (isEdit && initialPatient?.id) {
      setLoading(true);
      getPatient(initialPatient.id)
        .then((p) => { setForm(toForm(p)); setError(null); })
        .catch((e) => setError(e.message || 'No se pudo cargar el expediente'))
        .finally(() => setLoading(false));
    } else {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open, isEdit, initialPatient?.id]);

  if (!open) return null;

  const age = calculateAge(form.date_of_birth);

  // Contacto emergencia: si uno está, los tres son obligatorios
  const ecAny = form.ec_name || form.ec_relationship || form.ec_phone;
  const ecAll = form.ec_name && form.ec_relationship && form.ec_phone;
  const ecInvalid = ecAny && !ecAll;

  const canSubmit =
    form.name.trim() &&
    form.date_of_birth &&
    form.reason_for_consultation.trim() &&
    !ecInvalid &&
    !saving &&
    !loading;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload(form, { patchMode: isEdit });
      const saved = isEdit
        ? await updatePatient(initialPatient.id, payload)
        : await createPatient(payload);
      onSaved?.(saved);
      if (!isEdit) setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el expediente');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving || loading) return;
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div
      id="patient-intake-modal-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4"
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">
              {isEdit ? 'Expediente clínico' : 'Nuevo expediente'}
            </span>
            <h2 className="text-[#18181b] text-lg font-semibold leading-snug">
              {isEdit ? 'Editar expediente' : 'Registrar paciente'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#18181b] hover:bg-black/[0.04] transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Aviso LFPDPPP */}
        <div className="mx-6 mb-4 bg-[#f4f4f2] rounded-lg px-3 py-2 flex items-start gap-2">
          <svg className="w-4 h-4 text-[#5a9e8a] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[12px] text-ink-secondary leading-snug">
            Estos datos se guardan cifrados y solo tú los ves. Art. 8 LFPDPPP.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-6">
          {loading && (
            <p className="text-ink-tertiary text-[13px]">Cargando expediente…</p>
          )}

          {/* IDENTIDAD */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Identidad</h3>

            <Field label="Nombre completo" required>
              <input
                type="text"
                value={form.name}
                onChange={setField('name')}
                autoFocus
                disabled={saving || loading}
                placeholder="Ej. María García López"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de nacimiento" required hint={age != null ? `Edad: ${age}` : null}>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={setField('date_of_birth')}
                  disabled={saving || loading}
                  max={todayIso}
                  className={inputClass}
                />
              </Field>
              <Field label="Estado civil">
                <select
                  value={form.marital_status}
                  onChange={setField('marital_status')}
                  disabled={saving || loading}
                  className={inputClass}
                >
                  {MARITAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Ocupación">
              <input
                type="text"
                value={form.occupation}
                onChange={setField('occupation')}
                disabled={saving || loading}
                placeholder="Ej. Docente, ingeniera, estudiante"
                className={inputClass}
              />
            </Field>
          </section>

          {/* CONTACTO */}
          <section className="flex flex-col gap-3 pt-4 border-t border-ink/[0.06]">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Contacto</h3>

            <Field label="Domicilio">
              <textarea
                value={form.address}
                onChange={setField('address')}
                disabled={saving || loading}
                rows={2}
                placeholder="Calle, número, colonia, ciudad"
                className={inputClass}
              />
            </Field>

            <div>
              <p className="text-[12px] font-medium text-[#18181b] mb-2">Contacto de emergencia</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={form.ec_name}
                  onChange={setField('ec_name')}
                  disabled={saving || loading}
                  placeholder="Nombre"
                  className={inputClass}
                  aria-label="Contacto de emergencia — nombre"
                />
                <input
                  type="text"
                  value={form.ec_relationship}
                  onChange={setField('ec_relationship')}
                  disabled={saving || loading}
                  placeholder="Parentesco"
                  className={inputClass}
                  aria-label="Contacto de emergencia — parentesco"
                />
                <input
                  type="tel"
                  value={form.ec_phone}
                  onChange={setField('ec_phone')}
                  disabled={saving || loading}
                  placeholder="Teléfono"
                  className={inputClass}
                  aria-label="Contacto de emergencia — teléfono"
                />
              </div>
              {ecInvalid && (
                <p className="text-red-600 text-[12px] mt-1.5">
                  Completa nombre, parentesco y teléfono, o deja los tres vacíos.
                </p>
              )}
            </div>
          </section>

          {/* CLÍNICO */}
          <section className="flex flex-col gap-3 pt-4 border-t border-ink/[0.06]">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Clínico</h3>

            <Field label="Motivo de consulta" required>
              <textarea
                value={form.reason_for_consultation}
                onChange={setField('reason_for_consultation')}
                disabled={saving || loading}
                rows={3}
                placeholder="¿Qué trae al paciente a consulta?"
                className={inputClass}
              />
            </Field>

            <Field label="Historial médico relevante">
              <textarea
                value={form.medical_history}
                onChange={setField('medical_history')}
                disabled={saving || loading}
                rows={3}
                placeholder="Enfermedades crónicas, medicación actual, cirugías"
                className={inputClass}
              />
            </Field>

            <Field label="Historial psicológico">
              <textarea
                value={form.psychological_history}
                onChange={setField('psychological_history')}
                disabled={saving || loading}
                rows={3}
                placeholder="Tratamientos previos, diagnósticos, hospitalizaciones"
                className={inputClass}
              />
            </Field>
          </section>

          {error && (
            <p className="text-red-600 text-[13px] bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 sticky bottom-0 bg-white pt-4 pb-1 -mx-6 px-6 border-t border-ink/[0.06]">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving || loading}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all ${
                !canSubmit ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed' : 'bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98]'
              }`}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all disabled:opacity-60';

function Field({ label, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-[#18181b] flex items-center gap-2">
        <span>
          {label} {required && <span className="text-red-400">*</span>}
        </span>
        {hint && <span className="text-[11px] text-ink-tertiary font-normal">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Actualizar `App.jsx` para usar `PatientIntakeModal`**

En `frontend/src/App.jsx`:

1. Reemplazar el import (línea 7):
```js
import PatientIntakeModal from './components/PatientIntakeModal'
```

2. Reemplazar el `<NewPatientModal .../>` (líneas 928-933) por:
```jsx
{/* PatientIntakeModal — crear o editar expediente */}
<PatientIntakeModal
  open={isCreatingPatient || editingPatientId != null}
  mode={editingPatientId != null ? 'edit' : 'create'}
  initialPatient={editingPatientId != null ? { id: editingPatientId } : null}
  onClose={() => {
    setIsCreatingPatient(false);
    setEditingPatientId(null);
  }}
  onSaved={(patient) => {
    if (editingPatientId != null) {
      // EDIT — update conversation entry with fresh name
      setConversations((prev) => prev.map((c) =>
        c.patient_id === String(patient.id) ? { ...c, patient_name: patient.name } : c
      ));
      setEditingPatientId(null);
    } else {
      // CREATE
      handleModalPatientCreated(patient);
    }
  }}
/>
```

3. Agregar estado nuevo `editingPatientId` junto a `isCreatingPatient` (buscar `useState.*isCreatingPatient` en el archivo):
```js
const [editingPatientId, setEditingPatientId] = useState(null);
```

- [ ] **Step 4: Smoke test: el frontend compila**

Run (desde `frontend/`):
```bash
npm run build
```
Expected: build pasa sin errores. Si hay errores de import sobre `NewPatientModal`, buscarlos y actualizarlos.

- [ ] **Step 5: Reescribir `PatientIntakeModal.test.jsx`**

Reemplazar todo el contenido del archivo por:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import PatientIntakeModal from './PatientIntakeModal'

vi.mock('../api', () => ({
  createPatient: vi.fn(),
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
}))

import { createPatient, getPatient, updatePatient } from '../api'

const noop = () => {}

describe('PatientIntakeModal', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  beforeEach(() => {
    createPatient.mockReset()
    getPatient.mockReset()
    updatePatient.mockReset()
  })

  it('no renderiza cuando open=false', () => {
    const { container } = render(<PatientIntakeModal open={false} onClose={noop} onSaved={noop} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza título "Registrar paciente" en modo create', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    expect(screen.getByText('Registrar paciente')).toBeInTheDocument()
  })

  it('renderiza título "Editar expediente" en modo edit y hace GET', async () => {
    getPatient.mockResolvedValueOnce({
      id: 42, name: 'Ana', date_of_birth: '1990-01-01', reason_for_consultation: 'Ansiedad',
      emergency_contact: null,
    })
    render(
      <PatientIntakeModal open={true} mode="edit" initialPatient={{ id: 42 }} onClose={noop} onSaved={noop} />
    )
    await waitFor(() => expect(getPatient).toHaveBeenCalledWith(42))
    expect(screen.getByText('Editar expediente')).toBeInTheDocument()
  })

  it('muestra aviso LFPDPPP', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    expect(screen.getByText(/Art\. 8 LFPDPPP/)).toBeInTheDocument()
  })

  it('submit deshabilitado hasta llenar los 3 obligatorios', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    const submit = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    expect(submit).toBeDisabled()

    const dob = screen.getByLabelText(/Fecha de nacimiento/)
    await user.type(dob, '1990-01-01')
    expect(submit).toBeDisabled()

    const reason = screen.getByPlaceholderText(/Qué trae al paciente/)
    await user.type(reason, 'Ansiedad')
    expect(submit).not.toBeDisabled()
  })

  it('muestra edad calculada al elegir fecha', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    expect(screen.getByText(/Edad: 36/)).toBeInTheDocument()
  })

  it('contacto emergencia: parcial → submit deshabilitado + mensaje', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    // Llenar los 3 obligatorios
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')

    // Escribir solo el nombre del contacto → inválido
    await user.type(screen.getByLabelText(/Contacto de emergencia — nombre/), 'Pedro')

    const submit = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/Completa nombre, parentesco y teléfono/)).toBeInTheDocument()
  })

  it('mode=create llama createPatient con payload limpio', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onSaved = vi.fn()
    createPatient.mockResolvedValueOnce({ id: 7, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(createPatient).toHaveBeenCalledTimes(1)
    })
    const payload = createPatient.mock.calls[0][0]
    expect(payload.name).toBe('Ana')
    expect(payload.date_of_birth).toBe('1990-01-01')
    expect(payload.reason_for_consultation).toBe('Ansiedad')
    // Campos vacíos NO deben estar en el payload de create
    expect(payload).not.toHaveProperty('occupation')
    expect(payload).not.toHaveProperty('emergency_contact')
    expect(onSaved).toHaveBeenCalledWith({ id: 7, name: 'Ana' })
  })

  it('mode=edit llama updatePatient con patch incluyendo nulls explícitos', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onSaved = vi.fn()
    getPatient.mockResolvedValueOnce({
      id: 9,
      name: 'Ana',
      date_of_birth: '1990-01-01',
      reason_for_consultation: 'Orig',
      occupation: 'Antigua',
      emergency_contact: null,
    })
    updatePatient.mockResolvedValueOnce({ id: 9, name: 'Ana', occupation: '' })

    render(<PatientIntakeModal open={true} mode="edit" initialPatient={{ id: 9 }} onClose={noop} onSaved={onSaved} />)

    await waitFor(() => expect(getPatient).toHaveBeenCalled())

    // Borrar la ocupación
    const occInput = screen.getByPlaceholderText(/Ej\. Docente/)
    await user.clear(occInput)

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => expect(updatePatient).toHaveBeenCalledTimes(1))
    const [id, patch] = updatePatient.mock.calls[0]
    expect(id).toBe(9)
    expect(patch.occupation).toBeNull()  // PATCH sí incluye null explícito
  })

  it('muestra error inline si el API falla', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockRejectedValueOnce(new Error('Nombre duplicado'))

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(screen.getByText('Nombre duplicado')).toBeInTheDocument())
  })

  it('click en Cancelar llama onClose', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    render(<PatientIntakeModal open={true} mode="create" onClose={onClose} onSaved={noop} />)
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('click en X llama onClose', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    render(<PatientIntakeModal open={true} mode="create" onClose={onClose} onSaved={noop} />)
    await user.click(screen.getByRole('button', { name: /Cerrar/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Correr los tests del modal**

Run (desde `frontend/`):
```bash
npm test -- PatientIntakeModal.test.jsx --run
```
Expected: 11 tests PASS.

- [ ] **Step 7: Arreglar integration test si existe**

Run:
```bash
grep -rn "NewPatientModal\|createPatient" frontend/src/App.integration.test.jsx
```

Si `createPatient` es llamado en el test con un string y ya no con objeto, actualizar el mock. Ejemplo: si el test hace `expect(createPatient).toHaveBeenCalledWith('Ana')`, cambiar a:
```js
expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }))
```

Correr:
```bash
npm test -- App.integration.test.jsx --run
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src/
git commit -m "feat(ui): PatientIntakeModal reusable for create + edit

Renames NewPatientModal → PatientIntakeModal. 3 visual sections
(Identidad / Contacto / Clínico), LFPDPPP notice, age derived from
DOB. Emergency contact is all-or-nothing. CREATE strips null/empty;
PATCH includes explicit null to allow clearing optional fields. Edit
mode GETs the patient to pre-fill. 11 unit tests."
```

---

## Task 10: Botón "Editar expediente" en PatientHeader

**Files:**
- Modify: `frontend/src/components/PatientHeader.jsx`
- Modify: `frontend/src/App.jsx` (callback `onEditPatient` + pasar al PatientHeader)

- [ ] **Step 1: Ampliar props de PatientHeader**

En `PatientHeader.jsx`, ampliar la firma:

```jsx
export default function PatientHeader({
  patientName,
  sessionCount = 0,
  compact = false,
  mode = 'session',
  onModeChange,
  patientId = null,
  onEditPatient = null,
}) {
```

Y justo antes del `{onModeChange && ( ... )}` (línea 53 en el original), agregar el botón de edición:

```jsx
{onEditPatient && patientId && (
  <button
    onClick={() => onEditPatient(patientId)}
    className="ml-2 p-1.5 rounded-lg text-ink-tertiary hover:text-[#5a9e8a] hover:bg-black/[0.04] transition-colors"
    aria-label="Editar expediente"
    title="Editar expediente"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  </button>
)}
```

- [ ] **Step 2: Wire del botón en App.jsx**

Buscar todas las instancias de `<PatientHeader` en `App.jsx` (habrá al menos 1 en desktop). Agregar las props:

```jsx
<PatientHeader
  patientName={...}
  sessionCount={...}
  /* props existentes */
  patientId={selectedPatientId}
  onEditPatient={(id) => setEditingPatientId(id)}
/>
```

- [ ] **Step 3: QA manual del flujo de edición**

Arrancar backend y frontend:
```bash
docker-compose up -d postgres
cd backend && uvicorn main:app --reload
# en otra terminal:
cd frontend && npm run dev
```

En el navegador:
1. Login.
2. Crear paciente vía el modal (todos los campos).
3. Seleccionarlo en el sidebar.
4. Click en el icono ✎ al lado del nombre en el header.
5. Verificar que el modal abre en modo Edit con los datos pre-llenados.
6. Modificar un campo → Guardar → verificar que el cambio se refleja en la UI.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PatientHeader.jsx frontend/src/App.jsx
git commit -m "feat(ui): edit expediente button in PatientHeader

Pencil icon next to patient name in desktop header. Opens
PatientIntakeModal in edit mode. Conversation entry name
syncs on save."
```

---

# FASE 4 — Seed

## Task 11: Datos de intake en seed.py y seed_demo.py

**Files:**
- Modify: `backend/seed.py`
- Modify: `backend/seed_demo.py`

- [ ] **Step 1: Inspeccionar seed.py y seed_demo.py**

Run:
```bash
grep -n "Patient(" backend/seed.py backend/seed_demo.py
```

Para cada `Patient(...)` que encuentres, agregar los campos nuevos con valores de ejemplo coherentes con el paciente existente. Ejemplo (ajustar a los pacientes que ya existen):

```python
Patient(
    name="Ana García",
    risk_level="medium",
    # Nuevos intake fields
    date_of_birth=date(1988, 7, 22),
    marital_status="casado",
    occupation="Docente de primaria",
    address="Av. Revolución 456, Col. Centro, Culiacán",
    emergency_contact={
        "name": "Luis García",
        "relationship": "esposo",
        "phone": "6671234567",
    },
    reason_for_consultation="Ansiedad relacionada con carga laboral y conflictos familiares",
    medical_history="Hipotiroidismo en tratamiento con levotiroxina",
    psychological_history="Terapia cognitivo-conductual previa en 2022 (10 sesiones)",
    ...
)
```

Variar los valores entre pacientes demo (diferentes edades, estados civiles, motivos) para que el UI se pruebe con datos realistas.

- [ ] **Step 2: Correr seed y verificar**

Run:
```bash
cd backend && python seed.py
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "SELECT name, marital_status, occupation, reason_for_consultation FROM patients;"
```
Expected: los pacientes demo aparecen con los campos nuevos rellenos.

Si usas seed_demo:
```bash
cd backend && python seed_demo.py
```

- [ ] **Step 3: Commit**

```bash
git add backend/seed.py backend/seed_demo.py
git commit -m "feat(seed): populate intake fields in demo patients

Ensures the UI can be tested end-to-end with realistic data including
DOB, occupation, emergency contact, and clinical history."
```

---

# FASE 5 — Verificación final

## Task 12: Suite completa + smoke test manual

- [ ] **Step 1: Backend suite**

Run:
```bash
cd backend && pytest -q
```
Expected: toda la suite PASS.

- [ ] **Step 2: Frontend suite**

Run:
```bash
cd frontend && npm test -- --run
```
Expected: toda la suite PASS.

- [ ] **Step 3: Build frontend**

Run:
```bash
cd frontend && npm run build
```
Expected: build exitoso sin warnings de import/export.

- [ ] **Step 4: QA manual end-to-end (usando el QA checklist del spec)**

Arrancar local:
```bash
docker-compose up -d postgres
cd backend && uvicorn main:app --reload
cd frontend && npm run dev
```

Checklist:
- [ ] Crear paciente con **todos** los campos → aparece en sidebar.
- [ ] Crear paciente con **solo los 3 mínimos** → 201 y aparece.
- [ ] Intentar crear sin `date_of_birth` → submit deshabilitado.
- [ ] Intentar crear con `emergency_contact` parcial → submit deshabilitado + mensaje.
- [ ] Editar paciente existente desde el botón ✎ → modal se pre-llena.
- [ ] En edit mode: borrar `occupation` → persiste como `null`.
- [ ] En edit mode: intentar dejar `name` vacío → submit deshabilitado.
- [ ] Verificar audit log:
  ```bash
  docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c \
    "SELECT action, entity, extra FROM audit_logs WHERE entity='patient' ORDER BY timestamp DESC LIMIT 5;"
  ```
  → verificar que `extra` solo tiene nombres de campos, nunca valores clínicos.
- [ ] Abrir DevTools → Network → confirmar que `GET /patients/{id}` pasa el Authorization header.

- [ ] **Step 5: Push de la rama + abrir PR a dev**

```bash
git push -u origin feature/expanded-patient-intake
gh pr create --base dev --title "feat: expanded patient intake (3+6 fields, LFPDPPP audit)" --body "$(cat <<'EOF'
## Summary
- 7 nuevas columnas en `patients` (marital_status, occupation, address, emergency_contact JSONB, reason_for_consultation, medical_history, psychological_history)
- `POST /patients` ampliado, `GET /patients/{id}` y `PATCH /patients/{id}` nuevos con ownership → 404
- `NewPatientModal` → `PatientIntakeModal` reutilizable en modo create/edit con aviso LFPDPPP
- Audit log en CREATE/UPDATE sólo con nombres de campos (sin valores clínicos)
- Helper puro `calculateAge` + tests

## Test plan
- [ ] Backend suite verde (`cd backend && pytest -q`)
- [ ] Frontend suite verde (`cd frontend && npm test -- --run`)
- [ ] Build frontend verde (`npm run build`)
- [ ] QA manual: crear/editar paciente, 404 al acceder paciente ajeno, audit log limpio

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Execution Notes

- **TDD cadence:** en backend seguir test-first para Task 6. En frontend, por densidad visual, el componente se construye primero y los tests vienen inmediatamente después (Task 9 Step 5).
- **Commits:** un commit por Task cuando el scope es pequeño (Tasks 1, 2, 4, 5, 11, 12); múltiples commits cuando Task es grande (Task 3, 9, 10).
- **No hacer amend.** Si un test falla, nuevo commit con el fix.
- **Skill references:** Ninguna skill externa requerida. Este plan es auto-contenido.

## Referencias

- Spec: `docs/superpowers/specs/2026-04-16-expanded-patient-intake-design.md`
- CLAUDE.md: paleta de colores, branching strategy, patrones UI
- `backend/api/audit.py`: helper `log_audit` pre-existente
- `backend/api/auth.py:173`: `get_current_psychologist` dependency
- LFPDPPP Art. 8: consentimiento informado para datos sensibles
