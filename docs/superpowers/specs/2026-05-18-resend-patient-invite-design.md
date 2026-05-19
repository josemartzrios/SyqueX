# Resend Patient Invite — Design Spec

**Date:** 2026-05-18
**Branch:** `feature/resend-patient-invite`

## Context

The existing `POST /patients/{patient_id}/portal/invite` endpoint blocks re-invitations with a 409 if a `PatientUser` record already exists. When a patient loses the invite email or the token expires, the only workaround is a manual DB update. This feature adds a first-class resend flow.

## Scope

- New backend endpoint for resending an invitation
- Frontend button in `PatientInviteModal` for pending invitations
- Unit tests for both layers

Out of scope: changing the original `/portal/invite` endpoint behavior.

---

## Backend

### Endpoint

`POST /patients/{patient_id}/portal/resend-invite`

- **Auth:** Psychologist JWT (same as invite)
- **File:** `backend/api/routes.py` (alongside the existing invite endpoint)

### Logic

1. Resolve patient via `_get_owned_patient(db, psychologist.id, patient_id)` — reuses existing ownership check
2. Fetch `PatientUser` where `patient_id = patient.id`
3. If no `PatientUser` → `404` `"Este paciente no tiene invitación previa. Usa el flujo de invitar."`
4. If `patient_user.is_active == True` → `409` `"El paciente ya activó su cuenta en el portal."`
5. Generate new token: `secrets.token_urlsafe(32)`
6. Overwrite on the existing row:
   - `invite_token = hash_token(token)`
   - `invite_token_expires_at = now + PATIENT_INVITE_EXPIRE_DAYS`
   - `invited_at = now`
7. Commit
8. Call `send_patient_invite(email, patient.name, psychologist.name, token)` — no changes to this function
9. Return `{"message": "Invitación reenviada", "expires_in_days": settings.PATIENT_INVITE_EXPIRE_DAYS}`

The old token is implicitly invalidated because `invite_token` is overwritten.

### Rate Limiting

3 resends per patient per hour (keyed on `patient_id`). Prevents accidental spam. Uses the same in-memory limiter pattern already present in the codebase.

### Error Responses

| Status | Detail |
|--------|--------|
| 404 | Paciente no encontrado o no pertenece al psicólogo |
| 404 | No hay invitación previa |
| 409 | El paciente ya activó su cuenta |
| 429 | Rate limit excedido |

---

## Frontend

### `api.js`

New function alongside `invitePatient`:

```js
export async function resendPatientInvite(patientId) {
  return await _authFetch(`${API_BASE}/patients/${patientId}/portal/resend-invite`, { method: 'POST' });
}
```

### `PatientInviteModal.jsx`

The modal already receives `patient.portal_status` (`null | 'invited' | 'active'`). Changes:

- `portal_status === null` → show **"Invitar al portal"** button (unchanged)
- `portal_status === 'invited'` → show **"Reenviar invitación"** button (new)
- `portal_status === 'active'` → show **"Cuenta activa"** state (unchanged)

The resend button calls `resendPatientInvite`, manages its own loading state, and shows a success message on 200. On 409, surfaces the server error message directly.

No changes needed in `App.jsx` or other components.

---

## Tests

### Backend (`backend/tests/test_resend_invite.py`)

| Case | Expected |
|------|----------|
| Resend with `is_active=False`, valid `PatientUser` | 200, `invite_token` updated, email sent |
| Resend with `is_active=True` | 409 |
| Resend with no `PatientUser` | 404 |
| Patient belongs to different psychologist | 404 |

### Frontend (`PatientInviteModal.test.jsx` or new file)

| Case | Expected |
|------|----------|
| `portal_status === 'invited'` | Renders "Reenviar invitación" button |
| `portal_status === null` | Renders "Invitar al portal" button |
| Resend success | Shows confirmation message |

---

## Implementation Notes

- Reuse `_get_owned_patient`, `hash_token`, `send_patient_invite` — no new utilities needed
- The rate limiter should be keyed on `(psychologist.id, patient_id)` to be per-patient, not per-psychologist
- Keep the new endpoint directly below the existing invite endpoint in `routes.py` for readability
