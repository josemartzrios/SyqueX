# Frontend Cleanup + Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete two unused components and their dead API functions, then add 17 unit tests for the two remaining interactive components (`ChatInput` and `Sidebar`).

**Architecture:** Cleanup runs first (Tasks 1–2) because the deleted files would otherwise appear as candidates for testing. Tests run after (Tasks 3–4): Task 3 patches `Sidebar.jsx` with testability attributes, Tasks 4–5 add the test files. Each task ends with a commit.

**Tech Stack:** React 18, Vitest, @testing-library/react, @testing-library/user-event v14, jsdom

---

## File Map

| Action | File |
|--------|------|
| Delete | `frontend/src/components/PatientCard.jsx` |
| Delete | `frontend/src/components/SessionHistory.jsx` |
| Modify | `frontend/src/api.js` — remove lines 44–47 (`getPatientProfile`) and 55–58 (`searchHistory`) |
| Modify | `frontend/src/components/Sidebar.jsx` — add 3 testability attributes |
| Create | `frontend/src/components/ChatInput.test.jsx` |
| Create | `frontend/src/components/Sidebar.test.jsx` |

---

## Task 1: Delete unused component files

**Files:**
- Delete: `frontend/src/components/PatientCard.jsx`
- Delete: `frontend/src/components/SessionHistory.jsx`

- [ ] **Step 1: Verify neither file is imported anywhere**

Run from repo root:
```bash
grep -r "PatientCard\|SessionHistory" frontend/src --include="*.jsx" --include="*.js" -l
```
Expected output: only `frontend/src/components/PatientCard.jsx` and `frontend/src/components/SessionHistory.jsx` themselves (no importers).

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/components/PatientCard.jsx
rm frontend/src/components/SessionHistory.jsx
```

- [ ] **Step 3: Verify build still passes**

```bash
cd frontend && npm run build
```
Expected: build completes with no errors. Warnings about chunk size are OK.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused PatientCard and SessionHistory components"
```

---

## Task 2: Remove dead API functions

**Files:**
- Modify: `frontend/src/api.js`

The two functions to remove are:
- `getPatientProfile` (lines 44–47 in current file)
- `searchHistory` (lines 55–58 in current file)

Do NOT remove `getPatientSessions` (lines 49–53) — it is actively used by `App.jsx`.

- [ ] **Step 1: Remove `getPatientProfile` from `api.js`**

Delete these exact lines from `frontend/src/api.js`:
```js
export async function getPatientProfile(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/profile`);
  return _handleResponse(res);
}
```
Also delete the blank line before it (line 43).

- [ ] **Step 2: Remove `searchHistory` from `api.js`**

Delete these exact lines (now shifted up after step 1):
```js
export async function searchHistory(patientId, query) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/search?q=${encodeURIComponent(query)}`);
  return _handleResponse(res);
}
```
Also delete the blank line before it.

- [ ] **Step 3: Verify the remaining functions are all present**

After editing, `api.js` should export exactly:
- `ApiError` (class)
- `processSession`
- `confirmNote`
- `getPatientSessions`
- `listPatients`
- `createPatient`
- `listConversations`
- `archiveSession`

Run:
```bash
grep "^export" frontend/src/api.js
```
Expected: 8 export lines matching the list above.

- [ ] **Step 4: Verify build still passes**

```bash
cd frontend && npm run build
```
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js
git commit -m "chore: remove dead getPatientProfile and searchHistory from api.js"
```

---

## Task 3: Add testability attributes to Sidebar.jsx

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

Three small additions are needed so tests can query elements that have no accessible role or text:

1. `data-testid="sidebar-backdrop"` on the backdrop `<div>` (the `fixed inset-0` div, line 7–10)
2. `data-testid="sidebar-panel"` on the sliding panel `<div>` (the `fixed left-0 top-0 h-full` div, line 13)
3. `aria-label="Cerrar"` on the X close button (line 20–27)

- [ ] **Step 1: Add `data-testid="sidebar-backdrop"`**

Find this block in `Sidebar.jsx`:
```jsx
      {open && (
        <div
          className="fixed inset-0 bg-ink/20 backdrop-blur-[2px] z-30"
          onClick={onClose}
        />
      )}
```
Change to:
```jsx
      {open && (
        <div
          data-testid="sidebar-backdrop"
          className="fixed inset-0 bg-ink/20 backdrop-blur-[2px] z-30"
          onClick={onClose}
        />
      )}
```

- [ ] **Step 2: Add `data-testid="sidebar-panel"`**

Find:
```jsx
      <div className={`fixed left-0 top-0 h-full w-[85vw] max-w-sm bg-white z-40 flex flex-col transform transition-transform duration-300 ease-out border-r border-ink/[0.07] shadow-xl ${open ? 'translate-x-0' : '-translate-x-full'}`}>
```
Change to:
```jsx
      <div data-testid="sidebar-panel" className={`fixed left-0 top-0 h-full w-[85vw] max-w-sm bg-white z-40 flex flex-col transform transition-transform duration-300 ease-out border-r border-ink/[0.07] shadow-xl ${open ? 'translate-x-0' : '-translate-x-full'}`}>
```

- [ ] **Step 3: Add `aria-label="Cerrar"` to the X button**

Find:
```jsx
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-parchment transition-colors"
          >
```
Change to:
```jsx
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-parchment transition-colors"
          >
```

- [ ] **Step 4: Verify build still passes**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "chore: add testability attributes to Sidebar (data-testid, aria-label)"
```

---

## Task 4: Write ChatInput tests

**Files:**
- Create: `frontend/src/components/ChatInput.test.jsx`

- [ ] **Step 1: Create the test file**

Create `frontend/src/components/ChatInput.test.jsx` with this content:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ChatInput from './ChatInput'

describe('ChatInput', () => {
  it('renderiza textarea y ambos botones', () => {
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText(/Generar nota clínica/i)).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
  })

  it('muestra contador de palabras al escribir', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'uno dos tres')
    expect(screen.getByText('3 palabras')).toBeInTheDocument()
    // singular
    await user.clear(textarea)
    await user.type(textarea, 'hola')
    expect(screen.getByText('1 palabra')).toBeInTheDocument()
  })

  it('muestra hint y botones deshabilitados cuando el textarea está vacío', () => {
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    expect(screen.getByText('Enter para chat · Shift+Enter nueva línea')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('Enter llama onSend con formato "chat" y limpia el textarea', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'dictado de prueba')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('dictado de prueba', 'chat')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter NO llama onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'texto')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('click en "Generar nota clínica" llama onSend con formato "SOAP" y limpia el textarea', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'sesión clínica')
    await user.click(screen.getByText(/Generar nota clínica/i))
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('sesión clínica', 'SOAP')
    expect(textarea.value).toBe('')
  })

  it('loading=true: textarea y botones quedan deshabilitados', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput onSend={onSend} loading={false} />)
    await user.type(screen.getByRole('textbox'), 'texto')
    rerender(<ChatInput onSend={onSend} loading={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('loading=true: Enter NO llama onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput onSend={onSend} loading={false} />)
    await user.type(screen.getByRole('textbox'), 'texto')
    rerender(<ChatInput onSend={onSend} loading={true} />)
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd frontend && npx vitest run src/components/ChatInput.test.jsx
```
Expected: 8 tests pass, 0 failures.

If a test fails: read the error message carefully. Common issues:
- "Cannot find text" → check the exact string in the component source
- "Element is not disabled" → confirm the `disabled` prop is passed correctly in `ChatInput.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatInput.test.jsx
git commit -m "test: add unit tests for ChatInput component (8 tests)"
```

---

## Task 5: Write Sidebar tests

**Files:**
- Create: `frontend/src/components/Sidebar.test.jsx`

**Fixture data used in tests:**
```js
// Single-item fixture — used for delete tests (#8, #9) and count test (partial)
const ONE_CONV = [{
  id: 'sess-1', patient_id: 'p1', patient_name: 'María López',
  session_date: '2026-01-15', session_number: 1,
  status: 'confirmed', dictation_preview: 'Texto de prueba'
}]

// Three-item fixture — used for count test (#6) and navigation test (#7)
// patient_id values MUST be distinct (Sidebar uses patient_id as React key)
const THREE_CONVS = [
  { id: 'sess-1', patient_id: 'p1', patient_name: 'María López',   session_date: '2026-01-15', session_number: 1, status: 'confirmed', dictation_preview: 'A' },
  { id: 'sess-2', patient_id: 'p2', patient_name: 'Carlos Ruiz',   session_date: '2026-01-22', session_number: 2, status: 'draft',     dictation_preview: 'B' },
  { id: 'sess-3', patient_id: 'p3', patient_name: 'Ana Gómez',     session_date: '2026-01-29', session_number: 3, status: 'confirmed', dictation_preview: 'C' },
]
```

- [ ] **Step 1: Create the test file**

Create `frontend/src/components/Sidebar.test.jsx` with this content:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Sidebar from './Sidebar'

const ONE_CONV = [{
  id: 'sess-1', patient_id: 'p1', patient_name: 'María López',
  session_date: '2026-01-15', session_number: 1,
  status: 'confirmed', dictation_preview: 'Texto de prueba'
}]

const THREE_CONVS = [
  { id: 'sess-1', patient_id: 'p1', patient_name: 'María López',   session_date: '2026-01-15', session_number: 1, status: 'confirmed', dictation_preview: 'A' },
  { id: 'sess-2', patient_id: 'p2', patient_name: 'Carlos Ruiz',   session_date: '2026-01-22', session_number: 2, status: 'draft',     dictation_preview: 'B' },
  { id: 'sess-3', patient_id: 'p3', patient_name: 'Ana Gómez',     session_date: '2026-01-29', session_number: 3, status: 'confirmed', dictation_preview: 'C' },
]

const noop = vi.fn()

describe('Sidebar', () => {
  it('open=false: panel tiene clase -translate-x-full', () => {
    render(<Sidebar open={false} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    const panel = screen.getByTestId('sidebar-panel')
    expect(panel.classList.contains('-translate-x-full')).toBe(true)
  })

  it('open=true: panel tiene clase translate-x-0', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    const panel = screen.getByTestId('sidebar-panel')
    expect(panel.classList.contains('translate-x-0')).toBe(true)
  })

  it('click en backdrop llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    await user.click(screen.getByTestId('sidebar-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('click en botón X llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('estado vacío: muestra "Sin sesiones registradas"', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText(/Sin sesiones registradas/i)).toBeInTheDocument()
  })

  it('muestra conteo correcto: "3 sesiones" y "1 sesión"', () => {
    const { rerender } = render(<Sidebar open={true} onClose={noop} conversations={THREE_CONVS} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText('3 sesiones')).toBeInTheDocument()
    rerender(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText('1 sesión')).toBeInTheDocument()
  })

  it('click en conversación llama onSelectConversation antes que onClose', async () => {
    const user = userEvent.setup()
    const onSelectConversation = vi.fn()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={THREE_CONVS} onSelectConversation={onSelectConversation} onDeleteConversation={noop} />)
    await user.click(screen.getByText('María López'))
    expect(onSelectConversation).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSelectConversation.mock.invocationCallOrder[0])
      .toBeLessThan(onClose.mock.invocationCallOrder[0])
  })

  it('primer click en eliminar muestra estado de confirmación, NO llama onDeleteConversation', async () => {
    const user = userEvent.setup()
    const onDeleteConversation = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={onDeleteConversation} />)
    await user.click(screen.getByTitle('Archivar sesión'))
    expect(screen.getByTitle('Confirmar')).toBeInTheDocument()
    expect(onDeleteConversation).not.toHaveBeenCalled()
  })

  it('segundo click en eliminar llama onDeleteConversation', async () => {
    const user = userEvent.setup()
    const onDeleteConversation = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={onDeleteConversation} />)
    await user.click(screen.getByTitle('Archivar sesión'))
    await user.click(screen.getByTitle('Confirmar'))
    expect(onDeleteConversation).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```
Expected: 9 tests pass, 0 failures.

If a test fails with "Unable to find element by testid":
→ Confirm Task 3 was completed correctly (Sidebar.jsx has `data-testid` attributes).

If test #7 fails with `invocationCallOrder`:
→ Vitest tracks call order automatically on `vi.fn()`. Confirm both mocks are fresh `vi.fn()` instances (not `noop`).

- [ ] **Step 3: Run the full test suite to verify nothing broke**

```bash
cd frontend && npx vitest run
```
Expected: all existing tests pass (App.test.jsx, NoteReview.test.jsx) plus 17 new tests.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.test.jsx
git commit -m "test: add unit tests for Sidebar component (9 tests)"
```

---

## Final Verification

- [ ] Run full test suite one last time:
```bash
cd frontend && npx vitest run
```
Expected: **25 total tests passing** (existing 8 + new 17).

- [ ] Confirm no regressions in build:
```bash
cd frontend && npm run build
```
