# Patient Password Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar recuperación de contraseña para pacientes en el portal usando Resend, con toggle inline en PatientLogin y página dedicada de reset.

**Architecture:** Nueva tabla `PatientPasswordResetToken` en Postgres (espejo de `PasswordResetToken` de psicólogos). Dos endpoints en `patient_auth.py`: `POST /forgot-password` (genera token SHA-256, envía email) y `POST /reset-password` (valida token, actualiza password, devuelve JWT). En frontend: PatientLogin agrega estado `mode: login|forgot|sent`; nueva página `PatientResetPassword` para `/portal/reset?token=…`.

**Tech Stack:** FastAPI + SQLAlchemy async, bcrypt, secrets/hashlib, slowapi rate limiting, Resend email, React 18 + Vite, Tailwind CDN, Vitest + React Testing Library.

---

## Archivos impactados

| Archivo | Acción |
|---|---|
| `backend/database.py` | + clase `PatientPasswordResetToken` |
| `backend/services/email.py` | + función `send_patient_reset_email()` |
| `backend/api/patient_auth.py` | + imports, helpers, 2 endpoints, 2 Pydantic models |
| `backend/tests/test_patient_auth.py` | + 8 nuevos casos de prueba |
| `frontend/src/auth.js` | + ruta `/portal/reset` en `getScreenFromUrl` |
| `frontend/src/App.jsx` | + import, skip-refresh, case `patient-reset` |
| `frontend/src/pages/PatientLogin.jsx` | + estado `mode`, handlers, UI forgot/sent |
| `frontend/src/pages/PatientResetPassword.jsx` | archivo nuevo |
| `frontend/src/patientApi.js` | + 2 funciones |
| `frontend/src/pages/PatientResetPassword.test.jsx` | archivo nuevo |

---

## Task 1: Modelo de datos — PatientPasswordResetToken

**Files:**
- Modify: `backend/database.py` (después de la clase `PasswordResetToken`, antes de `ProcessedStripeEvent`)

- [ ] **Paso 1: Agregar el modelo**

  Abre `backend/database.py`. Localiza la clase `PasswordResetToken` (busca `__tablename__ = 'password_reset_tokens'`). Inmediatamente después del cierre de esa clase, agrega:

  ```python
  class PatientPasswordResetToken(Base):
      __tablename__ = 'patient_password_reset_tokens'

      id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
      patient_user_id: Mapped[uuid.UUID] = mapped_column(
          ForeignKey('patient_users.id', ondelete='CASCADE'), nullable=False
      )
      token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
      expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
      used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
      failed_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
      ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
      created_at: Mapped[datetime] = mapped_column(
          DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
      )

      __table_args__ = (
          Index('idx_patient_password_reset_tokens_hash', 'token_hash'),
      )
  ```

- [ ] **Paso 2: Verificar que la tabla se crea**

  ```bash
  cd backend
  python -c "import asyncio; from database import init_db; asyncio.run(init_db())"
  ```

  Esperado: sin errores. Si hay error de conexión a Postgres, levanta el contenedor primero: `docker-compose up -d postgres`.

- [ ] **Paso 3: Confirmar tabla en Postgres**

  ```bash
  docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "\d patient_password_reset_tokens"
  ```

  Esperado: tabla con columnas `id, patient_user_id, token_hash, expires_at, used_at, failed_attempts, ip_address, created_at`.

- [ ] **Paso 4: Commit**

  ```bash
  git add backend/database.py
  git commit -m "feat: add PatientPasswordResetToken model"
  ```

---

## Task 2: Función de email — send_patient_reset_email

**Files:**
- Modify: `backend/services/email.py` (al final del archivo)

- [ ] **Paso 1: Agregar la función al final de `services/email.py`**

  ```python
  async def send_patient_reset_email(to_email: str, patient_name: str, token: str):
      frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
      reset_url = f"{frontend_url}/portal/reset?token={token}"
      if not resend.api_key:
          print(f"Mock email: Password reset for patient {patient_name} ({to_email}) -> {reset_url}")
          return None
      try:
          r = resend.Emails.send({
              "from": FROM_EMAIL,
              "to": to_email,
              "subject": "Restablece tu contraseña — Portal del Paciente SyqueX",
              "html": f"""
  <html>
  <body style="font-family:-apple-system,sans-serif;background:#f4f4f2;margin:0;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.07);">
      <div style="background:#5a9e8a;padding:28px 32px;">
        <p style="color:white;font-size:15px;font-weight:700;margin:0 0 8px 0;letter-spacing:-.02em;">SyqueX</p>
        <h1 style="color:white;font-family:Georgia,serif;font-size:22px;margin:0 0 6px 0;line-height:1.3;">Recupera tu contraseña</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;line-height:1.5;">Portal del Paciente</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="color:#18181b;font-size:14px;margin:0 0 16px 0;">Hola {patient_name},</p>
        <p style="color:#374151;font-size:13px;margin:0 0 24px 0;line-height:1.6;">
          Recibimos una solicitud para restablecer la contraseña de tu portal. Si no la pediste, puedes ignorar este mensaje.
        </p>
        <a href="{reset_url}" style="display:block;background:#5a9e8a;color:white;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;margin-bottom:20px;">
          Crear nueva contraseña →
        </a>
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">
          Este link es válido por 60 minutos.
        </p>
      </div>
    </div>
  </body>
  </html>
              """
          })
          return r
      except Exception as e:
          print(f"Error enviando email reset paciente: {e}")
          return None
  ```

- [ ] **Paso 2: Verificar import en Python**

  ```bash
  cd backend
  python -c "from services.email import send_patient_reset_email; print('OK')"
  ```

  Esperado: `OK`

- [ ] **Paso 3: Commit**

  ```bash
  git add backend/services/email.py
  git commit -m "feat: add send_patient_reset_email function"
  ```

---

## Task 3: Backend — endpoint forgot-password + tests

**Files:**
- Modify: `backend/api/patient_auth.py`
- Modify: `backend/tests/test_patient_auth.py`

- [ ] **Paso 1: Escribir los tests que fallarán**

  Abre `backend/tests/test_patient_auth.py`. Al final del archivo agrega:

  ```python
  # ── Forgot Password Tests ──────────────────────────────────────────────────
  # Agrega `patch` al import existente al inicio del archivo:
  # from unittest.mock import AsyncMock, MagicMock, patch

  FORGOT_URL = "/api/v1/auth/patient/forgot-password"


  @pytest.fixture
  def patient_user_active():
      pu = MagicMock()
      pu.id = uuid.uuid4()
      pu.patient_id = uuid.uuid4()
      pu.email = "patient@example.com"
      pu.is_active = True
      return pu


  @pytest.mark.asyncio
  async def test_forgot_password_existing_email(patient_user_active):
      """200 con mensaje genérico; token añadido a DB; email enviado."""
      from main import app
      from database import get_db

      patient_mock = MagicMock()
      patient_mock.name = "Ana García"

      result_pu = MagicMock()
      result_pu.scalar_one_or_none.return_value = patient_user_active
      result_patient = MagicMock()
      result_patient.scalar_one_or_none.return_value = patient_mock

      mock_db = AsyncMock()
      mock_db.execute.side_effect = [result_pu, result_patient]

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      with patch('api.patient_auth.send_patient_reset_email', new_callable=AsyncMock) as mock_email:
          try:
              async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                  res = await client.post(FORGOT_URL, json={"email": "patient@example.com"})
              assert res.status_code == 200
              data = res.json()
              assert "message" in data
              assert "Si esa dirección" in data["message"]
              mock_db.add.assert_called_once()
              mock_email.assert_called_once()
          finally:
              app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_forgot_password_nonexistent_email():
      """Email inexistente → 200 mismo mensaje (sin user enumeration)."""
      from main import app
      from database import get_db

      result_none = MagicMock()
      result_none.scalar_one_or_none.return_value = None

      mock_db = AsyncMock()
      mock_db.execute.return_value = result_none

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      with patch('api.patient_auth.send_patient_reset_email', new_callable=AsyncMock) as mock_email:
          try:
              async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                  res = await client.post(FORGOT_URL, json={"email": "ghost@example.com"})
              assert res.status_code == 200
              data = res.json()
              assert "Si esa dirección" in data["message"]
              mock_db.add.assert_not_called()
              mock_email.assert_not_called()
          finally:
              app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_forgot_password_per_email_rate_limit():
      """Segunda solicitud para el mismo email en 10 min → 429."""
      from main import app
      from database import get_db
      from datetime import datetime, timezone
      import api.patient_auth as patient_auth_module

      patient_auth_module._forgot_pw_email_attempts["ratelimited@example.com"] = [
          datetime.now(timezone.utc)
      ]

      mock_db = AsyncMock()

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(FORGOT_URL, json={"email": "ratelimited@example.com"})
          assert res.status_code == 429
      finally:
          app.dependency_overrides.clear()
          patient_auth_module._forgot_pw_email_attempts.pop("ratelimited@example.com", None)
  ```

- [ ] **Paso 2: Verificar que los tests fallan**

  ```bash
  cd backend
  pytest tests/test_patient_auth.py::test_forgot_password_existing_email tests/test_patient_auth.py::test_forgot_password_nonexistent_email tests/test_patient_auth.py::test_forgot_password_per_email_rate_limit -v
  ```

  Esperado: 3 FAILs (endpoint no existe aún).

- [ ] **Paso 3: Agregar imports y helpers a `patient_auth.py`**

  Al inicio del archivo, después de los imports existentes, agrega:

  ```python
  from fastapi import Request
  from api.limiter import limiter
  from database import PatientPasswordResetToken, Patient
  from services.email import send_patient_reset_email
  import hashlib
  import secrets
  import asyncio
  import random
  from collections import defaultdict
  ```

  Después de las funciones `hash_password` y `verify_password`, agrega estos helpers:

  ```python
  _forgot_pw_email_attempts: dict = defaultdict(list)


  def _hash_token(raw: str) -> str:
      return hashlib.sha256(raw.encode()).hexdigest()


  def _check_patient_forgot_email_rate(email: str) -> None:
      now = datetime.now(timezone.utc)
      window = now - timedelta(minutes=10)
      _forgot_pw_email_attempts[email] = [
          t for t in _forgot_pw_email_attempts[email] if t > window
      ]
      if len(_forgot_pw_email_attempts[email]) >= 1:
          raise HTTPException(
              status_code=status.HTTP_429_TOO_MANY_REQUESTS,
              detail="Demasiadas solicitudes. Intenta en 10 minutos.",
              headers={"Retry-After": "600"},
          )
      _forgot_pw_email_attempts[email].append(now)
  ```

  Después de `PatientLoginRequest`, agrega los nuevos Pydantic models:

  ```python
  class ForgotPasswordRequest(BaseModel):
      email: str


  class ResetPasswordRequest(BaseModel):
      token: str
      new_password: str
  ```

- [ ] **Paso 4: Implementar el endpoint forgot-password**

  Al final de `patient_auth.py`, antes del cierre del archivo, agrega:

  ```python
  _FORGOT_GENERIC_MSG = (
      "Si esa dirección tiene una cuenta activa, recibirás un link en los próximos minutos."
  )


  @router.post("/forgot-password")
  @limiter.limit("3/hour")
  async def patient_forgot_password(
      request: Request,
      req: ForgotPasswordRequest,
      db: AsyncSession = Depends(get_db),
  ):
      _check_patient_forgot_email_rate(req.email)
      await asyncio.sleep(random.uniform(0.1, 0.3))

      result = await db.execute(
          select(PatientUser).where(
              PatientUser.email == req.email,
              PatientUser.is_active == True,
          )
      )
      patient_user = result.scalar_one_or_none()

      if patient_user:
          raw_token = secrets.token_urlsafe(32)
          reset_record = PatientPasswordResetToken(
              patient_user_id=patient_user.id,
              token_hash=_hash_token(raw_token),
              expires_at=datetime.now(timezone.utc) + timedelta(minutes=60),
              ip_address=request.client.host if request.client else None,
          )
          db.add(reset_record)
          await db.commit()

          patient_result = await db.execute(
              select(Patient).where(Patient.id == patient_user.patient_id)
          )
          patient = patient_result.scalar_one_or_none()
          patient_name = patient.name if patient else "Paciente"

          try:
              await send_patient_reset_email(patient_user.email, patient_name, raw_token)
          except Exception:
              pass

      return {"message": _FORGOT_GENERIC_MSG}
  ```

- [ ] **Paso 5: Correr tests y verificar que pasan**

  ```bash
  cd backend
  pytest tests/test_patient_auth.py::test_forgot_password_existing_email tests/test_patient_auth.py::test_forgot_password_nonexistent_email tests/test_patient_auth.py::test_forgot_password_per_email_rate_limit -v
  ```

  Esperado: 3 PASSes.

- [ ] **Paso 6: Commit**

  ```bash
  git add backend/api/patient_auth.py backend/tests/test_patient_auth.py
  git commit -m "feat: add patient forgot-password endpoint"
  ```

---

## Task 4: Backend — endpoint reset-password + tests

**Files:**
- Modify: `backend/api/patient_auth.py`
- Modify: `backend/tests/test_patient_auth.py`

- [ ] **Paso 1: Escribir los tests que fallarán**

  Al final de `backend/tests/test_patient_auth.py`, agrega:

  ```python
  # ── Reset Password Tests ───────────────────────────────────────────────────

  RESET_URL = "/api/v1/auth/patient/reset-password"
  VALID_RAW_TOKEN = "valid-raw-token-abc123xyz"


  @pytest.fixture
  def reset_token_valid(patient_user_active):
      from datetime import datetime, timezone, timedelta
      import hashlib
      t = MagicMock()
      t.id = uuid.uuid4()
      t.patient_user_id = patient_user_active.id
      t.token_hash = hashlib.sha256(VALID_RAW_TOKEN.encode()).hexdigest()
      t.expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)
      t.used_at = None
      t.failed_attempts = 0
      return t


  @pytest.mark.asyncio
  async def test_reset_password_valid_token(patient_user_active, reset_token_valid):
      """Token válido → 200 + JWT, password_hash actualizado, used_at seteado."""
      from main import app
      from database import get_db

      result_token = MagicMock()
      result_token.scalar_one_or_none.return_value = reset_token_valid
      result_user = MagicMock()
      result_user.scalar_one_or_none.return_value = patient_user_active

      mock_db = AsyncMock()
      mock_db.execute.side_effect = [result_token, result_user]

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(RESET_URL, json={
                  "token": VALID_RAW_TOKEN,
                  "new_password": "NewPassword1"
              })
          assert res.status_code == 200
          data = res.json()
          assert "access_token" in data
          assert data["token_type"] == "bearer"
          assert reset_token_valid.used_at is not None
          assert patient_user_active.password_hash is not None
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_reset_password_expired_token(reset_token_valid):
      """Token expirado → 400, failed_attempts incrementado."""
      from main import app
      from database import get_db

      reset_token_valid.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)

      result_token = MagicMock()
      result_token.scalar_one_or_none.return_value = reset_token_valid

      mock_db = AsyncMock()
      mock_db.execute.return_value = result_token

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(RESET_URL, json={
                  "token": VALID_RAW_TOKEN,
                  "new_password": "NewPassword1"
              })
          assert res.status_code == 400
          assert reset_token_valid.failed_attempts == 1
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_reset_password_already_used(reset_token_valid):
      """Token ya usado → 400."""
      from main import app
      from database import get_db

      reset_token_valid.used_at = datetime.now(timezone.utc) - timedelta(minutes=5)

      result_token = MagicMock()
      result_token.scalar_one_or_none.return_value = reset_token_valid

      mock_db = AsyncMock()
      mock_db.execute.return_value = result_token

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(RESET_URL, json={
                  "token": VALID_RAW_TOKEN,
                  "new_password": "NewPassword1"
              })
          assert res.status_code == 400
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_reset_password_max_failed_attempts(reset_token_valid):
      """Token con 3+ intentos fallidos → 400."""
      from main import app
      from database import get_db

      reset_token_valid.failed_attempts = 3

      result_token = MagicMock()
      result_token.scalar_one_or_none.return_value = reset_token_valid

      mock_db = AsyncMock()
      mock_db.execute.return_value = result_token

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(RESET_URL, json={
                  "token": VALID_RAW_TOKEN,
                  "new_password": "NewPassword1"
              })
          assert res.status_code == 400
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_reset_password_invalid_token():
      """Token no encontrado → 400."""
      from main import app
      from database import get_db

      result_none = MagicMock()
      result_none.scalar_one_or_none.return_value = None

      mock_db = AsyncMock()
      mock_db.execute.return_value = result_none

      async def override_db():
          yield mock_db

      app.dependency_overrides[get_db] = override_db
      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              res = await client.post(RESET_URL, json={
                  "token": "wrong-token-xyz",
                  "new_password": "NewPassword1"
              })
          assert res.status_code == 400
      finally:
          app.dependency_overrides.clear()
  ```

- [ ] **Paso 2: Correr tests para verificar que fallan**

  ```bash
  cd backend
  pytest tests/test_patient_auth.py::test_reset_password_valid_token tests/test_patient_auth.py::test_reset_password_expired_token tests/test_patient_auth.py::test_reset_password_already_used tests/test_patient_auth.py::test_reset_password_max_failed_attempts tests/test_patient_auth.py::test_reset_password_invalid_token -v
  ```

  Esperado: 5 FAILs.

- [ ] **Paso 3: Implementar el endpoint reset-password**

  Al final de `patient_auth.py`, después de `patient_forgot_password`, agrega:

  ```python
  _INVALID_TOKEN_MSG = "El link de recuperación no es válido o ha expirado."


  @router.post("/reset-password")
  @limiter.limit("5/hour")
  async def patient_reset_password(
      request: Request,
      req: ResetPasswordRequest,
      db: AsyncSession = Depends(get_db),
  ):
      if len(req.new_password) < 8:
          raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

      token_hash = _hash_token(req.token)
      result = await db.execute(
          select(PatientPasswordResetToken).where(
              PatientPasswordResetToken.token_hash == token_hash
          )
      )
      reset_record = result.scalar_one_or_none()

      if not reset_record:
          raise HTTPException(status_code=400, detail=_INVALID_TOKEN_MSG)

      if reset_record.failed_attempts >= 3:
          raise HTTPException(status_code=400, detail=_INVALID_TOKEN_MSG)

      now = datetime.now(timezone.utc)

      if reset_record.used_at is not None or reset_record.expires_at < now:
          reset_record.failed_attempts += 1
          await db.commit()
          raise HTTPException(status_code=400, detail=_INVALID_TOKEN_MSG)

      user_result = await db.execute(
          select(PatientUser).where(PatientUser.id == reset_record.patient_user_id)
      )
      patient_user = user_result.scalar_one_or_none()

      if not patient_user:
          raise HTTPException(status_code=400, detail=_INVALID_TOKEN_MSG)

      patient_user.password_hash = hash_password(req.new_password)
      reset_record.used_at = now
      await db.commit()
      await db.refresh(patient_user)

      access_token = create_patient_access_token(patient_user)
      return {"access_token": access_token, "token_type": "bearer"}
  ```

- [ ] **Paso 4: Correr todos los tests de patient_auth**

  ```bash
  cd backend
  pytest tests/test_patient_auth.py -v
  ```

  Esperado: todos los tests PASS (incluyendo los de invite y login previos).

- [ ] **Paso 5: Commit**

  ```bash
  git add backend/api/patient_auth.py backend/tests/test_patient_auth.py
  git commit -m "feat: add patient reset-password endpoint with tests"
  ```

---

## Task 5: Frontend API — patientApi.js

**Files:**
- Modify: `frontend/src/patientApi.js` (al final del archivo)

- [ ] **Paso 1: Agregar las dos nuevas funciones**

  Al final de `frontend/src/patientApi.js`, agrega:

  ```javascript
  export async function requestPatientPasswordReset(email) {
    const res = await fetch(`${API_BASE}/auth/patient/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      let msg = 'Error al procesar la solicitud'
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch (e) {}
      throw new Error(msg)
    }

    return res.json()
  }

  export async function resetPatientPassword(token, newPassword) {
    const res = await fetch(`${API_BASE}/auth/patient/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    })

    if (!res.ok) {
      let msg = 'El link de recuperación no es válido o ha expirado.'
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch (e) {}
      throw new Error(msg)
    }

    const data = await res.json()
    setPatientToken(data.access_token)
    return data
  }
  ```

- [ ] **Paso 2: Commit**

  ```bash
  git add frontend/src/patientApi.js
  git commit -m "feat: add requestPatientPasswordReset and resetPatientPassword to patientApi"
  ```

---

## Task 6: Routing — auth.js + App.jsx

**Files:**
- Modify: `frontend/src/auth.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Paso 1: Agregar ruta `/portal/reset` en auth.js**

  En `frontend/src/auth.js`, localiza este bloque (líneas 32-34):

  ```javascript
  if (path === '/portal/login') return { screen: 'patient-login' };
  if (path === '/portal/invite') return { screen: 'patient-invite', inviteToken: token };
  if (path === '/portal') return { screen: 'patient-portal' };
  ```

  Agrega la línea de reset **antes** de `/portal/login`:

  ```javascript
  if (path === '/portal/reset') return { screen: 'patient-reset', resetToken: token };
  if (path === '/portal/login') return { screen: 'patient-login' };
  if (path === '/portal/invite') return { screen: 'patient-invite', inviteToken: token };
  if (path === '/portal') return { screen: 'patient-portal' };
  ```

- [ ] **Paso 2: Actualizar initAuth en App.jsx — skip refresh**

  En `frontend/src/App.jsx`, localiza la línea (aprox. 278):

  ```javascript
  if (screen === 'register' || screen === 'forgot-password' || screen === 'reset-password' || screen === 'patient-invite') return;
  ```

  Reemplázala por:

  ```javascript
  if (screen === 'register' || screen === 'forgot-password' || screen === 'reset-password' || screen === 'patient-invite' || screen === 'patient-reset') return;
  ```

- [ ] **Paso 3: Agregar import de PatientResetPassword en App.jsx**

  En `frontend/src/App.jsx`, localiza el grupo de imports de páginas de paciente:

  ```javascript
  import PatientLogin from './pages/PatientLogin';
  import PatientInviteAccept from './pages/PatientInviteAccept';
  import PatientPortal from './pages/PatientPortal';
  ```

  Agrega la línea de import:

  ```javascript
  import PatientLogin from './pages/PatientLogin';
  import PatientInviteAccept from './pages/PatientInviteAccept';
  import PatientPortal from './pages/PatientPortal';
  import PatientResetPassword from './pages/PatientResetPassword';
  ```

- [ ] **Paso 4: Agregar case patient-reset en el render de App.jsx**

  En `frontend/src/App.jsx`, localiza (aprox. líneas 626-634):

  ```javascript
  if (screen === 'patient-login') {
    return <PatientLogin setScreen={(s) => setAuthScreen({ screen: s })} />;
  }
  ```

  Agrega el case **antes** del patient-login:

  ```javascript
  if (screen === 'patient-reset') {
    return <PatientResetPassword resetToken={authScreen.resetToken} setScreen={(s) => setAuthScreen({ screen: s })} />;
  }
  if (screen === 'patient-login') {
    return <PatientLogin setScreen={(s) => setAuthScreen({ screen: s })} />;
  }
  ```

- [ ] **Paso 5: Commit**

  ```bash
  git add frontend/src/auth.js frontend/src/App.jsx
  git commit -m "feat: add patient-reset route to auth.js and App.jsx"
  ```

---

## Task 7: PatientLogin.jsx — inline toggle

**Files:**
- Modify: `frontend/src/pages/PatientLogin.jsx`

- [ ] **Paso 1: Agregar imports y estado nuevo**

  En `PatientLogin.jsx`, modifica el bloque de imports y estados iniciales:

  Añade `requestPatientPasswordReset` al import de patientApi:

  ```javascript
  import { patientLogin, requestPatientPasswordReset } from '../patientApi';
  ```

  Dentro del componente `PatientLogin`, después de las declaraciones de estado existentes (`email`, `password`, `loading`, `error`), agrega:

  ```javascript
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'sent'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  ```

- [ ] **Paso 2: Agregar handler de forgot**

  Después del `handleSubmit` existente, agrega:

  ```javascript
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      await requestPatientPasswordReset(forgotEmail);
      setMode('sent');
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };
  ```

- [ ] **Paso 3: Modificar el form panel para los tres modos**

  En el JSX, localiza el bloque `{/* Form panel */}`. El contenido interno del `<div className="w-full max-w-sm">` debe quedar así (reemplaza el contenido interno completo):

  ```jsx
  {mode === 'login' && (
    <>
      <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-6">
        Inicia sesión
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
            Correo electrónico
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] font-bold">!</span>
            </div>
            <p className="text-[12px] text-red-600">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {loading ? 'Iniciando sesión…' : 'Entrar al portal →'}
        </button>
        <hr className="border-black/[0.06]" />
        <button
          type="button"
          onClick={() => setMode('forgot')}
          className="w-full text-[9px] text-[#5a9e8a] text-center underline hover:no-underline transition-all"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </>
  )}

  {mode === 'forgot' && (
    <form onSubmit={handleForgotSubmit} className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-1">
          Recuperar contraseña
        </h2>
        <p className="text-[12px] text-[#9ca3af] mb-4 leading-relaxed">
          Te enviaremos un link para crear una nueva contraseña.
        </p>
      </div>
      <div>
        <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
          Correo electrónico
        </label>
        <input
          type="email"
          required
          value={forgotEmail}
          onChange={(e) => setForgotEmail(e.target.value)}
          placeholder="tu@email.com"
          className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
        />
      </div>
      {forgotError && (
        <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[9px] font-bold">!</span>
          </div>
          <p className="text-[12px] text-red-600">{forgotError}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={forgotLoading}
        className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {forgotLoading ? 'Enviando…' : 'Enviar link de recuperación →'}
      </button>
      <hr className="border-black/[0.06]" />
      <button
        type="button"
        onClick={() => setMode('login')}
        className="w-full text-[12px] text-[#9ca3af] text-center hover:text-[#18181b] transition-colors"
      >
        ← Volver al inicio de sesión
      </button>
    </form>
  )}

  {mode === 'sent' && (
    <div className="space-y-4">
      <div className="bg-[#f0faf7] border border-[#5a9e8a] rounded-xl px-3 py-3 flex items-start gap-3">
        <div className="w-5 h-5 rounded-full bg-[#5a9e8a] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold font-serif text-[#5a9e8a]">Revisa tu correo</p>
          <p className="text-[11px] text-[#9ca3af] mt-1 leading-relaxed">
            Si esa dirección tiene una cuenta activa, recibirás un link en los próximos minutos.
          </p>
        </div>
      </div>
      <hr className="border-black/[0.06]" />
      <button
        type="button"
        onClick={() => setMode('login')}
        className="w-full text-[12px] text-[#9ca3af] text-center hover:text-[#18181b] transition-colors"
      >
        ← Volver al inicio de sesión
      </button>
    </div>
  )}
  ```

  El bloque de "Datos encriptados · Solo tú los ves" para móvil que ya existe al final — mantenlo solo si `mode === 'login'` envolviéndolo en `{mode === 'login' && (...)}`.

- [ ] **Paso 4: Commit**

  ```bash
  git add frontend/src/pages/PatientLogin.jsx
  git commit -m "feat: add forgot-password inline toggle to PatientLogin"
  ```

---

## Task 8: PatientResetPassword.jsx — nueva página

**Files:**
- Create: `frontend/src/pages/PatientResetPassword.jsx`

- [ ] **Paso 1: Crear el archivo**

  Crea `frontend/src/pages/PatientResetPassword.jsx` con el siguiente contenido:

  ```jsx
  import { useState, useEffect } from 'react';
  import { navigateTo } from '../auth';
  import { resetPatientPassword } from '../patientApi';

  export default function PatientResetPassword({ resetToken, setScreen }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
      if (!resetToken) {
        navigateTo('/portal/login');
        setScreen('patient-login');
      }
    }, [resetToken, setScreen]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await resetPatientPassword(resetToken, password);
        setSuccess(true);
        setTimeout(() => {
          navigateTo('/portal');
          setScreen('patient-portal');
        }, 1500);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (success) {
      return (
        <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#5a9e8a] px-5 py-4 max-w-sm w-full flex items-center gap-4">
            <svg className="w-5 h-5 text-[#5a9e8a] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-[14px] font-semibold text-[#5a9e8a] font-serif">¡Contraseña actualizada!</p>
              <p className="text-[12px] text-[#9ca3af] mt-0.5">Redirigiendo a tu portal…</p>
            </div>
          </div>
        </div>
      );
    }

    const isExpiredError = error && (error.includes('expirado') || error.includes('válido'));

    return (
      <div className="min-h-screen bg-[#f4f4f2] flex flex-col md:flex-row font-sans">

        {/* Sage panel */}
        <div className="bg-[#5a9e8a] px-6 py-8 md:w-[42%] md:min-h-screen md:flex md:flex-col md:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <span className="text-white text-[15px] font-bold tracking-tight">SyqueX</span>
            </div>
            <h1 className="text-white text-[22px] font-bold font-serif leading-snug mb-2">
              Nueva contraseña
            </h1>
            <p className="text-white/70 text-[13px] leading-relaxed">
              Elige una contraseña segura para tu portal.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 mt-8 pt-6 border-t border-white/[0.18]">
            <svg className="w-3.5 h-3.5 text-white/55 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-white/55 text-[11px]">Datos encriptados</span>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex-1 bg-white px-6 py-8 md:flex md:items-center md:justify-center">
          <div className="w-full max-w-sm">
            <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-6">
              Crear nueva contraseña
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                />
                <p className="text-[11px] text-[#9ca3af] mt-1.5 pl-0.5">Mínimo 8 caracteres</p>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                />
              </div>
              {error && (
                <div className="flex flex-col gap-1.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">!</span>
                    </div>
                    <p className="text-[12px] text-red-600">{error}</p>
                  </div>
                  {isExpiredError && (
                    <button
                      type="button"
                      onClick={() => { navigateTo('/portal/login'); setScreen('patient-login'); }}
                      className="text-[11px] text-[#5a9e8a] underline text-left pl-6"
                    >
                      Solicitar un nuevo link
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? 'Guardando…' : 'Guardar nueva contraseña →'}
              </button>
            </form>

            <div className="flex items-center justify-center gap-1.5 mt-6 md:hidden">
              <svg className="w-3 h-3 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[11px] text-[#9ca3af]">Datos encriptados · Solo tú los ves</span>
            </div>
          </div>
        </div>

      </div>
    );
  }
  ```

- [ ] **Paso 2: Commit**

  ```bash
  git add frontend/src/pages/PatientResetPassword.jsx
  git commit -m "feat: add PatientResetPassword page"
  ```

---

## Task 9: Tests de frontend

**Files:**
- Create: `frontend/src/pages/PatientResetPassword.test.jsx`

- [ ] **Paso 1: Verificar setup de tests**

  ```bash
  cd frontend
  npm test -- --run --reporter=verbose 2>&1 | head -20
  ```

  Esperado: alguna salida de Vitest. Si falla con "vitest not found", ejecuta `npm install` primero.

- [ ] **Paso 2: Crear `PatientResetPassword.test.jsx`**

  Crea `frontend/src/pages/PatientResetPassword.test.jsx`:

  ```jsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { vi, describe, it, expect, beforeEach } from 'vitest'
  import PatientResetPassword from './PatientResetPassword'

  vi.mock('../auth', () => ({
    navigateTo: vi.fn(),
  }))

  vi.mock('../patientApi', () => ({
    resetPatientPassword: vi.fn(),
    setPatientToken: vi.fn(),
  }))

  const { navigateTo } = await import('../auth')
  const { resetPatientPassword } = await import('../patientApi')

  describe('PatientResetPassword', () => {
    const mockSetScreen = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('redirige a /portal/login si no hay token', () => {
      render(<PatientResetPassword resetToken={null} setScreen={mockSetScreen} />)
      expect(navigateTo).toHaveBeenCalledWith('/portal/login')
      expect(mockSetScreen).toHaveBeenCalledWith('patient-login')
    })

    it('muestra el form cuando hay token', () => {
      render(<PatientResetPassword resetToken="valid-token-123" setScreen={mockSetScreen} />)
      expect(screen.getByText('Crear nueva contraseña')).toBeTruthy()
    })

    it('muestra error si las contraseñas no coinciden', async () => {
      render(<PatientResetPassword resetToken="valid-token-123" setScreen={mockSetScreen} />)

      const inputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(inputs[0], { target: { value: 'Password1' } })
      fireEvent.change(inputs[1], { target: { value: 'Password2' } })

      fireEvent.submit(screen.getByRole('button', { name: /Guardar nueva contraseña/i }))

      await waitFor(() => {
        expect(screen.getByText('Las contraseñas no coinciden')).toBeTruthy()
      })
      expect(resetPatientPassword).not.toHaveBeenCalled()
    })

    it('llama resetPatientPassword y navega a /portal en éxito', async () => {
      resetPatientPassword.mockResolvedValueOnce({ access_token: 'jwt-token' })

      render(<PatientResetPassword resetToken="valid-token-123" setScreen={mockSetScreen} />)

      const inputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(inputs[0], { target: { value: 'ValidPass1' } })
      fireEvent.change(inputs[1], { target: { value: 'ValidPass1' } })

      fireEvent.submit(screen.getByRole('button', { name: /Guardar nueva contraseña/i }))

      await waitFor(() => {
        expect(resetPatientPassword).toHaveBeenCalledWith('valid-token-123', 'ValidPass1')
      })

      await waitFor(() => {
        expect(screen.getByText('¡Contraseña actualizada!')).toBeTruthy()
      })
    })

    it('muestra error y link de re-solicitud si el token expiró', async () => {
      resetPatientPassword.mockRejectedValueOnce(new Error('El link ha expirado.'))

      render(<PatientResetPassword resetToken="expired-token" setScreen={mockSetScreen} />)

      const inputs = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(inputs[0], { target: { value: 'ValidPass1' } })
      fireEvent.change(inputs[1], { target: { value: 'ValidPass1' } })

      fireEvent.submit(screen.getByRole('button', { name: /Guardar nueva contraseña/i }))

      await waitFor(() => {
        expect(screen.getByText(/expirado/i)).toBeTruthy()
        expect(screen.getByText('Solicitar un nuevo link')).toBeTruthy()
      })
    })
  })
  ```

- [ ] **Paso 3: Correr los tests de frontend**

  ```bash
  cd frontend
  npm test -- --run frontend/src/pages/PatientResetPassword.test.jsx
  ```

  Esperado: 4/4 PASSes (el test de redirect puede requerir ajuste si el useEffect no se dispara en el mock — si falla, envuelve la aserción en `waitFor`).

- [ ] **Paso 4: Correr todos los tests del proyecto**

  ```bash
  cd backend && pytest tests/ -v
  cd ../frontend && npm test -- --run
  ```

  Esperado: todos los tests de backend y frontend PASS.

- [ ] **Paso 5: Agregar tests de PatientLogin toggle**

  Crea `frontend/src/pages/PatientLogin.test.jsx`:

  ```jsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { vi, describe, it, expect, beforeEach } from 'vitest'
  import PatientLogin from './PatientLogin'

  vi.mock('../auth', () => ({ navigateTo: vi.fn() }))
  vi.mock('../patientApi', () => ({
    patientLogin: vi.fn(),
    requestPatientPasswordReset: vi.fn(),
  }))

  const { patientLogin } = await import('../patientApi')
  const { requestPatientPasswordReset } = await import('../patientApi')

  describe('PatientLogin — forgot password toggle', () => {
    const mockSetScreen = vi.fn()

    beforeEach(() => { vi.clearAllMocks() })

    it('muestra el link ¿Olvidaste? en modo login', () => {
      render(<PatientLogin setScreen={mockSetScreen} />)
      expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeTruthy()
    })

    it('click en ¿Olvidaste? cambia a modo forgot', () => {
      render(<PatientLogin setScreen={mockSetScreen} />)
      fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'))
      expect(screen.getByText('Recuperar contraseña')).toBeTruthy()
      expect(screen.getByText('Enviar link de recuperación →')).toBeTruthy()
    })

    it('submit en modo forgot → modo sent con success box', async () => {
      requestPatientPasswordReset.mockResolvedValueOnce({ message: 'ok' })

      render(<PatientLogin setScreen={mockSetScreen} />)
      fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'))

      fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
        target: { value: 'patient@test.com' },
      })
      fireEvent.submit(screen.getByRole('button', { name: /Enviar link/i }))

      await waitFor(() => {
        expect(screen.getByText('Revisa tu correo')).toBeTruthy()
      })
      expect(requestPatientPasswordReset).toHaveBeenCalledWith('patient@test.com')
    })

    it('← Volver desde modo forgot regresa a login', () => {
      render(<PatientLogin setScreen={mockSetScreen} />)
      fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'))
      fireEvent.click(screen.getByText('← Volver al inicio de sesión'))
      expect(screen.getByText('Inicia sesión')).toBeTruthy()
    })

    it('← Volver desde modo sent regresa a login', async () => {
      requestPatientPasswordReset.mockResolvedValueOnce({ message: 'ok' })

      render(<PatientLogin setScreen={mockSetScreen} />)
      fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'))
      fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
        target: { value: 'patient@test.com' },
      })
      fireEvent.submit(screen.getByRole('button', { name: /Enviar link/i }))

      await waitFor(() => { screen.getByText('Revisa tu correo') })
      fireEvent.click(screen.getByText('← Volver al inicio de sesión'))
      expect(screen.getByText('Inicia sesión')).toBeTruthy()
    })
  })
  ```

- [ ] **Paso 6: Correr los tests de PatientLogin**

  ```bash
  cd frontend
  npm test -- --run frontend/src/pages/PatientLogin.test.jsx
  ```

  Esperado: 5/5 PASSes.

- [ ] **Paso 7: Correr todos los tests del proyecto**

  ```bash
  cd backend && pytest tests/ -v
  cd ../frontend && npm test -- --run
  ```

  Esperado: todos los tests PASS.

- [ ] **Paso 8: Commit final**

  ```bash
  git add frontend/src/pages/PatientResetPassword.test.jsx frontend/src/pages/PatientLogin.test.jsx
  git commit -m "test: add frontend tests for patient password recovery flow"
  ```
