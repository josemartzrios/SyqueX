# Historial Confirmed-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historial tab shows only confirmed sessions; orphaned drafts surface as a recovery banner in the dictation panel with Reanudar/Descartar actions.

**Architecture:** Four-file change — backend adds DELETE endpoint, frontend adds `deleteSession()` in api.js, App.jsx adds derived state and handlers, DictationPanel.jsx adds the orphan banner. No schema changes.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), React 18 + Vitest + Testing Library (frontend), Tailwind via CDN.

**Spec:** `docs/superpowers/specs/2026-04-20-historial-confirmed-only-design.md`

---

## Task 0: Feature branch setup

**Files:** none (git only)

- [ ] **Step 1: Create and switch to feature branch from dev**

```bash
git checkout dev
git checkout -b feature/historial-confirmed-only
```

Expected: branch `feature/historial-confirmed-only` checked out.

---

## Task 1: Backend — DELETE /sessions/{session_id}

**Files:**
- Modify: `backend/api/routes.py` (add endpoint after `confirm_session`)
- Create: `backend/tests/test_session_delete.py`

### Step 1: Write failing tests

- [ ] Create `backend/tests/test_session_delete.py`:

```python
"""Tests for DELETE /api/v1/sessions/{session_id}"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


def _result(scalar_one_or_none=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar_one_or_none
    return r


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    db.execute.return_value = _result()
    return db


@pytest.fixture
def app(mock_db, monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())
    with patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db, Psychologist
        from api.auth import get_current_psychologist

        async def override_get_db():
            yield mock_db

        fake_psy = MagicMock(spec=Psychologist)
        fake_psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_psy.is_active = True

        async def override_current_user():
            return fake_psy

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()


@pytest.fixture
def session_uuid():
    return uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


class TestDeleteDraftSession:
    @pytest.mark.asyncio
    async def test_returns_204_for_draft(self, app, mock_db, session_uuid):
        sess = MagicMock()
        sess.id = session_uuid
        sess.status = "draft"
        mock_db.execute.return_value = _result(scalar_one_or_none=sess)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 204
        mock_db.delete.assert_called_once_with(sess)
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_404_when_session_not_found(self, app, mock_db, session_uuid):
        mock_db.execute.return_value = _result(scalar_one_or_none=None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_409_when_session_confirmed(self, app, mock_db, session_uuid):
        sess = MagicMock()
        sess.id = session_uuid
        sess.status = "confirmed"
        mock_db.execute.return_value = _result(scalar_one_or_none=sess)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 409
        mock_db.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_400_for_invalid_uuid(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete("/api/v1/sessions/not-a-uuid")

        assert response.status_code == 400
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_session_delete.py -v
```

Expected: 4 failures — `404 Not Found` for the route (not yet implemented).

- [ ] **Step 3: Add the endpoint to `backend/api/routes.py`**

Find the end of `confirm_session` function (around line 640+) and add after it:

```python
@router.delete("/sessions/{session_id}", status_code=204, tags=["sessions"])
async def delete_draft_session(
    session_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    session_uuid = _parse_uuid(session_id, "session_id")
    res = await db.execute(
        select(Session).join(Patient).where(
            Session.id == session_uuid,
            Patient.psychologist_id == psychologist.id,
        )
    )
    sess = res.scalar_one_or_none()

    if not sess:
        raise SessionNotFoundError(
            "Sesión no encontrada.",
            code="SESSION_NOT_FOUND",
            details={"session_id": session_id},
        )

    if sess.status == "confirmed":
        from exceptions import DomainError
        raise DomainError(
            "Las sesiones confirmadas no pueden eliminarse.",
            code="INVALID_SESSION_STATUS",
            http_status=409,
        )

    await db.delete(sess)
    await db.commit()
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend
pytest tests/test_session_delete.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full backend test suite to check no regressions**

```bash
cd backend
pytest --tb=short -q
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_session_delete.py
git commit -m "feat(api): DELETE /sessions/{id} — discard orphaned draft sessions"
```

---

## Task 2: Frontend api.js — deleteSession + fix 204 handling

**Files:**
- Modify: `frontend/src/api.js`

The current `_handleResponse` calls `res.json()` on all successful responses. A 204 No Content response has no body — calling `.json()` on it throws. Fix it, then add the new function.

- [ ] **Step 1: Fix `_handleResponse` for 204 and add `deleteSession`**

In `frontend/src/api.js`, change the `_handleResponse` function's success branch:

```js
// BEFORE:
async function _handleResponse(res) {
  if (res.ok) return res.json();
  ...
}

// AFTER:
async function _handleResponse(res) {
  if (res.ok) {
    if (res.status === 204) return null;
    return res.json();
  }
  ...
}
```

Then add at the end of the file (before the closing of billing exports):

```js
export async function deleteSession(sessionId) {
  return await _authFetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Verify no existing tests break**

```bash
cd frontend
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(api-client): deleteSession + handle 204 No Content in _handleResponse"
```

---

## Task 3: App.jsx — derived state, sessionsLoading, and handlers

**Files:**
- Modify: `frontend/src/App.jsx`

This task adds the derived variables and two handlers needed by Tasks 4–6. No UI changes yet.

- [ ] **Step 1: Add `sessionsLoading` state**

After line 148 (`const [sessionHistory, setSessionHistory] = useState([]);`), add:

```js
const [sessionsLoading, setSessionsLoading] = useState(false);
```

- [ ] **Step 2: Set sessionsLoading in `handleSelectConversation`**

Replace the current `handleSelectConversation` (around line 354):

```js
// BEFORE:
const handleSelectConversation = async (conv) => {
  try {
    const history = await getPatientSessions(conv.patient_id);
    loadPatientChat(conv.patient_id, conv.patient_name, history);
  } catch (err) {
    loadPatientChat(conv.patient_id, conv.patient_name);
  }
};

// AFTER:
const handleSelectConversation = async (conv) => {
  setSessionsLoading(true);
  try {
    const history = await getPatientSessions(conv.patient_id);
    loadPatientChat(conv.patient_id, conv.patient_name, history);
  } catch (err) {
    loadPatientChat(conv.patient_id, conv.patient_name);
  } finally {
    setSessionsLoading(false);
  }
};
```

- [ ] **Step 3: Add derived variables after `soapSessions` (line ~480)**

After the line `const soapSessions = sessionHistory.filter(s => s.format !== 'chat');`, add:

```js
const confirmedSessions = soapSessions.filter(s => s.status === 'confirmed');
const orphanedSessions  = soapSessions.filter(s => s.status === 'draft');
const orphanedPending   = orphanedSessions[0] ?? null;
```

- [ ] **Step 4: Add `deleteSession` import**

Add `deleteSession` to the existing import from `./api.js` at the top of `App.jsx`.

- [ ] **Step 5: Add handlers (after `handleDeleteConversation` around line 363)**

```js
const handleResumeOrphan = () => {
  setCurrentSessionNote({
    type: 'bot',
    sessionId: orphanedPending.id,
    noteData: {
      session_id: String(orphanedPending.id),
      clinical_note: null,
      text_fallback: orphanedPending.ai_response,
    },
    readOnly: false,
  });
};

const handleDiscardOrphan = async () => {
  try {
    await deleteSession(orphanedPending.id);
    await fetchConversations();
    const history = await getPatientSessions(selectedPatientId);
    setSessionHistory(history);
  } catch {
    // DictationPanel shows inline error — re-throw so it can catch
    throw new Error('discard_failed');
  }
};
```

> Note: after discarding, we reload `sessionHistory` directly so `orphanedPending` updates without a full page reload.

- [ ] **Step 6: Verify app compiles (no runtime errors)**

```bash
cd frontend
npm run build
```

Expected: build succeeds, no TypeScript/lint errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(app): derived confirmedSessions/orphaned state + resume/discard handlers"
```

---

## Task 4: App.jsx — Desktop Historial render

**Files:**
- Modify: `frontend/src/App.jsx` (desktop Review mode panel, ~lines 630–698)

- [ ] **Step 1: Replace `soapSessions.map` with `confirmedSessions.map` in desktop Historial**

Find the desktop Historial block (the `<div>` with class `"w-[380px]..."` containing "Historial de Notas"). Replace its inner content:

```jsx
// BEFORE:
{soapSessions.length === 0 ? (
  <p className="text-ink-tertiary text-xs px-2 italic">Sin notas SOAP registradas.</p>
) : (
  soapSessions.map((s, i) => {
    const isExpanded = reviewExpandedSessionId === String(s.id);
    const hasNote = s.status === 'confirmed' && s.structured_note;
    return (
      <div
        key={s.id || i}
        className={`rounded-xl overflow-hidden transition-all duration-200 bg-white border-l-[3px] ${
          s.status === 'confirmed' ? 'border-l-[#5a9e8a]' : 'border-l-[#c4935a]'
        } ${isExpanded ? 'ring-1 ring-[#5a9e8a]/20' : ''}`}
      >
        <div
          className="px-3 py-3 flex items-start gap-3 cursor-pointer group"
          onClick={() => hasNote && setReviewExpandedSessionId(toggleExpandedSession(reviewExpandedSessionId, String(s.id)))}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">Sesión #{s.session_number || (soapSessions.length - i)}</p>
              <span className="text-[11px] text-ink-tertiary font-medium">{formatDate(s.session_date)}</span>
            </div>
            {!isExpanded && s.raw_dictation && (
              <>
                <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5 leading-relaxed">
                  {s.raw_dictation}
                </p>
                <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${
                  s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'
                }`}>
                  {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </span>
              </>
            )}
          </div>
          ...
        </div>
      </div>
    );
  })
)}

// AFTER:
{confirmedSessions.length === 0 ? (
  <p className="text-ink-tertiary text-xs px-2 italic">
    {!sessionsLoading && soapSessions.length > 0
      ? 'No hay notas confirmadas aún.'
      : !sessionsLoading
      ? 'Sin notas SOAP registradas.'
      : ''}
  </p>
) : (
  confirmedSessions.map((s, i) => {
    const isExpanded = reviewExpandedSessionId === String(s.id);
    const hasNote = !!s.structured_note;
    return (
      <div
        key={s.id || i}
        className={`rounded-xl overflow-hidden transition-all duration-200 bg-white border-l-[3px] border-l-[#5a9e8a] ${isExpanded ? 'ring-1 ring-[#5a9e8a]/20' : ''}`}
      >
        <div
          className="px-3 py-3 flex items-start gap-3 cursor-pointer group"
          onClick={() => hasNote && setReviewExpandedSessionId(toggleExpandedSession(reviewExpandedSessionId, String(s.id)))}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">Sesión #{s.session_number || (confirmedSessions.length - i)}</p>
              <span className="text-[11px] text-ink-tertiary font-medium">{formatDate(s.session_date)}</span>
            </div>
            {!isExpanded && s.raw_dictation && (
              <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5 leading-relaxed">
                {s.raw_dictation}
              </p>
            )}
          </div>
          ...chevron svg unchanged...
        </div>
        ...expanded SoapNoteDocument block unchanged...
      </div>
    );
  })
)}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(historial): desktop — show only confirmed sessions, remove draft badges"
```

---

## Task 5: App.jsx — Mobile Historial tab render

**Files:**
- Modify: `frontend/src/App.jsx` (mobile tab historial, ~lines 821–880)

- [ ] **Step 1: Replace `soapSessions.map` with `confirmedSessions.map` in mobile Historial tab**

Find the mobile `{mobileTab === 'historial' && (` block. Apply the same pattern as Task 4:

```jsx
// BEFORE:
{soapSessions.length === 0 ? (
  <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
) : (
  <div className="space-y-2">
    {soapSessions.map((s, i) => {
      const isExpanded = expandedSessionId === String(s.id);
      const hasNote = s.status === 'confirmed' && s.structured_note;
      return (
        <div key={s.id || i} className={`rounded-xl overflow-hidden transition-all ${
          isExpanded ? 'bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25' : 'bg-[#f4f4f2]'
        }`}>
          <div className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
            onClick={() => hasNote && handleToggleSession(String(s.id))}>
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
              </p>
              {s.raw_dictation && (
                <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
              )}
              <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'}`}>
                {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
              </span>
            </div>
            ...
          </div>
        </div>
      );
    })}
  </div>
)}

// AFTER:
{confirmedSessions.length === 0 ? (
  <p className="text-ink-tertiary text-[14px] text-center mt-10">
    {!sessionsLoading && soapSessions.length > 0
      ? 'No hay notas confirmadas aún.'
      : !sessionsLoading
      ? 'Sin sesiones registradas aún.'
      : ''}
  </p>
) : (
  <div className="space-y-2">
    {confirmedSessions.map((s, i) => {
      const isExpanded = expandedSessionId === String(s.id);
      const hasNote = !!s.structured_note;
      return (
        <div key={s.id || i} className={`rounded-xl overflow-hidden transition-all ${
          isExpanded ? 'bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25' : 'bg-[#f4f4f2]'
        }`}>
          <div className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
            onClick={() => hasNote && handleToggleSession(String(s.id))}>
            <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-[#5a9e8a]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                Sesión #{s.session_number || (confirmedSessions.length - i)} · {formatDate(s.session_date)}
              </p>
              {s.raw_dictation && (
                <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
              )}
            </div>
            ...chevron unchanged...
          </div>
          ...expanded SoapNoteDocument block unchanged...
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(historial): mobile — show only confirmed sessions, remove draft badges"
```

---

## Task 6: DictationPanel.jsx — Orphan session banner

**Files:**
- Modify: `frontend/src/components/DictationPanel.jsx`
- Modify: `frontend/src/components/DictationPanel.test.jsx`
- Modify: `frontend/src/App.jsx` (pass new props to DictationPanel)

### Step 1: Write failing tests first

- [ ] Add these test cases to `frontend/src/components/DictationPanel.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onGenerate: vi.fn(),
  loading: false,
  orphanedPending: null,
  orphanedCount: 0,
  onResumeOrphan: vi.fn(),
  onDiscardOrphan: vi.fn(),
}

const orphan = {
  id: 'abc-123',
  session_date: '2026-04-18',
  ai_response: 'Subjetivo: El paciente...',
}

// ... keep existing tests unchanged, add:

describe('orphan banner', () => {
  it('does not render banner when no orphan', () => {
    render(<DictationPanel {...defaultProps} orphanedPending={null} />)
    expect(screen.queryByText(/sin guardar/i)).not.toBeInTheDocument()
  })

  it('renders banner when orphanedPending is set', () => {
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} />)
    expect(screen.getByText(/sin guardar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reanudar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descartar/i })).toBeInTheDocument()
  })

  it('shows extra count when orphanedCount > 1', () => {
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} orphanedCount={3} />)
    expect(screen.getByText(/\+ 2 más/i)).toBeInTheDocument()
  })

  it('calls onResumeOrphan when Reanudar is clicked', async () => {
    const onResumeOrphan = vi.fn()
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} onResumeOrphan={onResumeOrphan} />)
    await userEvent.click(screen.getByRole('button', { name: /reanudar/i }))
    expect(onResumeOrphan).toHaveBeenCalledTimes(1)
  })

  it('shows confirmation prompt when Descartar is clicked', async () => {
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} />)
    await userEvent.click(screen.getByRole('button', { name: /descartar/i }))
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sí, descartar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('returns to normal banner state when Cancelar is clicked', async () => {
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} />)
    await userEvent.click(screen.getByRole('button', { name: /descartar/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByText(/no se puede deshacer/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descartar/i })).toBeInTheDocument()
  })

  it('calls onDiscardOrphan when Sí, descartar is clicked', async () => {
    const onDiscardOrphan = vi.fn().mockResolvedValue(undefined)
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} onDiscardOrphan={onDiscardOrphan} />)
    await userEvent.click(screen.getByRole('button', { name: /descartar/i }))
    await userEvent.click(screen.getByRole('button', { name: /sí, descartar/i }))
    expect(onDiscardOrphan).toHaveBeenCalledTimes(1)
  })

  it('shows inline error when discard fails', async () => {
    const onDiscardOrphan = vi.fn().mockRejectedValue(new Error('discard_failed'))
    render(<DictationPanel {...defaultProps} orphanedPending={orphan} onDiscardOrphan={onDiscardOrphan} />)
    await userEvent.click(screen.getByRole('button', { name: /descartar/i }))
    await userEvent.click(screen.getByRole('button', { name: /sí, descartar/i }))
    await waitFor(() => {
      expect(screen.getByText(/no se pudo descartar/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend
npm test -- --run DictationPanel
```

Expected: 8 new failures (props not accepted yet).

- [ ] **Step 3: Implement the banner in DictationPanel.jsx**

Replace the entire file content:

```jsx
import { useState } from 'react'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DictationPanel({
  value,
  onChange,
  onGenerate,
  loading,
  orphanedPending = null,
  orphanedCount = 0,
  onResumeOrphan,
  onDiscardOrphan,
}) {
  const [discardStep, setDiscardStep] = useState('idle') // 'idle' | 'confirm' | 'loading' | 'error'

  const handleGenerate = () => {
    if (!value.trim() || loading) return
    onGenerate(value.trim())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const handleDiscardClick = () => setDiscardStep('confirm')
  const handleDiscardCancel = () => setDiscardStep('idle')

  const handleDiscardConfirm = async () => {
    setDiscardStep('loading')
    try {
      await onDiscardOrphan()
      setDiscardStep('idle')
    } catch {
      setDiscardStep('error')
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {orphanedPending && (
        <div className="mx-5 mt-5 rounded-lg border-l-[3px] border-l-[#c4935a] bg-[#c4935a]/10 px-4 py-3 flex-shrink-0">
          {discardStep === 'confirm' || discardStep === 'loading' || discardStep === 'error' ? (
            <div>
              {discardStep === 'error' ? (
                <p className="text-[12px] text-[#c4935a] font-medium mb-2">No se pudo descartar. Intenta de nuevo.</p>
              ) : (
                <p className="text-[12px] text-ink font-medium mb-2">¿Descartar esta sesión? No se puede deshacer.</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleDiscardConfirm}
                  disabled={discardStep === 'loading'}
                  className="text-[11px] font-medium text-white bg-[#c4935a] rounded-md px-3 py-1 hover:bg-[#b37f48] disabled:opacity-50 transition-colors"
                >
                  {discardStep === 'loading' ? 'Descartando…' : 'Sí, descartar'}
                </button>
                <button
                  onClick={handleDiscardCancel}
                  disabled={discardStep === 'loading'}
                  className="text-[11px] font-medium text-ink-secondary hover:text-ink px-2 py-1 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[12px] text-ink font-medium">
                Sesión sin guardar del {formatDate(orphanedPending.session_date)}
              </p>
              {orphanedCount > 1 && (
                <p className="text-[11px] text-ink-muted mt-0.5">+ {orphanedCount - 1} más sin guardar</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={onResumeOrphan}
                  className="text-[11px] font-medium text-[#5a9e8a] hover:text-[#4a8a78] transition-colors"
                >
                  Reanudar
                </button>
                <button
                  onClick={handleDiscardClick}
                  className="text-[11px] font-medium text-ink-muted hover:text-ink-secondary transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <textarea
          className="w-full h-52 resize-none bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-[#18181b] outline-none focus:border-[#5a9e8a] focus:ring-0 transition-colors placeholder-ink-muted disabled:bg-slate-50"
          placeholder="Dicta los puntos clave de la sesión…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        {value.trim() && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c4935a]" />
            <span className="text-[10px] text-[#c4935a] font-medium">Borrador guardado</span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex-shrink-0">
        <button
          onClick={handleGenerate}
          disabled={loading || !value.trim()}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
            loading || !value.trim()
              ? 'bg-[#5a9e8a] text-white opacity-40 cursor-not-allowed'
              : 'bg-[#5a9e8a] text-white hover:bg-[#4a8a78] active:scale-95'
          }`}
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Generando nota">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generando…
            </>
          ) : (
            <>Generar nota →</>
          )}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run DictationPanel tests**

```bash
cd frontend
npm test -- --run DictationPanel
```

Expected: all tests pass (including the 8 new ones).

- [ ] **Step 5: Wire new props in App.jsx**

Find both DictationPanel usages in App.jsx (desktop ~line 595, mobile ~line 785) and add the new props to each:

```jsx
<DictationPanel
  value={draft}
  onChange={setDraft}
  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
  loading={isLoading}
  orphanedPending={orphanedPending}
  orphanedCount={orphanedSessions.length}
  onResumeOrphan={handleResumeOrphan}
  onDiscardOrphan={handleDiscardOrphan}
/>
```

- [ ] **Step 6: Run full frontend test suite**

```bash
cd frontend
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Verify build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx frontend/src/App.jsx
git commit -m "feat(dictation): orphan draft banner — resume or discard with two-step confirm"
```

---

## Task 7: Integration smoke test and PR prep

- [ ] **Step 1: Start dev stack and manually verify**

Start backend and frontend per CLAUDE.md. Open a patient that has a `draft` session in DB (or create one by processing without confirming). Verify:

1. Historial tab shows zero "Pendiente" badges
2. Banner appears in DictationPanel with the correct date
3. Click Reanudar → note review opens with text content
4. Confirm → session disappears from orphan banner, appears in Historial as confirmed
5. Repeat with a new draft → click Descartar → two-step appears → confirm → banner disappears

- [ ] **Step 2: Run all tests one final time**

```bash
# backend
cd backend && pytest --tb=short -q

# frontend
cd ../frontend && npm test -- --run
```

Expected: all pass.

- [ ] **Step 3: Open PR to dev**

```bash
git push -u origin feature/historial-confirmed-only
gh pr create \
  --base dev \
  --title "feat: Historial confirmed-only + orphan draft recovery banner" \
  --body "Closes backlog item #1 (Historial filtering).

## Changes
- Historial (desktop + mobile) shows only confirmed sessions
- Orphaned drafts surface as amber banner in DictationPanel
- Reanudar loads draft in NoteReview; Descartar calls DELETE /sessions/{id} with two-step confirmation
- Backend: DELETE /sessions/{id} with ownership guard and 409 for confirmed sessions

## Test plan
- [ ] Backend: \`pytest tests/test_session_delete.py -v\`
- [ ] Frontend: \`npm test -- --run\`
- [ ] Manual: create draft without confirming, reopen patient, verify banner + flows"
```
