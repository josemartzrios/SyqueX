# Desktop UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five focused UI changes that clean up the desktop layout — move the new-patient button, remove dead voice button, eliminate the duplicate session history, unify revision cards with mobile style, and replace the SOAP empty-state text with a subtle visual hint.

**Architecture:** All changes are purely presentational — no state, no API calls, no prop signatures change. Three files touched: `PatientSidebar.jsx` (button placement), `DictationPanel.jsx` (remove voice button), `App.jsx` (remove history block, restyle revision cards, replace empty-state).

**Tech Stack:** React 18, Vite, Tailwind CSS (CDN), Vitest + Testing Library

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/components/PatientSidebar.jsx` | Task 1 — move nuevo-paciente button |
| `frontend/src/components/DictationPanel.jsx` | Task 2 — remove voice button |
| `frontend/src/App.jsx` | Tasks 3, 4, 5 — remove history block, restyle revision cards, replace empty state |

---

## Task 1: Move "+ Nuevo paciente" to icon next to "PACIENTES" label

**Files:**
- Modify: `frontend/src/components/PatientSidebar.jsx`
- Test: `frontend/src/components/PatientSidebar.test.jsx`

Context: The "PACIENTES" label is at line ~135. The pinned-bottom button block starts at line ~161 and ends at line ~213 (the `isCreatingPatient` conditional). The bottom block must be removed. The inline form (`isCreatingPatient` conditional) moves to appear directly below the label row.

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/components/PatientSidebar.test.jsx`:

```jsx
describe('PatientSidebar — nuevo paciente button', () => {
  it('does not render visible "Nuevo paciente" text (wide button is gone)', () => {
    render(<PatientSidebar {...defaultProps} />)
    // The old wide button had visible text content — the new icon button has no text, only a title
    expect(screen.queryByText('Nuevo paciente')).not.toBeInTheDocument()
  })

  it('renders a + icon button next to the PACIENTES label', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.getByTitle('Nuevo paciente')).toBeInTheDocument()
  })

  it('calls onNewPatient when the + icon button is clicked', async () => {
    const onNewPatient = vi.fn()
    render(<PatientSidebar {...defaultProps} onNewPatient={onNewPatient} />)
    await userEvent.click(screen.getByTitle('Nuevo paciente'))
    expect(onNewPatient).toHaveBeenCalledOnce()
  })

  it('shows inline creation form when isCreatingPatient is true', () => {
    render(<PatientSidebar {...defaultProps} isCreatingPatient={true} />)
    expect(screen.getByPlaceholderText(/nombre del paciente/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/PatientSidebar.test.jsx
```

Expected: tests referencing `getByTitle('Nuevo paciente')` fail.

- [ ] **Step 3: Implement the change**

In `frontend/src/components/PatientSidebar.jsx`:

**3a.** Replace the "Section Label: Pacientes" block (currently `<div className="px-3 pt-3 pb-1 flex-shrink-0">`) with a row that includes the `+` icon button:

```jsx
{/* Section Label: Pacientes + New button */}
<div className="px-3 pt-3 pb-1 flex-shrink-0 flex items-center justify-between px-5">
  <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-bold px-2">
    Pacientes
  </span>
  {!isCreatingPatient && (
    <button
      onClick={onNewPatient}
      title="Nuevo paciente"
      className="p-1 rounded-md text-gray-400 hover:text-[#5a9e8a] hover:bg-black/[0.04] transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  )}
</div>

{/* Inline creation form — shown directly below label when isCreatingPatient */}
{isCreatingPatient && (
  <div className="px-3 pb-2 flex-shrink-0">
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        type="text"
        placeholder="Nombre del paciente..."
        className="w-full bg-white border border-black/[0.1] rounded-lg px-3 py-2 text-sm text-[#18181b] placeholder-gray-400 focus:outline-none focus:border-[#5a9e8a]/60 transition-all"
        value={newPatientName}
        onChange={onNewPatientNameChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSavePatient();
          if (e.key === 'Escape') onCancelNewPatient();
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onSavePatient}
          className="flex-1 bg-[#5a9e8a] hover:bg-[#4d8a78] text-white text-[13px] font-medium rounded-lg py-1.5 transition-colors"
        >
          Guardar
        </button>
        <button
          onClick={onCancelNewPatient}
          className="px-3 text-gray-500 hover:text-gray-700 text-[13px] rounded-lg py-1.5 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
)}
```

**3b.** Delete the entire pinned-bottom block — the `<div className="px-3 py-3 border-t border-black/[0.07] flex-shrink-0">` that contains the `isCreatingPatient` conditional with the wide button (old lines ~161-213).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/PatientSidebar.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PatientSidebar.jsx frontend/src/components/PatientSidebar.test.jsx
git commit -m "feat(sidebar): move nuevo-paciente to icon next to PACIENTES label"
```

---

## Task 2: Remove disabled voice button from DictationPanel

**Files:**
- Modify: `frontend/src/components/DictationPanel.jsx`
- Test: `frontend/src/components/DictationPanel.test.jsx` (create if not exists)

Context: The disabled voice button is at lines 41-47. The toolbar `<div className="flex items-center gap-3">` wraps both buttons. After removal, "Generar nota" is the only button — remove `gap-3` and make it full width.

- [ ] **Step 1: Check if DictationPanel test file exists**

```bash
ls frontend/src/components/DictationPanel.test.jsx 2>/dev/null || echo "NOT FOUND"
```

If NOT FOUND, create `frontend/src/components/DictationPanel.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

describe('DictationPanel', () => {
  it('does not render the disabled voice button', () => {
    render(<DictationPanel onGenerate={vi.fn()} loading={false} />)
    expect(screen.queryByText(/voz/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument()
  })

  it('renders the Generar nota button', () => {
    render(<DictationPanel onGenerate={vi.fn()} loading={false} />)
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm voice test fails**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```

Expected: "does not render the disabled voice button" FAILS (voice text currently present).

- [ ] **Step 3: Implement the change**

In `frontend/src/components/DictationPanel.jsx`, replace the toolbar section (lines 38-74):

```jsx
{/* Toolbar */}
<div className="px-5 pb-5 flex-shrink-0">
  <button
    onClick={handleGenerate}
    disabled={loading || !value.trim()}
    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
      loading || !value.trim()
        ? 'bg-[#5a9e8a] text-white opacity-40 cursor-not-allowed'
        : 'bg-[#5a9e8a] text-white hover:bg-[#4a8a78] active:scale-95'
    }`}
  >
    {loading ? (
      <>
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Generando nota">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Generando…
      </>
    ) : (
      <>Generar nota →</>
    )}
  </button>
</div>
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx
git commit -m "feat(dictation): remove disabled voice button, full-width generar nota"
```

---

## Task 3: Remove session history block from desktop dictation panel

**Files:**
- Modify: `frontend/src/App.jsx` (desktop session mode, lines ~594-648)

Context: In desktop mode `'session'`, the left panel renders `DictationPanel` followed by a conditional block `{soapSessions.length > 0 && (...)}` that shows an inline session history. This entire conditional block must be removed. The historial is still accessible in mode `'review'`.

No test needed — this is a removal of JSX with no logic. Visual verification is sufficient.

- [ ] **Step 1: Locate and delete the history block**

In `frontend/src/App.jsx`, inside the desktop session mode left panel (`desktopMode === 'session'`), find and delete the block:

```jsx
{/* Session history list below dictation */}
{soapSessions.length > 0 && (
  <div className="flex-1 overflow-y-auto border-t border-black/[0.07] px-4 py-3">
    ...
  </div>
)}
```

The left panel `<div className="w-80 flex-shrink-0 ...">` should contain only `<DictationPanel ... />` after this change.

- [ ] **Step 2: Verify the app compiles**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(desktop): remove duplicate session history from dictation panel"
```

---

## Task 4: Restyle desktop revision cards to match mobile

**Files:**
- Modify: `frontend/src/App.jsx` (desktop review mode, lines ~680-742)

Context: In `desktopMode === 'review'`, the left panel renders session cards. These need to match the mobile historial card style: solid `bg-[#f4f4f2]` background, `bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25` when expanded, `line-clamp-2` preview, and a status badge.

Mobile reference is at lines ~876-930 — use it as the source of truth.

- [ ] **Step 1: Update the card container classes**

Find the card wrapper in the review mode (currently `className={`rounded-xl overflow-hidden transition-all duration-200 ${isExpanded ? 'bg-white shadow-sm ring-1 ring-[#5a9e8a]/20' : 'bg-transparent hover:bg-black/[0.02]'}`}`).

Replace with:

```jsx
className={`rounded-xl overflow-hidden transition-all duration-200 ${
  isExpanded
    ? 'bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25'
    : 'bg-[#f4f4f2]'
}`}
```

- [ ] **Step 2: Update preview line-clamp and add status badge**

Find the `{!isExpanded && s.raw_dictation && (...)}` conditional inside the card body. Change `line-clamp-1` to `line-clamp-2` on the dictation preview `<p>`.

The status badge must go **inside** that same `!isExpanded` block, immediately after the preview `<p>` — it should only be visible when the card is collapsed (matching the mobile pattern):

```jsx
{!isExpanded && s.raw_dictation && (
  <>
    <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5 leading-relaxed">
      {s.raw_dictation}
    </p>
    <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${
      s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'
    }`}>
      {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
    </span>
  </>
)}
```

- [ ] **Step 3: Verify the app compiles**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(desktop): unify revision cards with mobile card style"
```

---

## Task 5: Replace SOAP empty-state text with subtle visual hint

**Files:**
- Modify: `frontend/src/App.jsx` (desktop session mode right panel, lines ~653-657)

Context: When `latestNoteMsg === null`, the right panel currently shows two lines of instructional text. Replace with a centered document icon + skeleton lines. No text.

- [ ] **Step 1: Replace the empty-state JSX**

Find the `latestNoteMsg === null` branch in the desktop right panel:

```jsx
<div className="h-full flex flex-col items-center justify-center gap-3 text-center">
  <p className="text-ink-tertiary text-[14px]">La nota SOAP aparecerá aquí.</p>
  <p className="text-ink-muted text-[12px]">Escribe un dictado y haz clic en "Generar nota".</p>
</div>
```

Replace with:

```jsx
<div className="h-full flex flex-col items-center justify-center gap-4">
  {/* Document icon */}
  <svg
    className="w-8 h-8 text-gray-200"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
  {/* Skeleton lines */}
  <div className="flex flex-col items-center gap-2">
    <div className="h-2 w-32 bg-gray-100 rounded-full" />
    <div className="h-2 w-24 bg-gray-100 rounded-full" />
    <div className="h-2 w-28 bg-gray-100 rounded-full" />
  </div>
</div>
```

- [ ] **Step 2: Verify the app compiles**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(desktop): replace SOAP empty-state text with subtle visual hint"
```

---

## Final Verification

- [ ] Start the dev server and verify all 5 changes visually:

```bash
cd frontend && npm run dev
```

Checklist:
- [ ] Sidebar: `+` icon appears next to "PACIENTES" label, wide green button gone
- [ ] Sidebar: clicking `+` shows inline form below label
- [ ] DictationPanel: no voice button, "Generar nota →" is full width (desktop + mobile)
- [ ] Desktop session mode: left panel has only DictationPanel, no history list
- [ ] Desktop revision mode: cards have `bg-[#f4f4f2]` background, status badge, 2-line preview
- [ ] Desktop session mode: right panel shows document icon + skeleton when no note generated

- [ ] Run full test suite

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.
