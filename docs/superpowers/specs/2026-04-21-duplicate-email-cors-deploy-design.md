# Spec: Deploy Duplicate Email CORS Fix to Production

**Date:** 2026-04-21
**Branch:** feature/fix-duplicate-email-cors
**Status:** Approved

## Context

The CORS fix for duplicate email registration (`EMAIL_TAKEN`) is implemented on `feature/fix-duplicate-email-cors`. The fix is invisible in local dev (CORS is permissive there) and only takes effect in production (Railway backend + Vercel frontend).

The feature branch has a pending merge from `dev` (conflicts resolved, staged but not committed) and the CORS fix itself is unstaged. Both need to be committed before opening the PR.

## Deployment Flow

Standard Git Flow: `feature → dev → main`

### Phase 1 — Seal local state (3 commits)

1. **Commit the in-progress merge** — staged files (routes.py, exceptions.py, App.jsx, DictationPanel.jsx, etc.) are dev-origin changes already on remote dev; they add noise to the diff but do not change dev when merged back.
2. **Commit the CORS fix** — `backend/main.py`, `frontend/src/components/RegisterScreen.jsx`, `frontend/src/components/RegisterScreen.test.jsx`
3. **Commit the plan doc** — `docs/superpowers/plans/2026-04-21-duplicate-email-cors-fix.md`
4. **Push** feature branch to remote.

### Phase 2 — PR: feature → dev

- Open PR `feature/fix-duplicate-email-cors` → `dev`
- Merge triggers Railway staging + Vercel preview auto-deploy
- Verify on staging: register with existing email → "Este email ya tiene una cuenta. Iniciar sesión" appears

### Phase 3 — PR: dev → main (production)

- Open PR `dev` → `main`
- Merge triggers Railway prod + Vercel prod auto-deploy
- Verify on production: same manual check as staging

## What does NOT change

- No schema changes, no new endpoints
- No env vars needed — the CORS regex is hardcoded in `main.py` matching the existing `allow_origin_regex`
- Both backend and frontend changes deploy together via the same PR merge
