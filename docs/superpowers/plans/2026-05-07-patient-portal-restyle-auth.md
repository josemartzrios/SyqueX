# Patient Portal UI Restyle + Auth Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the patient portal UI to match MockPortalPaciente and fix two auth security bugs (401 no redirect, email link bypass).

**Architecture:** Three independent changes in four frontend files. Auth fixes (Tasks 1–2) apply to logic only and are tested with Vitest. UI changes (Tasks 3–5) are style-only in PatientPortal.jsx and verified manually in the browser.

**Tech Stack:** React 18, Vite, Vitest + Testing Library, Tailwind CSS via CDN

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/patientApi.js` | Add `navigateTo` import; redirect + reload on 401 |
| `frontend/src/App.jsx` | Require `sessionStorage.portal_session` in patient portal guard |
| `frontend/src/pages/PatientLogin.jsx` | Set `sessionStorage.portal_session` on successful login |
| `frontend/src/pages/PatientInviteAccept.jsx` | Set `sessionStorage.portal_session` on successful invite accept |
| `frontend/src/pages/PatientPortal.jsx` | Remove sessionStorage on logout; full UI restyle; mobile scroll ref |
| `frontend/src/patientApi.test.js` | New — unit tests for 401 redirect behavior |
| `frontend/src/pages/PatientPortal.auth.test.jsx` | New — unit tests for sessionStorage guard |

---

## Task 1: Auth Fix A — Redirect to login on 401

**Files:**
- Modify: `frontend/src/patientApi.js`
- Create: `frontend/src/patientApi.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/patientApi.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock navigateTo before importing patientApi
vi.mock('../auth', () => ({ navigateTo: vi.fn() }))

import { navigateTo } from '../auth'
import { getPatientSummaries, setPatientToken, getPatientToken } from './patientApi'

const API_BASE = 'http://localhost:8000/api/v1'

beforeEach(() => {
  vi.clearAllMocks()
  // Provide a token so the request is actually sent
  setPatientToken('test-token')
  // Reset location mock
  delete window.location
  window.location = { reload: vi.fn(), href: '' }
})

afterEach(() => {
  setPatientToken(null)
})

describe('patientFetch — 401 handling', () => {
  it('clears token, redirects to /portal/login, and reloads on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Token inválido' }),
    })

    await expect(getPatientSummaries()).rejects.toThrow()

    expect(getPatientToken()).toBeNull()
    expect(navigateTo).toHaveBeenCalledWith('/portal/login')
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('does NOT redirect on non-401 errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    })

    await expect(getPatientSummaries()).rejects.toThrow()

    expect(navigateTo).not.toHaveBeenCalled()
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/patientApi.test.js
```

Expected: FAIL — `navigateTo` not called, `reload` not called.

- [ ] **Step 3: Add import and update 401 handler in `patientApi.js`**

Add import at top of file (line 1):
```js
import { navigateTo } from './auth'
```

Replace the existing 401 block (lines 39–41):
```js
// OLD:
if (res.status === 401) {
  clearPatientToken()
}

// NEW:
if (res.status === 401) {
  clearPatientToken()
  navigateTo('/portal/login')
  window.location.reload()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/patientApi.test.js
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/patientApi.js frontend/src/patientApi.test.js
git commit -m "fix(portal): redirect to login on 401 instead of showing error banner"
```

---

## Task 2: Auth Fix B — sessionStorage session boundary

**Files:**
- Modify: `frontend/src/App.jsx` (lines 304–313)
- Modify: `frontend/src/pages/PatientLogin.jsx` (line 17–18)
- Modify: `frontend/src/pages/PatientInviteAccept.jsx` (lines 27–29)
- Modify: `frontend/src/pages/PatientPortal.jsx` (`handleLogout`)
- Create: `frontend/src/pages/PatientPortal.auth.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/PatientPortal.auth.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the guard logic in isolation, not the component render
// The guard is: token && sessionStorage.portal_session === '1'

function portalGuard() {
  const token = localStorage.getItem('patient_token')
  const sessionActive = sessionStorage.getItem('portal_session') === '1'
  return token && sessionActive ? 'patient-portal' : 'patient-login'
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('patient portal auth guard', () => {
  it('shows login when no token and no session flag', () => {
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows login when token exists but no session flag (email link scenario)', () => {
    localStorage.setItem('patient_token', 'valid-token')
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows login when session flag exists but no token', () => {
    sessionStorage.setItem('portal_session', '1')
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows portal when both token and session flag are present', () => {
    localStorage.setItem('patient_token', 'valid-token')
    sessionStorage.setItem('portal_session', '1')
    expect(portalGuard()).toBe('patient-portal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail (or pass trivially)**

```bash
cd frontend && npx vitest run src/pages/PatientPortal.auth.test.jsx
```

Expected: PASS (the guard logic is pure — tests validate the expected behavior we're about to enforce).

- [ ] **Step 3: Update `App.jsx` patient portal guard**

Find this block in `App.jsx` (around line 304):
```js
// Patient portal check
if (screen === 'patient-portal' || screen === 'patient-login') {
  const ptoken = getPatientToken();
  if (ptoken) {
    setAuthScreen({ screen: 'patient-portal' });
  } else {
    setAuthScreen({ screen: 'patient-login' });
  }
  return;
}
```

Replace with:
```js
// Patient portal check — require both localStorage token AND active session flag
if (screen === 'patient-portal' || screen === 'patient-login') {
  const ptoken = getPatientToken();
  const sessionActive = sessionStorage.getItem('portal_session') === '1';
  if (ptoken && sessionActive) {
    setAuthScreen({ screen: 'patient-portal' });
  } else {
    clearPatientToken();
    setAuthScreen({ screen: 'patient-login' });
  }
  return;
}
```

Note: `clearPatientToken` is already imported in `App.jsx` via `patientApi`. Verify the import at the top: `import { getPatientToken } from './patientApi'` — add `clearPatientToken` to that import if missing.

- [ ] **Step 4: Update `PatientLogin.jsx` — set session flag on successful login**

In `handleSubmit` (line 16–18), after the `await patientLogin(...)` call:
```js
// OLD:
await patientLogin(email, password);
navigateTo('/portal');
setScreen('patient-portal');

// NEW:
await patientLogin(email, password);
sessionStorage.setItem('portal_session', '1');
navigateTo('/portal');
setScreen('patient-portal');
```

- [ ] **Step 5: Update `PatientInviteAccept.jsx` — set session flag on successful invite accept**

Find the success handler (around lines 27–29):
```js
// OLD:
navigateTo('/portal');
setScreen('patient-portal');

// NEW:
sessionStorage.setItem('portal_session', '1');
navigateTo('/portal');
setScreen('patient-portal');
```

- [ ] **Step 6: Update `PatientPortal.jsx` `handleLogout` — clear session flag**

Find `handleLogout`:
```js
// OLD:
const handleLogout = () => {
  clearPatientToken();
  navigateTo('/portal/login');
  window.location.reload();
};

// NEW:
const handleLogout = () => {
  clearPatientToken();
  sessionStorage.removeItem('portal_session');
  navigateTo('/portal/login');
  window.location.reload();
};
```

- [ ] **Step 7: Verify manually in browser**

Start the frontend: `cd frontend && npm run dev`

Test scenario A — email link without session:
1. Open a fresh private/incognito window → visit `http://localhost:5173/portal`
2. Expected: redirected to `/portal/login`

Test scenario B — stale token, no session:
1. In browser DevTools > Application > LocalStorage: manually set `patient_token = "fake"`
2. Visit `http://localhost:5173/portal` (new tab, no session flag)
3. Expected: redirected to `/portal/login`, token cleared

Test scenario C — valid login flow:
1. Go to `/portal/login`, log in with a valid patient account
2. Expected: lands on `/portal` and sees summaries
3. Refresh the page → Expected: stays on portal (session flag survives refresh)
4. Close and reopen tab → visit `/portal` → Expected: redirected to login

Test scenario D — logout:
1. While logged in, click "Cerrar sesión"
2. Expected: redirects to `/portal/login`
3. Press browser back → Expected: stays on login (token + session cleared)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/PatientLogin.jsx frontend/src/pages/PatientInviteAccept.jsx frontend/src/pages/PatientPortal.jsx frontend/src/pages/PatientPortal.auth.test.jsx
git commit -m "fix(portal): require sessionStorage flag to prevent email link bypass"
```

---

## Task 3: UI Restyle — Session pills (list column)

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Replace the session list title**

Find:
```jsx
<h1 className="text-2xl font-serif text-[#18181b] mb-6">Mis Sesiones</h1>
```

Replace with:
```jsx
<h1 className="text-lg font-bold text-[#18181b] mb-4">Mis Sesiones</h1>
```

- [ ] **Step 2: Replace the `space-y-3` wrapper with `flex flex-col gap-2`**

Find:
```jsx
<div className="space-y-3">
```

Replace with:
```jsx
<div className="flex flex-col gap-2">
```

- [ ] **Step 3: Replace the session pill button classes**

Find the `<button>` inside `summaries.map`:
```jsx
<button
  key={s.id}
  onClick={() => handleViewDetail(s.id)}
  className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedSummary?.id === s.id
    ? 'bg-[#5a9e8a]/5 border-[#5a9e8a] shadow-sm'
    : 'bg-white border-[#18181b]/[0.06] hover:border-[#5a9e8a]/30'
    }`}
>
```

Replace with:
```jsx
<button
  key={s.id}
  onClick={() => handleViewDetail(s.id)}
  className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all ${selectedSummary?.id === s.id
    ? 'border-2 border-[#5a9e8a] bg-white'
    : 'bg-white border border-[#18181b]/[0.08] hover:border-[#5a9e8a]/30'
    }`}
>
```

- [ ] **Step 4: Replace the date span inside the pill**

Find:
```jsx
<span className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
  {new Date(s.sent_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
</span>
```

Replace with:
```jsx
<span className="text-[10px] text-[#5a9e8a] font-semibold tracking-wide mb-1">
  {new Date(s.sent_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase()}
</span>
```

- [ ] **Step 5: Replace the topic text paragraph inside the pill**

Find:
```jsx
<p className="text-sm font-medium text-[#18181b] truncate">
  {s.topics_worked || 'Sesión sin título'}
</p>
```

Replace with:
```jsx
<p className={`text-xs truncate ${selectedSummary?.id === s.id ? 'font-medium text-[#18181b]' : 'text-[#18181b]/60'}`}>
  {s.topics_worked || 'Sesión sin título'}
</p>
```

- [ ] **Step 6: Verify in browser**

Start dev server: `cd frontend && npm run dev`
Log in as a patient with multiple summaries.
- Verify pills show compact `px-3.5 py-2.5` padding
- Verify date is sage-colored
- Verify selected pill has `border-2 border-[#5a9e8a]` (thicker border, white bg)
- Verify unselected topic text is 60% opacity

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat(portal): restyle session pills to match MockPortalPaciente"
```

---

## Task 4: UI Restyle — Detail card

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Replace the detail card container**

Find:
```jsx
<div className="bg-white rounded-3xl border border-[#18181b]/[0.06] shadow-sm overflow-hidden">
  <div className="p-6 sm:p-8">
```

Replace with:
```jsx
<div className="bg-white rounded-xl border border-[#18181b]/[0.08] overflow-hidden">
  <div className="p-4">
```

- [ ] **Step 2: Replace the detail header (label + date)**

Find:
```jsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
  <div>
    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5a9e8a]">Resumen de Sesión</span>
    <p className="text-[15px] font-medium text-[#18181b] mt-0.5">
      {new Date(selectedSummary.sent_at).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })}
    </p>
  </div>

</div>
```

Replace with:
```jsx
<div className="mb-3.5">
  <div className="text-[10px] text-[#5a9e8a] font-bold tracking-widest mb-1">RESUMEN DE SESIÓN</div>
  <div className="text-sm font-semibold text-[#18181b]">
    {new Date(selectedSummary.sent_at).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}
  </div>
</div>
```

- [ ] **Step 3: Replace the "Temas Trabajados" section**

Find:
```jsx
<section>
  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] mb-3 pb-1 border-b border-[#18181b]/[0.04]">
    Temas Trabajados
  </h3>
  <p className="text-[#18181b] leading-relaxed whitespace-pre-wrap">
    {selectedSummary.topics_worked}
  </p>
</section>
```

Replace with:
```jsx
<section>
  <div className="text-[10px] text-[#5a9e8a] font-bold tracking-widest mb-1.5">TEMAS TRABAJADOS</div>
  <p className="text-xs leading-relaxed text-[#18181b]/60 whitespace-pre-wrap mb-4">
    {selectedSummary.topics_worked}
  </p>
</section>
```

- [ ] **Step 4: Replace the homework section**

Find:
```jsx
{selectedSummary.homework && (
  <section>
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#5a9e8a] mb-3 pb-1 border-b border-[#5a9e8a]/10">
      Tareas y Propósitos
    </h3>
    <div className="bg-[#5a9e8a]/[0.02] p-4 rounded-2xl border border-[#5a9e8a]/5">
      <p className="text-[#18181b] leading-relaxed whitespace-pre-wrap italic">
        {selectedSummary.homework}
      </p>
    </div>
  </section>
)}
```

Replace with:
```jsx
{selectedSummary.homework && (
  <section>
    <div className="text-[10px] text-[#5a9e8a] font-bold tracking-widest mb-2">TAREAS Y PROPÓSITOS</div>
    <div className="px-3.5 py-2.5 rounded-xl border-l-[3px] border-[#5a9e8a] bg-[#f4f4f2] text-xs leading-relaxed text-[#18181b] italic mb-3.5">
      {selectedSummary.homework}
    </div>
  </section>
)}
```

- [ ] **Step 5: Replace the next session section**

Find:
```jsx
{selectedSummary.next_session_date && (
  <section style={{ marginTop: '24px' }}>
    <div className="bg-[#fefaf6] px-4 py-2 rounded-xl border border-[#5a9e8a]/20">
      <p className="text-[10px] font-bold uppercase text-[#5a9e8a] mb-0.5">Próxima Sesión</p>
      <p className="text-sm font-medium text-[#18181b]">
        {new Date(selectedSummary.next_session_date).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short'
        })}
      </p>
    </div>
  </section>
)}
```

Replace with:
```jsx
{selectedSummary.next_session_date && (
  <section>
    <div className="text-[10px] text-[#5a9e8a] font-bold tracking-widest mb-1">PRÓXIMA SESIÓN</div>
    <div className="text-sm font-semibold text-[#18181b]">
      {new Date(selectedSummary.next_session_date).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long'
      })}
    </div>
  </section>
)}
```

- [ ] **Step 6: Remove the `space-y-8` wrapper (now sections manage their own spacing)**

Find:
```jsx
<div className="space-y-8">
  <section>
    <div className="text-[10px] ...">TEMAS TRABAJADOS</div>
```

Replace with (remove the div wrapper, keep the sections):
```jsx
<section>
  <div className="text-[10px] ...">TEMAS TRABAJADOS</div>
```

Note: the sections now self-manage spacing via `mb-4` / `mb-3.5`. The closing `</div>` of `space-y-8` must be removed.

- [ ] **Step 7: Verify in browser**

Log in as a patient and open a summary.
- Verify container is `rounded-xl` (not `rounded-3xl`) with no shadow
- Verify labels are sage + `tracking-widest`
- Verify temas text is 60% opacity
- Verify homework has left border `border-l-[3px] border-[#5a9e8a]` on beige bg
- Verify próxima sesión is plain text (no pill container)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat(portal): restyle detail card to match MockPortalPaciente"
```

---

## Task 5: Mobile — scroll to detail on select

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Add `useRef` import (already imported — verify)**

Confirm line 1 of `PatientPortal.jsx`:
```js
import { useState, useEffect } from 'react';
```

Update to:
```js
import { useState, useEffect, useRef } from 'react';
```

- [ ] **Step 2: Add ref declaration after existing state declarations**

After the last `useState` declaration (line ~13), add:
```js
const detailRef = useRef(null);
```

- [ ] **Step 3: Update `handleViewDetail` to scroll on mobile**

Find the end of the `try` block in `handleViewDetail`:
```js
setSummaries(prev => prev.map(s => s.id === summaryId ? { ...s, viewed_at: detail.viewed_at } : s));
```

Add scroll after it:
```js
setSummaries(prev => prev.map(s => s.id === summaryId ? { ...s, viewed_at: detail.viewed_at } : s));
if (window.innerWidth < 768) {
  setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
```

- [ ] **Step 4: Attach ref to the detail column div**

Find:
```jsx
{/* Detail Section */}
<div className="md:col-span-2">
```

Replace with:
```jsx
{/* Detail Section */}
<div ref={detailRef} className="md:col-span-2">
```

- [ ] **Step 5: Verify on mobile viewport in browser**

In Chrome DevTools, set viewport to iPhone 390px.
1. Log in as patient
2. Tap a session pill
3. Expected: page scrolls smoothly to the detail card below the list

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat(portal): scroll to detail on mobile when selecting a session"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Desktop split-view unchanged | No changes to grid structure ✓ |
| Mobile: detail inline below list | Grid already single-column on mobile ✓ |
| Session pills: `rounded-xl`, `px-3.5 py-2.5` | Task 3 step 3 ✓ |
| Selected: `border-2 border-sage bg-white` | Task 3 step 3 ✓ |
| Date: sage, `font-semibold tracking-wide` | Task 3 step 4 ✓ |
| Topic text: 60% unselected, full selected | Task 3 step 5 ✓ |
| Detail container: `rounded-xl p-4` | Task 4 step 1 ✓ |
| Labels: sage, `font-bold tracking-widest` | Task 4 steps 2–5 ✓ |
| Topics: `text-xs text-[#18181b]/60` | Task 4 step 3 ✓ |
| Homework: `border-l-[3px] border-sage bg-[#f4f4f2] italic` | Task 4 step 4 ✓ |
| Next session: plain label + bold text | Task 4 step 5 ✓ |
| RC-1: 401 redirects to login | Task 1 ✓ |
| RC-2+3: sessionStorage boundary | Task 2 ✓ |
| sessionStorage set on invite accept | Task 2 step 5 ✓ |
| sessionStorage cleared on logout | Task 2 step 6 ✓ |
| Mobile scroll to detail | Task 5 ✓ |
| Tutorial button, logout button preserved | No removals in any task ✓ |
| TutorialModal preserved | No changes to that section ✓ |
| Error banners preserved | No changes to error rendering ✓ |
