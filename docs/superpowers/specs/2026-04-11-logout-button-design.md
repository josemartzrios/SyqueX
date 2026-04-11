# Logout Button — Design Spec

**Date:** 2026-04-11
**Branch:** feature/logout
**Scope:** Frontend only — backend `POST /auth/logout` is fully implemented

---

## Problem

Users logged into SyqueX have no way to log out. The backend endpoint, the `api.js` helper, and the `clearAccessToken` utility all exist — there is simply no button wired to them in the UI.

---

## Design Decision

Place a ghost text "Cerrar sesión" button at the bottom of `PatientSidebar`, below the existing pinned footer ("Nuevo paciente"), separated by a thin divider.

**Why the sidebar bottom:**
- Matches the convention of sidebar-based SaaS apps (account/session actions at the bottom of the nav column)
- Spatially separated from patient-facing actions — satisfies `destructive-nav-separation` (UX Pro Max §9)
- Does not pollute the patient work area (`PatientHeader`) with account controls

**Why ghost/text:**
- Logout is a low-frequency, account-level action — it should not compete visually with "Nuevo paciente"
- Matches the subdued visual tone of the existing sidebar footer

---

## Visual Spec

```
┌──────────────────────────────┐
│  SyqueX                 v2.0 │  ← brand header
├──────────────────────────────┤
│  PACIENTES                   │
│  [patient list]              │
│                              │
├──────────────────────────────┤  ← border-t border-black/[0.07]
│  [+ Nuevo paciente]          │  ← existing pinned footer
├──────────────────────────────┤  ← NEW thin divider
│  Cerrar sesión               │  ← NEW logout zone
└──────────────────────────────┘
```

**Token values:**
- Text: `text-gray-500` (`#6b7280`) — passes WCAG AA 4.5:1 on `#f4f4f2` sidebar background
- Hover: `hover:text-gray-700`
- Transition: `transition-colors`
- Touch target: `py-3 w-full text-left` — desktop-only; `py-3` (12px × 2) + ~18px line height ≈ 42px, acceptable for a desktop sidebar (mobile logout is out of scope)
- Font: `text-[13px]` — matches existing sidebar footer copy
- Padding: `px-4` — aligns with sidebar horizontal rhythm
- Divider: `border-t border-black/[0.07]` — reuses the same token used elsewhere in the sidebar

No background, no border-radius, no icon. Pure text.

---

## Data Flow

```
User clicks "Cerrar sesión"
  → PatientSidebar calls onLogout()
    → App.jsx handleLogout()
      → try: logout() [api.js]
            POST /auth/logout (revokes refresh token, clears httpOnly cookie)
            clearAccessToken() called internally by logout()
        catch: network/API error — swallow silently
      → setAuthScreen({ screen: 'login' }) — always runs, success or failure
```

**Error handling:** If the API call fails (network down, server error), `handleLogout` must still complete local cleanup and redirect to login. Logout must never be blocked by a failed server call. The `logout()` helper already swallows server errors — `handleLogout` wraps it in `try/finally` to guarantee `setAuthScreen` always fires.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/PatientSidebar.jsx` | Add `onLogout` prop; add divider + logout button below the existing pinned footer |
| `frontend/src/App.jsx` | Add `logout` to the existing `import { ... } from './api.js'` statement; add `handleLogout` function (try/finally); pass `onLogout={handleLogout}` to `PatientSidebar` |

No backend changes. No new files.

---

## UX Compliance (UX Pro Max)

| Rule | Status | Notes |
|------|--------|-------|
| `destructive-nav-separation` | ✅ | Thin divider creates visual + spatial separation from nav items |
| `touch-target-size` | ✅ | `py-3 w-full` — desktop-only; mobile logout is out of scope |
| `color-accessible-pairs` | ✅ | `text-gray-500` on `#f4f4f2` passes 4.5:1 |
| `hover-vs-tap` | ✅ | Button element, not a div |
| `primary-action` | ✅ | Ghost style — visually subordinate to "Nuevo paciente" CTA |

---

## Out of Scope

- Confirmation dialog before logout (logout is reversible — user can log back in)
- Logout from mobile sidebar (mobile uses `MobileTabNav`; can be a follow-up)
- Session expiry / forced logout (already handled by `onUnauthorized` in App.jsx)
