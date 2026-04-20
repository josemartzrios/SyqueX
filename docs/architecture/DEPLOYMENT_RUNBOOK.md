# SyqueX — Deployment Runbook

> **Version:** 1.0.0 · **Last Updated:** 2026-04-16  
> **Audience:** DevOps, Engineering Lead

---

## 1. Infrastructure Overview

```mermaid
graph TB
    subgraph "Source Control"
        GH["GitHub<br/>josemartzrios/SyqueX"]
    end

    subgraph "Frontend Hosting"
        V["Vercel"]
        VProd["Production<br/>syquex.vercel.app"]
        VStg["Preview Deployments"]
    end

    subgraph "Backend Hosting"
        R["Railway"]
        RProd["Production Container<br/>Dockerfile"]
        RStg["Staging Container"]
    end

    subgraph "Database"
        S["Supabase"]
        SPG["PostgreSQL 16<br/>+ pgvector"]
    end

    subgraph "External APIs"
        Ant["Anthropic"]
        Str["Stripe"]
        Res["Resend"]
    end

    GH -->|"main branch"| VProd
    GH -->|"dev / feature/*"| VStg
    GH -->|"main branch"| RProd
    GH -->|"dev branch"| RStg
    V --> VProd & VStg
    R --> RProd & RStg
    S --> SPG
    RProd & RStg --> SPG
    RProd & RStg --> Ant & Str & Res

    style GH fill:#24292E,stroke:#fff,color:#fff
    style VProd fill:#000,stroke:#fff,color:#fff
    style RProd fill:#0B0D0E,stroke:#C049DB,color:#fff
    style SPG fill:#3ECF8E,stroke:#1F6F4A,color:#fff
```

---

## 2. Pre-Deploy Checklist

### 2.1 Environment Variables

> [!CAUTION]
> **NEVER commit secrets to git.** All values below must be set in the hosting platform's environment configuration.

#### Railway (Backend)

| Variable | Example | Critical |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` | Yes |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Yes |
| `SECRET_KEY` | 64+ random chars (`python -c "import secrets; print(secrets.token_hex(64))"`) | Yes |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Yes |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Yes |
| `STRIPE_PRICE_ID` | `price_...` | Yes |
| `RESEND_API_KEY` | `re_...` | Yes |
| `RESEND_FROM_EMAIL` | `SyqueX <hola@syquex.mx>` | Yes |
| `ENVIRONMENT` | `production` | Yes |
| `ALLOWED_ORIGINS` | `https://syquex.vercel.app` | Recommended |
| `CRON_SECRET` | Random bearer token | Yes |
| `FRONTEND_URL` | `https://syquex.vercel.app` | Yes |

#### Vercel (Frontend)

| Variable | Example |
|---|---|
| `VITE_API_URL` | `https://your-backend.up.railway.app` |

### 2.2 Database Setup

```bash
# 1. Enable pgvector extension on Supabase
#    Dashboard → Database → Extensions → Enable "vector"

# 2. The app auto-creates tables on first startup via init_db()
#    No manual SQL needed — just deploy the backend.

# 3. (Optional) Seed demo data for testing
python seed_demo.py
# Login: ana@syquex.demo / demo1234
```

### 2.3 Stripe Configuration

1. Create a Product + Price in Stripe Dashboard (MXN, recurring monthly)
2. Copy the `price_...` ID to `STRIPE_PRICE_ID`
3. Create a webhook endpoint pointing to `https://your-backend/api/v1/billing/webhook`
4. Subscribe to events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 2.4 DNS and Email

1. Configure custom domain `syquex.mx` on Vercel
2. Add Resend DNS records (SPF, DKIM, DMARC) for `syquex.mx`
3. Verify domain in Resend dashboard

---

## 3. Deployment Steps

### 3.1 Backend (Railway)

```mermaid
graph LR
    Push["git push to main"] --> Detect["Railway detects Dockerfile"]
    Detect --> Build["Docker build<br/>(requirements.txt install)"]
    Build --> Deploy["Deploy container<br/>uvicorn main:app"]
    Deploy --> Health["Health check<br/>GET /api/v1/health"]
    Health --> Live["Production live"]

    style Push fill:#24292E,stroke:#fff,color:#fff
    style Deploy fill:#0B0D0E,stroke:#C049DB,color:#fff
    style Live fill:#5a9e8a,stroke:#18181b,color:#fff
```

**Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Startup Sequence:**
1. Container starts, Uvicorn binds port 8000
2. `startup_event()` fires: prints CORS debug, calls `init_db()`
3. `init_db()` creates pgvector extension, tables, runs idempotent migrations
4. FastEmbed model downloads on first embedding request (~570 MB, cached after)

### 3.2 Frontend (Vercel)

```mermaid
graph LR
    Push["git push to main"] --> Detect["Vercel detects Vite"]
    Detect --> Build["npm run build<br/>(vite build)"]
    Build --> Deploy["Deploy to CDN<br/>Global edge network"]
    Deploy --> Live["syquex.vercel.app live"]

    style Push fill:#24292E,stroke:#fff,color:#fff
    style Deploy fill:#000,stroke:#fff,color:#fff
    style Live fill:#5a9e8a,stroke:#18181b,color:#fff
```

**Vercel Configuration:**
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js Version: 18.x

---

## 4. Post-Deploy Verification

### 4.1 Smoke Tests

```bash
# 1. Health check
curl https://your-backend.up.railway.app/api/v1/health
# Expected: {"status":"ok"}

# 2. CORS check
curl -I -X OPTIONS https://your-backend.up.railway.app/api/v1/health \
  -H "Origin: https://syquex.vercel.app" \
  -H "Access-Control-Request-Method: GET"
# Expected: Access-Control-Allow-Origin header present

# 3. Registration test
curl -X POST https://your-backend.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"Test1234","accepted_privacy":true,"accepted_terms":true}'
# Expected: {"access_token":"...","token_type":"bearer","expires_in":1800}

# 4. Frontend loads
curl -s https://syquex.vercel.app | head -20
# Expected: HTML with React app
```

### 4.2 Monitoring Checklist

- [ ] Railway logs: check for `[CORS_DEBUG]` output on startup
- [ ] Railway logs: no unhandled exceptions in first 5 minutes
- [ ] Vercel Analytics: verify page loads
- [ ] Stripe Dashboard: webhook endpoint shows "Active" status
- [ ] Resend Dashboard: domain verified, no sending errors

---

## 5. Rollback Procedures

### 5.1 Backend Rollback

```bash
# Railway — redeploy previous commit
# In Railway dashboard: Deployments → select previous → Redeploy

# Or via git:
git revert HEAD
git push origin main
```

### 5.2 Frontend Rollback

```bash
# Vercel — instant rollback via dashboard
# Vercel → Deployments → select previous → Promote to Production

# Or via git:
git revert HEAD
git push origin main
```

### 5.3 Database Rollback

> [!WARNING]
> The current migration strategy is **additive only** (ADD COLUMN IF NOT EXISTS). There are no down-migrations. For destructive schema changes, write explicit rollback SQL and test in staging first.

---

## 6. Cron Jobs

### Daily Trial Expiration Check

**Trigger:** External cron service (e.g., Railway Cron, Vercel Cron, or UptimeRobot) hits:

```
GET https://your-backend.up.railway.app/api/v1/cron/daily
Authorization: Bearer {CRON_SECRET}
```

**Schedule:** Daily at 09:00 UTC  
**Purpose:** Sends trial-ending emails for trials expiring within 48 hours

---

## 7. Scaling Considerations

### Current Architecture (Single-Server)

| Component | Current | Bottleneck | Scale Path |
|---|---|---|---|
| Backend | 1 Railway container | FastEmbed model loading (~2GB RAM) | Horizontal scaling + shared model cache |
| Database | 1 Supabase instance | Connection pooling (NullPool currently) | PgBouncer or Supabase connection pooler |
| Embeddings | In-process (FastEmbed) | CPU-bound, blocks thread pool | Dedicated embedding microservice |
| LLM | Anthropic API | Rate limits (external) | Request queuing, retry with backoff |

### Recommended Scale-Up Order

1. **Enable Supabase connection pooler** — replace NullPool with bounded pool
2. **Move FastEmbed to dedicated service** — reduces backend memory footprint
3. **Add Redis** — replace in-memory brute-force tracking, add session caching
4. **Horizontal backend scaling** — Railway supports multiple replicas
5. **CDN caching for static assets** — already handled by Vercel

---

## 8. Incident Response

### Common Issues

| Symptom | Likely Cause | Resolution |
|---|---|---|
| 502 on `/process` | Anthropic API down or rate limited | Check Anthropic status page. App returns graceful fallback. |
| 401 on all requests | SECRET_KEY changed | All existing JWTs are invalidated. Users must re-login. |
| CORS errors in browser | `ALLOWED_ORIGINS` not set | Workaround regex is active; check Railway env vars |
| Slow first embedding | FastEmbed downloading model (~570MB) | Wait for download; subsequent requests are fast |
| Stripe webhooks failing | Webhook secret mismatch | Re-copy `whsec_...` from Stripe Dashboard |
| Trial emails not sending | `RESEND_API_KEY` empty | Set key in Railway env; restart service |
