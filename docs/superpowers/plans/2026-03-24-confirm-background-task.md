# Confirm SOAP Note — Background Profile Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `update_patient_profile_summary` Claude API call out of the synchronous request path in `POST /sessions/{id}/confirm` so the endpoint returns in ~200–800 ms instead of 4–10 s.

**Architecture:** Use FastAPI's native `BackgroundTasks` to register `_background_update_profile` as a post-response task. The endpoint saves the `ClinicalNote` and returns immediately; the background helper opens its own DB session and calls Claude to update the patient summary after the HTTP response is sent.

**Tech Stack:** Python 3.11, FastAPI `BackgroundTasks`, SQLAlchemy `async_sessionmaker`, pytest-asyncio, `unittest.mock`

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `backend/api/routes.py` | Modify | Add `logging` import + `logger`; add `BackgroundTasks` + `AsyncSessionLocal` to existing imports; add `_background_update_profile` helper before `confirm_session`; update `confirm_session` signature and body |
| `backend/tests/test_api_routes.py` | Modify | Update `TestConfirmSession.test_returns_200_when_session_found` to remove now-unnecessary mocks; add `test_background_task_is_registered` |

---

## Task 1: Add imports and logger to `routes.py`

**Files:**
- Modify: `backend/api/routes.py:1-13`

- [ ] **Step 1: Open `routes.py` and locate the import block (lines 1–13)**

Current imports:
```python
import uuid
from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import Optional, List, Dict, Any
from datetime import date, datetime

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist
from agent import process_session, update_patient_profile_summary
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding
from api.limiter import limiter
from exceptions import InvalidUUIDError, SessionNotFoundError, PatientNotFoundError
```

- [ ] **Step 2: Apply these three changes to the imports**

1. Add `import logging` as a new top-level import (after `import uuid`)
2. Add `BackgroundTasks` to the `fastapi` import
3. Add `AsyncSessionLocal` to the `database` import

> **Keep `update_patient_profile_summary` in the `agent` import** — it is called inside `_background_update_profile` which lives in the same file. Do not remove it.

Result:
```python
import uuid
import logging
from fastapi import APIRouter, Depends, Query, Request, status, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import Optional, List, Dict, Any
from datetime import date, datetime

from database import get_db, Patient, Session, ClinicalNote, PatientProfile, Psychologist, AsyncSessionLocal
from agent import process_session, update_patient_profile_summary
from agent.tools import generate_evolution_report, search_patient_history
from agent.embeddings import get_embedding
from api.limiter import limiter
from exceptions import InvalidUUIDError, SessionNotFoundError, PatientNotFoundError
```

- [ ] **Step 3: Add the logger after the imports, before `router = APIRouter(...)`**

```python
logger = logging.getLogger(__name__)

router = APIRouter(tags=["clinical"])
```

- [ ] **Step 4: Verify the file still parses**

```bash
cd backend && python -c "import api.routes; print('OK')"
```
Expected: `OK`

---

## Task 2: Add `_background_update_profile` helper

**Files:**
- Modify: `backend/api/routes.py` — insert before `confirm_session` endpoint

- [ ] **Step 1: Locate `confirm_session` in `routes.py` (around line 325)**

Find the line:
```python
@router.post("/sessions/{session_id}/confirm", ...)
```

- [ ] **Step 2: Insert `_background_update_profile` immediately above that decorator**

```python
async def _background_update_profile(patient_id: uuid.UUID, session_note: dict) -> None:
    """Runs after the HTTP response is sent. Opens its own DB session."""
    async with AsyncSessionLocal() as db:
        try:
            await update_patient_profile_summary(db, patient_id, session_note)
        except Exception as e:
            logger.error(f"Background profile update failed: {e}")


@router.post("/sessions/{session_id}/confirm", ...)
```

> **Note on `patient_id` type:** `update_patient_profile_summary` is annotated `patient_id: str`, but `PatientProfile.patient_id` is `UUID(as_uuid=True)`. Passing `uuid.UUID` directly works at runtime — SQLAlchemy/asyncpg handles the comparison correctly. Do **not** add a `str()` cast.

- [ ] **Step 3: Verify the file still parses**

```bash
cd backend && python -c "import api.routes; print('OK')"
```
Expected: `OK`

---

## Task 3: Update `confirm_session` to use `BackgroundTasks`

**Files:**
- Modify: `backend/api/routes.py` — `confirm_session` function

- [ ] **Step 1: Locate the `confirm_session` function signature**

Current:
```python
@router.post("/sessions/{session_id}/confirm", response_model=ConfirmNoteOut, tags=["sessions"])
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db)):
```

- [ ] **Step 2: Add `background_tasks: BackgroundTasks` parameter**

```python
@router.post("/sessions/{session_id}/confirm", response_model=ConfirmNoteOut, tags=["sessions"])
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db), background_tasks: BackgroundTasks = BackgroundTasks()):
```

Wait — FastAPI injects `BackgroundTasks` automatically when it appears as a parameter with the type annotation. The correct signature is simply:

```python
async def confirm_session(session_id: str, req: ConfirmNoteRequest, db: AsyncSession = Depends(get_db), background_tasks: BackgroundTasks = None):
```

No — the correct FastAPI pattern is just the type annotation, no default:

```python
async def confirm_session(session_id: str, req: ConfirmNoteRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
```

FastAPI detects `BackgroundTasks` by its type and injects it automatically. No `Depends()` needed.

- [ ] **Step 3: Locate the last two lines of the function body**

Current:
```python
    await update_patient_profile_summary(db, sess.patient_id, summary_data)

    return ConfirmNoteOut(id=cn.id)
```

- [ ] **Step 4: Replace `await` call with `background_tasks.add_task`**

```python
    background_tasks.add_task(_background_update_profile, sess.patient_id, summary_data)

    return ConfirmNoteOut(id=cn.id)
```

- [ ] **Step 5: Verify the file still parses**

```bash
cd backend && python -c "import api.routes; print('OK')"
```
Expected: `OK`

---

## Task 4: Update existing confirm test and add background task test

**Files:**
- Modify: `backend/tests/test_api_routes.py` — `TestConfirmSession`

The existing `test_returns_200_when_session_found` was written when the Claude call happened synchronously. It mocked:
- `mock_db.execute.side_effect` with two results (session lookup + profile lookup)
- `agent.agent.AsyncAnthropic` (the Claude client)

After the change, the background task runs in its own session (not `mock_db`) and the test no longer needs those mocks. We simplify it and add a new test that verifies the background task is actually registered.

- [ ] **Step 1: Write the new test `test_background_task_is_registered` (add it to `TestConfirmSession`)**

This test verifies that a successful confirm registers the background task instead of calling Claude synchronously.

```python
@pytest.mark.asyncio
async def test_background_task_is_registered(self, app, mock_db, session_uuid):
    """confirm_session should register a background task, not await Claude directly."""
    sess = MagicMock()
    sess.id = session_uuid
    sess.patient_id = uuid.uuid4()
    sess.ai_response = "Respuesta AI"
    sess.status = "draft"

    note_id = uuid.uuid4()

    def fake_add(obj):
        from database import ClinicalNote as CN
        if isinstance(obj, CN):
            obj.id = note_id

    mock_db.execute.return_value = _result(scalar_one_or_none=sess)
    mock_db.add = MagicMock(side_effect=fake_add)

    with patch("api.routes.get_embedding", new=AsyncMock(return_value=[0.0] * 1024)):
        with patch("api.routes._background_update_profile", new=AsyncMock()) as mock_bg:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/sessions/{session_uuid}/confirm",
                    json={},
                )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
    # The background helper was called (FastAPI awaits it as a background task)
    mock_bg.assert_called_once()
    assert mock_bg.call_args.args[0] == sess.patient_id  # first positional arg is patient_id
```

- [ ] **Step 2: Run the new test to verify it fails before implementation (TDD baseline)**

```bash
cd backend && python -m pytest tests/test_api_routes.py::TestConfirmSession::test_background_task_is_registered -v
```
Expected: `FAILED` — `_background_update_profile` not defined yet (or test may error on import). This confirms the test targets the right behavior.

- [ ] **Step 3: Update `test_returns_200_when_session_found` to remove the now-unnecessary mocks**

The test no longer needs:
- The `profile` MagicMock object
- The `mock_db.execute.side_effect = [...]` list (two results) — **replace it** with `mock_db.execute.return_value = _result(...)` (single result). If `side_effect` is left in place it takes priority over `return_value` and will raise `StopIteration` on a second execute call.
- The `agent.agent.AsyncAnthropic` patch block

The test **must keep**:
- The `fake_add` function and `mock_db.add = MagicMock(side_effect=fake_add)` — without this, `cn.id` is a bare `MagicMock` object and `ConfirmNoteOut(id=cn.id)` will fail Pydantic validation, returning a 500.

Replace the entire test body:

```python
@pytest.mark.asyncio
async def test_returns_200_when_session_found(self, app, mock_db, session_uuid):
    sess = MagicMock()
    sess.id = session_uuid
    sess.patient_id = uuid.uuid4()
    sess.ai_response = "Respuesta AI"
    sess.status = "draft"

    note_id = uuid.uuid4()

    def fake_add(obj):
        from database import ClinicalNote as CN
        if isinstance(obj, CN):
            obj.id = note_id

    mock_db.execute.return_value = _result(scalar_one_or_none=sess)
    mock_db.add = MagicMock(side_effect=fake_add)

    with patch("api.routes.get_embedding", new=AsyncMock(return_value=[0.0] * 1024)):
        with patch("api.routes._background_update_profile", new=AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/sessions/{session_uuid}/confirm",
                    json={},
                )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
```

- [ ] **Step 4: Run the full `TestConfirmSession` suite**

```bash
cd backend && python -m pytest tests/test_api_routes.py::TestConfirmSession -v
```
Expected: all 4 tests `PASSED`

- [ ] **Step 5: Run the full test suite to catch regressions**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "perf: move patient profile update to background task on confirm

POST /sessions/{id}/confirm now returns after persisting ClinicalNote (~200-800ms).
update_patient_profile_summary (Claude call ~3-8s) runs via FastAPI BackgroundTasks
after the HTTP response is sent."
```

---

## Manual Smoke Test (optional but recommended)

After the commit, start the server and time a confirm request:

```bash
# Terminal 1
cd backend && uvicorn main:app --reload

# Terminal 2 — after seeding DB and getting a draft session_id
time curl -s -X POST http://localhost:8000/api/v1/sessions/<session_id>/confirm \
  -H "Content-Type: application/json" -d '{}'
```

Expected: response in < 1 s (was 4–10 s before). The patient summary updates in the background within ~5 s.
