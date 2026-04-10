# Registration Flow Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where successful registration (and login) leaves the app stuck on the loading spinner by extracting `checkBillingAndRoute` as a shared function.

**Architecture:** Add a `useCallback`-wrapped `checkBillingAndRoute` function in `App.jsx` before the auth `useEffect`. Both `initAuth` (initial mount refresh) and the three `onSuccess` props (login, register, reset-password) call it. No changes outside `App.jsx`.

**Tech Stack:** React 18, Vitest + React Testing Library (frontend tests run with `npm test` from `/frontend`)

---

## Files

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Add `checkBillingAndRoute` useCallback; refactor `initAuth`; update 3 `onSuccess` props |
| `frontend/src/App.integration.test.jsx` | Add test verifying post-registration billing check + routing |

---

### Task 1: Add failing test for registration routing

**Files:**
- Modify: `frontend/src/App.integration.test.jsx`

- [ ] **Step 1: Add `register` to the api mock**

Open `frontend/src/App.integration.test.jsx`. The `vi.mock('./api', ...)` block does not include `register`. Add it:

```javascript
vi.mock('./api', () => ({
  listConversations: vi.fn(),
  getPatientSessions: vi.fn(),
  getPatientProfile: vi.fn(),
  processSession: vi.fn(),
  archivePatientSessions: vi.fn(),
  createPatient: vi.fn(),
  setAuthCallbacks: vi.fn(),
  getBillingStatus: vi.fn().mockResolvedValue({ status: 'active' }),
  createCheckout: vi.fn(),
  register: vi.fn().mockResolvedValue({ access_token: 'fake-token' }),  // ← add this
}))
```

- [ ] **Step 2: Add top-level auth import for the new test**

The file already has a `vi.mock('./auth.js', ...)` block. Add a named import at the top of the file alongside the other imports, consistent with how `api` is imported:

```javascript
import * as auth from './auth.js'
```

- [ ] **Step 3: Write the failing test**

Add a new `describe` block at the end of `frontend/src/App.integration.test.jsx`:

```javascript
describe('App - Registration routing', () => {
  it('after successful registration, calls getBillingStatus and shows app', async () => {
    // Start on the register screen
    auth.getScreenFromUrl.mockReturnValue({ screen: 'register' })

    render(<App />)
    const user = userEvent.setup()

    // Fill out the form
    await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')

    // Accept checkboxes
    await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
    await user.click(screen.getByLabelText(/Términos y Condiciones/i))

    // Submit
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    // After register succeeds, billing check must run and app must render
    await waitFor(() => {
      expect(api.getBillingStatus).toHaveBeenCalled()
    })

    // The loading spinner should NOT be the final state
    await waitFor(() => {
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd frontend && npm test -- --run App.integration
```

Expected: FAIL — `getBillingStatus` is not called after registration because `onSuccess` only sets loading state and `initAuth` never re-runs.

---

### Task 2: Implement `checkBillingAndRoute` in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:146-188` (auth useEffect) and `frontend/src/App.jsx:445-473` (screen render block)

- [ ] **Step 1: Add `useCallback` to the React import**

`frontend/src/App.jsx` line 1 already imports `useState, useEffect, useRef`. Add `useCallback`:

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'
```

- [ ] **Step 2: Add `checkBillingAndRoute` before the auth useEffect**

Insert the new function at line ~146, immediately before the `// Inicializar auth al montar` comment:

```javascript
const checkBillingAndRoute = useCallback(async () => {
  try {
    const status = await getBillingStatus();
    setBillingStatus(status);
    if (status.status === 'trialing' || status.status === 'active') {
      setAuthScreen({ screen: 'app' });
    } else {
      setAuthScreen({ screen: 'billing' });
    }
  } catch {
    setAuthScreen({ screen: 'billing' });
  }
}, []);
```

- [ ] **Step 3: Refactor `initAuth` inside the useEffect to use `checkBillingAndRoute`**

Replace the billing-check block inside `initAuth` (lines ~168-184):

```javascript
// BEFORE:
if (token) {
  setAccessToken(token);
  // Verificar billing status
  try {
    const status = await getBillingStatus();
    setBillingStatus(status);
    if (status.status === 'trialing' || status.status === 'active') {
      setAuthScreen({ screen: 'app' });
    } else {
      setAuthScreen({ screen: 'billing' });
    }
  } catch {
    setAuthScreen({ screen: 'billing' });
  }
} else {
  setAuthScreen({ screen: 'login' });
}

// AFTER:
if (token) {
  setAccessToken(token);
  await checkBillingAndRoute();
} else {
  setAuthScreen({ screen: 'login' });
}
```

- [ ] **Step 4: Update the three `onSuccess` props in the screen render block**

Find these three props in `App.jsx` (~lines 447, 454, 466) and update them:

```javascript
// LoginScreen — line ~447
onSuccess={() => checkBillingAndRoute()}

// RegisterScreen — line ~454
onSuccess={() => checkBillingAndRoute()}

// ResetPasswordScreen — line ~466
onSuccess={() => checkBillingAndRoute()}
```

Also update `BillingScreen.onActivated` (~line 472) for consistency:

```javascript
onActivated={() => checkBillingAndRoute()}
```

---

### Task 3: Verify tests pass and commit

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: All tests pass including the new registration routing test.

- [ ] **Step 2: Manual smoke test**

Start backend and frontend locally, go to `/registro`, fill out the form, submit. Confirm the app navigates to the dictation screen instead of staying on the spinner.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.integration.test.jsx
git commit -m "fix(auth): extract checkBillingAndRoute so login/register actually navigate after success"
```
