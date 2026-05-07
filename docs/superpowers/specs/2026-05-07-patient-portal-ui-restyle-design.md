# Patient Portal UI Restyle — Design Spec
**Date:** 2026-05-07  
**Status:** Approved  
**Scope:** `frontend/src/pages/PatientPortal.jsx` only

---

## Goal

Restyle the patient portal (`/portal`) to match the visual language of `MockPortalPaciente` from the landing, without changing any functionality, routing, API calls, or business logic.

---

## Layout

| Breakpoint | Behavior |
|------------|----------|
| Desktop (`md:+`) | Split-view: 3-col grid. List in col 1 (sticky). Detail in cols 2–3. No change from current structure. |
| Mobile | Single column. Session pills list on top. Selecting a pill renders the detail inline below the list (no transition, natural scroll). Selected pill visible via `border-2 border-sage`. |

---

## Session Pills (List)

| Property | Old | New |
|----------|-----|-----|
| Border radius | `rounded-2xl` | `rounded-xl` |
| Padding | `p-4` | `px-3.5 py-2.5` |
| Unselected border | `border-[#18181b]/[0.06]` | `border border-[#18181b]/[0.08]` |
| Selected border | `border-[#5a9e8a] shadow-sm bg-[#5a9e8a]/5` | `border-2 border-[#5a9e8a] bg-white` |
| Date color | `text-[#9ca3af]` (gray) | `text-[#5a9e8a]` (sage) |
| Date weight | normal | `font-semibold tracking-wide` |
| Topic text (unselected) | `font-medium text-[#18181b]` | `text-[#18181b]/60` |
| Topic text (selected) | same | `font-medium text-[#18181b]` |
| Unviewed dot | unchanged | unchanged |

---

## Detail Card

| Element | Old | New |
|---------|-----|-----|
| Container | `rounded-3xl p-6/p-8 shadow-sm` | `rounded-xl p-4` |
| Section labels | `text-[#9ca3af]` gray | `text-[#5a9e8a]` sage, `font-bold tracking-widest` |
| Date/title | `text-[15px] font-medium` | `text-sm font-semibold mb-3.5` |
| Topics text | `text-[#18181b] leading-relaxed` | `text-xs leading-relaxed text-[#18181b]/60` |
| Homework container | `bg-[#5a9e8a]/[0.02] p-4 rounded-2xl border border-[#5a9e8a]/5` | `px-3.5 py-2.5 rounded-xl border-l-[3px] border-[#5a9e8a] bg-[#f4f4f2] italic` |
| Next session | pill with bg-[#fefaf6] container | plain label (`text-[10px] sage`) + `text-sm font-semibold text-[#18181b]` |
| Footer note | unchanged | unchanged |

---

## Preserved (no changes)

- All state: `summaries`, `selectedSummary`, `loading`, `loadingDetail`, `error`, `detailError`, `tutorialVisible`
- All handlers: `loadSummaries`, `handleViewDetail`, `handleLogout`
- Header: logo, tutorial `?` button, logout button
- `TutorialModal` with `patientMode`
- Error banners (list and detail)
- Loading spinner
- Empty state ("Aún no tienes resúmenes disponibles")
- "Selecciona una sesión" placeholder state
- `document.body.style.overflow` override effect

---

## Files Changed

- `frontend/src/pages/PatientPortal.jsx` — styles only, no logic changes (UI restyle)
- `frontend/src/patientApi.js` — add login redirect on 401 (auth bug fix)
- `frontend/src/App.jsx` — enforce login on fresh `/portal` link visit (auth bug fix)
- `frontend/src/pages/PatientLogin.jsx` — receive `next` param if needed (minor)

---

## Auth Bug Fixes

> Scope additions: two security bugs found during debugging that affect the portal.

### Root Causes

**RC-1 — Portal renderiza con 401 en lugar de redirigir al login**

Flujo actual roto:
1. `App.jsx:306` — `getPatientToken()` encuentra cualquier string en localStorage
2. `App.jsx:308` — renderiza `PatientPortal` sin validar el token contra el servidor
3. `PatientPortal:34` — `loadSummaries()` llama la API → devuelve 401
4. `patientApi.js:40` — `patientFetch` detecta 401, limpia el token, lanza `Error`
5. `PatientPortal:37` — `catch` ejecuta `setError(msg)` → muestra banner de error
6. **Portal queda visible.** Nunca redirige a `/portal/login`

**RC-2 — Presencia de token ≠ validez del token**

`App.jsx:306-312` solo hace `if (ptoken)`. Cualquier string en `localStorage['patient_token']`
(expirado, inválido, de otra sesión anterior) pasa el guard y renderiza el portal.
No hay verificación server-side antes del primer render.

**RC-3 — El enlace de email no tiene frontera de autenticación**

`auth.js:35` mapea `/portal` → `patient-portal` sin condición de autenticidad.
El enlace enviado por Resend es solo `/portal`. Si existe cualquier `patient_token`
en localStorage de cualquier sesión anterior (de cualquier paciente en ese navegador),
ese token es usado como identidad del visitante — posible cross-patient data exposure.

### Fixes

**Fix A — Redirigir a login en cualquier 401 (`patientApi.js`)**

En `patientFetch`, al recibir 401:
```js
clearPatientToken()
navigateTo('/portal/login')
window.location.reload()
```
Esto resuelve RC-1: el usuario nunca ve el portal con un error 401.

**Fix B — Usar `sessionStorage` como frontera de sesión (`App.jsx` + `PatientLogin.jsx`)**

En lugar de depender únicamente de `localStorage` para decidir si mostrar el portal,
usar `sessionStorage` como flag de sesión activa:

- Al hacer login exitoso en `PatientLogin`: `sessionStorage.setItem('portal_session', '1')`
- Al hacer logout en `PatientPortal`: `sessionStorage.removeItem('portal_session')`
- En `App.jsx initAuth` (guard de `/portal`): requerir **ambos** — `getPatientToken()` Y `sessionStorage.getItem('portal_session')`. Si falta cualquiera → redirigir a login.

Esto resuelve RC-2 y RC-3:
- Abrir un nuevo link (nueva pestaña/ventana) → sessionStorage vacío → login requerido aunque haya token en localStorage
- Refrescar la página → sessionStorage persiste → no se pide login de nuevo (UX correcto)
- Cerrar y volver a abrir → sessionStorage limpio → login requerido

**Comportamiento resultante esperado:**

| Escenario | Comportamiento anterior | Comportamiento nuevo |
|-----------|------------------------|---------------------|
| Link de email, sin sesión activa | Muestra portal + 401 | Redirige a login |
| Link de email, con token de otro paciente | Muestra datos del paciente equivocado | Redirige a login |
| Link de email, misma sesión (refresh) | Muestra portal ✓ | Muestra portal ✓ |
| Token expirado, cualquier caso | Muestra portal + 401 | Redirige a login |
| Logout correcto | Limpia token | Limpia token + sessionStorage |
