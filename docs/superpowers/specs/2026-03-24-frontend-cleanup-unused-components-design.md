# Frontend Cleanup — Remove Unused Components

**Date:** 2026-03-24
**Status:** Approved

## Problem

Two components exist in the frontend that are not imported or used anywhere in the active MVP (`App.jsx`). They add noise to the codebase and reference API functions that also have no active callers.

---

## Scope

### Files to Delete

| File | Reason |
|------|--------|
| `frontend/src/components/PatientCard.jsx` | Not imported anywhere in the codebase |
| `frontend/src/components/SessionHistory.jsx` | Not imported anywhere in the codebase |

### Functions to Remove from `frontend/src/api.js`

| Function | Reason |
|----------|--------|
| `getPatientProfile(patientId)` | Exported but has zero call sites anywhere in the codebase. `PatientCard.jsx` receives `profileData` via props and never imports this function. |
| `searchHistory(patientId, query)` | Only imported by `SessionHistory.jsx`, which is being deleted. |

### Functions to KEEP in `frontend/src/api.js`

| Function | Reason |
|----------|--------|
| `getPatientSessions(patientId)` | Actively imported and used in `App.jsx`. Also imported by `SessionHistory.jsx`, but `App.jsx` is the primary consumer — do not remove. |

### No Changes To

- `App.jsx` — does not import either deleted component; continues to use `getPatientSessions`
- `main.jsx` — does not reference either component
- Existing tests (`App.test.jsx`, `NoteReview.test.jsx`) — no test file covers the deleted components
- `vite.config.js`, `package.json` — no changes needed
- Backend — API endpoints `/patients/{id}/profile` and `/patients/{id}/search` are NOT affected

---

## Implementation Steps

1. Delete `frontend/src/components/PatientCard.jsx`
2. Delete `frontend/src/components/SessionHistory.jsx`
3. In `frontend/src/api.js`, remove the `getPatientProfile` function
4. In `frontend/src/api.js`, remove the `searchHistory` function
5. Run `npm run build` from `frontend/` to verify no broken imports

---

## Notes

- `PatientCard.jsx` contains partially hardcoded JSX ("Juan Martínez", "Riesgo Bajo", "34 años") mixed with prop-driven data. When rebuilt for post-MVP, it should be fully prop-driven.
- These features (patient profile view, semantic history search) are planned for post-MVP Phase 2 and can be rebuilt from scratch at that time.
