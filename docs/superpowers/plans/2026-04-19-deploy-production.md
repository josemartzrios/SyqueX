# Deploy SyqueX — Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deployar SyqueX en Railway + Supabase + Vercel con dominio `app.syquex.mx`, con RLS multi-tenant y Stripe en modo test.

**Architecture:** Backend FastAPI en Railway (Dockerfile + $PORT dinámico), PostgreSQL en Supabase (pgvector 1024d, RLS via session variables), frontend React/Vite en Vercel con CNAME a `app.syquex.mx`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, NullPool, pgvector, Railway, Supabase, Vercel, Stripe (test mode)

---

## Mapa de archivos

| Archivo | Cambio |
|---------|--------|
| `backend/Dockerfile` | CMD → shell form con `${PORT:-8000}` |
| `backend/api/billing.py` | Ruta `/checkout` → `/create-checkout` + handler `invoice.payment_failed` |
| `backend/main.py` | CORS regex agrega `app.syquex.mx` |
| `backend/database.py` | RLS policies en `init_db()` |
| `backend/api/routes.py` | Agrega `get_db_with_user` (aquí, no en database.py — evita import circular) + reemplaza 13x `Depends(get_db)` |

---

## Task 1: Crear rama feature

- [ ] **Crear y cambiar a la rama feature**

```bash
git checkout dev
git pull origin dev
git checkout -b feature/deploy-production
```

- [ ] **Verificar rama activa**

```bash
git branch --show-current
# Debe mostrar: feature/deploy-production
```

---

## Task 2: Fix Dockerfile — puerto dinámico

**Archivos:** `backend/Dockerfile`

Railway inyecta `$PORT` dinámicamente. El exec-form actual no expande variables de shell.

- [ ] **Editar `backend/Dockerfile` línea 18**

```dockerfile
# Antes:
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Después (shell form — expande $PORT en runtime):
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

- [ ] **Verificar que el archivo quedó correcto**

```bash
tail -3 backend/Dockerfile
# Debe mostrar la línea CMD sin corchetes
```

- [ ] **Commit**

```bash
git add backend/Dockerfile
git commit -m "fix: use dynamic \$PORT in Dockerfile for Railway"
```

---

## Task 3: Fix billing — ruta y webhook

**Archivos:** `backend/api/billing.py`

El frontend llama `POST /api/v1/billing/create-checkout` pero el backend expone `/checkout` (línea 43). Además falta el handler de `invoice.payment_failed`.

- [ ] **Renombrar la ruta en línea 43**

```python
# Antes:
@router.post("/checkout")

# Después:
@router.post("/create-checkout")
```

- [ ] **Agregar handler `invoice.payment_failed` en el bloque de eventos del webhook**

Buscar el bloque `elif event.type in ['customer.subscription.deleted'...` (aprox. línea 127) y agregar **antes** de él:

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
```

- [ ] **Verificar que el `await db.commit()` final cubre todos los branches** (ya existe en la línea final del handler, no duplicar)

- [ ] **Commit**

```bash
git add backend/api/billing.py
git commit -m "fix: rename billing route to /create-checkout and handle invoice.payment_failed"
```

---

## Task 4: Fix CORS regex — agregar app.syquex.mx

**Archivos:** `backend/main.py` línea 65

El env var `ALLOWED_ORIGINS` no carga en Railway en runtime (bug conocido). La regex es el fix definitivo.

- [ ] **Editar línea 65 en `backend/main.py`**

```python
# Antes:
allow_origin_regex=r"^https://syquex(-[a-z0-9]+)*\.vercel\.app$",

# Después:
allow_origin_regex=r"^https://(syquex(-[a-z0-9]+)*\.vercel\.app|app\.syquex\.mx)$",
```

- [ ] **Commit**

```bash
git add backend/main.py
git commit -m "fix: add app.syquex.mx to CORS allow_origin_regex"
```

---

## Task 5: RLS middleware — dependency get_db_with_user

**Archivos:** `backend/api/routes.py`

`get_db_with_user` vive en `routes.py`, NO en `database.py`. Razón: necesita importar `get_current_psychologist` de `api/auth.py`, y `database.py` ya es importado por `api/auth.py` — poner la función en `database.py` crearía un import circular que crashea el startup.

**FastAPI dependency caching:** `get_db_with_user` depende de `get_current_psychologist`. FastAPI cachea sub-dependencies por request — si una ruta ya tiene `Depends(get_current_psychologist)` explícito, FastAPI reutiliza el mismo objeto sin hacer doble query a la BD. Al reemplazar `Depends(get_db)` por `Depends(get_db_with_user)`, el parámetro explícito `psychologist: Psychologist = Depends(get_current_psychologist)` en la firma de la ruta puede eliminarse (ya viene del sub-dependency) — pero también puede dejarse; FastAPI deduplica automáticamente.

- [ ] **Agregar import de `AsyncSessionLocal` y `text` ya están presentes en `routes.py` (verificar línea 10)**

```python
from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist, AsyncSessionLocal
from sqlalchemy import select, func, text
```

Ambos ya están importados. No hay que cambiar imports.

- [ ] **Agregar `get_db_with_user` en `backend/api/routes.py` después de los imports y antes del primer router (aprox. línea 35)**

```python
async def get_db_with_user(
    psychologist: Psychologist = Depends(get_current_psychologist),
):
    """DB session con RLS: inyecta psychologist_id como session variable de PostgreSQL."""
    from sqlalchemy import text as _text
    async with AsyncSessionLocal() as session:
        await session.execute(
            _text("SELECT set_config('app.psychologist_id', :pid, true)"),
            {"pid": str(psychologist.id)},
        )
        yield session
```

- [ ] **Commit (parcial — el siguiente task actualiza los usos)**

```bash
git add backend/api/routes.py
git commit -m "feat: add get_db_with_user dependency for RLS session variable injection"
```

---

## Task 6: Actualizar rutas autenticadas a get_db_with_user

**Archivos:** `backend/api/routes.py`

Hay 13 ocurrencias de `Depends(get_db)` en routes.py. Solo las rutas que tienen `Depends(get_current_psychologist)` deben cambiarse. Las que no tienen auth (si las hay) mantienen `get_db`.

- [ ] **Identificar qué líneas cambiar**

```bash
grep -n "Depends(get_db)" backend/api/routes.py
```

Todas las líneas listadas en routes.py tienen `get_current_psychologist` también — todas cambian.

- [ ] **Reemplazar todas las ocurrencias en routes.py**

```bash
# Verificar primero cuántas hay (deben ser 13):
grep -c "Depends(get_db)" backend/api/routes.py
```

```python
# Usar Python para el reemplazo (sed -i en Windows/Git Bash puede comportarse diferente):
python -c "
import pathlib
p = pathlib.Path('backend/api/routes.py')
p.write_text(p.read_text().replace('Depends(get_db)', 'Depends(get_db_with_user)'))
print('Done')
"
```

**Importante:** El `get_db` importado de `database` sigue siendo necesario para `get_db_with_user` internamente (a través de `AsyncSessionLocal`). No eliminar el import de `get_db`.

- [ ] **Verificar que no quedaron usos de `Depends(get_db)` en routes.py**

```bash
grep "Depends(get_db)" backend/api/routes.py
# No debe mostrar resultados
```

- [ ] **Verificar que `get_db_with_user` tiene el número correcto de usos**

```bash
grep -c "Depends(get_db_with_user)" backend/api/routes.py
# Debe coincidir con el conteo anterior (13)
```

- [ ] **Commit**

```bash
git add backend/api/routes.py
git commit -m "feat: switch all authenticated routes to get_db_with_user for RLS enforcement"
```

---

## Task 7: RLS policies en init_db()

**Archivos:** `backend/database.py`

Agregar al final de `init_db()`, después del bloque de HNSW index (aprox. línea 496). `CREATE POLICY` en PostgreSQL no soporta `IF NOT EXISTS` — usar bloques `DO` idempotentes igual que las constraints existentes.

- [ ] **Agregar este bloque al final de la función `init_db()`, antes del cierre del `async with`**

```python
        # ── RLS — Row Level Security ─────────────────────────────────────────
        # NOTA: La tabla `psychologists` NO recibe RLS. Las rutas de auth
        # (/login, /register) la consultan sin app.psychologist_id seteado;
        # habilitarla bloquearía el acceso. La seguridad de esa tabla está
        # garantizada por la lógica de auth (JWT + bcrypt).
        # NOTA 2: Si DATABASE_URL usa el usuario `postgres` (superuser de
        # Supabase), ese rol tiene BYPASSRLS implícito. Para enforcement real
        # crear un rol no-superuser es un paso post-MVP.
        for _tbl in [
            "patients", "sessions", "clinical_notes", "patient_profiles",
            "subscriptions", "refresh_tokens", "audit_logs",
        ]:
            await conn.execute(text(f"ALTER TABLE {_tbl} ENABLE ROW LEVEL SECURITY;"))

        # Políticas de aislamiento por psicólogo — idempotentes via DO blocks
        _rls_policies = [
            ("patients_isolation", "patients",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("sessions_isolation", "sessions",
             "patient_id IN (SELECT id FROM patients WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("clinical_notes_isolation", "clinical_notes",
             "session_id IN (SELECT s.id FROM sessions s JOIN patients p ON s.patient_id = p.id WHERE p.psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("patient_profiles_isolation", "patient_profiles",
             "patient_id IN (SELECT id FROM patients WHERE psychologist_id = current_setting('app.psychologist_id', true)::uuid)"),
            ("subscriptions_isolation", "subscriptions",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("refresh_tokens_isolation", "refresh_tokens",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid"),
            ("audit_logs_isolation", "audit_logs",
             "psychologist_id = current_setting('app.psychologist_id', true)::uuid OR psychologist_id IS NULL"),
        ]
        for _name, _table, _using in _rls_policies:
            await conn.execute(text(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_policies
                        WHERE tablename = '{_table}' AND policyname = '{_name}'
                    ) THEN
                        CREATE POLICY {_name} ON {_table} USING ({_using});
                    END IF;
                END$$;
            """))
```

- [ ] **Verificar indentación correcta** — el bloque debe estar dentro del `async with engine.begin() as conn:` de `init_db()`

- [ ] **Commit**

```bash
git add backend/database.py
git commit -m "feat: add RLS policies and ENABLE ROW LEVEL SECURITY in init_db()"
```

---

## Task 8: Push feature branch

- [ ] **Push a GitHub**

```bash
git push -u origin feature/deploy-production
```

- [ ] **Verificar en GitHub que la rama aparece con los commits correctos**

---

## Task 9: Configurar Supabase (manual — plataforma externa)

- [ ] **Crear proyecto en Supabase**
  - Región: `us-east-1` (para menor latencia con Railway US)
  - Anotar: Project URL, anon key (para referencia), contraseña de BD

- [ ] **NO habilitar pgvector desde el dashboard** — `init_db()` lo crea en `public` schema automáticamente al primer deploy

- [ ] **Obtener connection string para Transaction mode (requerido para NullPool)**
  - Settings → Database → Connection string → URI → **Transaction** tab
  - Copiar URI

- [ ] **Adaptar el prefijo del URI**
  ```
  # Cambiar:
  postgresql://postgres:[password]@...
  # Por:
  postgresql+asyncpg://postgres:[password]@...
  ```

- [ ] **Opcional: deshabilitar PostgREST**
  - Settings → API → desactivar "Enable Data API"
  - Elimina superficie de ataque directa a la BD

- [ ] **Guardar el `DATABASE_URL` adaptado** para usarlo en Railway

---

## Task 10: Configurar Stripe (manual — plataforma externa)

- [ ] **Obtener API keys de test**
  - Dashboard → Developers → API keys
  - Copiar `sk_test_...` (Secret key)

- [ ] **Crear producto y precio**
  - Products → Add product
  - Nombre: "SyqueX Pro"
  - Precio: recurrente, mensual, en MXN (definir el monto)
  - Copiar `price_...` del precio creado

- [ ] **Registrar webhook** (hacerlo DESPUÉS de tener la Railway URL del Task 11)
  - Webhooks → Add endpoint
  - URL: `https://[railway-url]/api/v1/billing/webhook`
  - Eventos a seleccionar (5):
    - `checkout.session.completed`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`
    - `customer.subscription.deleted`
    - `customer.subscription.updated`
  - Copiar `whsec_...` del webhook creado

---

## Task 11: Configurar Railway (manual — plataforma externa)

- [ ] **Crear nuevo proyecto**
  - New Project → Deploy from GitHub repo
  - Seleccionar este repositorio
  - Root directory: `backend`
  - Railway detecta el Dockerfile automáticamente

- [ ] **Configurar env vars** (Settings → Variables):

```
ENVIRONMENT=staging
DATABASE_URL=postgresql+asyncpg://postgres:[pass]@[host]:5432/postgres
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=[output de: openssl rand -hex 32]
ENCRYPTION_KEY=[Fernet key existente del .env local]
INTERNAL_API_KEY=[output de: openssl rand -hex 16]
ALLOWED_ORIGINS=https://app.syquex.mx
FRONTEND_URL=https://app.syquex.mx
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

- [ ] **Generar SECRET_KEY e INTERNAL_API_KEY** (ejecutar localmente):

```bash
openssl rand -hex 32   # para SECRET_KEY (64 chars hex)
openssl rand -hex 16   # para INTERNAL_API_KEY (32 chars hex)
```

- [ ] **Trigger primer deploy** y esperar que el healthcheck pase

- [ ] **Verificar que el backend arrancó**

```bash
curl https://[railway-url]/api/v1/health
# Debe retornar: {"status": "ok"} o similar con HTTP 200
```

- [ ] **Copiar la Railway URL pública** para los siguientes tasks

- [ ] **Registrar el webhook en Stripe** ahora que tienes la Railway URL (ver Task 10, último paso)

---

## Task 12: Configurar Vercel (manual — plataforma externa)

- [ ] **Crear nuevo proyecto**
  - New Project → Import Git Repository → seleccionar este repo
  - **Root Directory: `frontend`** (crítico — no dejar en raíz)
  - Framework Preset: Vite (detección automática)

- [ ] **Configurar env var antes del primer deploy**
  - `VITE_API_URL` = `https://[railway-url]` (sin slash al final)

- [ ] **Deploy**

- [ ] **Verificar que el frontend carga en la URL de Vercel**

---

## Task 13: Configurar DNS y dominio custom (manual)

- [ ] **Agregar CNAME en el registrador de syquex.mx**

```
Tipo:  CNAME
Host:  app
Valor: cname.vercel-dns.com
TTL:   300
```

- [ ] **Verificar propagación DNS** (esperar 5–30 minutos con TTL 300)

```bash
dig app.syquex.mx CNAME
# Debe retornar: app.syquex.mx. CNAME cname.vercel-dns.com.
```

- [ ] **Agregar custom domain en Vercel**
  - Project → Settings → Domains → Add domain: `app.syquex.mx`
  - Vercel emite el certificado TLS automáticamente

- [ ] **Verificar HTTPS**

```bash
curl -I https://app.syquex.mx
# Debe retornar HTTP 200 con cert válido de Vercel
```

---

## Task 14: Smoke tests (staging)

Ejecutar en orden para verificar el deploy completo.

- [ ] **Health check backend**

```bash
curl https://[railway-url]/api/v1/health
# Esperado: 200 OK
```

- [ ] **Registro de usuario**

```bash
curl -X POST https://[railway-url]/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Psico","email":"test@syquex.test","password":"Test1234!","accepted_privacy":true,"accepted_terms":true,"privacy_version":"1.0","terms_version":"1.0"}'
# Esperado: 201 con access_token
```

- [ ] **Login**

```bash
curl -X POST https://[railway-url]/api/v1/auth/login \
  -F "username=test@syquex.test" \
  -F "password=Test1234!"
# Esperado: 200 con access_token
```

- [ ] **Guardar el token para requests siguientes**

```bash
TOKEN="[access_token del login]"
```

- [ ] **Listar pacientes (verifica auth + RLS activo)**

```bash
curl https://[railway-url]/api/v1/patients \
  -H "Authorization: Bearer $TOKEN"
# Esperado: 200 con array vacío []
```

- [ ] **Checkout Stripe**

```bash
curl -X POST https://[railway-url]/api/v1/billing/create-checkout \
  -H "Authorization: Bearer $TOKEN"
# Esperado: 200 con {"checkout_url": "https://checkout.stripe.com/..."}
```

- [ ] **Verificar frontend en app.syquex.mx**
  - Abrir https://app.syquex.mx en el browser
  - Abrir DevTools → Network → verificar que las llamadas a la API van a Railway sin errores CORS

- [ ] **Test de aislamiento RLS** (crear segundo usuario y verificar que no ve datos del primero)

```bash
# Registrar segundo usuario
curl -X POST https://[railway-url]/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Otro Psico","email":"otro@syquex.test","password":"Test1234!","accepted_privacy":true,"accepted_terms":true,"privacy_version":"1.0","terms_version":"1.0"}'

# Crear paciente con el primer usuario
curl -X POST https://[railway-url]/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Paciente Test","risk_level":"low","date_of_birth":"1990-01-01"}'

# Login con segundo usuario y listar pacientes — debe retornar []
TOKEN2="[token del segundo usuario]"
curl https://[railway-url]/api/v1/patients \
  -H "Authorization: Bearer $TOKEN2"
# Esperado: [] — el segundo psicólogo no ve pacientes del primero
```

---

## Task 15: PR a dev

- [ ] **Abrir PR de `feature/deploy-production` → `dev`**

```bash
gh pr create \
  --title "feat: deploy production — Railway + Supabase + Vercel + app.syquex.mx" \
  --body "## Cambios
- Fix Dockerfile para usar \$PORT dinámico de Railway
- Fix ruta billing /checkout → /create-checkout
- Agrega handler invoice.payment_failed en webhook Stripe
- Fix CORS regex para incluir app.syquex.mx
- Agrega get_db_with_user dependency con RLS via set_config
- Agrega ENABLE ROW LEVEL SECURITY + políticas en init_db()

## Test
Smoke tests ejecutados contra staging en Railway. RLS verificado con dos cuentas." \
  --base dev
```
