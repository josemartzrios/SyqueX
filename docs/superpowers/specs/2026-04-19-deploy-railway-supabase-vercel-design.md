# Deploy SyqueX: Railway + Supabase + Vercel + app.syquex.mx

**Date:** 2026-04-19  
**Status:** Approved  
**Environment target:** Staging first → Production

---

## Objetivo

Deployar SyqueX (backend FastAPI + frontend React) en infraestructura de producción con el subdominio `app.syquex.mx`, usando Railway (backend), Supabase (PostgreSQL 16 + pgvector 1024d), y Vercel (frontend). Incluye configuración de RLS con session variables (no Supabase Auth) y Stripe en modo test.

---

## Arquitectura

```
syquex.mx            → Landing (ya en producción, sin cambios)
app.syquex.mx        → Vercel (frontend React/Vite)
                           ↓ VITE_API_URL
                       Railway (FastAPI + Uvicorn, $PORT dinámico)
                           ↓ DATABASE_URL (postgresql+asyncpg + SSL)
                       Supabase (PostgreSQL 16 + pgvector, vector(1024))
                           ↕
                       Stripe (modo test)
```

Un solo repo GitHub conectado a Railway (backend) y Vercel (frontend) con deploys automáticos en push a `dev`.

---

## Orden de pasos

1. **Supabase** — crear proyecto, habilitar `pgvector` vía `init_db()`, obtener connection string
2. **Stripe** — obtener test keys, crear producto/precio, registrar webhook con 5 eventos
3. **Railway** — crear servicio, conectar repo `/backend`, configurar env vars, deploy
4. **Vercel** — crear proyecto apuntando a `/frontend`, configurar `VITE_API_URL`, deploy
5. **DNS** — agregar CNAME `app → cname.vercel-dns.com`, verificar propagación
6. **Vercel custom domain** — agregar `app.syquex.mx` y verificar TLS
7. **Cambios de código** — 5 cambios en backend (billing, CORS, Dockerfile, RLS middleware, políticas SQL)

---

## Cambios de código

### 1. Fix Dockerfile — puerto dinámico (`backend/Dockerfile`)

Railway inyecta `$PORT` dinámicamente. El CMD actual hardcodea 8000.

```dockerfile
# Antes:
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Después (shell form para que $PORT se expanda):
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

### 2. Fix billing route (`backend/api/billing.py`)

El frontend llama `POST /api/v1/billing/create-checkout` pero el backend expone `/checkout`.

```python
# Antes (línea 43):
@router.post("/checkout")

# Después:
@router.post("/create-checkout")
```

### 3. CORS — agregar `app.syquex.mx` (`backend/main.py`)

El env var `ALLOWED_ORIGINS` tiene un bug conocido en Railway (no carga en runtime). Actualizar la regex como fix definitivo:

```python
# Antes:
allow_origin_regex=r"^https://syquex(-[a-z0-9]+)*\.vercel\.app$"

# Después:
allow_origin_regex=r"^https://(syquex(-[a-z0-9]+)*\.vercel\.app|app\.syquex\.mx)$"
```

### 4. RLS middleware (`backend/database.py`)

Agregar función `get_db_for_user` junto a `get_db` existente. Las rutas autenticadas usan este dependency para inyectar el `psychologist_id` como session variable de PostgreSQL:

```python
async def get_db_for_user(psychologist_id: str):
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.psychologist_id', :pid, true)"),
            {"pid": str(psychologist_id)}
        )
        yield session
```

`set_config(..., true)` es transaction-local — no puede filtrarse entre requests, incluso con conexiones reutilizadas. Compatible con `NullPool` ya configurado.

**Rutas que cambian de `get_db` a `get_db_for_user`:** todas las rutas que reciben `current_psychologist` como dependency (pacientes, sesiones, notas clínicas, perfiles, billing/status). Las rutas de auth (`/register`, `/login`, `/refresh`, `/logout`) y el webhook de Stripe **mantienen `get_db`** — no tienen `psychologist_id` en ese punto.

### 5. Políticas RLS en `init_db()` (`backend/database.py`)

Agregar al final de `init_db()`. Supabase otorga ownership de las tablas al usuario de la conexión (postgres), por lo que `ENABLE ROW LEVEL SECURITY` no requiere permisos adicionales. Habilitar pgvector también vía `init_db()` — no usar el toggle del dashboard de Supabase (puede crear la extensión en schema `extensions`, lo que rompe la resolución del tipo `vector`).

```sql
-- Habilitar RLS (idempotente — IF no existe restricción previa)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychologists ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de aislamiento por psicólogo
-- patients: acceso directo por psychologist_id
CREATE POLICY IF NOT EXISTS patients_isolation ON patients
    USING (psychologist_id = current_setting('app.psychologist_id', true)::uuid);

-- sessions: a través de patients.psychologist_id
CREATE POLICY IF NOT EXISTS sessions_isolation ON sessions
    USING (patient_id IN (
        SELECT id FROM patients
        WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid
    ));

-- clinical_notes: a través de sessions → patients
CREATE POLICY IF NOT EXISTS clinical_notes_isolation ON clinical_notes
    USING (session_id IN (
        SELECT s.id FROM sessions s
        JOIN patients p ON s.patient_id = p.id
        WHERE p.psychologist_id = current_setting('app.psychologist_id', true)::uuid
    ));

-- patient_profiles: a través de patients
CREATE POLICY IF NOT EXISTS patient_profiles_isolation ON patient_profiles
    USING (patient_id IN (
        SELECT id FROM patients
        WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid
    ));

-- psychologists: solo su propio row
CREATE POLICY IF NOT EXISTS psychologists_self ON psychologists
    USING (id = current_setting('app.psychologist_id', true)::uuid);

-- subscriptions
CREATE POLICY IF NOT EXISTS subscriptions_isolation ON subscriptions
    USING (psychologist_id = current_setting('app.psychologist_id', true)::uuid);

-- refresh_tokens
CREATE POLICY IF NOT EXISTS refresh_tokens_isolation ON refresh_tokens
    USING (psychologist_id = current_setting('app.psychologist_id', true)::uuid);

-- audit_logs: permite rows sin psychologist_id (eventos de sistema)
CREATE POLICY IF NOT EXISTS audit_logs_isolation ON audit_logs
    USING (psychologist_id = current_setting('app.psychologist_id', true)::uuid
           OR psychologist_id IS NULL);
```

**Tablas sin RLS:**
- `processed_stripe_events` — escrita por el webhook (unauthenticated by design); RLS bloquearía los writes del app user
- `password_reset_tokens` — accedida antes de conocer el psychologist_id

---

## Webhook Stripe — fix de evento faltante

El handler actual no procesa `invoice.payment_failed`, que es el evento que mueve una suscripción a `past_due`. Sin él, los pagos fallidos no actualizan el status en BD.

**Agregar a `backend/api/billing.py`:**

```python
elif event.type == 'invoice.payment_failed':
    invoice = event.data.object
    if invoice.subscription:
        db_sub_res = await db.execute(
            select(Subscription).where(
                Subscription.stripe_subscription_id == invoice.subscription
            )
        )
        db_sub = db_sub_res.scalar_one_or_none()
        if db_sub:
            db_sub.status = 'past_due'

await db.commit()
```

**Eventos a registrar en el webhook de Stripe (5 total):**
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

---

## Env vars Railway (staging)

| Variable | Valor |
|----------|-------|
| `ENVIRONMENT` | `staging` |
| `DATABASE_URL` | `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SECRET_KEY` | 64+ chars (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Fernet key existente |
| `INTERNAL_API_KEY` | random (`openssl rand -hex 16`) |
| `ALLOWED_ORIGINS` | `https://app.syquex.mx` |
| `FRONTEND_URL` | `https://app.syquex.mx` |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_ID` | `price_...` |
| `RESEND_API_KEY` | no requerido en staging — dejar vacío |

## Env vars Vercel

| Variable | Valor |
|----------|-------|
| `VITE_API_URL` | URL pública de Railway (ej. `https://syquex-backend-production.up.railway.app`) |

---

## Supabase — configuración inicial

1. Crear proyecto (región: US East para menor latencia con Railway US)
2. **No** habilitar pgvector desde el dashboard — `init_db()` lo crea en `public` schema
3. Settings → Database → Connection string → **Transaction mode** (requerido para NullPool)
4. Copiar URI y adaptar prefijo: `postgresql://` → `postgresql+asyncpg://`
5. El código ya incluye `statement_cache_size: 0` (requerido para Transaction mode pooler)
6. El código ya habilita SSL automáticamente si la URL contiene "supabase"
7. Opcional: Settings → API → deshabilitar PostgREST para eliminar superficie de ataque directa

---

## Stripe — configuración inicial

1. Dashboard → Developers → API keys → copiar `sk_test_...`
2. Products → Add product → "SyqueX Pro" → precio recurrente mensual en MXN
3. Copiar `price_...` del precio creado
4. Webhooks → Add endpoint:
   - URL: `https://[railway-url]/api/v1/billing/webhook`
   - Eventos: los 5 listados arriba
5. Copiar `whsec_...` del webhook

---

## Railway — configuración

1. New Project → Deploy from GitHub repo → seleccionar `/backend` como root directory
2. Railway detecta el Dockerfile automáticamente
3. Configurar todas las env vars de la tabla anterior
4. El `railway.toml` ya tiene: `healthcheckPath = "/api/v1/health"`, `healthcheckTimeout = 60`
5. Tras primer deploy exitoso, copiar la Railway URL pública para configurar Vercel

---

## Vercel — configuración

1. New Project → Import GitHub repo → **Root Directory: `frontend`**
2. Framework: Vite (detección automática)
3. Env var: `VITE_API_URL = https://[railway-url]`
4. Deploy
5. Settings → Domains → Add `app.syquex.mx`
6. Vercel provee el certificado TLS automáticamente

---

## DNS — configurar app.syquex.mx

En el panel DNS del registrador de `syquex.mx`:

```
Tipo:  CNAME
Host:  app
Valor: cname.vercel-dns.com
TTL:   300
```

**Verificar propagación antes de agregar el dominio en Vercel:**

```bash
dig app.syquex.mx CNAME
# Debe retornar: app.syquex.mx. CNAME cname.vercel-dns.com.
```

Propagación típica: 5–30 minutos con TTL 300.

---

## Criterios de éxito (staging)

- [ ] `GET https://[railway-url]/api/v1/health` → 200
- [ ] `POST /api/v1/auth/register` crea psicólogo + suscripción trial
- [ ] `POST /api/v1/auth/login` retorna JWT válido
- [ ] `GET /api/v1/patients` retorna solo pacientes del psicólogo autenticado
- [ ] `POST /api/v1/billing/create-checkout` retorna `checkout_url` de Stripe
- [ ] Webhook de Stripe recibe `checkout.session.completed` y actualiza `subscriptions`
- [ ] `https://app.syquex.mx` carga el frontend sin errores
- [ ] El frontend se conecta al backend (sin errores CORS en DevTools)
- [ ] RLS: un psicólogo no puede ver pacientes de otro (verificar con dos cuentas de prueba)
