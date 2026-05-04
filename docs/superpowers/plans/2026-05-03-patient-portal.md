# Patient Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un portal para pacientes donde reciban resúmenes post-sesión generados por Claude, revisados y aprobados por su psicólogo.

**Architecture:** Nueva tabla `patient_users` (credenciales del paciente) y `patient_summaries` (resúmenes aprobados). El psicólogo genera un resumen desde la nota SOAP o custom usando Claude, lo edita y lo envía. El paciente accede con JWT `role: "patient"` y ve su historial de resúmenes en un portal mobile-first dentro de la misma app React.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async, PostgreSQL, React 18 + Vite + Tailwind CDN, Claude claude-sonnet-4-6, Resend (email), PyJWT, bcrypt.

---

## File Map

### Backend — Nuevos archivos
- `backend/api/patient_auth.py` — Auth del paciente: accept-invite, login, refresh, logout
- `backend/api/patient_routes.py` — Portal: /patient/me, /me/summaries, /me/summaries/:id
- `backend/api/summary_routes.py` — Resúmenes lado psicólogo: generate, save, send

### Backend — Modificados
- `backend/database.py` — Modelos `PatientUser`, `PatientSummary`; columna `email` en `Patient`
- `backend/agent/agent.py` — Función `generate_patient_summary()`
- `backend/main.py` — Incluir los 3 routers nuevos
- `backend/config.py` — Constante `PATIENT_INVITE_EXPIRE_DAYS`

### Backend — Tests nuevos
- `backend/tests/test_patient_auth.py`
- `backend/tests/test_patient_routes.py`
- `backend/tests/test_summary_routes.py`
- `backend/tests/test_generate_summary.py`

### Frontend — Nuevos archivos
- `frontend/src/components/PatientSummarySection.jsx` — Sección colapsable en tab Nota
- `frontend/src/components/PatientPortal.jsx` — Contenedor portal paciente
- `frontend/src/components/SummaryList.jsx` — Lista de tarjetas de sesiones
- `frontend/src/components/SummaryDetail.jsx` — Detalle de un resumen
- `frontend/src/components/AcceptInvite.jsx` — Activación de cuenta con token

### Frontend — Modificados
- `frontend/src/App.jsx` — Routing por rol al login; rutas /portal y /invite/:token
- `frontend/src/api.js` — Endpoints nuevos
- `frontend/src/components/PatientIntakeModal.jsx` — Campo email del paciente

---

## Task 1: Feature branch

- [ ] **Crear rama desde dev**

```bash
git checkout dev
git pull origin dev
git checkout -b feature/patient-portal
```

- [ ] **Verificar rama activa**

```bash
git branch --show-current
# Expected: feature/patient-portal
```

---

## Task 2: Modelos SQLAlchemy

**Files:** Modify `backend/database.py`

- [ ] **Agregar columna `email` al modelo `Patient`**

En `database.py`, localizar la clase `Patient` y añadir después del campo `phone`:

```python
email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
```

- [ ] **Agregar modelo `PatientUser` al final de database.py (antes de `init_db`)**

```python
class PatientUser(Base):
    __tablename__ = "patient_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologists.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    invite_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    invite_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    patient: Mapped["Patient"] = relationship("Patient", foreign_keys=[patient_id])
    psychologist: Mapped["Psychologist"] = relationship("Psychologist", foreign_keys=[psychologist_id])
```

- [ ] **Agregar modelo `PatientSummary`**

```python
class PatientSummary(Base):
    __tablename__ = "patient_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    ai_draft: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topics_worked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    homework: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_session_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    session: Mapped["Session"] = relationship("Session", foreign_keys=[session_id])
    patient: Mapped["Patient"] = relationship("Patient", foreign_keys=[patient_id])
```

- [ ] **Agregar migración segura en `init_db()`**

Dentro de la función `init_db()`, después de `Base.metadata.create_all`, añadir:

```python
# Patient portal migrations
await conn.execute(text("""
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS email VARCHAR(255);
"""))
await conn.execute(text("""
    CREATE INDEX IF NOT EXISTS idx_patient_users_patient ON patient_users(patient_id);
"""))
await conn.execute(text("""
    CREATE INDEX IF NOT EXISTS idx_patient_users_psychologist ON patient_users(psychologist_id);
"""))
await conn.execute(text("""
    CREATE INDEX IF NOT EXISTS idx_patient_summaries_patient ON patient_summaries(patient_id);
"""))
await conn.execute(text("""
    CREATE INDEX IF NOT EXISTS idx_patient_summaries_session ON patient_summaries(session_id);
"""))
```

- [ ] **Verificar que los imports necesarios existan en database.py**

Asegurarse de que `Optional`, `date`, `Boolean`, `Text`, `String` estén importados. Añadir los que falten:

```python
from datetime import date  # añadir si no está
from sqlalchemy import Boolean, Text, String, Date  # verificar que estén
```

- [ ] **Arrancar PostgreSQL y verificar que init_db no falla**

```bash
docker-compose up -d postgres
cd backend
python -c "import asyncio; from database import init_db, engine; asyncio.run(init_db())"
# Expected: sin errores
```

- [ ] **Commit**

```bash
git add backend/database.py
git commit -m "feat: add PatientUser and PatientSummary models + email on Patient"
```

---

## Task 3: Config

**Files:** Modify `backend/config.py`

- [ ] **Agregar constante de expiración de invitación**

En la clase `Settings`, después de `REFRESH_TOKEN_EXPIRE_DAYS`:

```python
PATIENT_INVITE_EXPIRE_DAYS: int = 7
```

- [ ] **Commit**

```bash
git add backend/config.py
git commit -m "feat: add PATIENT_INVITE_EXPIRE_DAYS config"
```

---

## Task 4: generate_patient_summary() en agent.py

**Files:** Modify `backend/agent/agent.py`

- [ ] **Escribir el test que falla primero**

Crear `backend/tests/test_generate_summary.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

SOAP_NOTE = {
    "format": "SOAP",
    "subjective": "Paciente refiere ansiedad ante conflictos con pareja.",
    "objective": "Afecto ansioso moderado. Colaboradora durante sesión.",
    "assessment": "Pensamiento catastrófico ante situaciones ambiguas.",
    "plan": "Registro de pensamientos automáticos. Próxima sesión martes 20 de mayo.",
}

CUSTOM_NOTE = {
    "format": "custom",
    "custom_fields": {"Motivo": "Ansiedad", "Intervención": "TCC", "Tarea": "Diario emocional"},
}

EXPECTED_KEYS = {"topics_worked", "homework", "next_session_date"}

@pytest.mark.asyncio
async def test_generate_summary_soap_returns_three_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text='{"topics_worked": "Identificamos pensamientos automáticos.", "homework": "Registrar 3 momentos de ansiedad.", "next_session_date": "2025-05-20"}')]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        result = await generate_patient_summary(SOAP_NOTE)

    assert set(result.keys()) == EXPECTED_KEYS
    assert result["topics_worked"] != ""
    assert result["next_session_date"] == "2025-05-20"


@pytest.mark.asyncio
async def test_generate_summary_custom_returns_three_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text='{"topics_worked": "Trabajamos emociones.", "homework": "Diario emocional.", "next_session_date": null}')]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        result = await generate_patient_summary(CUSTOM_NOTE)

    assert set(result.keys()) == EXPECTED_KEYS
    assert result["next_session_date"] is None


@pytest.mark.asyncio
async def test_generate_summary_invalid_json_returns_empty_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text="No puedo procesar esto.")]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        result = await generate_patient_summary(SOAP_NOTE)

    assert result == {"topics_worked": "", "homework": "", "next_session_date": None}
```

- [ ] **Ejecutar tests — deben fallar**

```bash
cd backend
python -m pytest tests/test_generate_summary.py -v
# Expected: ImportError o AttributeError — generate_patient_summary no existe aún
```

- [ ] **Implementar `generate_patient_summary()` en agent.py**

Al final del archivo `backend/agent/agent.py`, añadir:

```python
_PATIENT_SUMMARY_PROMPT = """Eres un asistente clínico. A partir de la siguiente nota clínica, genera un resumen para el paciente en lenguaje simple y empático. NO incluyas diagnósticos, formulaciones clínicas, ni información sensible.

Extrae exactamente tres campos:
1. topics_worked: ¿Qué trabajamos hoy? (1-2 oraciones, lenguaje del paciente)
2. homework: ¿Cuál es la tarea para esta semana? (clara y accionable, o cadena vacía si no hay tarea)
3. next_session_date: Fecha de próxima sesión en formato YYYY-MM-DD, o null si no se menciona

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"topics_worked": "...", "homework": "...", "next_session_date": "YYYY-MM-DD o null"}"""


def _build_note_content(note_data: dict) -> str:
    """Serializa nota SOAP o custom a texto plano para el prompt."""
    fmt = note_data.get("format", "").upper()
    if fmt == "SOAP":
        parts = []
        for field, label in [("subjective", "Subjetivo"), ("objective", "Objetivo"),
                               ("assessment", "Análisis"), ("plan", "Plan")]:
            val = note_data.get(field) or ""
            if val:
                parts.append(f"{label}: {val}")
        return "\n".join(parts)
    # Custom note
    custom_fields = note_data.get("custom_fields") or {}
    if isinstance(custom_fields, dict):
        return "\n".join(f"{k}: {v}" for k, v in custom_fields.items() if v)
    return str(custom_fields)


async def generate_patient_summary(note_data: dict) -> dict:
    """
    Genera un resumen para el paciente a partir de una nota SOAP o custom.
    Retorna dict con keys: topics_worked, homework, next_session_date.
    En caso de error de parseo devuelve campos vacíos — el psicólogo puede editar.
    """
    import json as _json
    note_content = _build_note_content(note_data)
    user_message = f"Nota clínica:\n{note_content}"

    try:
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            temperature=0,
            system=_PATIENT_SUMMARY_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = "\n".join(b.text for b in response.content if b.type == "text").strip()
        parsed = _json.loads(raw)
        return {
            "topics_worked": parsed.get("topics_worked") or "",
            "homework": parsed.get("homework") or "",
            "next_session_date": parsed.get("next_session_date") or None,
        }
    except Exception as exc:
        logger.warning("generate_patient_summary failed: %s", exc)
        return {"topics_worked": "", "homework": "", "next_session_date": None}
```

- [ ] **Ejecutar tests — deben pasar**

```bash
python -m pytest tests/test_generate_summary.py -v
# Expected: 3 passed
```

- [ ] **Commit**

```bash
git add backend/agent/agent.py backend/tests/test_generate_summary.py
git commit -m "feat: add generate_patient_summary() from SOAP/custom note"
```

---

## Task 5: Auth del paciente

**Files:** Create `backend/api/patient_auth.py`

- [ ] **Escribir tests primero**

Crear `backend/tests/test_patient_auth.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
import uuid

ACCEPT_URL = "/api/v1/auth/patient/accept-invite"
LOGIN_URL = "/api/v1/auth/patient/login"

VALID_TOKEN = "valid-invite-token-abc123"
VALID_PASSWORD = "Password1"


@pytest.fixture
def patient_user_pending():
    from datetime import datetime, timezone, timedelta
    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.psychologist_id = uuid.uuid4()
    pu.email = "ana@example.com"
    pu.password_hash = None
    pu.invite_token = VALID_TOKEN
    pu.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    pu.is_active = False
    pu.accepted_at = None
    return pu


@pytest.mark.asyncio
async def test_accept_invite_success(patient_user_pending):
    from main import app
    from database import get_db

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = patient_user_pending
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(ACCEPT_URL, json={"token": VALID_TOKEN, "password": VALID_PASSWORD})
        assert res.status_code == 200
        assert "access_token" in res.json()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_accept_invite_invalid_token():
    from main import app
    from database import get_db

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(ACCEPT_URL, json={"token": "bad-token", "password": VALID_PASSWORD})
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patient_login_success():
    from main import app
    from database import get_db
    from api.patient_auth import hash_password

    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.psychologist_id = uuid.uuid4()
    pu.email = "ana@example.com"
    pu.password_hash = hash_password(VALID_PASSWORD)
    pu.is_active = True

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = pu
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": VALID_PASSWORD})
        assert res.status_code == 200
        data = res.json()
        assert data["role"] == "patient"
        assert "access_token" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patient_login_wrong_password():
    from main import app
    from database import get_db
    from api.patient_auth import hash_password

    pu = MagicMock()
    pu.password_hash = hash_password(VALID_PASSWORD)
    pu.is_active = True

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = pu
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": "Wrongpass1"})
        assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Ejecutar tests — deben fallar**

```bash
python -m pytest tests/test_patient_auth.py -v
# Expected: ImportError — patient_auth no existe
```

- [ ] **Crear `backend/api/patient_auth.py`**

```python
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status, Request, Cookie
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db, PatientUser

router = APIRouter(prefix="/auth/patient", tags=["patient-auth"])

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
_patient_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/patient/login", auto_error=False)

UTC = timezone.utc


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def _create_access_token(patient_user: PatientUser) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(patient_user.id),
        "role": "patient",
        "patient_id": str(patient_user.patient_id),
        "psychologist_id": str(patient_user.psychologist_id),
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── Schemas ────────────────────────────────────────────────────────────────

class AcceptInviteRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        import re
        errors = []
        if len(v) < 8:
            errors.append("Mínimo 8 caracteres")
        if not re.search(r"[A-Z]", v):
            errors.append("Al menos 1 mayúscula")
        if not re.search(r"[0-9]", v):
            errors.append("Al menos 1 número")
        if errors:
            raise ValueError("; ".join(errors))
        return v


class PatientLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PatientTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "patient"
    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


# ── Dependency ─────────────────────────────────────────────────────────────

async def get_current_patient(
    token: Optional[str] = Depends(_patient_oauth2),
    db: AsyncSession = Depends(get_db),
) -> PatientUser:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("role") != "patient" or payload.get("type") != "access":
            raise exc
        patient_user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise exc

    pu = await db.get(PatientUser, uuid.UUID(patient_user_id))
    if not pu or not pu.is_active:
        raise exc
    return pu


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/accept-invite", response_model=PatientTokenResponse)
async def accept_invite(body: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PatientUser).where(PatientUser.invite_token == body.token)
    )
    pu = result.scalar_one_or_none()

    if not pu:
        raise HTTPException(status_code=400, detail="Invitación inválida o expirada.")
    if pu.is_active:
        raise HTTPException(status_code=400, detail="Esta cuenta ya fue activada.")
    if pu.invite_token_expires_at and pu.invite_token_expires_at < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invitación expirada. Solicita una nueva al psicólogo.")

    pu.password_hash = hash_password(body.password)
    pu.accepted_at = datetime.now(UTC)
    pu.is_active = True
    pu.invite_token = None
    pu.invite_token_expires_at = None
    await db.commit()

    return PatientTokenResponse(access_token=_create_access_token(pu))


@router.post("/login", response_model=PatientTokenResponse)
async def patient_login(body: PatientLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PatientUser).where(PatientUser.email == body.email)
    )
    pu = result.scalar_one_or_none()

    invalid_exc = HTTPException(status_code=401, detail="Credenciales incorrectas.")

    if not pu or not pu.is_active or not pu.password_hash:
        raise invalid_exc
    if not verify_password(body.password, pu.password_hash):
        raise invalid_exc

    return PatientTokenResponse(access_token=_create_access_token(pu))


@router.post("/logout", status_code=204)
async def patient_logout():
    # Stateless JWT — client descarta el token
    return Response(status_code=204)
```

- [ ] **Registrar router en main.py**

En `backend/main.py`, añadir el import y el `include_router`:

```python
from api.patient_auth import router as patient_auth_router
# ...
app.include_router(patient_auth_router, prefix="/api/v1")
```

- [ ] **Ejecutar tests**

```bash
python -m pytest tests/test_patient_auth.py -v
# Expected: 4 passed
```

- [ ] **Commit**

```bash
git add backend/api/patient_auth.py backend/main.py backend/tests/test_patient_auth.py
git commit -m "feat: add patient auth endpoints (accept-invite, login, logout)"
```

---

## Task 6: Endpoints de resúmenes (lado psicólogo)

**Files:** Create `backend/api/summary_routes.py`

- [ ] **Escribir tests primero**

Crear `backend/tests/test_summary_routes.py`:

```python
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

SESSION_ID = str(uuid.uuid4())
PATIENT_ID = str(uuid.uuid4())
GENERATE_URL = f"/api/v1/sessions/{SESSION_ID}/summary/generate"
SAVE_URL = f"/api/v1/sessions/{SESSION_ID}/summary"
SEND_URL = f"/api/v1/sessions/{SESSION_ID}/summary/send"
GET_URL = f"/api/v1/sessions/{SESSION_ID}/summary"


def _make_session(status="confirmed", fmt="SOAP"):
    s = MagicMock()
    s.id = uuid.UUID(SESSION_ID)
    s.patient_id = uuid.UUID(PATIENT_ID)
    s.status = status
    s.format = fmt
    return s


def _make_note(fmt="SOAP"):
    n = MagicMock()
    n.subjective = "Ansiedad ante conflictos."
    n.objective = "Afecto moderado."
    n.assessment = "Pensamiento catastrófico."
    n.plan = "Registro pensamientos. Próxima sesión 20 mayo."
    n.custom_fields = None
    n.format = fmt
    return n


@pytest.fixture
def authed_summary_app(mock_db, fake_psychologist, monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())

    from main import app
    from database import get_db
    from api.auth import get_current_psychologist

    async def override_db():
        yield mock_db

    async def override_user():
        return fake_psychologist

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_psychologist] = override_user
    yield app
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_generate_summary_confirmed_session(authed_summary_app, mock_db):
    session = _make_session(status="confirmed")
    note = _make_note()
    summary_result = MagicMock()
    summary_result.scalar_one_or_none.return_value = None  # no existing summary

    def execute_side_effect(query, *args, **kwargs):
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        result.scalars.return_value.first.return_value = None
        return result

    mock_db.execute.side_effect = [
        MagicMock(scalar_one_or_none=MagicMock(return_value=session)),   # session lookup
        MagicMock(scalar_one_or_none=MagicMock(return_value=note)),      # note lookup
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),      # existing summary
    ]
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    draft = {"topics_worked": "Pensamientos automáticos.", "homework": "Registrar ansiedad.", "next_session_date": "2025-05-20"}

    with patch("api.summary_routes.generate_patient_summary", return_value=draft):
        async with AsyncClient(transport=ASGITransport(app=authed_summary_app), base_url="http://test") as client:
            res = await client.post(GENERATE_URL)

    assert res.status_code == 200
    data = res.json()
    assert data["topics_worked"] == "Pensamientos automáticos."


@pytest.mark.asyncio
async def test_generate_summary_draft_session_fails(authed_summary_app, mock_db):
    session = _make_session(status="draft")
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=session))

    async with AsyncClient(transport=ASGITransport(app=authed_summary_app), base_url="http://test") as client:
        res = await client.post(GENERATE_URL)

    assert res.status_code == 400
```

- [ ] **Ejecutar tests — deben fallar**

```bash
python -m pytest tests/test_summary_routes.py -v
# Expected: ImportError
```

- [ ] **Crear `backend/api/summary_routes.py`**

```python
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import resend
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.agent import generate_patient_summary
from api.auth import get_current_psychologist
from config import settings
from database import (
    get_db, Session as SessionModel, ClinicalNote,
    PatientUser, PatientSummary, Patient,
)
from exceptions import SessionNotFoundError

router = APIRouter(tags=["summaries"])
UTC = timezone.utc


# ── Schemas ────────────────────────────────────────────────────────────────

class SummaryOut(BaseModel):
    id: Optional[str] = None
    topics_worked: Optional[str] = None
    homework: Optional[str] = None
    next_session_date: Optional[str] = None
    sent_at: Optional[str] = None

    class Config:
        from_attributes = True


class SummarySaveRequest(BaseModel):
    topics_worked: Optional[str] = None
    homework: Optional[str] = None
    next_session_date: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────

async def _get_confirmed_session(session_id: str, psychologist_id: uuid.UUID, db: AsyncSession) -> SessionModel:
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="session_id inválido.")

    result = await db.execute(select(SessionModel).where(SessionModel.id == sid))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if session.status != "confirmed":
        raise HTTPException(status_code=400, detail="Solo se puede generar resumen para sesiones confirmadas.")

    # Verify ownership via patient
    patient = await db.get(Patient, session.patient_id)
    if not patient or patient.psychologist_id != psychologist_id:
        raise HTTPException(status_code=403, detail="Acceso no autorizado.")

    return session


def _note_to_dict(note: ClinicalNote) -> dict:
    """Serialize ClinicalNote to dict for generate_patient_summary."""
    if note.custom_fields:
        return {"format": "custom", "custom_fields": note.custom_fields}
    return {
        "format": "SOAP",
        "subjective": note.subjective or "",
        "objective": note.objective or "",
        "assessment": note.assessment or "",
        "plan": note.plan or "",
    }


async def _get_or_create_summary(session: SessionModel, db: AsyncSession) -> PatientSummary:
    result = await db.execute(
        select(PatientSummary).where(PatientSummary.session_id == session.id)
    )
    summary = result.scalar_one_or_none()
    if not summary:
        summary = PatientSummary(session_id=session.id, patient_id=session.patient_id)
        db.add(summary)
        await db.flush()
    return summary


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/summary/generate", response_model=SummaryOut)
async def generate_summary(
    session_id: str,
    psychologist=Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_confirmed_session(session_id, psychologist.id, db)

    note_result = await db.execute(
        select(ClinicalNote).where(ClinicalNote.session_id == session.id)
    )
    note = note_result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota clínica no encontrada.")

    draft = await generate_patient_summary(_note_to_dict(note))

    summary = await _get_or_create_summary(session, db)
    summary.ai_draft = str(draft)
    summary.topics_worked = draft["topics_worked"]
    summary.homework = draft["homework"]
    summary.next_session_date = draft["next_session_date"]
    await db.commit()
    await db.refresh(summary)

    return SummaryOut(
        id=str(summary.id),
        topics_worked=summary.topics_worked,
        homework=summary.homework,
        next_session_date=str(summary.next_session_date) if summary.next_session_date else None,
        sent_at=summary.sent_at.isoformat() if summary.sent_at else None,
    )


@router.put("/sessions/{session_id}/summary", response_model=SummaryOut)
async def save_summary(
    session_id: str,
    body: SummarySaveRequest,
    psychologist=Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_confirmed_session(session_id, psychologist.id, db)
    summary = await _get_or_create_summary(session, db)

    if body.topics_worked is not None:
        summary.topics_worked = body.topics_worked
    if body.homework is not None:
        summary.homework = body.homework
    if body.next_session_date is not None:
        from datetime import date
        try:
            summary.next_session_date = date.fromisoformat(body.next_session_date) if body.next_session_date else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD.")

    await db.commit()
    await db.refresh(summary)

    return SummaryOut(
        id=str(summary.id),
        topics_worked=summary.topics_worked,
        homework=summary.homework,
        next_session_date=str(summary.next_session_date) if summary.next_session_date else None,
        sent_at=summary.sent_at.isoformat() if summary.sent_at else None,
    )


@router.post("/sessions/{session_id}/summary/send", response_model=SummaryOut)
async def send_summary(
    session_id: str,
    psychologist=Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_confirmed_session(session_id, psychologist.id, db)
    summary = await _get_or_create_summary(session, db)

    patient = await db.get(Patient, session.patient_id)
    if not patient or not patient.email:
        raise HTTPException(status_code=400, detail="El paciente no tiene email registrado. Agrégalo en su perfil.")

    # Find or create PatientUser
    pu_result = await db.execute(
        select(PatientUser).where(PatientUser.patient_id == patient.id)
    )
    pu = pu_result.scalar_one_or_none()

    if not pu:
        # First send — create invitation
        token = secrets.token_urlsafe(32)
        expires = datetime.now(UTC) + timedelta(days=settings.PATIENT_INVITE_EXPIRE_DAYS)
        pu = PatientUser(
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            email=patient.email,
            invite_token=token,
            invite_token_expires_at=expires,
            is_active=False,
        )
        db.add(pu)
        await db.flush()
        _send_invitation_email(patient.name, patient.email, psychologist.name, token)
    else:
        # Subsequent sends — notify of new summary
        _send_new_summary_email(patient.name, patient.email, psychologist.name)

    summary.sent_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(summary)

    return SummaryOut(
        id=str(summary.id),
        topics_worked=summary.topics_worked,
        homework=summary.homework,
        next_session_date=str(summary.next_session_date) if summary.next_session_date else None,
        sent_at=summary.sent_at.isoformat() if summary.sent_at else None,
    )


@router.get("/sessions/{session_id}/summary", response_model=SummaryOut)
async def get_summary(
    session_id: str,
    psychologist=Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_confirmed_session(session_id, psychologist.id, db)
    result = await db.execute(
        select(PatientSummary).where(PatientSummary.session_id == session.id)
    )
    summary = result.scalar_one_or_none()
    if not summary:
        return SummaryOut()

    return SummaryOut(
        id=str(summary.id),
        topics_worked=summary.topics_worked,
        homework=summary.homework,
        next_session_date=str(summary.next_session_date) if summary.next_session_date else None,
        sent_at=summary.sent_at.isoformat() if summary.sent_at else None,
    )


# ── Email helpers ──────────────────────────────────────────────────────────

def _send_invitation_email(patient_name: str, patient_email: str, psych_name: str, token: str) -> None:
    if not settings.RESEND_API_KEY:
        return
    invite_url = f"https://app.syquex.mx/invite/{token}"
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": patient_email,
            "subject": f"{psych_name} te invita a ver tu seguimiento en SyqueX",
            "html": f"""
            <p>Hola {patient_name},</p>
            <p>Tu psicólogo <strong>{psych_name}</strong> ha compartido el resumen de tu sesión.</p>
            <p><a href="{invite_url}">Crear cuenta y ver resumen</a></p>
            <p>Este enlace expira en {settings.PATIENT_INVITE_EXPIRE_DAYS} días.</p>
            """,
        })
    except Exception:
        pass  # Non-fatal — summary is saved regardless


def _send_new_summary_email(patient_name: str, patient_email: str, psych_name: str) -> None:
    if not settings.RESEND_API_KEY:
        return
    portal_url = "https://app.syquex.mx/portal"
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": patient_email,
            "subject": f"Nuevo resumen de sesión disponible",
            "html": f"""
            <p>Hola {patient_name},</p>
            <p><strong>{psych_name}</strong> compartió el resumen de tu última sesión.</p>
            <p><a href="{portal_url}">Ver en SyqueX</a></p>
            """,
        })
    except Exception:
        pass
```

- [ ] **Registrar router en main.py**

```python
from api.summary_routes import router as summary_router
# ...
app.include_router(summary_router, prefix="/api/v1")
```

- [ ] **Ejecutar tests**

```bash
python -m pytest tests/test_summary_routes.py -v
# Expected: 2 passed
```

- [ ] **Commit**

```bash
git add backend/api/summary_routes.py backend/main.py backend/tests/test_summary_routes.py
git commit -m "feat: add summary generate/save/send endpoints for psychologist"
```

---

## Task 7: Endpoints del portal del paciente

**Files:** Create `backend/api/patient_routes.py`

- [ ] **Escribir tests primero**

Crear `backend/tests/test_patient_routes.py`:

```python
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone

ME_URL = "/api/v1/patient/me"
SUMMARIES_URL = "/api/v1/patient/me/summaries"


def _make_patient_user():
    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.psychologist_id = uuid.uuid4()
    pu.is_active = True
    return pu


def _make_patient(pu):
    p = MagicMock()
    p.id = pu.patient_id
    p.name = "Ana García"
    return p


def _make_psychologist(pu):
    psy = MagicMock()
    psy.id = pu.psychologist_id
    psy.name = "Dr. Martínez"
    return psy


@pytest.fixture
def authed_patient_app(monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())

    from main import app
    from database import get_db
    from api.patient_auth import get_current_patient

    pu = _make_patient_user()
    mock_db = AsyncMock()

    async def override_db():
        yield mock_db

    async def override_patient():
        return pu

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_patient] = override_patient
    yield app, mock_db, pu
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_me(authed_patient_app):
    app, mock_db, pu = authed_patient_app
    patient = _make_patient(pu)
    psychologist = _make_psychologist(pu)

    mock_db.get.side_effect = [patient, psychologist]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(ME_URL)

    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Ana García"
    assert data["psychologist_name"] == "Dr. Martínez"


@pytest.mark.asyncio
async def test_get_summaries_empty(authed_patient_app):
    app, mock_db, pu = authed_patient_app
    mock_db.execute.return_value = MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(SUMMARIES_URL)

    assert res.status_code == 200
    assert res.json() == []
```

- [ ] **Ejecutar tests — deben fallar**

```bash
python -m pytest tests/test_patient_routes.py -v
# Expected: ImportError
```

- [ ] **Crear `backend/api/patient_routes.py`**

```python
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.patient_auth import get_current_patient
from database import get_db, Patient, Psychologist, PatientSummary, PatientUser

router = APIRouter(prefix="/patient", tags=["patient-portal"])
UTC = timezone.utc


class PatientMeOut(BaseModel):
    name: str
    psychologist_name: str


class SummaryListItem(BaseModel):
    id: str
    session_date: Optional[str] = None
    topics_worked: Optional[str] = None
    homework: Optional[str] = None
    next_session_date: Optional[str] = None
    sent_at: Optional[str] = None
    viewed_at: Optional[str] = None
    is_new: bool = False


class SummaryDetailOut(SummaryListItem):
    pass


@router.get("/me", response_model=PatientMeOut)
async def get_me(
    current_patient: PatientUser = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    patient = await db.get(Patient, current_patient.patient_id)
    psychologist = await db.get(Psychologist, current_patient.psychologist_id)
    if not patient or not psychologist:
        raise HTTPException(status_code=404, detail="Datos no encontrados.")
    return PatientMeOut(name=patient.name, psychologist_name=psychologist.name)


@router.get("/me/summaries", response_model=List[SummaryListItem])
async def list_summaries(
    current_patient: PatientUser = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    from database import Session as SessionModel
    result = await db.execute(
        select(PatientSummary, SessionModel.session_date)
        .join(SessionModel, PatientSummary.session_id == SessionModel.id)
        .where(
            PatientSummary.patient_id == current_patient.patient_id,
            PatientSummary.sent_at.isnot(None),
        )
        .order_by(SessionModel.session_date.desc())
    )
    rows = result.all()

    return [
        SummaryListItem(
            id=str(s.id),
            session_date=str(session_date) if session_date else None,
            topics_worked=s.topics_worked,
            homework=s.homework,
            next_session_date=str(s.next_session_date) if s.next_session_date else None,
            sent_at=s.sent_at.isoformat() if s.sent_at else None,
            viewed_at=s.viewed_at.isoformat() if s.viewed_at else None,
            is_new=s.viewed_at is None,
        )
        for s, session_date in rows
    ]


@router.get("/me/summaries/{summary_id}", response_model=SummaryDetailOut)
async def get_summary_detail(
    summary_id: str,
    current_patient: PatientUser = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    from database import Session as SessionModel
    try:
        sid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="summary_id inválido.")

    result = await db.execute(
        select(PatientSummary, SessionModel.session_date)
        .join(SessionModel, PatientSummary.session_id == SessionModel.id)
        .where(
            PatientSummary.id == sid,
            PatientSummary.patient_id == current_patient.patient_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Resumen no encontrado.")

    summary, session_date = row

    # Mark as viewed on first access
    if summary.viewed_at is None:
        summary.viewed_at = datetime.now(UTC)
        await db.commit()

    return SummaryDetailOut(
        id=str(summary.id),
        session_date=str(session_date) if session_date else None,
        topics_worked=summary.topics_worked,
        homework=summary.homework,
        next_session_date=str(summary.next_session_date) if summary.next_session_date else None,
        sent_at=summary.sent_at.isoformat() if summary.sent_at else None,
        viewed_at=summary.viewed_at.isoformat() if summary.viewed_at else None,
        is_new=False,
    )
```

- [ ] **Registrar router en main.py**

```python
from api.patient_routes import router as patient_router
# ...
app.include_router(patient_router, prefix="/api/v1")
```

- [ ] **Ejecutar tests**

```bash
python -m pytest tests/test_patient_routes.py -v
# Expected: 2 passed
```

- [ ] **Ejecutar suite completa de backend**

```bash
python -m pytest tests/ -v
# Expected: todos los tests previos siguen pasando
```

- [ ] **Commit**

```bash
git add backend/api/patient_routes.py backend/main.py backend/tests/test_patient_routes.py
git commit -m "feat: add patient portal endpoints (/patient/me, /me/summaries)"
```

---

## Task 8: Campo email en PatientIntakeModal

**Files:** Modify `frontend/src/components/PatientIntakeModal.jsx`

- [ ] **Localizar el campo `phone` en PatientIntakeModal.jsx y añadir `email` después**

Buscar el bloque del campo `phone` (contiene `placeholder="Ej: +52 55..."`) y añadir después:

```jsx
<div>
  <label className="block text-xs font-semibold text-[#18181b] uppercase tracking-wide mb-1">
    Email del paciente
  </label>
  <input
    type="email"
    value={form.email || ''}
    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
    placeholder="para enviarle resúmenes de sesión"
    className="w-full border border-[#e0e0e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5a9e8a]"
  />
  <p className="text-xs text-[#aaa] mt-1">Opcional. Solo se usa para enviar resúmenes.</p>
</div>
```

- [ ] **Incluir `email` en el objeto que se envía al backend**

Localizar el objeto de payload en el submit handler (donde están `name`, `phone`, etc.) y añadir:

```js
email: form.email || null,
```

- [ ] **Verificar visualmente en el navegador**

```bash
cd frontend && npm run dev
# Abrir http://localhost:5173
# Crear o editar un paciente — debe verse el campo Email
```

- [ ] **Commit**

```bash
git add frontend/src/components/PatientIntakeModal.jsx
git commit -m "feat: add email field to patient intake modal"
```

---

## Task 9: api.js — nuevos endpoints

**Files:** Modify `frontend/src/api.js`

- [ ] **Añadir funciones de resumen (psicólogo) al final del archivo**

```js
// ── Patient summaries (psychologist side) ──────────────────────────────────
export const generateSummary = (sessionId, token) =>
  apiFetch(`/sessions/${sessionId}/summary/generate`, { method: 'POST' }, token);

export const saveSummary = (sessionId, data, token) =>
  apiFetch(`/sessions/${sessionId}/summary`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, token);

export const sendSummary = (sessionId, token) =>
  apiFetch(`/sessions/${sessionId}/summary/send`, { method: 'POST' }, token);

export const getSummary = (sessionId, token) =>
  apiFetch(`/sessions/${sessionId}/summary`, { method: 'GET' }, token);

// ── Patient portal ──────────────────────────────────────────────────────────
export const patientLogin = (email, password) =>
  apiFetch('/auth/patient/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const acceptInvite = (token, password) =>
  apiFetch('/auth/patient/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

export const getPatientMe = (token) =>
  apiFetch('/patient/me', { method: 'GET' }, token);

export const getPatientSummaries = (token) =>
  apiFetch('/patient/me/summaries', { method: 'GET' }, token);

export const getPatientSummaryDetail = (summaryId, token) =>
  apiFetch(`/patient/me/summaries/${summaryId}`, { method: 'GET' }, token);
```

- [ ] **Verificar que `apiFetch` acepta token opcional (revisar su firma actual)**

Si `apiFetch` no acepta token como tercer parámetro, adaptar según el patrón existente en el archivo.

- [ ] **Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add summary and patient portal API functions"
```

---

## Task 10: PatientSummarySection — sección colapsable en tab Nota

**Files:** Create `frontend/src/components/PatientSummarySection.jsx`

- [ ] **Crear el componente**

```jsx
import { useState, useEffect } from 'react';
import { generateSummary, saveSummary, sendSummary, getSummary } from '../api';

const STATES = { IDLE: 'idle', EXPANDED: 'expanded', SENT: 'sent', LOADING: 'loading' };

export default function PatientSummarySection({ sessionId, patientName, token }) {
  const [state, setState] = useState(STATES.IDLE);
  const [fields, setFields] = useState({ topics_worked: '', homework: '', next_session_date: '' });
  const [sentAt, setSentAt] = useState(null);
  const [error, setError] = useState(null);

  // Load existing summary on mount
  useEffect(() => {
    if (!sessionId || !token) return;
    getSummary(sessionId, token)
      .then(data => {
        if (data?.id) {
          setFields({
            topics_worked: data.topics_worked || '',
            homework: data.homework || '',
            next_session_date: data.next_session_date || '',
          });
          if (data.sent_at) {
            setSentAt(data.sent_at);
            setState(STATES.SENT);
          }
        }
      })
      .catch(() => {});
  }, [sessionId, token]);

  const handleGenerate = async () => {
    setState(STATES.LOADING);
    setError(null);
    try {
      const data = await generateSummary(sessionId, token);
      setFields({
        topics_worked: data.topics_worked || '',
        homework: data.homework || '',
        next_session_date: data.next_session_date || '',
      });
      setState(STATES.EXPANDED);
    } catch {
      setError('No se pudo generar el resumen. Intenta de nuevo.');
      setState(STATES.IDLE);
    }
  };

  const handleSend = async () => {
    setState(STATES.LOADING);
    setError(null);
    try {
      await saveSummary(sessionId, fields, token);
      const result = await sendSummary(sessionId, token);
      setSentAt(result.sent_at);
      setState(STATES.SENT);
    } catch (e) {
      setError(e?.message || 'Error al enviar. Verifica que el paciente tenga email registrado.');
      setState(STATES.EXPANDED);
    }
  };

  const handleFieldChange = async (key, value) => {
    const updated = { ...fields, [key]: value };
    setFields(updated);
    try { await saveSummary(sessionId, updated, token); } catch {}
  };

  // ── State: SENT ──
  if (state === STATES.SENT) {
    const hour = sentAt ? new Date(sentAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <div className="border-t border-[#f0f0f0] mt-4 pt-4">
        <div className="w-full bg-[#f4faf8] border border-[#5a9e8a] border-dashed rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#5a9e8a]">✓ Resumen enviado a {patientName}</span>
          {hour && <span className="text-xs text-[#aaa]">Hoy · {hour}</span>}
        </div>
      </div>
    );
  }

  // ── State: IDLE ──
  if (state === STATES.IDLE) {
    return (
      <div className="border-t border-[#f0f0f0] mt-4 pt-4">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button
          onClick={handleGenerate}
          className="w-full bg-[#f4faf8] border border-dashed border-[#5a9e8a] rounded-lg px-4 py-3 text-sm font-semibold text-[#5a9e8a] hover:bg-[#eaf5f2] transition-colors"
        >
          ✨ Generar resumen para {patientName}
        </button>
      </div>
    );
  }

  // ── State: LOADING ──
  if (state === STATES.LOADING) {
    return (
      <div className="border-t border-[#f0f0f0] mt-4 pt-4">
        <div className="w-full bg-[#f4faf8] border border-dashed border-[#5a9e8a] rounded-lg px-4 py-3 text-sm text-[#5a9e8a] text-center">
          Generando resumen…
        </div>
      </div>
    );
  }

  // ── State: EXPANDED ──
  return (
    <div className="border-t border-[#e0ede8] mt-4 pt-4 bg-[#f9fdf9] rounded-lg p-4">
      <p className="text-xs font-bold text-[#5a9e8a] uppercase tracking-wide mb-3">
        ✨ Resumen para {patientName}
      </p>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {/* Trabajamos */}
      <div className="mb-3">
        <label className="block text-xs font-bold text-[#5a9e8a] uppercase tracking-wide mb-1">
          📌 Trabajamos
        </label>
        <textarea
          value={fields.topics_worked}
          onChange={e => handleFieldChange('topics_worked', e.target.value)}
          rows={2}
          className="w-full bg-white border-2 border-[#5a9e8a] rounded-lg px-3 py-2 text-sm text-[#18181b] focus:outline-none resize-none"
        />
      </div>

      {/* Tarea */}
      <div className="mb-3">
        <label className="block text-xs font-bold text-[#c4935a] uppercase tracking-wide mb-1">
          📝 Tarea para esta semana
        </label>
        <textarea
          value={fields.homework}
          onChange={e => handleFieldChange('homework', e.target.value)}
          rows={2}
          className="w-full bg-white border-2 border-[#c4935a] rounded-lg px-3 py-2 text-sm text-[#18181b] focus:outline-none resize-none"
          style={{ background: '#fff9f5' }}
        />
      </div>

      {/* Próxima sesión */}
      <div className="mb-4">
        <label className="block text-xs font-bold text-[#5a9e8a] uppercase tracking-wide mb-1">
          📅 Próxima sesión
        </label>
        <input
          type="date"
          value={fields.next_session_date || ''}
          onChange={e => handleFieldChange('next_session_date', e.target.value)}
          className="w-full bg-[#f4f4f2] border border-[#ddd] rounded-lg px-3 py-2 text-sm text-[#18181b] focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setState(STATES.IDLE)}
          className="flex-1 bg-white border border-[#ddd] rounded-lg py-2 text-sm text-[#666] hover:bg-[#f4f4f2]"
        >
          Cancelar
        </button>
        <button
          onClick={handleSend}
          className="flex-2 bg-[#5a9e8a] text-white rounded-lg py-2 px-4 text-sm font-semibold hover:bg-[#4a8e7a] flex-grow"
        >
          Enviar a {patientName} →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Integrar en el tab "Nota" de App.jsx**

Localizar en `App.jsx` donde se renderiza el contenido del tab "Nota" (buscar `SoapNoteDocument` o `CustomNoteDocument`). Añadir `PatientSummarySection` después de la nota, condicionado a `session.status === 'confirmed'`:

```jsx
import PatientSummarySection from './components/PatientSummarySection';

// En el JSX del tab Nota, después de <SoapNoteDocument .../> o <CustomNoteDocument .../>:
{selectedSession?.status === 'confirmed' && (
  <PatientSummarySection
    sessionId={selectedSession.id}
    patientName={selectedPatient?.name}
    token={accessToken}
  />
)}
```

- [ ] **Verificar visualmente**

```bash
# Con backend y frontend corriendo:
# 1. Seleccionar un paciente con sesión confirmada
# 2. Ir al tab "Nota"
# 3. Verificar que aparece el botón "✨ Generar resumen para [Nombre]"
# 4. Hacer clic — deben aparecer los 3 campos editables
# 5. Hacer clic en "Enviar" — debe mostrar "✓ Resumen enviado"
```

- [ ] **Commit**

```bash
git add frontend/src/components/PatientSummarySection.jsx frontend/src/App.jsx
git commit -m "feat: add PatientSummarySection collapsible in Nota tab"
```

---

## Task 11: AcceptInvite — activación de cuenta

**Files:** Create `frontend/src/components/AcceptInvite.jsx`

- [ ] **Crear el componente**

```jsx
import { useState, useEffect } from 'react';
import { acceptInvite } from '../api';

export default function AcceptInvite({ token, onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (password.length < 8) return 'Mínimo 8 caracteres.';
    if (!/[A-Z]/.test(password)) return 'Al menos 1 letra mayúscula.';
    if (!/[0-9]/.test(password)) return 'Al menos 1 número.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await acceptInvite(token, password);
      onSuccess(data.access_token);
    } catch {
      setError('Invitación inválida o expirada. Solicita una nueva a tu psicólogo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#18181b] mb-1" style={{ fontFamily: 'Georgia, serif' }}>
          Bienvenido a SyqueX
        </h1>
        <p className="text-sm text-[#666] mb-6">Crea tu contraseña para acceder a tu seguimiento.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#18181b] uppercase tracking-wide mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-[#e0e0e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5a9e8a]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#18181b] uppercase tracking-wide mb-1">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full border border-[#e0e0e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5a9e8a]"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5a9e8a] text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Activando cuenta…' : 'Crear cuenta y ver mi seguimiento'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/AcceptInvite.jsx
git commit -m "feat: add AcceptInvite screen for patient account activation"
```

---

## Task 12: Portal del paciente — SummaryList y SummaryDetail

**Files:** Create `frontend/src/components/SummaryList.jsx`, `SummaryDetail.jsx`

- [ ] **Crear SummaryList.jsx**

```jsx
export default function SummaryList({ summaries, onSelect }) {
  if (!summaries.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[#aaa]">
        <p className="text-sm">No hay resúmenes aún.</p>
        <p className="text-xs mt-1">Aparecerán aquí después de cada sesión.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {summaries.map(s => {
        const dateLabel = s.session_date
          ? new Date(s.session_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
          : '—';
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left bg-white rounded-xl p-4 border-2 transition-colors ${
              s.is_new ? 'border-[#5a9e8a]' : 'border-[#ebebeb]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-[#18181b]">{dateLabel}</span>
              {s.is_new && (
                <span className="bg-[#5a9e8a] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  Nueva
                </span>
              )}
            </div>
            {s.topics_worked && (
              <p className="text-xs text-[#555] mt-1 line-clamp-2">📌 {s.topics_worked}</p>
            )}
            {s.homework && (
              <p className="text-xs text-[#c4935a] mt-1">📝 Tarea asignada</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Crear SummaryDetail.jsx**

```jsx
export default function SummaryDetail({ summary, patientName, onBack }) {
  const dateLabel = summary.session_date
    ? new Date(summary.session_date + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : '';

  const nextDate = summary.next_session_date
    ? new Date(summary.next_session_date + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#18181b] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-[#5a9e8a] text-lg">←</button>
        <span className="text-xs text-[#aaa]">Mis sesiones</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Session header */}
        <div className="px-4 py-4 border-b border-[#f0f0f0]">
          {dateLabel && (
            <p className="text-xs font-bold text-[#aaa] uppercase tracking-wide">{dateLabel}</p>
          )}
          <h1 className="text-2xl font-bold text-[#18181b] mt-1" style={{ fontFamily: 'Georgia, serif' }}>
            Hola, {patientName?.split(' ')[0]}
          </h1>
          <p className="text-sm text-[#666] mt-1">Tu psicólogo registró los temas de hoy</p>
        </div>

        {/* Sections */}
        <div className="px-4 py-4 flex flex-col gap-3">
          {summary.topics_worked && (
            <div className="bg-[#f4faf8] rounded-xl p-4">
              <p className="text-xs font-bold text-[#5a9e8a] uppercase tracking-wide mb-2">📌 Trabajamos</p>
              <p className="text-sm text-[#18181b] leading-relaxed">{summary.topics_worked}</p>
            </div>
          )}

          {summary.homework && (
            <div className="rounded-xl p-4" style={{ background: '#fff9f5' }}>
              <p className="text-xs font-bold text-[#c4935a] uppercase tracking-wide mb-2">📝 Tu tarea esta semana</p>
              <p className="text-sm text-[#18181b] leading-relaxed">{summary.homework}</p>
            </div>
          )}

          {nextDate && (
            <div className="bg-[#f4f4f2] rounded-xl p-4">
              <p className="text-xs font-bold text-[#5a9e8a] uppercase tracking-wide mb-2">📅 Próxima sesión</p>
              <p className="text-sm font-semibold text-[#18181b]">{nextDate}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/SummaryList.jsx frontend/src/components/SummaryDetail.jsx
git commit -m "feat: add SummaryList and SummaryDetail patient portal components"
```

---

## Task 13: PatientPortal y routing por rol en App.jsx

**Files:** Create `frontend/src/components/PatientPortal.jsx`, modify `frontend/src/App.jsx`

- [ ] **Crear PatientPortal.jsx**

```jsx
import { useState, useEffect } from 'react';
import { getPatientMe, getPatientSummaries, getPatientSummaryDetail } from '../api';
import SummaryList from './SummaryList';
import SummaryDetail from './SummaryDetail';

export default function PatientPortal({ token, onLogout }) {
  const [me, setMe] = useState(null);
  const [summaries, setSummaries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPatientMe(token), getPatientSummaries(token)])
      .then(([meData, sumData]) => { setMe(meData); setSummaries(sumData); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSelect = async (id) => {
    setSelectedId(id);
    const data = await getPatientSummaryDetail(id, token);
    setDetail(data);
    setSummaries(prev => prev.map(s => s.id === id ? { ...s, is_new: false } : s));
  };

  const handleBack = () => { setSelectedId(null); setDetail(null); };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center">
        <p className="text-sm text-[#aaa]">Cargando…</p>
      </div>
    );
  }

  // ── Desktop layout (md+): sidebar + detail panel ──
  return (
    <div className="min-h-dvh bg-[#f4f4f2] flex flex-col">
      {/* Top header */}
      <div className="bg-[#18181b] px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#5a9e8a] uppercase tracking-wide">Mi seguimiento</p>
          <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
            Hola, {me?.name?.split(' ')[0]} 👋
          </h1>
        </div>
        <button onClick={onLogout} className="text-xs text-[#aaa] hover:text-white">Salir</button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile: show list OR detail */}
        <div className="flex-1 md:hidden overflow-y-auto">
          {selectedId && detail
            ? <SummaryDetail summary={detail} patientName={me?.name} onBack={handleBack} />
            : <SummaryList summaries={summaries} onSelect={handleSelect} />
          }
        </div>

        {/* Desktop: sidebar + panel */}
        <div className="hidden md:flex flex-1 overflow-hidden">
          <div className="w-72 bg-white border-r border-[#ebebeb] overflow-y-auto">
            <SummaryList summaries={summaries} onSelect={handleSelect} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {detail
              ? <SummaryDetail summary={detail} patientName={me?.name} onBack={handleBack} />
              : (
                <div className="flex items-center justify-center h-full text-[#aaa]">
                  <p className="text-sm">Selecciona una sesión</p>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Añadir routing por rol en App.jsx**

En App.jsx, localizar la lógica de login (donde se guarda `accessToken` tras login exitoso) y añadir detección de rol:

```jsx
import PatientPortal from './components/PatientPortal';
import AcceptInvite from './components/AcceptInvite';

// En el estado inicial, añadir:
const [userRole, setUserRole] = useState(null); // 'psychologist' | 'patient'

// En el handler de login exitoso (donde se hace setAccessToken):
// Decodificar el JWT para leer el rol (sin validar firma, solo leer el payload):
const decodeJwtRole = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'psychologist';
  } catch { return 'psychologist'; }
};

// Al guardar el token:
const role = decodeJwtRole(data.access_token);
setUserRole(role);
setAccessToken(data.access_token);
```

- [ ] **Añadir routing de pantallas en el return de App.jsx**

Antes del return principal del dashboard del psicólogo, añadir:

```jsx
// Ruta /invite/:token — pública
const inviteMatch = window.location.pathname.match(/^\/invite\/(.+)$/);
if (inviteMatch) {
  return (
    <AcceptInvite
      token={inviteMatch[1]}
      onSuccess={(accessToken) => {
        setAccessToken(accessToken);
        setUserRole('patient');
        window.history.replaceState({}, '', '/portal');
      }}
    />
  );
}

// Portal del paciente
if (accessToken && userRole === 'patient') {
  return (
    <PatientPortal
      token={accessToken}
      onLogout={() => { setAccessToken(null); setUserRole(null); }}
    />
  );
}
```

- [ ] **Verificar visualmente el portal**

```bash
# 1. Ir a http://localhost:5173
# 2. Hacer login con una cuenta de paciente activada
# 3. Debe redirigir a PatientPortal
# 4. Verificar lista de resúmenes y navegación al detalle
# 5. En desktop (>=768px) verificar sidebar + panel lado a lado
```

- [ ] **Commit**

```bash
git add frontend/src/components/PatientPortal.jsx frontend/src/App.jsx
git commit -m "feat: add PatientPortal and role-based routing at login"
```

---

## Task 14: Actualizar documentación de arquitectura

**Files:** Modify `docs/architecture/`

- [ ] **DATABASE_SCHEMA.md** — agregar tablas nuevas al diagrama ER

Localizar el diagrama Mermaid de entidades y añadir:

```
patient_users {
    UUID id PK
    UUID patient_id FK
    UUID psychologist_id FK
    TEXT email UK
    TEXT password_hash
    TEXT invite_token
    TIMESTAMPTZ invite_token_expires_at
    TIMESTAMPTZ invited_at
    TIMESTAMPTZ accepted_at
    BOOL is_active
}

patient_summaries {
    UUID id PK
    UUID session_id FK UK
    UUID patient_id FK
    TEXT ai_draft
    TEXT topics_worked
    TEXT homework
    DATE next_session_date
    TIMESTAMPTZ sent_at
    TIMESTAMPTZ viewed_at
}
```

Añadir también `email VARCHAR(255) nullable` en la tabla `patients`.

- [ ] **ARCHITECTURE.md** — agregar actores y módulos nuevos

En la sección de actores/roles añadir `PatientUser`. En el inventario de módulos backend añadir:
- `api/patient_auth.py` — Auth del paciente
- `api/patient_routes.py` — Portal del paciente
- `api/summary_routes.py` — Generación y envío de resúmenes

En la sección de componentes frontend añadir: `PatientPortal`, `SummaryList`, `SummaryDetail`, `AcceptInvite`, `PatientSummarySection`.

- [ ] **API_REFERENCE.md** — documentar endpoints nuevos

Añadir sección "Patient Auth" con: `POST /auth/patient/accept-invite`, `POST /auth/patient/login`, `POST /auth/patient/logout`.

Añadir sección "Patient Portal" con: `GET /patient/me`, `GET /patient/me/summaries`, `GET /patient/me/summaries/{id}`.

Añadir sección "Summaries (Psychologist)" con: `POST /sessions/{id}/summary/generate`, `PUT /sessions/{id}/summary`, `POST /sessions/{id}/summary/send`, `GET /sessions/{id}/summary`.

- [ ] **SECURITY_COMPLIANCE.md** — aislamiento de datos del paciente

Añadir sección "Portal del Paciente":
- Los tokens JWT de paciente llevan `role: "patient"` y son rechazados por todos los endpoints del psicólogo.
- El `patient_id` del token es verificado contra el recurso solicitado en cada endpoint del portal.
- Los resúmenes del paciente NO contienen datos SOAP, diagnósticos ni formulaciones clínicas.
- Los tokens de invitación son de un solo uso (se anulan tras la activación) con TTL de 7 días.

- [ ] **Commit**

```bash
git add docs/architecture/
git commit -m "docs: update architecture diagrams for patient portal feature"
```

---

## Task 15: Suite final de tests y PR

- [ ] **Ejecutar suite completa de backend**

```bash
cd backend
python -m pytest tests/ -v --tb=short
# Expected: todos los tests pasan
```

- [ ] **Verificar que el servidor backend arranca sin errores**

```bash
.\start-backend.ps1
# Expected: "Application startup complete" sin warnings de migración
```

- [ ] **Verificar flujo completo en navegador**

```
1. Psicólogo crea/edita paciente → agrega email
2. Psicólogo confirma nota SOAP o custom
3. En tab Nota aparece "✨ Generar resumen para [Nombre]"
4. Clic → campos editables con borrador de Claude
5. Editar campos → clic "Enviar" → chip "✓ Resumen enviado"
6. En inbox del paciente llega email de invitación
7. Paciente abre link /invite/:token → crea contraseña
8. Paciente hace login → ve PatientPortal con lista de sesiones
9. Clic en sesión → SummaryDetail con Trabajamos / Tarea / Próxima sesión
10. En desktop: sidebar + panel lado a lado
```

- [ ] **Commit final y push**

```bash
git push -u origin feature/patient-portal
```

- [ ] **Abrir PR hacia dev**

```bash
gh pr create \
  --title "feat: Patient Portal — seguimiento post-sesión para pacientes" \
  --base dev \
  --body "## Qué hace este PR

- Nuevo rol \`patient\` con auth propia (invitación por email → activación con contraseña)
- Claude genera resumen empático desde nota SOAP o custom
- Psicólogo revisa/edita y envía con un clic desde el tab Nota
- Paciente ve historial de resúmenes en portal mobile-first + desktop sidebar

## Archivos nuevos
- \`backend/api/patient_auth.py\`
- \`backend/api/patient_routes.py\`
- \`backend/api/summary_routes.py\`
- \`frontend/src/components/PatientPortal.jsx\`
- \`frontend/src/components/PatientSummarySection.jsx\`
- \`frontend/src/components/SummaryList.jsx\`
- \`frontend/src/components/SummaryDetail.jsx\`
- \`frontend/src/components/AcceptInvite.jsx\`

## Test plan
- [ ] Backend: \`pytest tests/ -v\` — todos pasan
- [ ] Flujo completo: invitación → activación → login → portal → detalle
- [ ] Mobile: lista de tarjetas → detalle a pantalla completa
- [ ] Desktop: sidebar + panel lado a lado
- [ ] Nota SOAP y nota custom ambas generan resumen correcto"
```
