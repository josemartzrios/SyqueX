# Mobile Logout Button — Design Spec

**Date:** 2026-04-11
**Branch:** feature/logout
**Scope:** Frontend only — `handleLogout` already exists in App.jsx from the desktop implementation

---

## Context

The desktop logout button was implemented in `PatientSidebar.jsx`. Mobile was explicitly out of scope for that sprint. This spec covers the mobile surface.

---

## Mobile Navigation Structure

Mobile has two navigation surfaces:

| Surface | Component | Purpose |
|---------|-----------|---------|
| Slide-over drawer | `Sidebar.jsx` | Patient/session navigation — opens via hamburger button in the mobile top bar |
| Tab bar | inline in `App.jsx` | Content tabs: Dictar / Nota / Historial / Evolución |

The **slide-over `Sidebar`** is the correct home for logout — it is the mobile equivalent of the desktop sidebar, already serving as the navigation panel. The tab bar is for content switching only.

---

## Design Decision

Add a pinned "Cerrar sesión" ghost-text button at the bottom of `Sidebar.jsx`, below the scrollable session list, separated by a thin divider. When tapped, the drawer closes and the user is redirected to the login screen.

---

## Visual Spec

```
┌─────────────────────────────┐
│ ▌ Sesiones clínicas      ✕  │  ← existing header
├─────────────────────────────┤
│  N sesiones                 │  ← existing count label
├─────────────────────────────┤
│  [session list — scrollable]│
│                             │
├─────────────────────────────┤  ← NEW: border-t border-ink/[0.07]
│  Cerrar sesión              │  ← NEW: ghost button
└─────────────────────────────┘
```

**Token values:**
- Text: `text-gray-500` — consistent with desktop logout button
- Hover: `hover:text-gray-700`
- Transition: `transition-colors`
- Touch target: `py-3 w-full text-left` — meets mobile touch target requirement
- Font: `text-[13px]` — matches existing `Sidebar.jsx` copy size
- Padding: `px-5` — matches existing `Sidebar.jsx` horizontal padding (`px-5` used in header and count label)
- Divider: `border-t border-ink/[0.07]` — reuses the same token already used in `Sidebar.jsx`

No background, no border-radius, no icon. Pure text — same aesthetic as desktop.

---

## Behaviour

- Tapping "Cerrar sesión" calls `onLogout()` which triggers `handleLogout()` in `App.jsx`
- `handleLogout` (try/finally): calls `logout()` from api.js, then always calls `setAuthScreen({ screen: 'login' })`
- The drawer does not need an explicit `onClose()` call — redirecting to the login screen unmounts the entire app layout, which collapses the drawer naturally

---

## Data Flow

```
User taps "Cerrar sesión" (inside Sidebar slide-over)
  → Sidebar calls onLogout()
    → App.jsx handleLogout() [already implemented]
      → try: logout() [api.js] — POST /auth/logout
        finally: setAuthScreen({ screen: 'login' }) — always fires
```

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/Sidebar.jsx` | Add `onLogout` prop; add `border-t` divider + "Cerrar sesión" button pinned below the session list |
| `frontend/src/App.jsx` | Add `onLogout={handleLogout}` to the existing `<Sidebar>` JSX (~line 514) |

No backend changes. No new files. `handleLogout` is not modified.

---

## UX Compliance (UX Pro Max)

| Rule | Status | Notes |
|------|--------|-------|
| `destructive-nav-separation` | ✅ | `border-t` divider separates logout from session list items |
| `touch-target-size` | ✅ | `py-3 w-full` — full-width button, adequate tap height on mobile |
| `color-accessible-pairs` | ✅ | `text-gray-500` on `bg-white` (`Sidebar` background) passes 4.5:1 |
| `hover-vs-tap` | ✅ | `<button>` element |
| `drawer-usage` | ✅ | Logout lives in drawer, not in primary tab bar |

---

## Out of Scope

- Confirmation dialog (logout is reversible)
- Explicit drawer close animation before redirect (unmount handles it)
- Session expiry / forced logout (already handled by `onUnauthorized` in App.jsx)
