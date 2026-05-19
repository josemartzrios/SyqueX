# Resend Patient Invite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /patients/{patient_id}/portal/resend-invite` so psychologists can resend a portal invitation to a patient who never accepted it, and surface a "Reenviar invitación" button in the frontend when `portal_status === 'invited'`.

**Architecture:** New endpoint in `routes.py` that finds the existing `PatientUser`, validates it is pending, overwrites the invite token, and calls the existing `send_patient_invite` email function. Frontend change is isolated to `PatientInviteModal.jsx` and `api.js` — no changes to `App.jsx` needed.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy async, React 18 / Vitest / Testing Library

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/api/routes.py` |
| Create | `backend/tests/test_resend_invite.py` |
| Modify | `frontend/src/api.js` |
| Modify | `frontend/src/components/PatientInviteModal.jsx` |
| Create | `frontend/src/components/PatientInviteModal.test.jsx` |

---

### Task 1: Backend — Tests (TDD: write before implementing)

**Files:**
- Create: `backend/tests/test_resend_invite.py`

- [ ] **Step 1: Create the test file**

```python
# backend/tests/test_resend_invite.py
"""Tests for POST /patients/{patient_id}/portal/resend-invite."""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

RESEND_URL = "/api/v1/patients/{patient_id}/portal/resend-invite"


def _make_patient(patient_id, psychologist_id, email="test@example.com"):
    p = MagicMock()
    p.id = patient_id
    p.psychologist_id = psychologist_id
    p.email = email
    p.name = "Ana García"
    p.deleted_at = None
    return p


def _make_execute_result(scalar_value=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar_value
    return r


@pytest.mark.asyncio
async def test_resend_no_patient_user_returns_404(authed_app, mock_db, fake_psychologist):
    """No PatientUser exists for patient → 404."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)
    mock_db.get.return_value = patient
    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config (get_db_with_user)
        _make_execute_result(None),  # select PatientUser → not found
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 404
    assert "invitación previa" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_active_patient_returns_409(authed_app, mock_db, fake_psychologist):
    """Patient already activated their account → 409."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)
    mock_db.get.return_value = patient
    active_user = MagicMock()
    active_user.is_active = True
    mock_db.execute.side_effect = [
        _make_execute_result(None),          # set_config
        _make_execute_result(active_user),   # select PatientUser → active
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 409
    assert "activó" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_success_returns_200_and_updates_token(authed_app, mock_db, fake_psychologist):
    """Pending PatientUser → 200, token fields updated, email sent."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id, email="patient@test.com")
    mock_db.get.return_value = patient

    pending_user = MagicMock()
    pending_user.is_active = False

    mock_db.execute.side_effect = [
        _make_execute_result(None),           # set_config
        _make_execute_result(pending_user),   # select PatientUser → pending
    ]

    with patch("services.email.send_patient_invite", new_callable=AsyncMock) as mock_send:
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
            res = await client.post(RESEND_URL.format(patient_id=patient_id))

    assert res.status_code == 200
    assert "reenviada" in res.json()["message"].lower()
    assert mock_db.commit.await_count == 1
    mock_send.assert_awaited_once()
    # Token fields were assigned (not None)
    assert pending_user.invite_token is not None
    assert pending_user.invite_token_expires_at is not None
    assert pending_user.invited_at is not None


@pytest.mark.asyncio
async def test_resend_wrong_psychologist_returns_403(authed_app, mock_db, fake_psychologist):
    """Patient belongs to a different psychologist → 403."""
    patient_id = uuid.uuid4()
    other_psych_id = uuid.uuid4()
    patient = _make_patient(patient_id, other_psych_id)  # owned by someone else
    mock_db.get.return_value = patient
    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they all fail (endpoint doesn't exist yet)**

```bash
cd backend
python -m pytest tests/test_resend_invite.py -v
```

Expected: 4 failures — `404 Not Found` for all (route not registered yet).

---

### Task 2: Backend — Endpoint Implementation

**Files:**
- Modify: `backend/api/routes.py`

- [ ] **Step 1: Add `collections` import at the top of `routes.py`**

In `backend/api/routes.py`, add to line 1 area (alongside existing imports):

```python
from collections import defaultdict
```

The file starts with `import asyncio` — add this line right after it.

- [ ] **Step 2: Add rate-limiter state and helper function**

Add these lines immediately **before** the `invite_patient` endpoint (around line 1155 in `routes.py`, after the `# Patient Portal Endpoints` comment block header):

```python
# --- Resend invite rate limiting (in-memory, per psychologist+patient) ---
_resend_invite_attempts: dict = defaultdict(list)
_RESEND_MAX = 3
_RESEND_WINDOW_MINUTES = 60


def _check_resend_rate(psychologist_id: uuid.UUID, patient_id: uuid.UUID) -> None:
    from datetime import timedelta
    key = (str(psychologist_id), str(patient_id))
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=_RESEND_WINDOW_MINUTES)
    _resend_invite_attempts[key] = [t for t in _resend_invite_attempts[key] if t > window]
    if len(_resend_invite_attempts[key]) >= _RESEND_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados reenvíos. Intenta en 60 minutos.",
            headers={"Retry-After": "3600"},
        )
    _resend_invite_attempts[key].append(now)
```

- [ ] **Step 3: Add the resend endpoint**

Add this endpoint immediately **after** the `invite_patient` function (after its closing `return` statement, before the `send_session_summary` endpoint at line ~1232):

```python
@router.post("/patients/{patient_id}/portal/resend-invite", tags=["portal"])
async def resend_patient_invite(
    patient_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
    import secrets
    from api.auth import hash_token
    from services.email import send_patient_invite
    from datetime import timedelta

    patient = await _get_owned_patient(db, psychologist.id, patient_id)

    _check_resend_rate(psychologist.id, patient.id)

    res = await db.execute(select(PatientUser).where(PatientUser.patient_id == patient.id))
    patient_user = res.scalar_one_or_none()

    if not patient_user:
        raise HTTPException(
            status_code=404,
            detail="Este paciente no tiene invitación previa. Usa el flujo de invitar.",
        )

    if patient_user.is_active:
        raise HTTPException(
            status_code=409,
            detail="El paciente ya activó su cuenta en el portal.",
        )

    token = secrets.token_urlsafe(32)
    patient_user.invite_token = hash_token(token)
    patient_user.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.PATIENT_INVITE_EXPIRE_DAYS)
    patient_user.invited_at = datetime.now(timezone.utc)

    await db.commit()

    try:
        await send_patient_invite(patient.email, patient.name, psychologist.name, token)
    except Exception as e:
        logger.error(f"Error reenviando invitacion a {patient.email}: {e}")

    return {"message": "Invitación reenviada", "expires_in_days": settings.PATIENT_INVITE_EXPIRE_DAYS}
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
cd backend
python -m pytest tests/test_resend_invite.py -v
```

Expected output:
```
PASSED tests/test_resend_invite.py::test_resend_no_patient_user_returns_404
PASSED tests/test_resend_invite.py::test_resend_active_patient_returns_409
PASSED tests/test_resend_invite.py::test_resend_success_returns_200_and_updates_token
PASSED tests/test_resend_invite.py::test_resend_wrong_psychologist_returns_403
4 passed
```

- [ ] **Step 5: Run the full backend test suite to check for regressions**

```bash
cd backend
python -m pytest --tb=short -q
```

Expected: all previously passing tests continue to pass.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_resend_invite.py
git commit -m "feat(portal): add resend-patient-invite endpoint with rate limiting"
```

---

### Task 3: Frontend — api.js + PatientInviteModal + Tests

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/PatientInviteModal.jsx`
- Create: `frontend/src/components/PatientInviteModal.test.jsx`

- [ ] **Step 1: Add `resendPatientInvite` to `api.js`**

In `frontend/src/api.js`, find the existing `invitePatient` function (around line 294):

```js
// --- Patient Portal ---
export async function invitePatient(patientId) {
  return await _authFetch(`${API_BASE}/patients/${patientId}/portal/invite`, {
    method: 'POST',
  });
}
```

Add the new function directly after it:

```js
export async function resendPatientInvite(patientId) {
  return await _authFetch(`${API_BASE}/patients/${patientId}/portal/resend-invite`, {
    method: 'POST',
  });
}
```

- [ ] **Step 2: Write the failing frontend tests first**

Create `frontend/src/components/PatientInviteModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PatientInviteModal from './PatientInviteModal'

vi.mock('../api', () => ({
  invitePatient: vi.fn(),
  resendPatientInvite: vi.fn(),
}))

import { invitePatient, resendPatientInvite } from '../api'

const noop = () => {}

const makePatient = (portalStatus = null) => ({
  id: 'patient-123',
  name: 'Ana García',
  portal_status: portalStatus,
})

describe('PatientInviteModal', () => {
  beforeEach(() => {
    invitePatient.mockReset()
    resendPatientInvite.mockReset()
  })

  it('no renderiza cuando open=false', () => {
    const { container } = render(
      <PatientInviteModal open={false} patient={makePatient()} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('muestra "Enviar invitación" cuando portal_status es null', () => {
    render(<PatientInviteModal open={true} patient={makePatient(null)} onClose={noop} />)
    expect(screen.getByRole('button', { name: /Enviar invitación/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/i })).not.toBeInTheDocument()
  })

  it('muestra "Reenviar invitación" cuando portal_status es "invited"', () => {
    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    expect(screen.getByRole('button', { name: /Reenviar invitación/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument()
  })

  it('llama resendPatientInvite al hacer click en Reenviar', async () => {
    const user = userEvent.setup()
    resendPatientInvite.mockResolvedValueOnce({ message: 'Invitación reenviada', expires_in_days: 7 })

    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    await user.click(screen.getByRole('button', { name: /Reenviar invitación/i }))

    await waitFor(() => expect(resendPatientInvite).toHaveBeenCalledWith('patient-123'))
  })

  it('muestra confirmación de éxito tras reenvío', async () => {
    const user = userEvent.setup()
    resendPatientInvite.mockResolvedValueOnce({ message: 'Invitación reenviada', expires_in_days: 7 })

    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    await user.click(screen.getByRole('button', { name: /Reenviar invitación/i }))

    await waitFor(() => expect(screen.getByText(/reenviada/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run tests to see them fail**

```bash
cd frontend
npx vitest run src/components/PatientInviteModal.test.jsx
```

Expected: failures on "Reenviar" tests since the component doesn't branch on `portal_status` yet.

- [ ] **Step 4: Update `PatientInviteModal.jsx` to support resend**

Replace the entire content of `frontend/src/components/PatientInviteModal.jsx` with:

```jsx
import { useState } from 'react';
import { invitePatient, resendPatientInvite } from '../api';

export default function PatientInviteModal({ open, patient, onClose, onSuccess, onStatusUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!open || !patient) return null;

  const isResend = patient.portal_status === 'invited';

  const handleAction = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isResend) {
        await resendPatientInvite(patient.id);
      } else {
        await invitePatient(patient.id);
        onSuccess?.();
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message || 'Error al enviar la invitación');
      if (err.status === 409) {
        onStatusUpdate?.(err.message?.includes('activó') ? 'active' : 'invited');
      }
    } finally {
      setLoading(false);
    }
  };

  const title = isResend ? 'Reenviar invitación' : 'Invitar al Portal';
  const description = isResend
    ? `¿Deseas reenviarle la invitación a ${patient.name}? Se generará un nuevo enlace y el anterior quedará inválido.`
    : `¿Deseas invitar a ${patient.name} al portal del paciente? Recibirá un correo para crear su contraseña y acceder a sus tareas y resúmenes.`;
  const buttonLabel = isResend ? 'Reenviar invitación' : 'Enviar invitación';
  const successTitle = isResend ? 'Invitación reenviada' : 'Invitación enviada';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col items-center text-center">
        {!success ? (
          <>
            <div className="w-12 h-12 rounded-full bg-[#5a9e8a]/10 flex items-center justify-center mb-4 text-[#5a9e8a]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#18181b] mb-2">{title}</h3>
            <p className="text-sm text-ink-secondary mb-6">{description}</p>

            {error && (
              <p className="w-full text-[13px] text-red-600 bg-red-50 p-2 rounded-lg mb-4 text-left border border-red-100">
                {error}
              </p>
            )}

            <div className="flex w-full gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAction}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-[14px] font-medium text-white bg-[#5a9e8a] hover:bg-[#4a8a78] transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'Enviando...' : buttonLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#18181b] mb-2">{successTitle}</h3>
            <p className="text-sm text-ink-secondary mb-2">
              El paciente recibirá un correo con las instrucciones de acceso.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run frontend tests to verify they pass**

```bash
cd frontend
npx vitest run src/components/PatientInviteModal.test.jsx
```

Expected output:
```
✓ no renderiza cuando open=false
✓ muestra "Enviar invitación" cuando portal_status es null
✓ muestra "Reenviar invitación" cuando portal_status es "invited"
✓ llama resendPatientInvite al hacer click en Reenviar
✓ muestra confirmación de éxito tras reenvío
5 passed
```

- [ ] **Step 6: Run the full frontend test suite to check for regressions**

```bash
cd frontend
npx vitest run
```

Expected: all previously passing tests continue to pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.js frontend/src/components/PatientInviteModal.jsx frontend/src/components/PatientInviteModal.test.jsx
git commit -m "feat(portal): add resend invite button to PatientInviteModal"
```

---

## Self-Review

**Spec coverage:**
- ✅ `POST /patients/{patient_id}/portal/resend-invite` endpoint
- ✅ Auth: psychologist JWT via `get_current_psychologist` + `get_db_with_user`
- ✅ 404 when no PatientUser exists
- ✅ 409 when patient is already active
- ✅ Token overwrite (invalidates old token)
- ✅ Rate limiting (3/hour per psychologist+patient pair)
- ✅ `send_patient_invite` reused without modification
- ✅ `resendPatientInvite` in `api.js`
- ✅ Modal branches on `portal_status === 'invited'`
- ✅ Success state shows "reenviada" text
- ✅ All 4 backend test cases
- ✅ All 3 frontend test cases (+ 2 existing behavior guards)

**Placeholder scan:** None found.

**Type consistency:**
- `resendPatientInvite` defined in Task 3 Step 1, imported in Step 4 — matches.
- `_check_resend_rate(psychologist.id, patient.id)` — both are `uuid.UUID` — matches function signature.
- `pending_user.invite_token` assigned in endpoint, asserted non-None in test — consistent.
