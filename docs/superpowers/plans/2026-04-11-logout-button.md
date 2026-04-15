# Logout Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a "Cerrar sesión" ghost-text button to the bottom of the desktop sidebar so logged-in users can log out.

**Architecture:** Two-file change only. `PatientSidebar` gets an `onLogout` prop and renders a divider + button below the existing pinned footer. `App.jsx` defines `handleLogout` (try/finally so redirect always fires) and passes it down. Backend and auth utilities are untouched — they are already complete.

**Tech Stack:** React 18, Vitest + @testing-library/react, Tailwind CSS (CDN)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `frontend/src/components/PatientSidebar.jsx` | Modify | Add `onLogout` prop; add divider + logout button below existing pinned footer (lines 160–212) |
| `frontend/src/components/PatientSidebar.test.jsx` | Create | Unit tests for the logout button rendering and click behaviour |
| `frontend/src/App.jsx` | Modify | Add `logout` to api import (line 9); add `handleLogout`; pass `onLogout` to `<PatientSidebar>` (line 526) |

---

## Task 1: Add logout button to PatientSidebar

**Files:**
- Modify: `frontend/src/components/PatientSidebar.jsx`
- Create: `frontend/src/components/PatientSidebar.test.jsx`

### Step 1.1 — Write the failing tests

Create `frontend/src/components/PatientSidebar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import PatientSidebar from './PatientSidebar'

const defaultProps = {
  conversations: [],
  selectedPatientId: null,
  onSelectConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onNewPatient: vi.fn(),
  isCreatingPatient: false,
  newPatientName: '',
  onNewPatientNameChange: vi.fn(),
  onSavePatient: vi.fn(),
  onCancelNewPatient: vi.fn(),
  onLogout: vi.fn(),
}

describe('PatientSidebar — logout button', () => {
  it('renders "Cerrar sesión" button', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  })

  it('calls onLogout when the button is clicked', async () => {
    const onLogout = vi.fn()
    render(<PatientSidebar {...defaultProps} onLogout={onLogout} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('does not crash when onLogout is not provided', () => {
    const props = { ...defaultProps }
    delete props.onLogout
    expect(() => render(<PatientSidebar {...props} />)).not.toThrow()
  })
})
```

### Step 1.2 — Run tests to confirm they fail

```bash
cd frontend && npx vitest run src/components/PatientSidebar.test.jsx
```

Expected: 3 failures — button not found / onLogout not called.

### Step 1.3 — Add the button to PatientSidebar

In `frontend/src/components/PatientSidebar.jsx`:

**1. Add `onLogout` to the destructured props** (line 111):

```jsx
export default function PatientSidebar({
  conversations,
  selectedPatientId,
  onSelectConversation,
  onDeleteConversation,
  onNewPatient,
  isCreatingPatient,
  newPatientName,
  onNewPatientNameChange,
  onSavePatient,
  onCancelNewPatient,
  onLogout,          // ← add this
}) {
```

**2. Add the logout zone between the closing `</div>` of the "Nuevo paciente" block (line 212) and the closing `</aside>` (line 213):**

```jsx
      {/* Logout — pinned to very bottom */}
      <div className="border-t border-black/[0.07] flex-shrink-0">
        <button
          onClick={onLogout}
          className="w-full text-left px-4 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
```

### Step 1.4 — Run tests to confirm they pass

```bash
cd frontend && npx vitest run src/components/PatientSidebar.test.jsx
```

Expected: 3 passing.

### Step 1.5 — Commit

```bash
git add frontend/src/components/PatientSidebar.jsx frontend/src/components/PatientSidebar.test.jsx
git commit -m "feat(sidebar): add Cerrar sesión logout button"
```

---

## Task 2: Wire handleLogout in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

### Step 2.1 — Add `logout` to the api import

In `frontend/src/App.jsx`, line 9, add `logout` to the existing api import:

```js
// Before:
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout } from './api'

// After:
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout, logout } from './api'
```

### Step 2.2 — Add the handleLogout function

Add this function near the other auth-related handlers (e.g. after `checkBillingAndRoute`, around line 158):

```js
async function handleLogout() {
  try {
    await logout();
  } finally {
    setAuthScreen({ screen: 'login' });
  }
}
```

### Step 2.3 — Pass onLogout to PatientSidebar

In `frontend/src/App.jsx`, find the `<PatientSidebar>` JSX block (~line 526) and add `onLogout`:

```jsx
<PatientSidebar
  conversations={conversations}
  selectedPatientId={selectedPatientId}
  onSelectConversation={handleSelectConversation}
  onDeleteConversation={handleDeleteConversation}
  onNewPatient={() => setIsCreatingPatient(true)}
  isCreatingPatient={isCreatingPatient}
  newPatientName={newPatientName}
  onNewPatientNameChange={(e) => setNewPatientName(e.target.value)}
  onSavePatient={handleSavePatient}
  onCancelNewPatient={() => { setIsCreatingPatient(false); setNewPatientName(''); }}
  onLogout={handleLogout}
/>
```

### Step 2.4 — Manual smoke test

Start the dev server and verify:

```bash
cd frontend && npm run dev
```

1. Log in with `ana@syquex.demo / demo1234`
2. Confirm "Cerrar sesión" appears at the bottom of the left sidebar, below "Nuevo paciente", separated by a thin line
3. Click it — app should return to the login screen
4. Confirm re-login works normally

### Step 2.5 — Commit

```bash
git add frontend/src/App.jsx
git commit -m "feat(auth): wire handleLogout in App.jsx to PatientSidebar"
```

---

## Done

The feature is complete when:
- `PatientSidebar.test.jsx` — 3 tests passing
- Smoke test — clicking "Cerrar sesión" returns to login screen
- Re-login after logout works
