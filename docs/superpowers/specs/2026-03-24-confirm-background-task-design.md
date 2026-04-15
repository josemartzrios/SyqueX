# Design: Confirm SOAP Note — Background Profile Update

**Date:** 2026-03-24
**Status:** Approved
**Scope:** `backend/api/routes.py`

---

## Problem

The `POST /sessions/{session_id}/confirm` endpoint blocks until three sequential operations complete:

1. Generate embedding (FastEmbed `intfloat/multilingual-e5-large`, **1024-dim**, thread pool via `run_in_executor` — ~200–800 ms)
2. Save `ClinicalNote` to DB
3. Call Claude (`update_patient_profile_summary`, ~3–8 s) to regenerate the patient summary
4. Save updated `PatientProfile` to DB

Step 3 dominates latency. The psychologist waits 4–10 s to see confirmation of a save that is clinically complete after step 2.

> **Embedding note:** The active embedding service is FastEmbed 1024-dim (see `agent/embeddings.py` and `database.py` `Vector(1024)`). The 1536-dim OpenAI reference in `CLAUDE.md` is outdated documentation.

---

## Goal

Return the confirm response to the frontend immediately after the `ClinicalNote` is persisted. The patient profile summary update runs in the background and completes seconds later without the user noticing.

---

## Approach: FastAPI `BackgroundTasks`

FastAPI's built-in `BackgroundTasks` executes registered callables after the HTTP response body is sent. No additional infrastructure (Redis, Celery, workers) is required.

### Trade-offs

| Aspect | Detail |
|--------|--------|
| Dependencies | None — FastAPI native |
| Data safety | SOAP note saved before response; only `patient_summary` may lag |
| Failure risk | Process restart during ~5 s background window skips summary update. Regenerated on next confirm. No clinical data lost. |
| Worker blocking | BackgroundTasks run in same ASGI worker. Under single-worker Uvicorn (default dev), the ~5 s Claude call blocks that worker. Acceptable for MVP with low concurrent usage. |
| Complexity | ~5 line change in `routes.py` |

---

## Architecture

### `_background_update_profile` helper (routes.py)

Define this **before** the `confirm_session` endpoint in `routes.py` to avoid `NameError` at module load time.

```python
async def _background_update_profile(patient_id: uuid.UUID, session_note: dict) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await update_patient_profile_summary(db, patient_id, session_note)
        except Exception as e:
            logger.error(f"Background profile update failed: {e}")
```

**Key implementation notes:**

- **`patient_id` type:** Pass `sess.patient_id` directly as `uuid.UUID`. `PatientProfile.patient_id` is `Mapped[uuid.UUID]` with `UUID(as_uuid=True)` — SQLAlchemy correctly handles `uuid.UUID` in the WHERE clause. The `str` annotation in `update_patient_profile_summary(db, patient_id: str, ...)` is an inaccurate type hint but causes no runtime issue.
- **`session_note`** matches the actual parameter name in `update_patient_profile_summary`.
- **`async with AsyncSessionLocal() as db:`** ensures the session is closed cleanly even if `update_patient_profile_summary` raises (including a failed internal `db.commit()`).
- FastAPI `BackgroundTasks` awaits async callables — the asyncio event loop is still running.

### `confirm_session` endpoint (routes.py)

Add `background_tasks: BackgroundTasks` as a FastAPI-injected parameter.

**Before:**
```python
await update_patient_profile_summary(db, sess.patient_id, summary_data)
return ConfirmNoteOut(id=cn.id)
```

**After:**
```python
background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)
return ConfirmNoteOut(id=cn.id)
```

`cn.id` is available without `db.refresh(cn)` because `ClinicalNote.id` uses `default=uuid.uuid4` (Python-side UUID generation) and `AsyncSessionLocal` is configured with `expire_on_commit=False`.

### Required additions to `routes.py`

**Imports** (append to existing lines):
```python
import logging                                               # new top-level import
from fastapi import APIRouter, Depends, Query, Request, status, BackgroundTasks  # add BackgroundTasks
from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist, AsyncSessionLocal  # add AsyncSessionLocal
```

**Logger** (add after imports, before `router = APIRouter(...)`):
```python
logger = logging.getLogger(__name__)
```

### DB session isolation

The request-scoped `AsyncSession` (from `get_db`) closes when the response is sent — before background tasks execute. The helper opens its own independent session via `AsyncSessionLocal` (the `async_sessionmaker` factory in `database.py`).

---

## Data Flow

```
POST /sessions/{id}/confirm
  ├─ get_embedding()           ← thread pool ~200–800 ms (FastEmbed 1024-dim)
  ├─ db.add(ClinicalNote)
  ├─ db.commit()               ← note persisted; cn.id available
  ├─ background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)
  └─ return ConfirmNoteOut(id=cn.id)   ← response sent here

         [background — after HTTP response, same ASGI worker]
         async with AsyncSessionLocal() as db:
           await update_patient_profile_summary(db, patient_id, session_note)
             → Claude API (~3–8 s)
           ← session auto-closed
```

---

## Known Limitations

### Double-confirm
`clinical_notes.session_id` has a `UNIQUE` constraint. Rapid double-confirm: the second request returns an unhandled 500 (DB unique-constraint violation); the first confirm's background task completes normally and is unaffected. Pre-existing gap, out of scope.

### Background task loss on process restart
`patient_summary` won't reflect the last confirmed session until the next confirm. No clinical note data is lost.

### Single-worker blocking
Under a single Uvicorn worker, the ~5 s background Claude call blocks that worker from handling other requests during that window. Acceptable for MVP.

---

## What Does Not Change

- `agent/agent.py` — no changes
- `agent/__init__.py` — no changes
- `ConfirmNoteOut` response schema — no changes
- Frontend — no changes
- Embedding generation — unchanged (thread pool via `run_in_executor`)

---

## Files Modified

| File | Change |
|------|--------|
| `backend/api/routes.py` | Add `import logging` + `logger = logging.getLogger(__name__)`; add `BackgroundTasks` to fastapi import; add `AsyncSessionLocal` to database import; add `_background_update_profile` async helper **before** `confirm_session`; add `BackgroundTasks` param to `confirm_session`; replace `await update_patient_profile_summary(...)` with `background_tasks.add_task(...)` |

---

## Out of Scope

- Embedding latency optimization
- Persistent task queues (Celery/Redis)
- Retry logic for failed profile updates
- Double-confirm protection
