# Spec: Auth, Billing y Lanzamiento de Pago — SyqueX

**Fecha:** 2026-03-30
**Estado:** Aprobado para implementación
**Rama:** `feature/auth-billing-launch` desde `dev`

---

## Contexto

SyqueX tiene el flujo clínico core funcionando (SOAP notes, pacientes, sesiones, vector search) y una infraestructura de deploy lista (Vercel + Railway + Supabase). El backend tiene auth JWT implementado pero el frontend no tiene login ni manejo de tokens. No existe billing. Este spec cubre todo lo necesario para cobrar suscripciones reales con cumplimiento LFPDPPP.

---

## Alcance

### En scope
- Frontend de autenticación (login, registro, forgot/reset password)
- Registro con consentimiento explícito LFPDPPP
- Trial gratuito de 14 días sin tarjeta
- Integración Stripe Checkout (un plan, arquitectura escalable)
- Middleware de acceso (trial activo / suscripción activa)
- Emails transaccionales con Resend (bienvenida, reset, recordatorio día 12)
- Cron job de recordatorios de trial
- Endpoint de exportación de datos (derecho ARCO)
- Hardening de seguridad crítico y alto

### Fuera de scope
- Rediseño UI documentation-first (spec separado, ya en progreso)
- Notas por voz Whisper API (Fase 2 del roadmap)
- Intake de paciente nuevo con agente (spec separado)
- Stripe Customer Portal (cancelación self-service post-lanzamiento)
- Panel de administración
- Redis para rate limiting distribuido (fijar Railway a 1 instancia en MVP)

---

## Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Modelo de suscripción | Un plan, arquitectura escalable | Reduce complejidad MVP; agregar tiers es solo una row en DB |
| Trial | 14 días sin tarjeta | Psicólogos ocupados — primero que prueben, luego que paguen |
| Proveedor de pagos | Stripe | API más simple; Conekta/OXXO se puede agregar después |
| Email | Resend | 5 líneas de integración, tier gratis cubre volumen inicial |
| Verificación de cédula | Informativa (no validada) | Filtro de buena fe suficiente para MVP |
| Cancelación de suscripción | Manual por email en MVP | Evita implementar Stripe Customer Portal ahora |
| Rate limiting | In-memory (slowapi) + Railway en 1 instancia | Sin Redis en MVP; 1 instancia elimina el problema de estado compartido |

---

## Ciclo de vida de una suscripción

El estado de la suscripción local sigue este flujo. Es la fuente de verdad para `require_active_access`.

```
REGISTRO
  │
  ▼
subscription.status = 'trialing'          ← solo fila local, SIN objeto Stripe
stripe_customer creado, sin subscription
  │
  ├── [trial vigente] → acceso completo
  │
  ├── [trial expirado] → 402, redirige a /billing
  │
  └── [usuario hace checkout] ──────────────────────────────┐
                                                             ▼
                                          Stripe Checkout Session creada
                                          con trial_end = días restantes
                                                             │
                                          webhook: checkout.session.completed
                                                             │
                                                             ▼
                                          subscription.status = 'active'
                                          stripe_subscription_id guardado
                                          current_period_end actualizado
                                                             │
                              ┌──────────────────────────────┤
                              │                              │
                     invoice.payment_succeeded     invoice.payment_failed
                              │                              │
                              ▼                              ▼
                  current_period_end += 1 mes     status = 'past_due'
                                                  (acceso bloqueado)
                                                             │
                                              customer.subscription.deleted
                                                             │
                                                             ▼
                                                  status = 'canceled'
```

**Regla clave:** `trial_ends_at` aplica solo cuando `status = 'trialing'`. Una vez que `status = 'active'`, `trial_ends_at` se ignora — el control pasa a `current_period_end` de Stripe vía webhooks.

---

## Base de datos

### Cambios a `psychologists`

```sql
ALTER TABLE psychologists ADD COLUMN cedula_profesional   VARCHAR(20);
ALTER TABLE psychologists ADD COLUMN specialty             VARCHAR(100);
ALTER TABLE psychologists ADD COLUMN accepted_privacy_at   TIMESTAMPTZ;
ALTER TABLE psychologists ADD COLUMN accepted_terms_at     TIMESTAMPTZ;
ALTER TABLE psychologists ADD COLUMN privacy_version       VARCHAR(10);  -- "1.0"
ALTER TABLE psychologists ADD COLUMN terms_version         VARCHAR(10);  -- "1.0"
ALTER TABLE psychologists ADD COLUMN trial_ends_at         TIMESTAMPTZ;
ALTER TABLE psychologists ADD COLUMN stripe_customer_id    VARCHAR(50);
```

`accepted_privacy_at` y `accepted_terms_at` son NULL hasta que el psicólogo acepte explícitamente en el formulario de registro. Se registra la versión del documento aceptado para detectar quién necesita re-aceptar si el aviso cambia (LFPDPPP Art. 8).

### Nueva tabla: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id         UUID NOT NULL REFERENCES psychologists(id),
  plan_slug               VARCHAR(50) NOT NULL,         -- 'pro_v1'
  price_mxn_cents         INTEGER NOT NULL,              -- 49900 = $499.00 MXN
  status                  VARCHAR(20) NOT NULL
                          CHECK (status IN (
                            'trialing', 'active',
                            'past_due', 'canceled', 'unpaid'
                          )),
  stripe_subscription_id  VARCHAR(100) UNIQUE,           -- NULL durante trial
  stripe_price_id         VARCHAR(100),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  canceled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON subscriptions (psychologist_id);
CREATE INDEX ON subscriptions (status);
```

`stripe_subscription_id` es NULL mientras el psicólogo está en trial — se popula en `checkout.session.completed`. `plan_slug` y `price_mxn_cents` son libres (no FK); agregar tiers es una row nueva sin cambios de schema.

### Nueva tabla: `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id   UUID NOT NULL REFERENCES psychologists(id),
  token_hash        VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256, nunca el token raw
  expires_at        TIMESTAMPTZ NOT NULL,          -- NOW() + 7 días
  revoked_at        TIMESTAMPTZ,
  ip_address        INET,                          -- LFPDPPP: auditoría de sesiones
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON refresh_tokens (token_hash);
CREATE INDEX ON refresh_tokens (psychologist_id);
```

### Nueva tabla: `password_reset_tokens`

```sql
CREATE TABLE password_reset_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id  UUID NOT NULL REFERENCES psychologists(id),
  token_hash       VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 del token raw
  expires_at       TIMESTAMPTZ NOT NULL,          -- NOW() + 1 hora
  used_at          TIMESTAMPTZ,
  failed_attempts  INTEGER DEFAULT 0,             -- bloqueo tras 3 intentos fallidos
  ip_address       INET,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON password_reset_tokens (token_hash);
```

### Tabla `audit_logs` (ya existe — campos de referencia)

```sql
-- Tabla existente en database.py. Campos relevantes para este spec:
-- id UUID, timestamp TIMESTAMPTZ, psychologist_id UUID,
-- action VARCHAR, entity VARCHAR, entity_id UUID,
-- ip_address INET, extra JSONB
--
-- Nuevos valores de action usados en este spec:
-- 'register', 'logout', 'password_reset_requested',
-- 'password_reset_completed', 'data_export', 'trial_reminder_sent'
```

---

## Backend

### Política de contraseñas

```
Mínimo 8 caracteres
Al menos 1 letra mayúscula
Al menos 1 número
Sin máximo (nunca truncar)
```

Validación en frontend (feedback en tiempo real) y verificación en backend antes de hashear.

### Rutas protegidas con `require_active_access`

El middleware se aplica exactamente a estos routers/endpoints:

```
/patients/*          — todas las rutas de pacientes
/sessions/*          — todas las rutas de sesiones
/account/export      — exportación ARCO

NO aplica a:
/auth/*              — login/registro/refresh/reset
/billing/*           — el psicólogo debe poder pagar aunque esté bloqueado
/health              — health check
/internal/*          — cron interno
```

### Nuevos endpoints — Auth

**`POST /auth/register`**
1. Validar email único
2. Validar política de contraseña
3. Verificar `accepted_privacy == true` y `accepted_terms == true` (400 si no)
4. Hashear password (bcrypt, 12 rounds — patrón existente)
5. Crear `psychologist` con `accepted_privacy_at = NOW()`, `accepted_terms_at = NOW()`, `privacy_version = "1.0"`, `terms_version = "1.0"`, `trial_ends_at = NOW() + 14 days`
6. Crear Stripe Customer (`stripe.customers.create`) — solo Customer, sin Subscription
7. Guardar `stripe_customer_id`
8. Crear fila local en `subscriptions` con `status='trialing'`, `stripe_subscription_id=NULL`
9. Enviar email de bienvenida vía Resend (fire-and-forget, no bloquea respuesta)
10. Registrar en `audit_logs`: `action='register'`
11. Retornar JWT + setear refresh token en httpOnly cookie

**`POST /auth/refresh`**
1. Leer refresh token de httpOnly cookie
2. Hashear → buscar en DB
3. Verificar: no revocado, no expirado
4. **Rotación:** revocar token actual (`revoked_at = NOW()`)
5. Emitir nuevo refresh token, guardar hash en DB
6. Si el token buscado ya tenía `revoked_at` (token ya usado) → revocar TODOS los tokens del psicólogo (señal de robo de sesión)
7. Retornar nuevo `access_token` (30 min)
8. Setear nueva cookie con nuevo refresh token

**`POST /auth/logout`**
1. Revocar refresh token actual (`revoked_at = NOW()`)
2. Limpiar cookie
3. Registrar en `audit_logs`: `action='logout'`

**`POST /auth/forgot-password`** — rate limit: 3/hora por IP, 1/10min por email
1. Buscar psicólogo por email
2. Siempre esperar `asyncio.sleep(random.uniform(0.1, 0.3))` — evita timing attack / enumeración
3. Si existe: generar token (`secrets.token_urlsafe(32)`), guardar hash, enviar email con link `https://syquex.mx/reset-password?token=<raw_token>`
4. Si no existe: no hacer nada (misma respuesta, mismo tiempo)
5. Responder siempre: `{"message": "Si el email existe, recibirás un enlace"}`
6. Registrar en `audit_logs`: `action='password_reset_requested'`

**`POST /auth/reset-password`** — rate limit: 5/hora por IP
1. Hashear token recibido → buscar en DB
2. Si no existe o `used_at IS NOT NULL` → 400
3. Si `failed_attempts >= 3` → 400 "Token inválido" (bloqueo por intentos fallidos)
4. Si expirado → incrementar `failed_attempts`, retornar 400
5. Validar política de contraseña
6. Actualizar `password_hash`
7. Marcar token como usado (`used_at = NOW()`)
8. Revocar TODOS los `refresh_tokens` del psicólogo
9. Registrar en `audit_logs`: `action='password_reset_completed'`
10. Retornar JWT nuevo + setear refresh token cookie (usuario queda logueado)

### Nuevos endpoints — Billing

**`GET /billing/status`** — auth requerida, sin `require_active_access`
```json
{
  "status": "trialing",
  "plan_slug": "pro_v1",
  "trial_ends_at": "2026-04-13T00:00:00Z",
  "days_remaining": 14,
  "current_period_end": null
}
```

**`POST /billing/create-checkout`** — auth requerida, sin `require_active_access`
1. Obtener `stripe_customer_id` del psicólogo
2. Calcular `trial_end_timestamp` si `trial_ends_at > NOW()`
3. Crear Stripe Checkout Session:
   - `mode: "subscription"`
   - `customer`: `stripe_customer_id`
   - `line_items`: `[{ price: STRIPE_PRICE_ID }]`
   - `subscription_data.trial_end`: `trial_end_timestamp` (si aplica) — Stripe respeta los días restantes
   - `success_url`: `https://syquex.mx/billing?success=true`
   - `cancel_url`: `https://syquex.mx/billing`
4. Retornar `{ checkout_url }`

**`POST /billing/webhook`** — SIN auth JWT, verificado por firma Stripe
```python
# CRÍTICO: validar firma ANTES de parsear el body
try:
    event = stripe.Webhook.construct_event(
        payload, sig_header, STRIPE_WEBHOOK_SECRET
    )
except stripe.error.SignatureVerificationError:
    raise HTTPException(status_code=400)

# Idempotencia: verificar que el evento no fue procesado antes
if await event_already_processed(event.id):
    return {"ok": True}  # responder 200 a Stripe, no re-procesar
await mark_event_processed(event.id)
```

Para idempotencia se agrega columna `stripe_event_id VARCHAR(100) UNIQUE` a una tabla auxiliar `processed_stripe_events (id, created_at)`. Esto evita doble cobro si Stripe reenvía el evento.

Eventos manejados:
- `checkout.session.completed` → `status = 'active'`, guardar `stripe_subscription_id`, `current_period_start/end`
- `invoice.payment_succeeded` → actualizar `current_period_end`, `status = 'active'`
- `invoice.payment_failed` → `status = 'past_due'`
- `customer.subscription.deleted` → `status = 'canceled'`, `canceled_at = NOW()`

**`GET /account/export`** — auth + `require_active_access`, rate limit: 2/día por psicólogo
1. Recopilar todos los datos: pacientes, sesiones, notas (excluir embeddings y `password_hash`)
2. Serializar a JSON
3. Comprimir en ZIP
4. Registrar en `audit_logs`: `action='data_export'`
5. Retornar ZIP con header `Content-Disposition: attachment; filename="syquex-export.zip"`

**`GET /internal/send-trial-reminders`** — header `X-Internal-Key: {INTERNAL_API_KEY}`
1. Buscar psicólogos con `trial_ends_at` entre `NOW() + 48h` y `NOW() + 24h` y `status='trialing'`
2. Enviar email de recordatorio vía Resend a cada uno
3. Registrar en `audit_logs`: `action='trial_reminder_sent'`

### Tabla auxiliar para idempotencia de webhooks

```sql
CREATE TABLE processed_stripe_events (
  id         VARCHAR(100) PRIMARY KEY,  -- event.id de Stripe
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Middleware de acceso

```python
async def require_active_access(psychologist):
    sub = await get_subscription(psychologist.id)

    if sub.status == 'trialing':
        if datetime.now(UTC) > psychologist.trial_ends_at:
            raise SubscriptionExpired()  # 402 Payment Required
        return  # trial vigente ✓

    if sub.status == 'active':
        return  # suscripción activa ✓

    # past_due, unpaid, canceled
    raise SubscriptionExpired()  # 402 Payment Required
```

El frontend intercepta 402 y redirige a `/billing`.

### Email con Resend — 3 plantillas

Todos los envíos son fire-and-forget (no bloquean la respuesta HTTP). Fallos de Resend se loguean como warning, nunca causan error 500.

| Trigger | Asunto | Variables |
|---|---|---|
| `POST /auth/register` | "Bienvenido a SyqueX, {nombre}" | `nombre`, `trial_ends_at` |
| `POST /auth/forgot-password` | "Reestablece tu contraseña de SyqueX" | `reset_url` (expira en 1h) |
| Cron día 12 | "Tu prueba gratuita termina en 2 días" | `nombre`, `checkout_url` |

### Variables de entorno nuevas

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=hola@syquex.mx
INTERNAL_API_KEY=...              # rotarlo manualmente si se compromete; redeployar Railway
```

---

## Frontend

### Rutas

```
/login           → público
/registro        → público
/forgot-password → público
/reset-password  → público (requiere ?token= válido en URL)
/billing         → protegido (auth, SIN require_active_access)
/               → protegido (auth + acceso activo)
```

### Manejo de tokens

- `access_token` en estado de React en memoria (no localStorage — evita XSS con datos clínicos)
- `refresh_token` en httpOnly cookie (el backend lo setea y lo lee — el JS nunca lo ve)
- Al cargar la app: si no hay `access_token` en memoria → llamar `auth.refresh()` silenciosamente
- Interceptor en `api.js`: respuesta 401 → llamar `auth.refresh()` → reintentar request original → si falla, redirigir a `/login`
- Interceptor en `api.js`: respuesta 402 → redirigir a `/billing`
- **Race condition:** si múltiples requests simultáneas reciben 401, encolar las requests y ejecutar un solo refresh. Usar un flag `isRefreshing` + cola de callbacks pendientes.

### Cookie de refresh token (backend)

```python
response.set_cookie(
    key="refresh_token",
    value=raw_token,      # el raw token solo viaja aquí, nunca en JSON
    httponly=True,        # JS no puede leerla
    secure=True,          # HTTPS only
    samesite="strict",    # bloquea CSRF cross-site
    max_age=7 * 24 * 3600,
    path="/auth"          # solo se envía a /auth/* — no a /patients, /sessions, etc.
)
```

### Página `/registro`

- Campos: nombre completo, email, password, cédula profesional (opcional)
- Indicador `PasswordStrength` en tiempo real (3 reglas con ✓/✗)
- Dos checkboxes obligatorios con link al documento:
  - "He leído el Aviso de Privacidad"
  - "Acepto los Términos y Condiciones"
- Botón "Crear cuenta — 14 días gratis" deshabilitado hasta que ambos checkboxes estén marcados

### Página `/login`

- Campos: email, password
- Link "¿Olvidaste tu contraseña?" → `/forgot-password`
- Link "¿No tienes cuenta?" → `/registro`

### Página `/forgot-password`

- Un campo: email
- Al enviar: mostrar siempre "Si el email existe, recibirás un enlace en los próximos minutos"
- Link "← Volver al inicio de sesión"

### Página `/reset-password`

- Lee `?token=` de la URL al montar — si ausente, redirigir a `/forgot-password`
- Campos: nueva contraseña + confirmar contraseña
- Indicador `PasswordStrength` en tiempo real
- Si el backend retorna error (token inválido/expirado/bloqueado): mensaje claro + link a `/forgot-password`
- Al éxito: el backend retorna JWT + setea cookie → usuario queda logueado → redirigir a `/`

### Trial banner

Visible en la app cuando `status === 'trialing'`. No visible cuando `status === 'active'`.

```
Prueba gratuita — te quedan {N} días      [Activar]
```

- Fondo amber `#c4935a` tenue cuando `N ≤ 3`
- Fondo neutro cuando `N > 3`
- `[Activar]` → `POST /billing/create-checkout` → `window.location.href = checkout_url`

### Página `/billing`

Tres estados basados en `GET /billing/status`:

**`trialing`** (trial vigente): días restantes + botón "Activar suscripción — $499/mes"

**`trialing` expirado o `past_due`/`canceled`**: acceso bloqueado, "Tu período de prueba terminó. Tus datos están guardados.", botón "Activar por $499/mes"

**`active`**: "Plan Pro — Activo", fecha de próximo cobro, "Para cancelar escríbenos a hola@syquex.mx"

### Nuevas funciones en `api.js`

```javascript
auth.register(name, email, password, cedula, privacyVersion, termsVersion)
auth.login(email, password)
auth.logout()
auth.refresh()              // llamado por interceptor; maneja race condition con cola
auth.forgotPassword(email)
auth.resetPassword(token, newPassword)
billing.getStatus()
billing.createCheckout()
```

### Nuevos componentes

| Componente | Propósito |
|---|---|
| `TrialBanner.jsx` | Banner de días restantes, amber cuando ≤3 días |
| `PasswordStrength.jsx` | Indicador visual con 3 reglas ✓/✗ en tiempo real |

---

## Seguridad

### Críticos

**Stripe webhook — validación de firma**
`stripe.Webhook.construct_event()` antes de cualquier lógica. Sin esto, cualquiera puede activar suscripciones con un POST falso.

**`/auth/forgot-password` — anti email bombing**
Rate limit: 3/hora por IP + 1/10min por email. Tiempo de respuesta constante con `asyncio.sleep(random.uniform(0.1, 0.3))` — evita enumerar emails por tiempo de respuesta.

### Altos

**Rotación de refresh tokens con detección de robo**
Cada `POST /auth/refresh` invalida el token actual y emite uno nuevo. Si un token ya revocado es presentado → revocar TODOS los tokens del psicólogo.

**Railway — una sola instancia en MVP**
`slowapi` usa contadores en memoria. Con múltiples instancias los contadores no se comparten. Configurar Railway a `instances=1` hasta implementar Redis.

**Cookie con flags completos**
`httponly=True`, `secure=True`, `samesite="strict"`, `path="/auth"`. `SameSite=Strict` bloquea el envío en requests cross-site.

**`GET /account/export` — rate limiting**
Máximo 2/día por psicólogo. Siempre registrar en `audit_logs`.

**Idempotencia en webhooks de Stripe**
Tabla `processed_stripe_events` con `stripe_event_id UNIQUE`. Evita doble cobro o estados duplicados si Stripe reenvía el evento.

**Interceptor de refresh con cola (race condition)**
Si múltiples requests reciben 401 simultáneamente, ejecutar un solo refresh y encolar el resto. Implementar con flag `isRefreshing` + array de callbacks pendientes en `api.js`.

**`/auth/reset-password` — bloqueo por intentos fallidos**
Campo `failed_attempts` en `password_reset_tokens`. Después de 3 intentos fallidos, el token se bloquea permanentemente. El usuario debe solicitar uno nuevo.

---

## LFPDPPP — cumplimiento técnico

| Obligación | Implementación |
|---|---|
| Consentimiento expreso (Art. 8) | `accepted_privacy_at`, `accepted_terms_at`, `privacy_version` en `psychologists` |
| Versionado de avisos | `privacy_version` — detectar quién necesita re-aceptar si el aviso cambia |
| Derecho de cancelación (ARCO) | `deleted_at` ya existe (soft delete); psicólogo con `deleted_at` no puede hacer login |
| Derecho de acceso (ARCO) | `GET /account/export` — ZIP con todos los datos, máx 2/día |
| Control de sesiones activas | `refresh_tokens` con `revoked_at` — terminar sesiones remotamente |
| Auditoría de acceso | `audit_logs` en todos los endpoints nuevos |
| Datos sensibles fuera de logs | Token raw nunca se loguea; `password_hash` excluido del export |

**Nota sobre datos en Stripe:** Al dar de baja a un psicólogo, notificar manualmente a Stripe para cancelar la suscripción y eliminar datos del customer. Procedimiento: Stripe Dashboard → buscar customer → "Delete customer". Automatizar post-MVP.

---

## Orden de implementación

### Fase 1 — Autenticación (2-3 días)
1. Migraciones de base de datos (campos en `psychologists`, tablas `subscriptions`, `refresh_tokens`, `password_reset_tokens`)
2. Backend: `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`
3. Backend: `POST /auth/forgot-password`, `POST /auth/reset-password`
4. Frontend: `/login`, `/registro`, `/forgot-password`, `/reset-password`
5. `api.js`: interceptor 401/402 con cola de refresh, funciones de auth

### Fase 2 — Billing (1-2 días)
1. Configurar producto + precio en Stripe Dashboard; obtener `STRIPE_PRICE_ID`
2. Tabla auxiliar `processed_stripe_events`
3. Backend: `GET /billing/status`, `POST /billing/create-checkout`, `POST /billing/webhook`
4. Middleware `require_active_access` aplicado a routers de patients y sessions
5. Frontend: `/billing` (3 estados), `TrialBanner`

### Fase 3 — Email + Cron (1 día)
1. Integrar Resend, crear 3 plantillas con variables documentadas
2. Trigger email bienvenida desde `POST /auth/register` (fire-and-forget)
3. Trigger email reset desde `POST /auth/forgot-password`
4. `GET /internal/send-trial-reminders`
5. Cron job en Railway: cada día 9:00am hora México

### Fase 4 — LFPDPPP final (1 día)
1. `GET /account/export` con rate limiting y exclusión de campos sensibles
2. Verificar `audit_logs` en todos los endpoints nuevos
3. Agregar bloqueo de login para psicólogos con `deleted_at IS NOT NULL`

---

## Dependencias externas

| Dependencia | Necesaria antes de... |
|---|---|
| Cuenta Stripe con RFC + CLABE configurada | Fase 2 |
| Dominio `syquex.mx` verificado en Resend | Fase 3 |
| Variables de entorno en Railway | Deploy a producción |
| Railway fijado a 1 instancia | Fase 1 deploy |
| Stripe CLI (`stripe listen`) para webhooks locales | Desarrollo de Fase 2 |
