# Auth, Billing y Lanzamiento de Pago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar autenticación frontend, suscripciones con Stripe, emails con Resend y cumplimiento LFPDPPP para lanzar SyqueX con pago.

**Architecture:** El backend FastAPI ya tiene JWT/bcrypt — se extiende con nuevos endpoints. El frontend no tiene react-router-dom; se implementa un screen manager basado en estado React para login/registro/billing. Stripe Checkout maneja el flujo de pago; el backend procesa webhooks firmados.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), React 18 + Vite sin router (frontend), Stripe Python SDK, Resend Python SDK, Vitest + React Testing Library (tests).

**Spec:** `docs/superpowers/specs/2026-03-30-auth-billing-launch-design.md`

---

## Mapa de archivos

### Backend — archivos nuevos
| Archivo | Responsabilidad |
|---|---|
| `backend/api/billing.py` | Endpoints Stripe: status, create-checkout, webhook |
| `backend/api/internal.py` | Endpoint cron para recordatorios de trial |
| `backend/services/__init__.py` | Package init vacío |
| `backend/services/email.py` | Servicio Resend: bienvenida, reset, recordatorio |

### Backend — archivos modificados
| Archivo | Cambios |
|---|---|
| `backend/database.py` | Campos nuevos en Psychologist + 4 modelos nuevos |
| `backend/api/auth.py` | register, refresh, logout, forgot-password, reset-password |
| `backend/config.py` | Settings para Stripe, Resend, clave interna |
| `backend/main.py` | Incluir routers billing/internal, require_active_access |
| `backend/exceptions.py` | SubscriptionExpired |
| `backend/requirements.txt` | stripe, resend |

### Frontend — archivos nuevos
| Archivo | Responsabilidad |
|---|---|
| `frontend/src/auth.js` | Estado de token, cola de refresh, lectura de URL params |
| `frontend/src/components/LoginScreen.jsx` | Pantalla de login |
| `frontend/src/components/RegisterScreen.jsx` | Pantalla de registro con checkboxes LFPDPPP |
| `frontend/src/components/ForgotPasswordScreen.jsx` | Pantalla olvidé contraseña |
| `frontend/src/components/ResetPasswordScreen.jsx` | Pantalla nueva contraseña (lee ?token= de URL) |
| `frontend/src/components/BillingScreen.jsx` | Pantalla billing: trial/expirado/activo |
| `frontend/src/components/TrialBanner.jsx` | Banner días restantes dentro de la app |
| `frontend/src/components/PasswordStrength.jsx` | Indicador visual 3 reglas |

### Frontend — archivos modificados
| Archivo | Cambios |
|---|---|
| `frontend/src/api.js` | Funciones auth + interceptor 401/402 con cola anti-race |
| `frontend/src/App.jsx` | Envolver con screen manager basado en auth state |

---

## FASE 1 — Autenticación

---

### Task 1: Modelos de base de datos

**Archivos:**
- Modify: `backend/database.py`

- [ ] **Step 1: Agregar campos a Psychologist**

En `database.py`, localizar la clase `Psychologist` y agregar después de `is_active`:

```python
# Campos de onboarding (LFPDPPP)
cedula_profesional: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
specialty: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
accepted_privacy_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
accepted_terms_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
privacy_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
terms_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
# Trial
trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
# Stripe
stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
```

- [ ] **Step 2: Agregar modelo Subscription**

Después del modelo `AuditLog` en `database.py`:

```python
class Subscription(Base):
    __tablename__ = 'subscriptions'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='RESTRICT'), nullable=False
    )
    plan_slug: Mapped[str] = mapped_column(String(50), nullable=False)
    price_mxn_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    stripe_price_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    canceled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('trialing','active','past_due','canceled','unpaid')",
            name='chk_subscriptions_status'
        ),
        Index('idx_subscriptions_psychologist_id', 'psychologist_id'),
        Index('idx_subscriptions_status', 'status'),
    )

    psychologist = relationship("Psychologist", back_populates="subscription")
```

También agregar en `Psychologist`:
```python
subscription = relationship("Subscription", back_populates="psychologist", uselist=False)
```

- [ ] **Step 3: Agregar modelo RefreshToken**

```python
class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='CASCADE'), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        Index('idx_refresh_tokens_token_hash', 'token_hash'),
        Index('idx_refresh_tokens_psychologist_id', 'psychologist_id'),
    )
```

- [ ] **Step 4: Agregar modelo PasswordResetToken**

```python
class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('psychologists.id', ondelete='CASCADE'), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        Index('idx_password_reset_tokens_hash', 'token_hash'),
    )
```

- [ ] **Step 5: Agregar modelo ProcessedStripeEvent**

```python
class ProcessedStripeEvent(Base):
    __tablename__ = 'processed_stripe_events'

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # event.id de Stripe
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
```

- [ ] **Step 6: Verificar que `init_db()` crea las tablas**

```bash
cd backend
python -c "import asyncio; from database import init_db; asyncio.run(init_db())"
```

Esperado: sin errores. Si falla, revisar imports (agregar `UTC` desde `datetime import timezone` y `UTC = timezone.utc`).

- [ ] **Step 7: Commit**

```bash
git add backend/database.py
git commit -m "feat(db): add subscription, refresh_token, password_reset_token, stripe_event models"
```

---

### Task 2: Config y dependencias

**Archivos:**
- Modify: `backend/config.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Agregar settings en config.py**

Añadir dentro de la clase `Settings`:

```python
# Stripe
STRIPE_SECRET_KEY: str = ""
STRIPE_WEBHOOK_SECRET: str = ""
STRIPE_PRICE_ID: str = ""

# Resend
RESEND_API_KEY: str = ""
RESEND_FROM_EMAIL: str = "hola@syquex.mx"

# Internal cron key
INTERNAL_API_KEY: str = "dev_internal_key_change_in_prod"
```

- [ ] **Step 2: Agregar dependencias en requirements.txt**

```
stripe>=8.0.0
resend>=2.0.0
```

- [ ] **Step 3: Instalar dependencias**

```bash
cd backend
pip install stripe resend
```

Esperado: instalación exitosa. Verificar con `pip show stripe resend`.

- [ ] **Step 4: Commit**

```bash
git add backend/config.py backend/requirements.txt
git commit -m "feat(config): add Stripe, Resend, and internal API key settings"
```

---

### Task 3: SubscriptionExpired exception

**Archivos:**
- Modify: `backend/exceptions.py`

- [ ] **Step 1: Leer el archivo actual**

```bash
cat backend/exceptions.py
```

Observar el patrón de `DomainError` y cómo define `http_status`.

- [ ] **Step 2: Agregar la excepción**

Siguiendo el patrón existente, agregar:

```python
class SubscriptionExpired(DomainError):
    """Suscripción expirada o inactiva — requiere pago."""
    http_status = 402

    def __init__(self, message: str = "Suscripción inactiva. Activa tu plan para continuar."):
        super().__init__(message, code="SUBSCRIPTION_EXPIRED")
```

- [ ] **Step 3: Verificar que el handler existente en main.py cubre 402**

Leer `backend/main.py` y confirmar que el handler de `DomainError` usa `exc.http_status`. Si es así, SubscriptionExpired se maneja automáticamente.

- [ ] **Step 4: Commit**

```bash
git add backend/exceptions.py
git commit -m "feat(exceptions): add SubscriptionExpired (402)"
```

---

### Task 4: Auth backend — registro

**Archivos:**
- Modify: `backend/api/auth.py`
- Create: `backend/tests/test_auth_register.py` (o agregar al test existente)

- [ ] **Step 1: Escribir tests de registro**

Crear `backend/tests/test_auth_register.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from main import app

REGISTER_URL = "/api/v1/auth/register"

VALID_PAYLOAD = {
    "name": "Ana García",
    "email": "ana@test.com",
    "password": "Password1",
    "cedula_profesional": "12345678",
    "accepted_privacy": True,
    "accepted_terms": True,
    "privacy_version": "1.0",
    "terms_version": "1.0"
}

@pytest.mark.asyncio
async def test_register_success():
    with patch("api.auth.get_db") as mock_db, \
         patch("api.auth.stripe") as mock_stripe:
        mock_stripe.customers.create.return_value = MagicMock(id="cus_test123")
        # ... setup mock db session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
        assert res.status_code == 200
        assert "access_token" in res.json()

@pytest.mark.asyncio
async def test_register_rejects_weak_password():
    payload = {**VALID_PAYLOAD, "password": "weak"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_register_requires_privacy_acceptance():
    payload = {**VALID_PAYLOAD, "accepted_privacy": False}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 400

@pytest.mark.asyncio
async def test_register_password_needs_uppercase():
    payload = {**VALID_PAYLOAD, "password": "password1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_register_password_needs_number():
    payload = {**VALID_PAYLOAD, "password": "PasswordOnly"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
cd backend
pytest tests/test_auth_register.py -v
```

Esperado: fallan porque el endpoint no existe.

- [ ] **Step 3: Implementar el schema de registro en auth.py**

Agregar al inicio de `auth.py` (después de los imports existentes):

```python
import hashlib
import secrets
import re
from datetime import timezone

UTC = timezone.utc

# --- Validación de contraseña ---
_PASSWORD_MIN_LENGTH = 8
_PASSWORD_UPPERCASE_RE = re.compile(r'[A-Z]')
_PASSWORD_NUMBER_RE = re.compile(r'[0-9]')

def _validate_password(password: str) -> str:
    """Valida política de contraseña. Retorna el password si es válido, lanza ValueError si no."""
    errors = []
    if len(password) < _PASSWORD_MIN_LENGTH:
        errors.append(f"Mínimo {_PASSWORD_MIN_LENGTH} caracteres")
    if not _PASSWORD_UPPERCASE_RE.search(password):
        errors.append("Al menos 1 letra mayúscula")
    if not _PASSWORD_NUMBER_RE.search(password):
        errors.append("Al menos 1 número")
    if errors:
        raise ValueError("; ".join(errors))
    return password


# --- Schema de registro ---
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    cedula_profesional: Optional[str] = None
    accepted_privacy: bool
    accepted_terms: bool
    privacy_version: str = "1.0"
    terms_version: str = "1.0"

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        return _validate_password(v)

    @field_validator('accepted_privacy', 'accepted_terms')
    @classmethod
    def must_accept(cls, v, info):
        if not v:
            raise ValueError(f"{info.field_name} debe ser aceptado")
        return v
```

- [ ] **Step 4: Implementar el endpoint POST /auth/register**

```python
@router.post("/auth/register", response_model=TokenResponse)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    from datetime import timedelta
    import stripe as stripe_lib

    # 1. Email único
    existing = await db.execute(
        select(Psychologist).where(
            Psychologist.email == body.email,
            Psychologist.deleted_at.is_(None)
        )
    )
    if existing.scalar_one_or_none():
        raise DomainError("El email ya está registrado.", code="EMAIL_TAKEN", http_status=409)

    # 2. Crear psicólogo
    now = datetime.now(UTC)
    psychologist = Psychologist(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        is_active=True,
        cedula_profesional=body.cedula_profesional,
        accepted_privacy_at=now,
        accepted_terms_at=now,
        privacy_version=body.privacy_version,
        terms_version=body.terms_version,
        trial_ends_at=now + timedelta(days=14),
    )
    db.add(psychologist)
    await db.flush()  # para obtener el ID

    # 3. Crear Stripe Customer
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    try:
        customer = stripe_lib.Customer.create(
            email=body.email,
            name=body.name,
            metadata={"psychologist_id": str(psychologist.id)},
        )
        psychologist.stripe_customer_id = customer.id
    except Exception:
        psychologist.stripe_customer_id = None  # no bloquear el registro si Stripe falla

    # 4. Crear suscripción local en trialing
    subscription = Subscription(
        psychologist_id=psychologist.id,
        plan_slug="pro_v1",
        price_mxn_cents=49900,
        status="trialing",
    )
    db.add(subscription)

    # 5. Audit log
    db.add(AuditLog(
        psychologist_id=psychologist.id,
        action="register",
        entity="psychologist",
        entity_id=str(psychologist.id),
        ip_address=request.client.host if request.client else None,
    ))

    await db.commit()

    # 6. Email bienvenida (fire-and-forget)
    try:
        from services.email import send_welcome_email
        await send_welcome_email(body.email, body.name, psychologist.trial_ends_at)
    except Exception:
        pass  # no bloquear el registro

    # 7. Retornar token (reusar create_access_token existente)
    token = create_access_token(str(psychologist.id))
    return TokenResponse(access_token=token)
```

Agregar imports necesarios en auth.py:
```python
from pydantic import EmailStr, field_validator
from database import Subscription, AuditLog, RefreshToken
import stripe
```

- [ ] **Step 5: Correr tests**

```bash
pytest tests/test_auth_register.py -v
```

Esperado: todos pasan (ajustar mocks si es necesario).

- [ ] **Step 6: Commit**

```bash
git add backend/api/auth.py backend/tests/test_auth_register.py
git commit -m "feat(auth): add POST /auth/register with LFPDPPP consent and Stripe customer creation"
```

---

### Task 5: Auth backend — refresh y logout

**Archivos:**
- Modify: `backend/api/auth.py`

- [ ] **Step 1: Escribir tests de refresh y logout**

Agregar a `backend/tests/test_auth_register.py` o crear `test_auth_refresh.py`:

```python
@pytest.mark.asyncio
async def test_refresh_returns_new_access_token():
    """Con un refresh token válido en cookie, retorna nuevo access_token."""
    # Test verifica que el endpoint existe y responde 200 con cookie válida
    # El mock del DB debe retornar un RefreshToken no revocado y no expirado
    pass  # implementar con mocks según patrón existente

@pytest.mark.asyncio
async def test_refresh_rejects_revoked_token():
    """Un token ya revocado retorna 401."""
    pass

@pytest.mark.asyncio
async def test_refresh_detects_token_reuse():
    """Presentar un token ya usado revoca todos los tokens del psicólogo."""
    pass

@pytest.mark.asyncio
async def test_logout_revokes_token():
    """Logout revoca el refresh token y limpia la cookie."""
    pass
```

- [ ] **Step 2: Implementar helpers de refresh token**

Agregar en `auth.py`:

```python
def _hash_token(raw_token: str) -> str:
    """SHA-256 del token. Nunca almacenar el token raw."""
    return hashlib.sha256(raw_token.encode()).hexdigest()

def _create_refresh_token_record(psychologist_id: uuid.UUID, request: Request) -> tuple[str, RefreshToken]:
    """Genera token raw + registro para DB. Retorna (raw_token, db_record)."""
    from datetime import timedelta
    raw = secrets.token_urlsafe(32)
    record = RefreshToken(
        psychologist_id=psychologist_id,
        token_hash=_hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return raw, record

def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=raw_token,
        httponly=True,
        secure=settings.is_production(),
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/api/v1/auth",
    )
```

- [ ] **Step 3: Actualizar POST /auth/login para setear refresh cookie**

En el endpoint existente `login`, después de crear el access_token, agregar:

```python
raw_refresh, refresh_record = _create_refresh_token_record(psychologist.id, request)
db.add(refresh_record)
await db.commit()

response = JSONResponse(content=TokenResponse(access_token=token).model_dump())
_set_refresh_cookie(response, raw_refresh)
return response
```

Cambiar la firma del endpoint para que retorne `Response` en vez de `TokenResponse`.

- [ ] **Step 4: Implementar POST /auth/refresh**

```python
@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_hash = _hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=401, detail="Token inválido")

    # Detección de robo: token ya revocado presentado de nuevo
    if record.revoked_at is not None:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.psychologist_id == record.psychologist_id)
            .values(revoked_at=datetime.now(UTC))
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Sesión inválida")

    if record.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Sesión expirada")

    # Rotación: revocar actual, emitir nuevo
    record.revoked_at = datetime.now(UTC)
    raw_new, new_record = _create_refresh_token_record(record.psychologist_id, request)
    db.add(new_record)
    await db.commit()

    access_token = create_access_token(str(record.psychologist_id))
    response = JSONResponse(content=TokenResponse(access_token=access_token).model_dump())
    _set_refresh_cookie(response, raw_new)
    return response
```

- [ ] **Step 5: Implementar POST /auth/logout**

```python
@router.post("/auth/logout")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_token = request.cookies.get("refresh_token")
    if raw_token:
        token_hash = _hash_token(raw_token)
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        record = result.scalar_one_or_none()
        if record and record.revoked_at is None:
            psychologist_id = record.psychologist_id
            record.revoked_at = datetime.now(UTC)
            db.add(AuditLog(
                psychologist_id=psychologist_id,
                action="logout",
                entity="psychologist",
                entity_id=str(psychologist_id),
                ip_address=request.client.host if request.client else None,
            ))
            await db.commit()

    response = JSONResponse(content={"ok": True})
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return response
```

- [ ] **Step 6: Correr tests existentes para verificar que no se rompió nada**

```bash
cd backend
pytest tests/ -v --tb=short
```

- [ ] **Step 7: Commit**

```bash
git add backend/api/auth.py
git commit -m "feat(auth): add refresh token rotation, logout with cookie cleanup"
```

---

### Task 6: Auth backend — forgot-password y reset-password

**Archivos:**
- Modify: `backend/api/auth.py`

- [ ] **Step 1: Escribir tests**

```python
@pytest.mark.asyncio
async def test_forgot_password_same_response_for_nonexistent_email():
    """Mismo response para email que no existe (evita enumeración)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/forgot-password", json={"email": "noexiste@test.com"})
    assert res.status_code == 200
    assert "enlace" in res.json()["message"]

@pytest.mark.asyncio
async def test_reset_password_invalid_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/reset-password",
                                json={"token": "fake_token", "new_password": "NewPass1"})
    assert res.status_code == 400

@pytest.mark.asyncio
async def test_reset_password_blocks_after_3_failed_attempts():
    """Después de 3 intentos fallidos, el token queda bloqueado."""
    pass  # implementar con DB mock

@pytest.mark.asyncio
async def test_reset_password_weak_password():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/reset-password",
                                json={"token": "any", "new_password": "weak"})
    assert res.status_code in (400, 422)
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
pytest tests/test_auth_register.py -v -k "forgot or reset"
```

- [ ] **Step 3: Implementar POST /auth/forgot-password**

```python
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

@router.post("/auth/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    import asyncio, random
    from datetime import timedelta

    # Siempre mismo delay — evita timing attack / enumeración
    await asyncio.sleep(random.uniform(0.1, 0.3))

    result = await db.execute(
        select(Psychologist).where(
            Psychologist.email == body.email,
            Psychologist.deleted_at.is_(None)
        )
    )
    psychologist = result.scalar_one_or_none()

    if psychologist:
        raw_token = secrets.token_urlsafe(32)
        reset_record = PasswordResetToken(
            psychologist_id=psychologist.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            ip_address=request.client.host if request.client else None,
        )
        db.add(reset_record)
        db.add(AuditLog(
            psychologist_id=psychologist.id,
            action="password_reset_requested",
            entity="psychologist",
            entity_id=str(psychologist.id),
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()

        # Fire-and-forget
        try:
            from services.email import send_reset_email
            await send_reset_email(body.email, psychologist.name, raw_token)
        except Exception:
            pass

    return {"message": "Si el email existe, recibirás un enlace en los próximos minutos"}
```

- [ ] **Step 4: Implementar POST /auth/reset-password**

```python
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        return _validate_password(v)

@router.post("/auth/reset-password", response_model=TokenResponse)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    token_hash = _hash_token(body.token)
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()

    if not record or record.used_at is not None:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")

    if record.failed_attempts >= 3:
        raise HTTPException(status_code=400, detail="Token bloqueado. Solicita uno nuevo.")

    if record.expires_at < datetime.now(UTC):
        record.failed_attempts += 1
        await db.commit()
        raise HTTPException(status_code=400, detail="Token expirado")

    # Actualizar password
    psych_result = await db.execute(
        select(Psychologist).where(Psychologist.id == record.psychologist_id)
    )
    psychologist = psych_result.scalar_one()
    psychologist.password_hash = hash_password(body.new_password)

    # Marcar token como usado
    record.used_at = datetime.now(UTC)

    # Revocar todos los refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.psychologist_id == psychologist.id)
        .values(revoked_at=datetime.now(UTC))
    )

    db.add(AuditLog(
        psychologist_id=psychologist.id,
        action="password_reset_completed",
        entity="psychologist",
        entity_id=str(psychologist.id),
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    # Emitir nuevo JWT + refresh cookie
    raw_refresh, refresh_record = _create_refresh_token_record(psychologist.id, request)
    db.add(refresh_record)
    await db.commit()

    access_token = create_access_token(str(psychologist.id))
    response = JSONResponse(content=TokenResponse(access_token=access_token).model_dump())
    _set_refresh_cookie(response, raw_refresh)
    return response
```

Agregar import en auth.py: `from sqlalchemy import update`

- [ ] **Step 5: Correr todos los tests de auth**

```bash
pytest tests/ -v --tb=short -k "auth"
```

- [ ] **Step 6: Commit**

```bash
git add backend/api/auth.py
git commit -m "feat(auth): add forgot-password and reset-password with brute-force protection"
```

---

### Task 7: Frontend — auth.js (gestión de tokens y screen manager)

**Archivos:**
- Create: `frontend/src/auth.js`

El frontend no tiene react-router-dom. Las "pantallas" se manejan como estado React: `{ screen: 'login' | 'register' | 'forgot-password' | 'reset-password' | 'billing' | 'app' | 'loading', token?: string }`.

- [ ] **Step 1: Crear frontend/src/auth.js**

```javascript
// auth.js — Gestión de tokens y estado de pantalla
// access_token: en memoria (nunca localStorage)
// refresh_token: httpOnly cookie (el backend lo setea, el JS nunca lo ve)

let _accessToken = null;
let _isRefreshing = false;
let _refreshQueue = []; // callbacks pendientes durante el refresh

export function getAccessToken() {
  return _accessToken;
}

export function setAccessToken(token) {
  _accessToken = token;
}

export function clearAccessToken() {
  _accessToken = null;
}

/**
 * Determina la pantalla inicial basándose en la URL actual.
 * Llama a esto en el mount de App.jsx antes de verificar auth.
 */
export function getScreenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const path = window.location.pathname;

  if (token) return { screen: 'reset-password', resetToken: token };
  if (path === '/registro') return { screen: 'register' };
  if (path === '/forgot-password') return { screen: 'forgot-password' };
  if (path === '/billing') return { screen: 'billing-check' }; // verificar auth primero

  const successParam = params.get('success');
  if (path === '/billing' && successParam === 'true') return { screen: 'billing-success' };

  return { screen: 'loading' }; // intentar refresh silencioso
}

/**
 * Navegar a una "ruta" actualizando la URL sin recargar.
 */
export function navigateTo(path) {
  window.history.pushState({}, '', path);
}

/**
 * Ejecuta un refresh de access token.
 * Si ya hay un refresh en curso, encola la llamada (anti-race-condition).
 * Retorna el nuevo access token o null si falla.
 */
export async function refreshAccessToken(apiBase) {
  if (_isRefreshing) {
    return new Promise((resolve) => {
      _refreshQueue.push(resolve);
    });
  }

  _isRefreshing = true;
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // envía la httpOnly cookie
    });

    if (!res.ok) {
      _accessToken = null;
      _refreshQueue.forEach(cb => cb(null));
      _refreshQueue = [];
      return null;
    }

    const data = await res.json();
    _accessToken = data.access_token;
    _refreshQueue.forEach(cb => cb(_accessToken));
    _refreshQueue = [];
    return _accessToken;
  } finally {
    _isRefreshing = false;
  }
}
```

- [ ] **Step 2: Verificar que el archivo es importable**

```bash
cd frontend
node -e "import('./src/auth.js').then(m => console.log(Object.keys(m)))"
```

Esperado: lista de exports sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth.js
git commit -m "feat(frontend): add auth.js with token management and screen-from-url routing"
```

---

### Task 8: Frontend — api.js con interceptor y funciones auth

**Archivos:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Agregar variable de interceptor y helper fetch con auth**

Al inicio de `api.js`, después de `const API_BASE`:

```javascript
import { getAccessToken, refreshAccessToken, clearAccessToken } from './auth.js';

// Callbacks para manejar redirecciones desde fuera de api.js
let _onUnauthorized = null;  // () => void — redirige a login
let _onPaymentRequired = null; // () => void — redirige a billing

export function setAuthCallbacks({ onUnauthorized, onPaymentRequired }) {
  _onUnauthorized = onUnauthorized;
  _onPaymentRequired = onPaymentRequired;
}

/**
 * fetch con manejo automático de JWT, refresh y errores 401/402.
 */
async function _authFetch(url, options = {}) {
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  let res = await fetch(url, { ...options, headers, credentials: 'include' });

  if (res.status === 401) {
    const newToken = await refreshAccessToken(API_BASE);
    if (!newToken) {
      clearAccessToken();
      _onUnauthorized?.();
      throw new ApiError('Sesión expirada', 401);
    }
    res = await fetch(url, {
      ...options,
      headers: { ...headers, 'Authorization': `Bearer ${newToken}` },
      credentials: 'include',
    });
  }

  if (res.status === 402) {
    _onPaymentRequired?.();
    throw new ApiError('Suscripción requerida', 402, 'SUBSCRIPTION_EXPIRED');
  }

  return _handleResponse(res);
}
```

- [ ] **Step 2: Actualizar las funciones existentes para usar `_authFetch`**

Reemplazar todos los `fetch(` en las funciones exportadas existentes con `_authFetch(`. Por ejemplo:

```javascript
export async function listPatients() {
  return _authFetch(`${API_BASE}/patients`);
}

export async function createPatient(name) {
  return _authFetch(`${API_BASE}/patients`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}
// ... etc para todas las funciones existentes
```

- [ ] **Step 3: Agregar funciones auth nuevas**

```javascript
// --- Auth ---
export async function login(email, password) {
  const formData = new FormData();
  formData.append('username', email);
  formData.append('password', password);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  return _handleResponse(res);
}

export async function register(name, email, password, cedula, privacyVersion = '1.0', termsVersion = '1.0') {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, email, password,
      cedula_profesional: cedula || null,
      accepted_privacy: true,
      accepted_terms: true,
      privacy_version: privacyVersion,
      terms_version: termsVersion,
    }),
    credentials: 'include',
  });
  return _handleResponse(res);
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  clearAccessToken();
}

export async function forgotPassword(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return _handleResponse(res);
}

export async function resetPassword(token, newPassword) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
    credentials: 'include',
  });
  return _handleResponse(res);
}

// --- Billing ---
export async function getBillingStatus() {
  return _authFetch(`${API_BASE}/billing/status`);
}

export async function createCheckout() {
  return _authFetch(`${API_BASE}/billing/create-checkout`, { method: 'POST' });
}
```

- [ ] **Step 4: Correr los tests de frontend existentes**

```bash
cd frontend
npm test -- --run
```

Esperado: tests existentes siguen pasando. Si alguno falla por el cambio en `_authFetch`, ajustar los mocks para incluir el header `Authorization`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(api): add JWT interceptor with refresh queue, auth and billing functions"
```

---

### Task 9: Frontend — PasswordStrength y TrialBanner

**Archivos:**
- Create: `frontend/src/components/PasswordStrength.jsx`
- Create: `frontend/src/components/TrialBanner.jsx`

- [ ] **Step 1: Crear PasswordStrength.jsx**

```jsx
// PasswordStrength.jsx — Indicador visual de reglas de contraseña
export default function PasswordStrength({ password }) {
  const rules = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Al menos 1 mayúscula', ok: /[A-Z]/.test(password) },
    { label: 'Al menos 1 número', ok: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <ul className="mt-1 space-y-1">
      {rules.map(({ label, ok }) => (
        <li key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-sage' : 'text-ink-tertiary'}`}>
          <span>{ok ? '✓' : '✗'}</span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Crear TrialBanner.jsx**

```jsx
// TrialBanner.jsx — Banner de días restantes de trial
export default function TrialBanner({ daysRemaining, onActivate }) {
  if (daysRemaining === null || daysRemaining === undefined) return null;

  const isUrgent = daysRemaining <= 3;
  const bgClass = isUrgent ? 'bg-amber-100 border-amber-300' : 'bg-sage-50 border-sage-200';
  const textClass = isUrgent ? 'text-amber-800' : 'text-sage-dark';

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b text-sm ${bgClass}`}>
      <span className={textClass}>
        Prueba gratuita — te quedan <strong>{daysRemaining}</strong> {daysRemaining === 1 ? 'día' : 'días'}
      </span>
      <button
        onClick={onActivate}
        className="text-xs font-medium underline ml-4 text-sage-dark hover:text-sage"
      >
        Activar
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Escribir tests básicos**

Crear `frontend/src/components/PasswordStrength.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import PasswordStrength from './PasswordStrength';

test('no muestra nada con password vacío', () => {
  const { container } = render(<PasswordStrength password="" />);
  expect(container).toBeEmptyDOMElement();
});

test('muestra reglas cuando hay password', () => {
  render(<PasswordStrength password="ab" />);
  expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
});

test('marca regla como cumplida', () => {
  render(<PasswordStrength password="Password1" />);
  // Las tres reglas están presentes
  expect(screen.getAllByText('✓')).toHaveLength(3);
});
```

- [ ] **Step 4: Correr tests**

```bash
cd frontend && npm test -- --run PasswordStrength
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PasswordStrength.jsx frontend/src/components/TrialBanner.jsx frontend/src/components/PasswordStrength.test.jsx
git commit -m "feat(ui): add PasswordStrength and TrialBanner components"
```

---

### Task 10: Frontend — LoginScreen y RegisterScreen

**Archivos:**
- Create: `frontend/src/components/LoginScreen.jsx`
- Create: `frontend/src/components/RegisterScreen.jsx`

- [ ] **Step 1: Crear LoginScreen.jsx**

```jsx
import { useState } from 'react';
import { login } from '../api.js';
import { setAccessToken } from '../auth.js';

export default function LoginScreen({ onSuccess, onRegister, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      setAccessToken(data.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Inicia sesión</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button onClick={onForgotPassword} className="text-sm text-ink-secondary underline block w-full">
            ¿Olvidaste tu contraseña?
          </button>
          <button onClick={onRegister} className="text-sm text-ink-secondary underline block w-full">
            ¿No tienes cuenta? Regístrate
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear RegisterScreen.jsx**

```jsx
import { useState } from 'react';
import { register } from '../api.js';
import { setAccessToken } from '../auth.js';
import PasswordStrength from './PasswordStrength.jsx';

const PRIVACY_URL = '/aviso-privacidad.pdf';
const TERMS_URL = '/terminos-condiciones.pdf';

export default function RegisterScreen({ onSuccess, onLogin }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', cedula: '',
    acceptPrivacy: false, acceptTerms: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = form.name && form.email && form.password &&
                    form.acceptPrivacy && form.acceptTerms;

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(form.name, form.email, form.password, form.cedula);
      setAccessToken(data.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Crea tu cuenta</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Nombre completo</label>
            <input type="text" value={form.name} onChange={e => update('name', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Contraseña</label>
            <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
            <PasswordStrength password={form.password} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Cédula profesional <span className="text-ink-tertiary">(opcional)</span>
            </label>
            <input type="text" value={form.cedula} onChange={e => update('cedula', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" />
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.acceptPrivacy}
                onChange={e => update('acceptPrivacy', e.target.checked)}
                className="mt-0.5 accent-sage" />
              <span className="text-sm text-ink-secondary">
                He leído el{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="underline text-sage">
                  Aviso de Privacidad
                </a>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.acceptTerms}
                onChange={e => update('acceptTerms', e.target.checked)}
                className="mt-0.5 accent-sage" />
              <span className="text-sm text-ink-secondary">
                Acepto los{' '}
                <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline text-sage">
                  Términos y Condiciones
                </a>
              </span>
            </label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta — 14 días gratis'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={onLogin} className="text-sm text-ink-secondary underline">
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Escribir tests básicos de LoginScreen**

Crear `frontend/src/components/LoginScreen.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import LoginScreen from './LoginScreen';

vi.mock('../api.js', () => ({
  login: vi.fn().mockResolvedValue({ access_token: 'fake_token' }),
}));
vi.mock('../auth.js', () => ({ setAccessToken: vi.fn() }));

test('muestra campos de email y password', () => {
  render(<LoginScreen onSuccess={() => {}} onRegister={() => {}} onForgotPassword={() => {}} />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
});

test('botón de entrar está presente', () => {
  render(<LoginScreen onSuccess={() => {}} onRegister={() => {}} onForgotPassword={() => {}} />);
  expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
});
```

- [ ] **Step 4: Correr tests**

```bash
cd frontend && npm test -- --run LoginScreen RegisterScreen
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoginScreen.jsx frontend/src/components/RegisterScreen.jsx frontend/src/components/LoginScreen.test.jsx
git commit -m "feat(ui): add LoginScreen and RegisterScreen with LFPDPPP checkboxes"
```

---

### Task 11: Frontend — ForgotPasswordScreen y ResetPasswordScreen

**Archivos:**
- Create: `frontend/src/components/ForgotPasswordScreen.jsx`
- Create: `frontend/src/components/ResetPasswordScreen.jsx`

- [ ] **Step 1: Crear ForgotPasswordScreen.jsx**

```jsx
import { useState } from 'react';
import { forgotPassword } from '../api.js';

export default function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch (_) { /* ignorar — la respuesta es siempre la misma */ }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">¿Olvidaste tu contraseña?</p>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Si el email existe, recibirás un enlace en los próximos minutos.
            </p>
            <button onClick={onBack} className="text-sm text-ink-secondary underline">
              ← Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-ink-secondary">
              Ingresa tu email y te enviamos un enlace para reestablecerla.
            </p>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <button type="button" onClick={onBack} className="text-sm text-ink-secondary underline w-full text-center block">
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear ResetPasswordScreen.jsx**

```jsx
import { useState } from 'react';
import { resetPassword } from '../api.js';
import { setAccessToken } from '../auth.js';
import PasswordStrength from './PasswordStrength.jsx';

export default function ResetPasswordScreen({ resetToken, onSuccess, onInvalidToken }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password && password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await resetPassword(resetToken, password);
      setAccessToken(data.access_token);
      // Limpiar token de la URL
      window.history.replaceState({}, '', '/');
      onSuccess();
    } catch (err) {
      if (err.status === 400) {
        setError('El enlace es inválido o ya expiró.');
        onInvalidToken?.();
      } else {
        setError(err.message || 'Error al cambiar la contraseña');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Nueva contraseña</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required />
            <PasswordStrength password={password} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={!passwordsMatch || loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ForgotPasswordScreen.jsx frontend/src/components/ResetPasswordScreen.jsx
git commit -m "feat(ui): add ForgotPasswordScreen and ResetPasswordScreen"
```

---

### Task 12: App.jsx — screen manager de autenticación

**Archivos:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Agregar estado de autenticación al inicio del componente App**

En `App.jsx`, dentro del componente `App`, agregar al inicio (antes del primer `useState` existente):

```javascript
import { getScreenFromUrl, navigateTo, refreshAccessToken, clearAccessToken, getAccessToken, setAccessToken } from './auth.js';
import { setAuthCallbacks, getBillingStatus, createCheckout } from './api.js';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import ResetPasswordScreen from './components/ResetPasswordScreen.jsx';
import BillingScreen from './components/BillingScreen.jsx';
import TrialBanner from './components/TrialBanner.jsx';

// Estado de pantalla
const [authScreen, setAuthScreen] = useState(() => getScreenFromUrl());
const [billingStatus, setBillingStatus] = useState(null);
```

- [ ] **Step 2: Agregar useEffect de inicialización de auth**

Después de los useEffect existentes, agregar:

```javascript
// Inicializar auth al montar
useEffect(() => {
  setAuthCallbacks({
    onUnauthorized: () => {
      clearAccessToken();
      setAuthScreen({ screen: 'login' });
    },
    onPaymentRequired: () => {
      setAuthScreen({ screen: 'billing' });
    },
  });

  async function initAuth() {
    const { screen } = authScreen;
    // Si es reset-password, no intentar refresh
    if (screen === 'reset-password') return;

    // Intentar refresh silencioso
    const token = await refreshAccessToken(
      (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'
    );

    if (token) {
      setAccessToken(token);
      // Verificar billing status
      try {
        const status = await getBillingStatus();
        setBillingStatus(status);
        if (status.status === 'trialing' || status.status === 'active') {
          setAuthScreen({ screen: 'app' });
        } else {
          setAuthScreen({ screen: 'billing' });
        }
      } catch {
        setAuthScreen({ screen: 'billing' });
      }
    } else {
      setAuthScreen({ screen: 'login' });
    }
  }

  initAuth();
}, []); // solo al montar
```

- [ ] **Step 3: Envolver el return de App con el screen manager**

En el `return` de App, antes del JSX existente, agregar el guard de pantallas:

```javascript
// Screen manager — antes del return principal
if (authScreen.screen === 'loading') {
  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <div className="text-ink-tertiary text-sm">Cargando…</div>
    </div>
  );
}
if (authScreen.screen === 'login') {
  return <LoginScreen
    onSuccess={() => setAuthScreen({ screen: 'loading' })}
    onRegister={() => { navigateTo('/registro'); setAuthScreen({ screen: 'register' }); }}
    onForgotPassword={() => { navigateTo('/forgot-password'); setAuthScreen({ screen: 'forgot-password' }); }}
  />;
}
if (authScreen.screen === 'register') {
  return <RegisterScreen
    onSuccess={() => setAuthScreen({ screen: 'loading' })}
    onLogin={() => { navigateTo('/'); setAuthScreen({ screen: 'login' }); }}
  />;
}
if (authScreen.screen === 'forgot-password') {
  return <ForgotPasswordScreen
    onBack={() => { navigateTo('/'); setAuthScreen({ screen: 'login' }); }}
  />;
}
if (authScreen.screen === 'reset-password') {
  return <ResetPasswordScreen
    resetToken={authScreen.resetToken}
    onSuccess={() => setAuthScreen({ screen: 'loading' })}
    onInvalidToken={() => { navigateTo('/forgot-password'); setAuthScreen({ screen: 'forgot-password' }); }}
  />;
}
if (authScreen.screen === 'billing') {
  return <BillingScreen
    onActivated={() => setAuthScreen({ screen: 'loading' })}
  />;
}
// screen === 'app' → continúa con el JSX existente de la app
```

- [ ] **Step 4: Agregar TrialBanner dentro de la app**

En el JSX existente de la app (justo después del primer `<div` raíz), agregar:

```jsx
{billingStatus?.status === 'trialing' && billingStatus?.days_remaining != null && (
  <TrialBanner
    daysRemaining={billingStatus.days_remaining}
    onActivate={async () => {
      const { checkout_url } = await createCheckout();
      window.location.href = checkout_url;
    }}
  />
)}
```

- [ ] **Step 5: Correr tests de App**

```bash
cd frontend && npm test -- --run App
```

Ajustar mocks en `App.test.jsx` si los tests existentes fallan por los nuevos imports.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(app): add auth screen manager with login/register/forgot/reset/billing guards"
```

---

## FASE 2 — Billing

---

### Task 13: Billing backend

**Archivos:**
- Create: `backend/api/billing.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Escribir tests de billing**

Crear `backend/tests/test_billing.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
from main import app

@pytest.mark.asyncio
async def test_billing_status_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/billing/status")
    assert res.status_code == 401

@pytest.mark.asyncio
async def test_billing_status_returns_trialing():
    """Con JWT válido de usuario en trial, retorna status trialing."""
    pass  # implementar con mock de JWT y DB

@pytest.mark.asyncio
async def test_create_checkout_returns_url():
    pass

@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/billing/webhook",
                                content=b'{"type":"checkout.session.completed"}',
                                headers={"stripe-signature": "invalid"})
    assert res.status_code == 400
```

- [ ] **Step 2: Crear backend/api/billing.py**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import stripe as stripe_lib

from database import get_db, Psychologist, Subscription, ProcessedStripeEvent, AuditLog
from api.auth import get_current_psychologist
from config import settings
from exceptions import SubscriptionExpired

UTC = timezone.utc
router = APIRouter(prefix="/billing", tags=["billing"])


async def _get_subscription(psychologist_id, db: AsyncSession) -> Subscription:
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    return sub


@router.get("/status")
async def billing_status(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_subscription(psychologist.id, db)
    now = datetime.now(UTC)

    days_remaining = None
    if sub.status == "trialing" and psychologist.trial_ends_at:
        trial_end = psychologist.trial_ends_at
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=UTC)
        delta = trial_end - now
        days_remaining = max(0, delta.days)

    return {
        "status": sub.status,
        "plan_slug": sub.plan_slug if sub.status == "active" else None,
        "trial_ends_at": psychologist.trial_ends_at.isoformat() if psychologist.trial_ends_at else None,
        "days_remaining": days_remaining,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


@router.post("/create-checkout")
async def create_checkout(
    request: Request,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    sub = await _get_subscription(psychologist.id, db)
    now = datetime.now(UTC)

    subscription_data = {}
    if sub.status == "trialing" and psychologist.trial_ends_at:
        trial_end = psychologist.trial_ends_at
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=UTC)
        if trial_end > now:
            subscription_data["trial_end"] = int(trial_end.timestamp())

    session = stripe_lib.checkout.Session.create(
        mode="subscription",
        customer=psychologist.stripe_customer_id,
        line_items=[{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
        subscription_data=subscription_data if subscription_data else None,
        success_url=f"https://syquex.mx/billing?success=true",
        cancel_url=f"https://syquex.mx/billing",
    )
    return {"checkout_url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY

    try:
        event = stripe_lib.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe_lib.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Idempotencia
    existing = await db.get(ProcessedStripeEvent, event["id"])
    if existing:
        return {"ok": True}

    db.add(ProcessedStripeEvent(id=event["id"]))

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        customer_id = data.get("customer")
        stripe_sub_id = data.get("subscription")
        if customer_id and stripe_sub_id:
            psych_result = await db.execute(
                select(Psychologist).where(Psychologist.stripe_customer_id == customer_id)
            )
            psychologist = psych_result.scalar_one_or_none()
            if psychologist:
                sub = await _get_subscription(psychologist.id, db)
                sub.status = "active"
                sub.stripe_subscription_id = stripe_sub_id
                # Obtener stripe_price_id desde la suscripción de Stripe
                try:
                    stripe_sub_obj = stripe_lib.Subscription.retrieve(stripe_sub_id)
                    sub.stripe_price_id = stripe_sub_obj["items"]["data"][0]["price"]["id"]
                except Exception:
                    pass  # no bloquear si falla la lectura del precio

    elif event_type == "invoice.payment_succeeded":
        stripe_sub_id = data.get("subscription")
        if stripe_sub_id:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                sub.status = "active"
                period_end = data.get("lines", {}).get("data", [{}])[0].get("period", {}).get("end")
                if period_end:
                    sub.current_period_end = datetime.fromtimestamp(period_end, tz=UTC)

    elif event_type == "invoice.payment_failed":
        stripe_sub_id = data.get("subscription")
        if stripe_sub_id:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                sub.status = "past_due"

    elif event_type == "customer.subscription.deleted":
        stripe_sub_id = data.get("id")
        if stripe_sub_id:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                sub.status = "canceled"
                sub.canceled_at = datetime.now(UTC)

    await db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Implementar require_active_access como dependencia**

Agregar en `billing.py` (o en un nuevo `backend/api/dependencies.py`):

```python
# backend/api/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from database import get_db, Psychologist, Subscription
from api.auth import get_current_psychologist
from exceptions import SubscriptionExpired

UTC = timezone.utc

async def require_active_access(
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
) -> Psychologist:
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist.id)
    )
    sub = result.scalar_one_or_none()

    if not sub:
        raise SubscriptionExpired()

    if sub.status == "trialing":
        trial_end = psychologist.trial_ends_at
        if trial_end:
            if trial_end.tzinfo is None:
                trial_end = trial_end.replace(tzinfo=UTC)
            if datetime.now(UTC) > trial_end:
                raise SubscriptionExpired()
        return psychologist

    if sub.status == "active":
        return psychologist

    raise SubscriptionExpired()
```

- [ ] **Step 4: Aplicar require_active_access en routes.py**

En `backend/api/routes.py`, reemplazar la dependencia de `get_current_psychologist` con `require_active_access` en todos los endpoints clínicos:

```python
# Cambiar el import y reemplazar en cada endpoint:
from api.dependencies import require_active_access

# En cada endpoint que necesite protección:
# Antes: psychologist: Psychologist = Depends(get_current_psychologist)
# Después: psychologist: Psychologist = Depends(require_active_access)
```

- [ ] **Step 5: Incluir el router de billing en main.py**

En `backend/main.py`:

```python
from api.billing import router as billing_router
app.include_router(billing_router, prefix="/api/v1")
```

- [ ] **Step 6: Correr tests**

```bash
cd backend && pytest tests/test_billing.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/api/billing.py backend/api/dependencies.py backend/api/routes.py backend/main.py
git commit -m "feat(billing): add Stripe checkout, webhook with idempotency, require_active_access middleware"
```

---

### Task 14: Frontend — BillingScreen

**Archivos:**
- Create: `frontend/src/components/BillingScreen.jsx`

- [ ] **Step 1: Crear BillingScreen.jsx**

```jsx
import { useState, useEffect } from 'react';
import { getBillingStatus, createCheckout } from '../api.js';

export default function BillingScreen({ onActivated }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBillingStatus()
      .then(s => {
        setStatus(s);
        // Si viene de Stripe con ?success=true y ya está activo
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true' && s.status === 'active') {
          window.history.replaceState({}, '', '/');
          onActivated?.();
        }
      })
      .catch(() => setError('No se pudo cargar el estado de suscripción'))
      .finally(() => setLoading(false));
  }, []);

  async function handleActivate() {
    setCheckoutLoading(true);
    setError('');
    try {
      const { checkout_url } = await createCheckout();
      window.location.href = checkout_url;
    } catch (err) {
      setError(err.message || 'Error al iniciar el pago');
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <p className="text-ink-tertiary text-sm">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-ink-muted p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Tu plan actual</h2>

        {status?.status === 'trialing' && (
          <>
            <div>
              <p className="text-sm text-ink-secondary">Período de prueba</p>
              <p className="text-sm text-ink font-medium">
                Te quedan {status.days_remaining} {status.days_remaining === 1 ? 'día' : 'días'}
              </p>
            </div>
            <PlanFeatures />
            <ActivateButton onClick={handleActivate} loading={checkoutLoading} />
          </>
        )}

        {(status?.status === 'past_due' || status?.status === 'canceled' || status?.status === 'unpaid' ||
          (status?.status === 'trialing' && status?.days_remaining === 0)) && (
          <>
            <p className="text-sm text-ink">
              Tu período de prueba terminó. Activa tu suscripción para continuar.
              Tus datos están guardados.
            </p>
            <ActivateButton onClick={handleActivate} loading={checkoutLoading} />
          </>
        )}

        {status?.status === 'active' && (
          <>
            <p className="text-sm font-medium text-sage">Plan Pro — Activo</p>
            {status.current_period_end && (
              <p className="text-sm text-ink-secondary">
                Próximo cobro: {new Date(status.current_period_end).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            <p className="text-sm text-ink-tertiary">
              Para cancelar o cambiar tu plan, escríbenos a hola@syquex.mx
            </p>
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}

function PlanFeatures() {
  return (
    <ul className="text-sm text-ink-secondary space-y-1">
      {['Pacientes ilimitados', 'Notas SOAP con IA', 'Historial clínico completo', 'Soporte por email'].map(f => (
        <li key={f} className="flex items-center gap-2">
          <span className="text-sage">✓</span> {f}
        </li>
      ))}
    </ul>
  );
}

function ActivateButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
      {loading ? 'Redirigiendo a pago…' : 'Activar suscripción — $499/mes'}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/BillingScreen.jsx
git commit -m "feat(ui): add BillingScreen with trial/expired/active states"
```

---

## FASE 3 — Email y Cron

---

### Task 15: Servicio de email con Resend

**Archivos:**
- Create: `backend/services/__init__.py`
- Create: `backend/services/email.py`

- [ ] **Step 1: Crear backend/services/__init__.py**

Archivo vacío:
```python
# services package
```

- [ ] **Step 2: Crear backend/services/email.py**

```python
"""Servicio de email con Resend. Todos los envíos son fire-and-forget.

Nota: El SDK de Resend para Python es SÍNCRONO. Se envuelve en asyncio.to_thread()
para no bloquear el event loop de FastAPI.
"""
import asyncio
import resend
from datetime import datetime
from config import settings

def _init_resend():
    resend.api_key = settings.RESEND_API_KEY


async def send_welcome_email(to_email: str, name: str, trial_ends_at: datetime) -> None:
    _init_resend()
    trial_date = trial_ends_at.strftime("%d de %B de %Y") if trial_ends_at else "14 días"

    await asyncio.to_thread(resend.Emails.send, {
        "from": settings.RESEND_FROM_EMAIL,
        "to": to_email,
        "subject": f"Bienvenido a SyqueX, {name.split()[0]}",
        "html": f"""
        <p>Hola {name.split()[0]},</p>
        <p>Tu cuenta está lista. Tienes <strong>14 días de prueba gratuita</strong> hasta el {trial_date}.</p>
        <p><a href="https://syquex.mx">Ir a SyqueX →</a></p>
        <p>Para empezar, crea tu primer paciente.</p>
        <hr>
        <p style="color:#999;font-size:12px;">SyqueX — Asistente clínico para psicólogos</p>
        """,
    })


async def send_reset_email(to_email: str, name: str, raw_token: str) -> None:
    _init_resend()
    reset_url = f"https://syquex.mx/reset-password?token={raw_token}"

    await asyncio.to_thread(resend.Emails.send, {
        "from": settings.RESEND_FROM_EMAIL,
        "to": to_email,
        "subject": "Reestablece tu contraseña de SyqueX",
        "html": f"""
        <p>Hola {name.split()[0]},</p>
        <p>Recibimos una solicitud para cambiar tu contraseña.</p>
        <p><a href="{reset_url}" style="background:#5B7A6A;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">
          Cambiar contraseña
        </a></p>
        <p style="color:#999;font-size:12px;">Este enlace es válido por 1 hora.<br>
        Si no fuiste tú, ignora este email — tu cuenta está segura.</p>
        """,
    })


async def send_trial_reminder_email(to_email: str, name: str) -> None:
    _init_resend()

    await asyncio.to_thread(resend.Emails.send, {
        "from": settings.RESEND_FROM_EMAIL,
        "to": to_email,
        "subject": "Tu prueba gratuita termina en 2 días",
        "html": f"""
        <p>Hola {name.split()[0]},</p>
        <p>Tu período de prueba de SyqueX termina en <strong>2 días</strong>.</p>
        <p>
          <a href="https://syquex.mx/billing" style="background:#5B7A6A;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">
            Activar mi suscripción — $499/mes
          </a>
        </p>
        <p style="color:#999;font-size:12px;">Tus datos clínicos están seguros y siempre disponibles.</p>
        """,
    })
```

- [ ] **Step 3: Crear backend/api/internal.py**

```python
"""Endpoints internos para tareas de cron. Protegidos con INTERNAL_API_KEY."""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta

from database import get_db, Psychologist, Subscription, AuditLog
from config import settings
from services.email import send_trial_reminder_email

UTC = timezone.utc
router = APIRouter(prefix="/internal", tags=["internal"])


def _verify_internal_key(x_internal_key: str = Header(...)):
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/send-trial-reminders", dependencies=[Depends(_verify_internal_key)])
async def send_trial_reminders(db: AsyncSession = Depends(get_db)):
    """
    Envía recordatorio a psicólogos cuyo trial termina en las próximas 24-48 horas.
    Ejecutar diariamente a las 9am vía cron de Railway.
    """
    now = datetime.now(UTC)
    window_start = now + timedelta(hours=24)
    window_end = now + timedelta(hours=48)

    result = await db.execute(
        select(Psychologist).join(
            Subscription, Subscription.psychologist_id == Psychologist.id
        ).where(
            Psychologist.trial_ends_at >= window_start,
            Psychologist.trial_ends_at <= window_end,
            Subscription.status == "trialing",
            Psychologist.deleted_at.is_(None),
        )
    )
    psychologists = result.scalars().all()

    sent = 0
    for psych in psychologists:
        try:
            await send_trial_reminder_email(psych.email, psych.name)
            db.add(AuditLog(
                psychologist_id=psych.id,
                action="trial_reminder_sent",
                entity="psychologist",
                entity_id=str(psych.id),
            ))
            sent += 1
        except Exception:
            pass  # no interrumpir el loop por un fallo individual

    await db.commit()
    return {"sent": sent}
```

- [ ] **Step 4: Incluir router internal en main.py**

```python
from api.internal import router as internal_router
app.include_router(internal_router, prefix="/api/v1")
```

- [ ] **Step 5: Configurar cron en Railway**

En Railway Dashboard → Servicio → Cron Jobs → Agregar:
```
Schedule: 0 15 * * *    (9am hora México = 15:00 UTC)
Command: curl -X GET https://<railway-backend-url>/api/v1/internal/send-trial-reminders \
         -H "X-Internal-Key: $INTERNAL_API_KEY"
```

- [ ] **Step 6: Commit**

```bash
git add backend/services/__init__.py backend/services/email.py backend/api/internal.py backend/main.py
git commit -m "feat(email): add Resend service for welcome, reset, trial reminder emails and cron endpoint"
```

---

## FASE 4 — LFPDPPP Final

---

### Task 16: Endpoint de exportación de datos (derecho ARCO)

**Archivos:**
- Modify: `backend/api/routes.py` (o crear `backend/api/account.py`)

- [ ] **Step 1: Implementar GET /account/export**

Agregar en `backend/api/routes.py` (o en un archivo `account.py` nuevo con su propio router):

```python
import io, zipfile, json
from fastapi.responses import StreamingResponse
from api.limiter import limiter
from api.dependencies import require_active_access

@router.get("/account/export")
@limiter.limit("2/day")
async def export_account_data(
    request: Request,
    psychologist: Psychologist = Depends(require_active_access),
    db: AsyncSession = Depends(get_db),
):
    """
    Exporta todos los datos del psicólogo en formato ZIP (derecho ARCO — LFPDPPP).
    Máximo 2 exportaciones por día.
    """
    # Recopilar pacientes
    patients_result = await db.execute(
        select(Patient).where(
            Patient.psychologist_id == psychologist.id,
            Patient.deleted_at.is_(None)
        )
    )
    patients = patients_result.scalars().all()

    export_data = {
        "psychologist": {
            "id": str(psychologist.id),
            "name": psychologist.name,
            "email": psychologist.email,
            "cedula_profesional": psychologist.cedula_profesional,
            "created_at": psychologist.created_at.isoformat(),
            "accepted_privacy_at": psychologist.accepted_privacy_at.isoformat() if psychologist.accepted_privacy_at else None,
            # password_hash EXCLUIDO intencionalmente
        },
        "patients": []
    }

    for patient in patients:
        sessions_result = await db.execute(
            select(Session).where(Session.patient_id == patient.id)
        )
        sessions = sessions_result.scalars().all()

        patient_data = {
            "id": str(patient.id),
            "name": patient.name,
            "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
            "diagnosis_tags": patient.diagnosis_tags,
            "risk_level": patient.risk_level,
            "created_at": patient.created_at.isoformat(),
            "sessions": []
        }

        for session in sessions:
            note_data = None
            if session.clinical_note:
                note = session.clinical_note
                note_data = {
                    "format": note.format,
                    "subjective": note.subjective,
                    "objective": note.objective,
                    "assessment": note.assessment,
                    "plan": note.plan,
                    "detected_patterns": note.detected_patterns,
                    # embedding EXCLUIDO — no es dato personal legible
                }
            patient_data["sessions"].append({
                "id": str(session.id),
                "session_number": session.session_number,
                "session_date": session.session_date.isoformat(),
                "raw_dictation": session.raw_dictation,
                "status": session.status,
                "clinical_note": note_data,
            })

        export_data["patients"].append(patient_data)

    # Audit log
    db.add(AuditLog(
        psychologist_id=psychologist.id,
        action="data_export",
        entity="psychologist",
        entity_id=str(psychologist.id),
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    # Crear ZIP en memoria
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("syquex-export.json", json.dumps(export_data, ensure_ascii=False, indent=2))
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=syquex-export.zip"}
    )
```

- [ ] **Step 2: Verificar bloqueo de login para deleted_at**

En `backend/api/auth.py`, en el endpoint `login`, agregar verificación:

```python
# Después de encontrar el psicólogo por email:
if psychologist.deleted_at is not None:
    raise HTTPException(status_code=401, detail="Cuenta desactivada")
```

- [ ] **Step 3: Audit logging en todos los endpoints nuevos**

Verificar que todos los endpoints implementados en Tasks 4-15 tienen su entrada en `audit_logs`. Revisar:
- `POST /auth/register` → `action='register'` ✓ (Task 4)
- `POST /auth/logout` → `action='logout'` ✓ (Task 5)
- `POST /auth/forgot-password` → `action='password_reset_requested'` ✓ (Task 6)
- `POST /auth/reset-password` → `action='password_reset_completed'` ✓ (Task 6)
- `GET /account/export` → `action='data_export'` ✓ (este task)
- `GET /internal/send-trial-reminders` → `action='trial_reminder_sent'` ✓ (Task 15)

- [ ] **Step 4: Correr suite completa de tests**

```bash
cd backend && pytest tests/ -v --tb=short
cd frontend && npm test -- --run
```

Esperado: todos los tests pasan.

- [ ] **Step 5: Commit final**

```bash
git add backend/api/routes.py backend/api/auth.py
git commit -m "feat(lfpdppp): add data export endpoint, block deleted accounts, complete audit logging"
```

---

## Verificación final antes de deploy

- [ ] **Confirmar variables de entorno en Railway:**

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=hola@syquex.mx
INTERNAL_API_KEY=<secreto aleatorio>
SYQUEX_ENV=production
```

- [ ] **Registrar webhook en Stripe Dashboard:**

Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<railway-url>/api/v1/billing/webhook`
- Events: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`

- [ ] **Verificar dominio syquex.mx en Resend:**

Resend Dashboard → Domains → Add → Seguir instrucciones DNS

- [ ] **Fijar Railway a 1 instancia:**

Railway Dashboard → Servicio → Settings → Scaling → Max replicas: 1

- [ ] **Correr seed de producción (crear primer psicólogo):**

```bash
cd backend
python -c "
import asyncio
from database import init_db
asyncio.run(init_db())
print('DB inicializada')
"
```

- [ ] **PR final a dev:**

```bash
git push origin feature/auth-billing-launch
# Crear PR → dev en GitHub
```
