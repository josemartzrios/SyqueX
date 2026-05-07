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

- `frontend/src/pages/PatientPortal.jsx` — styles only, no logic changes
