# Demo Deployment Design — SyqueX Staging

**Date:** 2026-03-24
**Scope:** Deploy staging environment for demo with 3 psychologists. Demo users share a single pre-seeded account (`ana@syquex.demo / demo1234`) — no independent login flow is built. Platform-native CD (Railway + Vercel GitHub integration), no GitHub Actions yet.

---

## 1. Architecture

```
GitHub repo (dev branch)
    │
    ├─→ Vercel (auto-deploy from dev)
    │      React 18 + Vite frontend
    │      URL: <project>.vercel.app
    │
    └─→ Railway (auto-deploy from dev)
           FastAPI backend (Python 3.11)
           URL: <project>.railway.app
                │
                └─→ Supabase (staging DB)
                       PostgreSQL 16 + pgvector extension
                       Seeded once from local machine
```

---

## 2. Files to Create / Modify

### `vercel.json` (root) — NEW
Required for React SPA: without this, direct URL loads return 404 from Vercel's CDN.
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### `backend/railway.toml` — NEW
Railway requires `--host 0.0.0.0 --port $PORT`; without `$PORT` binding the service binds to 127.0.0.1 and Railway's health checks fail silently.
```toml
[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/api/v1/health"
```

### Health endpoint — `GET /api/v1/health` in `backend/api/routes.py` — NEW
Add a simple public endpoint. Railway polls this to confirm the service started. No auth required, no DB query.
```python
@router.get("/health")
async def health():
    return {"status": "ok"}
```

### `backend/main.py` — ALREADY APPLIED
The `is_production()` check only disables docs when `ENVIRONMENT=production`. With `ENVIRONMENT=staging`, `/docs` and `/openapi.json` would be publicly accessible. Fixed: condition changed to `ENVIRONMENT in ("production", "staging")` so docs are hidden in staging too. Change is committed.

---

## 3. Environment Variables

### Railway (staging backend)
| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Same key as local dev. Set a $10–20 spending cap in Anthropic console. |
| `DATABASE_URL` | `postgresql+asyncpg://<supabase-staging-connection-string>` |
| `ENVIRONMENT` | `staging` |
| `SECRET_KEY` | 64 random characters — generate with `python -c "import secrets; print(secrets.token_hex(32))"`. Used internally by JWT config; not active in this demo since no login routes are called, but must not be the dev placeholder. |
| `ALLOWED_ORIGINS` | `https://<project>.vercel.app` |

**Note on embeddings:** The codebase uses FastEmbed (`intfloat/multilingual-e5-large`, 1024 dims) — no OpenAI API calls. `OPENAI_API_KEY` is not needed. CLAUDE.md and `architecture.txt` reference OpenAI embeddings; those documents are outdated. The ground truth is `backend/seed_demo.py` and `config.py` (`EMBEDDING_DIMENSIONS: int = 1024`).

### Vercel (staging frontend)
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<project>.railway.app` |

---

## 4. Seed Data Strategy

Run once from local machine. The seed file has a guard (`ENVIRONMENT in ("production", "staging") → sys.exit(1)`); the default is already `"local"`, so no flag is needed unless `ENVIRONMENT` is set in your shell.

Exact command from `/backend` with venv activated (always use this form — it overrides any `ENVIRONMENT` already exported in your shell):
```bash
DATABASE_URL="postgresql+asyncpg://<supabase-url>" ENVIRONMENT=local python seed_demo.py
```

The seed truncates all tables and reloads from scratch — safe to re-run if data needs resetting.

**Demo account (seeded):**
- Email: `ana@syquex.demo`
- Password: `demo1234`
- Data: 3 patients × 6 sessions with SOAP notes + FastEmbed 1024-dim embeddings

**"No login required" clarification:** The demo does not build a public-access bypass. All 3 psychologists share the single `ana@syquex.demo` account. The frontend currently has no auth flow (api.js sends no Authorization header), which means the backend routes must not enforce JWT for this demo — verify that clinical routes (`/patients`, `/sessions`) do not require auth middleware before deploying.

---

## 5. Deployment Checklist (one-time setup, in order)

1. **Supabase** — Create new project. In the SQL editor run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   Then copy the connection string for `DATABASE_URL` (use the async `postgresql+asyncpg://` format from Project Settings → Database → Connection string → URI).

2. **Railway** — Create project → New Service → GitHub repo. Set branch = `dev`. Add all env vars from Section 3.

3. **Vercel** — Create project → Import GitHub repo. Set root directory = `frontend`. Set branch = `dev`. Add `VITE_API_URL` env var.

4. **Seed** — Run the seed command from Section 4 from your local machine.

5. **Deploy trigger** — Push any commit to `dev`. Railway and Vercel auto-deploy.

6. **Verify** — `curl https://<project>.railway.app/api/v1/health` → `{"status":"ok"}`. Load the Vercel URL in browser and confirm the app loads and connects to the backend.

---

## 6. Security Notes

- **Anthropic key:** Same key as dev is acceptable for a short demo with 3 users. **Set a spending cap ($10–20) in the Anthropic console** as a safeguard.
- **SECRET_KEY:** Set a fresh 64-char random string in Railway. The dev placeholder (`dev_only_key_MUST_change...`) must never reach staging.
- **Docs/API schema:** Disabled in staging via the `main.py` change in Section 2.
- **`.env` in `.gitignore`:** API keys will never be committed ✓.
- **CORS:** `ALLOWED_ORIGINS` set to the exact Vercel URL — no wildcard.

---

## 7. Post-Demo: CI/CD Upgrade (pending task)

After the demo, add GitHub Actions to enforce quality gates before deploy:
- Run `pytest` (backend) and `vitest` (frontend) on every push to `dev`
- Gate Railway and Vercel deploys on green tests
- Same branching strategy (`dev → main`) already in place — no platform reconfiguration needed
