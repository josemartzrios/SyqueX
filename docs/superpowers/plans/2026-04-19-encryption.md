# Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cifrar todos los campos clínicos sensibles en reposo usando Fernet (AES-128-CBC + HMAC-SHA256) para cumplir LFPDPPP Art. 19.

**Architecture:** Nuevo módulo `backend/crypto.py` expone `encrypt`/`decrypt`/`encrypt_if_set`/`decrypt_if_set`. El cifrado ocurre en `routes.py` y `agent/` justo antes de escribir en BD; el descifrado ocurre justo después de leer, antes de usar el valor. La BD nunca ve texto plano.

**Tech Stack:** Python `cryptography` (Fernet), FastAPI, SQLAlchemy async, PostgreSQL.

---

## File Map

| Archivo | Acción |
|---------|--------|
| `backend/crypto.py` | Crear — módulo de cifrado |
| `backend/tests/test_crypto.py` | Crear — unit tests del módulo |
| `backend/config.py` | Modificar — agregar `ENCRYPTION_KEY`, `ENCRYPTION_KEY_V1` + validación |
| `backend/requirements.txt` | Modificar — agregar `cryptography` explícito |
| `backend/main.py` | Modificar — llamar `validate_key()` en startup |
| `backend/database.py` | Modificar — `emergency_contact` y `messages` JSONB → Text + DDL migrations |
| `backend/api/routes.py` | Modificar — cifrar/descifrar en patient y session endpoints |
| `backend/agent/tools.py` | Modificar — descifrar `assessment` y `subjective` al leer |
| `backend/agent/agent.py` | Modificar — descifrar `messages` y `patient_summary` en contexto |

---

## Task 1: Crear `backend/crypto.py`

**Files:**
- Create: `backend/crypto.py`
- Create: `backend/tests/test_crypto.py`

- [ ] **Step 1: Escribir el test primero**

Crea `backend/tests/test_crypto.py`. Los tests parchean `settings` directamente (no solo el env var, porque `settings` es un singleton ya instanciado al importar `config`):

```python
import pytest
from cryptography.fernet import Fernet


def _patch_key(monkeypatch):
    key = Fernet.generate_key().decode()
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", key)
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY_V1", "")
    return key


def test_encrypt_decrypt_roundtrip(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    plaintext = "Paciente refiere ansiedad severa."
    ciphertext = crypto.encrypt(plaintext)
    assert ciphertext.startswith("v1:")
    assert crypto.decrypt(ciphertext) == plaintext


def test_encrypt_produces_different_ciphertexts(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    c1 = crypto.encrypt("mismo texto")
    c2 = crypto.encrypt("mismo texto")
    assert c1 != c2  # Fernet uses random IV


def test_decrypt_if_set_none_returns_none(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.decrypt_if_set(None) is None


def test_decrypt_if_set_legacy_plain_text(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.decrypt_if_set("texto plano sin cifrar") == "texto plano sin cifrar"


def test_encrypt_if_set_none_returns_none(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.encrypt_if_set(None) is None


def test_encrypt_if_set_encrypts_string(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    result = crypto.encrypt_if_set("valor")
    assert result is not None and result.startswith("v1:")


def test_validate_key_raises_on_invalid_format(monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", "not_a_valid_fernet_key_at_all")
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(SystemExit):
        crypto.validate_key()


def test_validate_key_raises_on_empty(monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", "")
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(SystemExit):
        crypto.validate_key()


def test_validate_key_passes_on_valid(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    crypto.validate_key()  # Should not raise


def test_decrypt_unknown_prefix_raises(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt("v99:invalido")
```

- [ ] **Step 2: Correr test para verificar que falla**

```bash
cd backend
pytest tests/test_crypto.py -v
```

Expected: `ModuleNotFoundError: No module named 'crypto'`

- [ ] **Step 3: Implementar `backend/crypto.py`**

```python
import logging
from cryptography.fernet import Fernet, InvalidToken
from config import settings

logger = logging.getLogger(__name__)

# v1: es el prefijo inicial. Al rotar, los nuevos datos se escribirán con v2:.
# Mapeo: v1: → ENCRYPTION_KEY_V1 (si existe) else ENCRYPTION_KEY
#        v2: → ENCRYPTION_KEY (llave activa tras rotación)
_CURRENT_PREFIX = "v1:"
_V1_PREFIX = "v1:"
_V2_PREFIX = "v2:"


class DecryptionError(Exception):
    pass


def _get_fernet(prefix: str) -> Fernet:
    if prefix == _V2_PREFIX:
        return Fernet(settings.ENCRYPTION_KEY.encode())
    if prefix == _V1_PREFIX:
        key = settings.ENCRYPTION_KEY_V1 or settings.ENCRYPTION_KEY
        return Fernet(key.encode())
    raise DecryptionError(f"Prefijo de versión desconocido: {prefix!r}")


def encrypt(plaintext: str) -> str:
    f = Fernet(settings.ENCRYPTION_KEY.encode())
    token = f.encrypt(plaintext.encode()).decode()
    return f"{_CURRENT_PREFIX}{token}"


def decrypt(ciphertext: str) -> str:
    for prefix in (_V1_PREFIX, _V2_PREFIX):
        if ciphertext.startswith(prefix):
            token = ciphertext[len(prefix):]
            try:
                f = _get_fernet(prefix)
                return f.decrypt(token.encode()).decode()
            except InvalidToken as e:
                raise DecryptionError(f"No se pudo descifrar el token: {e}") from e
    raise DecryptionError(f"Prefijo de versión desconocido en: {ciphertext[:10]!r}")


def encrypt_if_set(value: str | None) -> str | None:
    if value is None:
        return None
    return encrypt(value)


def decrypt_if_set(value: str | None) -> str | None:
    if value is None:
        return None
    if value.startswith(_V1_PREFIX) or value.startswith(_V2_PREFIX):
        return decrypt(value)
    return value  # valor legacy sin cifrar — retornar tal cual


def validate_key() -> None:
    key = settings.ENCRYPTION_KEY
    if not key:
        logger.critical("ENCRYPTION_KEY ausente — configura la variable de entorno en Railway")
        raise SystemExit(1)
    try:
        Fernet(key.encode())
    except Exception:
        logger.critical("ENCRYPTION_KEY inválida — debe ser una llave Fernet base64 de 32 bytes")
        raise SystemExit(1)
```

- [ ] **Step 4: Correr tests y verificar que pasan**

```bash
cd backend
pytest tests/test_crypto.py -v
```

Expected: 11 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/crypto.py backend/tests/test_crypto.py
git commit -m "feat: add crypto module with Fernet encryption (LFPDPPP)"
```

---

## Task 2: Config + dependencies

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Agregar `cryptography` a requirements.txt**

Agrega al final de `backend/requirements.txt`:
```
cryptography>=42.0.0
```

- [ ] **Step 2: Actualizar `backend/config.py`**

Agrega estas dos líneas dentro de la clase `Settings`, después de `INTERNAL_API_KEY`:

```python
ENCRYPTION_KEY: str = ""          # Fernet key base64url — llave activa
ENCRYPTION_KEY_V1: str = ""       # Solo durante rotación de llaves
```

En el `model_validator`, dentro del bloque `if self.ENVIRONMENT in ("production", "staging"):`, agrega al final:

```python
if not self.ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY is required in production/staging")
```

- [ ] **Step 3: Verificar que el test de config pasa**

```bash
cd backend
pytest tests/test_config.py -v
```

Expected: todos PASSED

- [ ] **Step 4: Commit**

```bash
git add backend/config.py backend/requirements.txt
git commit -m "feat: add ENCRYPTION_KEY config + cryptography dependency"
```

---

## Task 3: Validación al arranque en `main.py` + fix de conftest

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Fix `conftest.py` para que tests no fallen con validate_key()**

`settings` es un singleton creado al importar `config` — `monkeypatch.setenv` no lo afecta retroactivamente. Hay que parchear el atributo directamente. Abre `backend/tests/conftest.py` y modifica `authed_app`:

```python
@pytest.fixture
def authed_app(mock_db, fake_psychologist, monkeypatch):
    """FastAPI app with DB + auth mocked for integration tests."""
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())
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

- [ ] **Step 2: Agregar `validate_key()` al startup en `main.py`**

En `backend/main.py`, en `startup_event` (~línea 98), agrega `validate_key()` como primera línea:

```python
@app.on_event("startup")
async def startup_event():
    from crypto import validate_key
    validate_key()
    import os
    raw = os.environ.get("ALLOWED_ORIGINS", "NOT_SET")
    parsed = settings.get_allowed_origins()
    if settings.ENVIRONMENT == "development":
        print(f"[CORS_DEBUG] raw env: {repr(raw)}", flush=True)
        print(f"[CORS_DEBUG] parsed origins: {parsed}", flush=True)
    await init_db()
```

- [ ] **Step 3: Verificar que los tests de health pasan**

```bash
cd backend
pytest tests/test_health.py -v
```

Expected: PASSED

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/tests/conftest.py
git commit -m "feat: validate ENCRYPTION_KEY on server startup"
```

---

## Task 4: Migración DB — JSONB → Text

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Cambiar declaraciones ORM**

En `backend/database.py`, localiza la clase `Patient` (~línea 181). Cambia:

```python
emergency_contact: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
```

por:

```python
emergency_contact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

Localiza la clase `Session` (~línea 218). Cambia:

```python
messages: Mapped[list] = mapped_column(JSONB, default=list)
```

por:

```python
messages: Mapped[str] = mapped_column(Text, default="[]")
```

- [ ] **Step 2: Actualizar la línea ADD COLUMN de messages en `init_db()`**

Localiza en `init_db()` (~línea 301):

```python
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]';"))
```

Reemplaza por:

```python
await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages TEXT NOT NULL DEFAULT '[]';"))
```

- [ ] **Step 3: Agregar migraciones DDL JSONB→Text a `init_db()`**

Al final de las migraciones seguras en `init_db()`, antes de los CHECK constraints, agrega:

```python
# Encryption: JSONB → Text (idempotente)
await conn.execute(text("""
    DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='patients' AND column_name='emergency_contact'
              AND data_type='jsonb'
        ) THEN
            ALTER TABLE patients ALTER COLUMN emergency_contact TYPE TEXT
                USING emergency_contact::text;
        END IF;
    END$$;
"""))
await conn.execute(text("""
    DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='sessions' AND column_name='messages'
              AND data_type='jsonb'
        ) THEN
            ALTER TABLE sessions ALTER COLUMN messages TYPE TEXT
                USING messages::text;
        END IF;
    END$$;
"""))
```

- [ ] **Step 4: Correr tests de paciente para detectar regresiones**

```bash
cd backend
pytest tests/test_patient_create.py tests/test_patient_update.py tests/test_patient_get.py -v
```

Expected: todos PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/database.py
git commit -m "feat: migrate emergency_contact and messages from JSONB to Text for encryption"
```

---

## Task 5: Cifrar/descifrar pacientes en `routes.py`

**Files:**
- Modify: `backend/api/routes.py`

- [ ] **Step 1: Agregar imports en `routes.py`**

Al inicio de `backend/api/routes.py`, junto con los otros imports locales (~línea 10), agrega:

```python
import json as _json
from crypto import encrypt_if_set, decrypt_if_set
```

- [ ] **Step 2: Escribir helpers de cifrado/descifrado de paciente**

Agrega estos dos helpers privados después de los imports, antes del primer `@router`:

```python
def _encrypt_patient_fields(patient_orm, payload_sensitive: dict) -> None:
    """Cifra in-place los campos sensibles en el ORM patient antes de commit."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address"]:
        if field in payload_sensitive:
            setattr(patient_orm, field, encrypt_if_set(payload_sensitive[field]))
    if "emergency_contact" in payload_sensitive:
        ec = payload_sensitive["emergency_contact"]
        if ec is not None:
            if isinstance(ec, dict):
                ec = _json.dumps(ec)
            setattr(patient_orm, "emergency_contact", encrypt_if_set(ec))
        else:
            setattr(patient_orm, "emergency_contact", None)


def _decrypt_patient_orm(patient) -> None:
    """Descifra in-place los campos sensibles de un ORM Patient antes de serializar."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address"]:
        setattr(patient, field, decrypt_if_set(getattr(patient, field, None)))
    ec = getattr(patient, "emergency_contact", None)
    if ec is not None:
        decrypted = decrypt_if_set(ec)
        if decrypted and isinstance(decrypted, str):
            try:
                decrypted = _json.loads(decrypted)
            except (_json.JSONDecodeError, TypeError):
                pass
        setattr(patient, "emergency_contact", decrypted)
```

- [ ] **Step 3: Aplicar cifrado en `POST /patients` (create_patient)**

Localiza la construcción de `Patient(...)` en `create_patient` (~línea 243). Reemplaza los campos sensibles:

```python
patient = Patient(
    psychologist_id=current_user.id,
    name=payload.name,
    date_of_birth=payload.date_of_birth,
    diagnosis_tags=payload.diagnosis_tags or [],
    risk_level=payload.risk_level or "low",
    marital_status=payload.marital_status,
    occupation=payload.occupation,
    address=encrypt_if_set(payload.address),
    emergency_contact=encrypt_if_set(
        _json.dumps(payload.emergency_contact.model_dump()) if payload.emergency_contact else None
    ),
    reason_for_consultation=encrypt_if_set(payload.reason_for_consultation),
    medical_history=encrypt_if_set(payload.medical_history),
    psychological_history=encrypt_if_set(payload.psychological_history),
)
```

Y justo antes del `return PatientOut.model_validate(patient)` al final de `create_patient`:

```python
_decrypt_patient_orm(patient)
return PatientOut.model_validate(patient)
```

- [ ] **Step 4: Aplicar descifrado en `GET /patients/{id}` (get_patient)**

Localiza `get_patient` (~línea 281). Justo antes de `return PatientOut.model_validate(patient)`:

```python
_decrypt_patient_orm(patient)
return PatientOut.model_validate(patient)
```

- [ ] **Step 5: Aplicar cifrado/descifrado en `PATCH /patients/{id}` (update_patient)**

Localiza `update_patient` (~línea 303). El loop actual es:

```python
for field, value in updates.items():
    if field == "emergency_contact":
        setattr(patient, field, value.model_dump() if hasattr(value, "model_dump") else value)
    else:
        setattr(patient, field, value)
```

Reemplaza por:

```python
_PATIENT_SENSITIVE = {"medical_history", "psychological_history", "reason_for_consultation", "address"}
for field, value in updates.items():
    if field == "emergency_contact":
        ec = value.model_dump() if hasattr(value, "model_dump") else value
        setattr(patient, field, encrypt_if_set(_json.dumps(ec)) if ec is not None else None)
    elif field in _PATIENT_SENSITIVE:
        setattr(patient, field, encrypt_if_set(value))
    else:
        setattr(patient, field, value)
```

Y justo antes del `return PatientOut.model_validate(patient)` al final:

```python
_decrypt_patient_orm(patient)
return PatientOut.model_validate(patient)
```

- [ ] **Step 6: Correr tests de paciente**

```bash
cd backend
pytest tests/test_patient_create.py tests/test_patient_update.py tests/test_patient_get.py -v
```

Expected: todos PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat: encrypt/decrypt patient sensitive fields in routes"
```

---

## Task 6: Cifrar sesión al crear — `process_session_endpoint`

**Files:**
- Modify: `backend/api/routes.py`

- [ ] **Step 1: Cifrar `raw_dictation`, `ai_response`, `messages` al crear la sesión**

Localiza `process_session_endpoint` (~línea 461). Reemplaza la construcción de `Session(...)`:

```python
session_messages = response.get("session_messages", [])
new_session = Session(
    id=uuid.UUID(session_id),
    patient_id=patient_uuid,
    session_number=current_session_number,
    session_date=date.today(),
    raw_dictation=encrypt_if_set(rec.raw_dictation),
    format=session_format,
    ai_response=encrypt_if_set(response.get("text_fallback")),
    messages=encrypt_if_set(_json.dumps(session_messages)),
    status=session_status,
)
```

- [ ] **Step 2: Correr tests de proceso de sesión**

```bash
cd backend
pytest tests/test_agent_process.py -v
```

Expected: PASSED

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat: encrypt raw_dictation, ai_response and messages on session create"
```

---

## Task 7: Cifrar nota SOAP en `confirm_session` + fix de ai_response

**Files:**
- Modify: `backend/api/routes.py`

El orden crítico: **embedding del texto plano primero → luego cifrar**.

También: `sess.ai_response` ya está cifrado en BD — hay que descifrarlo antes de pasarlo al background job.

- [ ] **Step 1: Modificar `confirm_session`**

Localiza `confirm_session` (~línea 519). Reemplaza el bloque de `text_to_embed` + construcción de `ClinicalNote` + `summary_data`:

```python
structured = note_data.get("structured_note", {})

# 1. Embedding del texto plano ANTES de cifrar
text_to_embed = " ".join([str(v) for v in structured.values() if v])
embedding = await get_embedding(text_to_embed)

# 2. Cifrar campos SOAP
cn = ClinicalNote(
    session_id=sess.id,
    format=note_data.get("format", "SOAP"),
    subjective=encrypt_if_set(structured.get("subjective")),
    objective=encrypt_if_set(structured.get("objective")),
    assessment=encrypt_if_set(structured.get("assessment")),
    plan=encrypt_if_set(structured.get("plan")),
    data_field=encrypt_if_set(structured.get("data_field")),
    detected_patterns=note_data.get("detected_patterns", []),
    alerts=note_data.get("alerts", []),
    suggested_next_steps=note_data.get("suggested_next_steps", []),
    evolution_delta=note_data.get("evolution_delta", {}),
    embedding=embedding,
)
db.add(cn)
await db.commit()

# 3. Descifrar ai_response antes de pasarlo al background job
summary_data = {
    "text_fallback": decrypt_if_set(sess.ai_response) or "",
    "detected_patterns": note_data.get("detected_patterns", []),
    "alerts": note_data.get("alerts", []),
    "suggested_next_steps": note_data.get("suggested_next_steps", []),
}
background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)

return ConfirmNoteOut(id=cn.id)
```

- [ ] **Step 2: Correr tests de API routes**

```bash
cd backend
pytest tests/test_api_routes.py -v
```

Expected: PASSED

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat: encrypt SOAP fields in confirm_session; decrypt ai_response for background job"
```

---

## Task 8: Descifrar en rutas de lectura — sesiones, perfil y conversations

**Files:**
- Modify: `backend/api/routes.py`

- [ ] **Step 1: Descifrar en `get_patient_sessions`**

Localiza el loop en `get_patient_sessions` (~línea 411). Reemplaza el bloque `items.append(SessionOut(...))` para descifrar:

```python
for s, cn in res.all():
    items.append(SessionOut(
        id=s.id,
        session_number=s.session_number,
        session_date=s.session_date,
        raw_dictation=decrypt_if_set(s.raw_dictation),
        ai_response=decrypt_if_set(s.ai_response),
        status=s.status,
        format=s.format,
        structured_note={
            "subjective": decrypt_if_set(cn.subjective),
            "objective": decrypt_if_set(cn.objective),
            "assessment": decrypt_if_set(cn.assessment),
            "plan": decrypt_if_set(cn.plan),
        } if cn else None,
        detected_patterns=list(cn.detected_patterns) if cn and cn.detected_patterns is not None else None,
        alerts=list(cn.alerts) if cn and cn.alerts is not None else None,
        suggested_next_steps=list(cn.suggested_next_steps) if cn and cn.suggested_next_steps is not None else None,
        clinical_note_id=cn.id if cn else None,
    ))
```

- [ ] **Step 2: Descifrar `assessment` en `get_patient_profile`**

Localiza `get_patient_profile` (~línea 363). Reemplaza:

```python
recent_sessions = [{"session_date": s.session_date, "assessment": c.assessment} for s, c in res_s]
```

por:

```python
recent_sessions = [
    {"session_date": s.session_date, "assessment": decrypt_if_set(c.assessment)}
    for s, c in res_s
]
```

- [ ] **Step 3: Descifrar en `list_conversations`**

Localiza el loop en `list_conversations` (~línea 650). Reemplaza:

```python
for row in rows:
    raw = row.get("dictation_preview")
    preview = (raw[:120] + "...") if raw and len(raw) > 120 else raw
    messages = row.get("messages") or []

    items.append(ConversationOut(
        id=str(row["session_id"]) if row["session_id"] else None,
        patient_id=str(row["patient_id"]),
        patient_name=row["patient_name"],
        session_number=row.get("session_number"),
        session_date=row.get("session_date"),
        dictation_preview=preview,
        status=row.get("status"),
        message_count=len(messages) if isinstance(messages, list) else 0,
    ))
```

por:

```python
for row in rows:
    raw = decrypt_if_set(row.get("dictation_preview"))
    preview = (raw[:120] + "...") if raw and len(raw) > 120 else raw
    messages_raw = decrypt_if_set(row.get("messages"))
    try:
        messages = _json.loads(messages_raw) if messages_raw else []
    except (_json.JSONDecodeError, TypeError):
        messages = []

    items.append(ConversationOut(
        id=str(row["session_id"]) if row["session_id"] else None,
        patient_id=str(row["patient_id"]),
        patient_name=row["patient_name"],
        session_number=row.get("session_number"),
        session_date=row.get("session_date"),
        dictation_preview=preview,
        status=row.get("status"),
        message_count=len(messages) if isinstance(messages, list) else 0,
    ))
```

- [ ] **Step 4: Correr todos los tests de routes**

```bash
cd backend
pytest tests/test_api_routes.py tests/test_patient_get.py -v
```

Expected: todos PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes.py
git commit -m "feat: decrypt session and patient fields on all read paths"
```

---

## Task 9: Descifrar en `agent/tools.py`

**Files:**
- Modify: `backend/agent/tools.py`

- [ ] **Step 1: Agregar import de decrypt_if_set**

Al inicio de `backend/agent/tools.py`, agrega:

```python
from crypto import decrypt_if_set
```

- [ ] **Step 2: Descifrar en `search_patient_history`**

Localiza el loop de construcción de `docs` (~línea 115). Reemplaza:

```python
for row in result:
    docs.append({
        "session_number": row[0],
        "date": str(row[1]),
        "summary_fragment": row[2] if row[2] else "",
        "relevance_score": row[3]
    })
```

por:

```python
for row in result:
    docs.append({
        "session_number": row[0],
        "date": str(row[1]),
        "summary_fragment": decrypt_if_set(row[2]) if row[2] else "",
        "relevance_score": row[3]
    })
```

- [ ] **Step 3: Descifrar en `detect_patterns_between_sessions`**

Localiza `detect_patterns_between_sessions` (~línea 127). El campo `row[2]` es `cn.subjective` y `row[3]` es `cn.assessment` — ambos cifrados. Reemplaza:

```python
history = "\n".join([
    f"Session {row[0]} ({row[1]}): {(row[2] or '')[:100]}..."
    for row in rows
])
```

por:

```python
history = "\n".join([
    f"Session {row[0]} ({row[1]}): {(decrypt_if_set(row[2]) or '')[:100]} | {(decrypt_if_set(row[3]) or '')[:100]}..."
    for row in rows
])
```

- [ ] **Step 4: Correr tests del agente**

```bash
cd backend
pytest tests/test_agent_process.py tests/test_agent_embeddings.py -v
```

Expected: PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/agent/tools.py
git commit -m "feat: decrypt clinical note fields before sending to agent tools"
```

---

## Task 10: Descifrar/cifrar en `agent/agent.py`

**Files:**
- Modify: `backend/agent/agent.py`

**Nota:** En este archivo se tocan 4 lugares. Aplicar en el orden indicado:
1. Importar `decrypt_if_set` y `encrypt_if_set`
2. Descifrar `patient_summary` en `_get_patient_context`
3. Descifrar `session.messages` en `_get_patient_context`
4. Descifrar `existing_summary` + cifrar `new_summary` en `update_patient_profile_summary`

- [ ] **Step 1: Agregar imports al inicio de `agent/agent.py`**

```python
import json as _json
from crypto import decrypt_if_set, encrypt_if_set
```

- [ ] **Step 2: Descifrar `patient_summary` en `_get_patient_context` (~línea 98)**

Reemplaza:

```python
if profile.patient_summary:
    profile_block_parts.append(f"Resumen clínico del paciente:\n{profile.patient_summary}")
```

por:

```python
summary = decrypt_if_set(profile.patient_summary)
if summary:
    profile_block_parts.append(f"Resumen clínico del paciente:\n{summary}")
```

- [ ] **Step 3: Descifrar `session.messages` en el loop de sesiones (~línea 132)**

Reemplaza:

```python
for session in reversed(sessions):
    if session.messages:
        context.extend(session.messages)
```

por:

```python
for session in reversed(sessions):
    if session.messages:
        raw = decrypt_if_set(session.messages)
        try:
            turns = _json.loads(raw) if isinstance(raw, str) else raw
        except (_json.JSONDecodeError, TypeError):
            turns = []
        if isinstance(turns, list):
            context.extend(turns)
```

- [ ] **Step 4: Descifrar `existing_summary` + cifrar `new_summary` en `update_patient_profile_summary`**

Localiza (~línea 155):

```python
existing_summary = profile.patient_summary or "Sin resumen previo."
```

Reemplaza por:

```python
existing_summary = decrypt_if_set(profile.patient_summary) or "Sin resumen previo."
```

Localiza (~línea 181):

```python
profile.patient_summary = new_summary
```

Reemplaza por:

```python
profile.patient_summary = encrypt_if_set(new_summary)
```

- [ ] **Step 5: Correr todos los tests**

```bash
cd backend
pytest tests/ -v
```

Expected: todos PASSED

- [ ] **Step 6: Commit final**

```bash
git add backend/agent/agent.py
git commit -m "feat: decrypt messages and patient_summary in agent context; encrypt on write"
```

---

## Task 11: Smoke test manual

- [ ] **Step 1: Instalar dependencias y generar ENCRYPTION_KEY**

```bash
cd backend
pip install -r requirements.txt
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Agrega el resultado al `.env` del backend:
```
ENCRYPTION_KEY=<output del comando>
```

- [ ] **Step 2: Arrancar servidor**

```bash
uvicorn main:app --reload
```

Expected: el servidor arranca sin errores. En logs debe aparecer el startup normal (sin `CRITICAL` de ENCRYPTION_KEY).

- [ ] **Step 3: Verificar cifrado en BD**

1. Login y crear paciente con `reason_for_consultation` y `medical_history`
2. Verificar en psql que los campos están cifrados:

```bash
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente \
  -c "SELECT LEFT(medical_history, 10) FROM patients LIMIT 1;"
```

Expected: `v1:gAAAAA` (no texto plano)

3. Crear sesión con dictado y confirmar nota SOAP
4. Verificar cifrado:

```bash
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente \
  -c "SELECT LEFT(raw_dictation, 10), LEFT(subjective, 10) FROM sessions s LEFT JOIN clinical_notes cn ON cn.session_id = s.id LIMIT 1;"
```

Expected: ambos con prefijo `v1:`

5. Abrir la app — el frontend debe ver texto plano (no tokens Fernet)

- [ ] **Step 4: Commit de cualquier fix detectado en smoke test**

```bash
git add -p
git commit -m "fix: <descripción>"
```

---

## Generación de llave para Railway (producción)

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Agregar como `ENCRYPTION_KEY` en Railway → servicio → Variables → Production environment. No commitear la llave al repo.
