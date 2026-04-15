# Demo Deployment — SyqueX Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy SyqueX staging environment to Vercel + Railway + Supabase so 3 psychologists can demo the app at a shared URL with pre-seeded clinical data.

**Architecture:** React/Vite frontend auto-deploys from `dev` to Vercel; FastAPI backend auto-deploys from `dev` to Railway; PostgreSQL + pgvector lives on Supabase and is seeded once from local machine. No GitHub Actions — platforms handle CD natively.

**Tech Stack:** FastAPI, React 18 + Vite, PostgreSQL 16 + pgvector, Railway, Vercel, Supabase, pytest + httpx (tests), FastEmbed (embeddings, local-only)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/api/routes.py` | Modify | Add `GET /health` endpoint |
| `backend/tests/test_health.py` | Create | Test for the health endpoint |
| `vercel.json` | Create | SPA rewrite rule for React Router |
| `backend/railway.toml` | Create | Railway start command + healthcheck path |
| `backend/main.py` | Already done | Docs disabled in staging ✓ |

---

## Task 1: Health Endpoint

**Files:**
- Modify: `backend/api/routes.py` (add after imports/router definition, before first route)
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

  Create `backend/tests/test_health.py`:

  ```python
  """
  Tests for GET /api/v1/health endpoint.
  Uses a minimal FastAPI app (no DB startup) to test the route in isolation.
  """
  import sys
  import os
  sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

  from starlette.testclient import TestClient
  from fastapi import FastAPI
  from api.routes import router

  # Minimal app — no startup events, no DB connection needed
  _test_app = FastAPI()
  _test_app.include_router(router, prefix="/api/v1")
  client = TestClient(_test_app)


  def test_health_returns_200():
      response = client.get("/api/v1/health")
      assert response.status_code == 200


  def test_health_returns_ok_body():
      response = client.get("/api/v1/health")
      assert response.json() == {"status": "ok"}
  ```

- [ ] **Step 2: Run test to verify it fails**

  From `backend/` with venv activated:
  ```bash
  pytest tests/test_health.py -v
  ```
  Expected: `FAILED` — `404 Not Found` because the endpoint doesn't exist yet.

- [ ] **Step 3: Add the health endpoint to routes.py**

  In `backend/api/routes.py`, add this block immediately after `router = APIRouter(tags=["clinical"])` (line 31):

  ```python
  @router.get("/health", tags=["ops"])
  async def health():
      return {"status": "ok"}
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pytest tests/test_health.py -v
  ```
  Expected:
  ```
  PASSED tests/test_health.py::test_health_returns_200
  PASSED tests/test_health.py::test_health_returns_200
  ```

- [ ] **Step 5: Run full test suite to confirm no regressions**

  ```bash
  pytest --tb=short -q
  ```
  Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/api/routes.py backend/tests/test_health.py backend/main.py
  git commit -m "feat: add /health endpoint and disable docs in staging"
  ```

---

## Task 2: vercel.json

**Files:**
- Create: `vercel.json` (repo root)

- [ ] **Step 1: Create the file**

  Create `vercel.json` at the repo root (same level as `frontend/`, `backend/`):

  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```

  **Why this is needed:** Vercel's CDN serves static files. Any route that isn't a real file (e.g. `/patients/123`) returns 404 without this rewrite. With it, all paths fall back to `index.html` and React Router handles routing client-side.

- [ ] **Step 2: Commit**

  ```bash
  git add vercel.json
  git commit -m "feat: add vercel.json SPA rewrite for React Router"
  ```

---

## Task 3: railway.toml

**Files:**
- Create: `backend/railway.toml`

- [ ] **Step 1: Create the file**

  Create `backend/railway.toml`:

  ```toml
  [deploy]
  startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
  healthcheckPath = "/api/v1/health"
  ```

  **Why `$PORT` matters:** Railway assigns a dynamic port via the `$PORT` env var. Without `--port $PORT`, Uvicorn binds to 8000 on localhost and Railway's health checks hit the wrong port, marking the deploy as failed.

- [ ] **Step 2: Commit**

  ```bash
  git add backend/railway.toml
  git commit -m "feat: add railway.toml with start command and healthcheck"
  ```

---

## Task 4: Push to dev

- [ ] **Step 1: Push the branch**

  ```bash
  git push origin dev
  ```

  This triggers auto-deploy on both Railway and Vercel (once configured in Tasks 5–7 below). You can push now — if platforms aren't connected yet, the push is harmless and they'll pick it up when connected.

---

## Task 5: Supabase Setup (manual, ~10 min)

- [ ] **Step 1: Create project**

  Go to [supabase.com](https://supabase.com) → New project. Choose a region close to your users (e.g. us-east-1 or eu-west-1). Note the **database password** you set. Est1

- [ ] **Step 2: Enable pgvector**

  In the Supabase dashboard → SQL Editor → run:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
  Click **Run**. Expected output: `Success. No rows returned`.

  **Why:** The `init_db()` startup function creates the `vector` column type on first run. If the extension isn't enabled first, Railway startup crashes with `type "vector" does not exist`.

- [ ] **Step 3: Copy DATABASE_URL**

  Project Settings → Database → Connection string → URI tab.
  Copy the URI. It looks like:
  ```
  postgresql://postgres:<password>@db.aowfweaqudncaxtoubsi.supabase.co:5432/postgres
  ```
  Change the scheme to `postgresql+asyncpg://` for use in Railway.

---

## Task 6: Railway Setup (manual, ~15 min)

- [ ] **Step 1: Create project**

  Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → select your SyqueX repo.

- [ ] **Step 2: Set root directory**

  In the service settings → Source → Root Directory = `backend`

- [ ] **Step 3: Set watch branch**

  Settings → Deploy → Branch = `dev`

- [ ] **Step 4: Set environment variables**

  In the service → Variables tab, add all of these:

  | Variable | Value |
  |----------|-------|
  | `ANTHROPIC_API_KEY` | Your key from `backend/.env` |
  | `DATABASE_URL` | `postgresql+asyncpg://postgres:<password>@db.<ref>.supabase.co:5432/postgres` |
  | `ENVIRONMENT` | `staging` |
  | `SECRET_KEY` | Run locally: `python -c "import secrets; print(secrets.token_hex(32))"` and paste result |
  | `ALLOWED_ORIGINS` | Leave blank for now — fill in after Vercel URL is known (Task 7 Step 3) |

- [ ] **Step 5: Note the Railway URL**

  After first deploy, copy the public URL from the Railway dashboard (e.g. `https://syquex-backend-production.up.railway.app`). Needed for Vercel setup.

  https://syquex-production.up.railway.app

---

## Task 7: Vercel Setup (manual, ~10 min)

- [ ] **Step 1: Create project**

  Go to [vercel.com](https://vercel.com) → New Project → Import your SyqueX GitHub repo.

- [ ] **Step 2: Configure root directory and branch**

  - Root Directory: `frontend`
  - Production Branch: `dev` (for this staging setup)

- [ ] **Step 3: Set environment variable**

  In project → Settings → Environment Variables:

  | Variable | Value |
  |----------|-------|
  | `VITE_API_URL` | `https://<your-railway-url>` (from Task 6 Step 5) |

  Set it for **all environments** (Production, Preview, Development).

- [ ] **Step 4: Deploy**

  Vercel will trigger a deploy automatically. Note the URL (e.g. `https://syquex.vercel.app`).

- [ ] **Step 5: Update ALLOWED_ORIGINS in Railway**

  Go back to Railway → Variables → set `ALLOWED_ORIGINS` to the exact Vercel URL:
  ```
  https://syquex.vercel.app
  ```
  Railway redeploys automatically when you save an env var change. Wait for the redeploy to complete before testing CORS — changes only take effect after the new deploy is live.

---

## Task 8: Seed the Database (manual, ~5 min + ~5 min FastEmbed download)

> **Order matters:** Run this AFTER Railway has completed at least one successful deploy. The FastAPI startup event (`init_db()`) creates all database tables on first launch. If you seed before Railway's first deploy, the tables won't exist yet and the seed will fail with a missing table error.

- [ ] **Step 1: Activate venv and install deps**

  From `backend/`:
  ```bash
  .\venv\Scripts\Activate.ps1   # Windows PowerShell
  pip install -r requirements.txt
  ```
  FastEmbed will download `intfloat/multilingual-e5-large` (~570 MB) on first run.

- [ ] **Step 2: Run the seed**

  Replace `<supabase-url>` with your full asyncpg connection string from Task 5 Step 3:
  ```bash
  DATABASE_URL="postgresql+asyncpg://postgres:<password>@db.<ref>.supabase.co:5432/postgres" ENVIRONMENT=local python seed_demo.py
  ```

  Expected output:
  ```
  Cargando modelo FastEmbed intfloat/multilingual-e5-large (primera vez: ~570 MB)...
  Modelo cargado.
  ✓ Seed completo.
  ```

  **Note:** If `ENVIRONMENT=staging` is already exported in your shell, the `ENVIRONMENT=local` prefix overrides it and lets the seed run.

---

## Task 9: Verify Deploy

- [ ] **Step 1: Check backend health**

  ```bash
  curl https://<railway-url>/api/v1/health
  ```
  Expected: `{"status":"ok"}`

- [ ] **Step 2: Check docs are hidden**

  ```bash
  curl -o /dev/null -w "%{http_code}" https://<railway-url>/docs
  ```
  Expected: `404`

- [ ] **Step 3: Load the frontend**

  Open `https://<vercel-url>` in a browser. The app should load without console errors.

- [ ] **Step 4: End-to-end smoke test**

  1. Select a patient from the sidebar — should see their session history
  2. Type a short dictation in the chat input and submit
  3. Confirm the SOAP note is generated
  4. Share the Vercel URL + credentials (`ana@syquex.demo` / `demo1234`) with the 3 psychologists

---

## Post-Demo Task (not blocking)

After the demo, add GitHub Actions CI/CD:
- `pytest` + `vitest` gates on every push to `dev`
- Gate Railway and Vercel deploys on green CI
- Same branching strategy (`dev → main`) — no platform reconfiguration needed
- Create a new spec + plan for this when ready
