# Draft Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-save dictation text per patient in `localStorage` so drafts survive page refresh, with "Borrador"/"Confirmada" badges in the sidebar and an amber label in the dictation panel.

**Architecture:** A new `useDraft(patientId)` hook owns all `localStorage` read/write logic and exposes React state so `App` re-renders reactively. `DictationPanel` becomes a controlled component receiving `value`/`onChange` from `App`. `PatientSidebar` receives a `draftPatientIds` Set and renders inline badges — no absolute positioning, no conflict with the existing archive button.

**Tech Stack:** React 18, Vitest 4, @testing-library/react, localStorage

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/hooks/useDraft.js` | **Create** — hook + static helpers |
| `frontend/src/components/DictationPanel.jsx` | **Modify** — controlled, amber label |
| `frontend/src/components/DictationPanel.test.jsx` | **Modify** — update for new props |
| `frontend/src/components/PatientSidebar.jsx` | **Modify** — Borrador/Confirmada badge |
| `frontend/src/components/PatientSidebar.test.jsx` | **Modify** — add badge tests |
| `frontend/src/components/Sidebar.jsx` | **Modify** — Borrador/Confirmada badge (mobile drawer) — **already patched** |
| `frontend/src/App.jsx` | **Modify** — wire hook, both DictationPanel sites, delete handler, pass draftPatientIds to both sidebars |

---

### Task 1: `useDraft` hook

**Files:**
- Create: `frontend/src/hooks/useDraft.js`

- [ ] **Step 1: Create the hooks directory and write `useDraft.js`**

Create `frontend/src/hooks/useDraft.js` with this exact content:

```js
import { useState, useEffect } from 'react';

const STORAGE_KEY = (patientId) => `syquex_draft_${patientId}`;

export default function useDraft(patientId) {
  const [draft, setDraftState] = useState(
    () => (patientId ? localStorage.getItem(STORAGE_KEY(String(patientId))) ?? '' : '')
  );

  useEffect(() => {
    setDraftState(
      patientId ? localStorage.getItem(STORAGE_KEY(String(patientId))) ?? '' : ''
    );
  }, [patientId]);

  const setDraft = (text) => {
    setDraftState(text);
    if (!patientId) return;
    try {
      if (text) {
        localStorage.setItem(STORAGE_KEY(String(patientId)), text);
      } else {
        localStorage.removeItem(STORAGE_KEY(String(patientId)));
      }
    } catch {
      // localStorage full — textarea still works, draft just won't persist
    }
  };

  const clearDraft = () => {
    setDraftState('');
    if (patientId) localStorage.removeItem(STORAGE_KEY(String(patientId)));
  };

  return { draft, setDraft, clearDraft };
}

useDraft.hasDraft = (patientId) =>
  !!patientId && !!localStorage.getItem(STORAGE_KEY(String(patientId)));

useDraft.clearDraftFor = (patientId) => {
  if (patientId) localStorage.removeItem(STORAGE_KEY(String(patientId)));
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useDraft.js
git commit -m "feat(hooks): add useDraft — localStorage draft per patient"
```

---

### Task 2: `DictationPanel` — controlled component + amber label

**Files:**
- Modify: `frontend/src/components/DictationPanel.jsx`
- Modify: `frontend/src/components/DictationPanel.test.jsx`

- [ ] **Step 1: Update the test file first**

Replace `frontend/src/components/DictationPanel.test.jsx` with:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onGenerate: vi.fn(),
  loading: false,
}

describe('DictationPanel', () => {
  it('does not render the disabled voice button', () => {
    render(<DictationPanel {...defaultProps} />)
    expect(screen.queryByText(/voz/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument()
  })

  it('renders the Generar nota button', () => {
    render(<DictationPanel {...defaultProps} />)
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeInTheDocument()
  })

  it('does not show draft label when value is empty', () => {
    render(<DictationPanel {...defaultProps} value="" />)
    expect(screen.queryByText(/borrador guardado/i)).not.toBeInTheDocument()
  })

  it('shows draft label when value has text', () => {
    render(<DictationPanel {...defaultProps} value="el paciente reporta" />)
    expect(screen.getByText(/borrador guardado/i)).toBeInTheDocument()
  })

  it('calls onChange when user types', async () => {
    const onChange = vi.fn()
    render(<DictationPanel {...defaultProps} onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onGenerate with trimmed value on button click', async () => {
    const onGenerate = vi.fn()
    render(<DictationPanel {...defaultProps} value="  hola  " onGenerate={onGenerate} />)
    await userEvent.click(screen.getByRole('button', { name: /generar nota/i }))
    expect(onGenerate).toHaveBeenCalledWith('hola')
  })
})
```

- [ ] **Step 2: Run tests — expect failures on the new cases**

```bash
cd frontend && npm run test -- DictationPanel --run
```

Expected: `does not show draft label` and `shows draft label` fail (component not yet updated).

- [ ] **Step 3: Rewrite `DictationPanel.jsx`**

Replace `frontend/src/components/DictationPanel.jsx` with:

```jsx
export default function DictationPanel({ value, onChange, onGenerate, loading }) {
  const handleGenerate = () => {
    if (!value.trim() || loading) return;
    onGenerate(value.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <textarea
          className="w-full h-52 resize-none bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-[#18181b] outline-none focus:border-[#5a9e8a] focus:ring-0 transition-colors placeholder-ink-muted disabled:bg-slate-50"
          placeholder="Dicta los puntos clave de la sesión…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        {value.trim() && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c4935a]" />
            <span className="text-[10px] text-[#c4935a] font-medium">Borrador guardado</span>
          </div>
        )}
      </div>

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
    </div>
  );
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npm run test -- DictationPanel --run
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx
git commit -m "feat(DictationPanel): controlled component + amber draft label"
```

---

### Task 3: `PatientSidebar` — Borrador/Confirmada badge

**Files:**
- Modify: `frontend/src/components/PatientSidebar.jsx`
- Modify: `frontend/src/components/PatientSidebar.test.jsx`

- [ ] **Step 1: Add badge tests to `PatientSidebar.test.jsx`**

Append these two describe blocks at the end of `frontend/src/components/PatientSidebar.test.jsx`:

```jsx
describe('PatientSidebar — draft badge', () => {
  const conv = {
    patient_id: '42',
    patient_name: 'Juan García',
    session_number: 3,
    session_date: '2026-04-18',
    dictation_preview: null,
    status: 'confirmed',
  }

  it('shows Borrador badge when patient has draft', () => {
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[conv]}
        draftPatientIds={new Set(['42'])}
      />
    )
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.queryByText('Confirmada')).not.toBeInTheDocument()
  })

  it('shows Confirmada badge when patient has no draft', () => {
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[conv]}
        draftPatientIds={new Set()}
      />
    )
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
  })

  it('shows no badge when patient has no sessions', () => {
    const noSessions = { ...conv, session_number: null }
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[noSessions]}
        draftPatientIds={new Set()}
      />
    )
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmada')).not.toBeInTheDocument()
    expect(screen.getByText('Sin sesiones')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect the new badge tests to fail**

```bash
cd frontend && npm run test -- PatientSidebar --run
```

Expected: 3 new badge tests FAIL (prop not wired yet).

- [ ] **Step 3: Update `PatientSidebar.jsx`**

**3a.** Add `hasDraft` to `PatientConversationItem` props and replace the session subtitle block.

Find in `PatientSidebar.jsx`:

```jsx
function PatientConversationItem({ conv, active, onClick, onDelete }) {
```

Replace with:

```jsx
function PatientConversationItem({ conv, active, onClick, onDelete, hasDraft }) {
```

**3b.** Find the session subtitle block inside `PatientConversationItem`:

```jsx
        {conv.session_number != null ? (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Sesión #{conv.session_number} · {formatDate(conv.session_date)}
          </p>
        ) : (
          <p className="text-[11px] text-gray-400 mt-0.5">Sin sesiones</p>
        )}
```

Replace with:

```jsx
        {conv.session_number != null ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[11px] text-gray-400">Sesión #{conv.session_number}</p>
            {hasDraft ? (
              <span className="text-[10px] font-semibold text-[#c4935a] bg-[#fef3e2] rounded px-1 leading-4">
                Borrador
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-[#5a9e8a] bg-[#f0faf7] rounded px-1 leading-4">
                Confirmada
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-0.5">Sin sesiones</p>
        )}
```

**3c.** Add `draftPatientIds` prop to the `PatientSidebar` component signature.

Find:

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
  onLogout,
}) {
```

Replace with:

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
  onLogout,
  draftPatientIds = new Set(),
}) {
```

**3d.** Wire `hasDraft` into the list render. Find:

```jsx
            <PatientConversationItem
              key={conv.patient_id}
              conv={conv}
              active={conv.patient_id === selectedPatientId}
              onClick={() => onSelectConversation(conv)}
              onDelete={() => onDeleteConversation(conv.id, conv.patient_id)}
            />
```

Replace with:

```jsx
            <PatientConversationItem
              key={conv.patient_id}
              conv={conv}
              active={conv.patient_id === selectedPatientId}
              onClick={() => onSelectConversation(conv)}
              onDelete={() => onDeleteConversation(conv.id, conv.patient_id)}
              hasDraft={draftPatientIds.has(String(conv.patient_id))}
            />
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npm run test -- PatientSidebar --run
```

Expected: all tests PASS (existing + 3 new badge tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PatientSidebar.jsx frontend/src/components/PatientSidebar.test.jsx
git commit -m "feat(PatientSidebar): Borrador/Confirmada badge next to session number"
```

---

### Task 4: `App.jsx` — wire everything together

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Import `useDraft` at the top of `App.jsx`**

Find the existing imports block. Add after the last local import:

```js
import useDraft from './hooks/useDraft';
```

- [ ] **Step 2: Call the hook inside the `App` component**

Find the state declarations block (around line 138 where `selectedPatientId` is declared). Add directly after the last `useState` call in that cluster:

```js
const { draft, setDraft, clearDraft } = useDraft(selectedPatientId);
```

- [ ] **Step 3: Compute `draftPatientIds` for the sidebar**

Find (around line 472–474):

```js
  const isLoading = messages[messages.length - 1]?.type === 'loading';
  const hasActivePatient = !!selectedPatientId;
```

Add after `hasActivePatient`:

```js
  const draftPatientIds = new Set(
    conversations.map(c => String(c.patient_id)).filter(useDraft.hasDraft)
  );
```

- [ ] **Step 4: Update the desktop `PatientSidebar` call — add `draftPatientIds`**

Find the desktop sidebar call (around line 572):

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

Add `draftPatientIds={draftPatientIds}` as the last prop before `/>`:

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
          draftPatientIds={draftPatientIds}
        />
```

- [ ] **Step 5: Update the desktop `DictationPanel` call (~line 609)**

Find:

```jsx
                    <DictationPanel
                      onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                      loading={isLoading}
                    />
```

Replace with:

```jsx
                    <DictationPanel
                      value={draft}
                      onChange={setDraft}
                      onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                      loading={isLoading}
                    />
```

- [ ] **Step 6: Update the mobile `DictationPanel` call (~line 796)**

Find:

```jsx
                <DictationPanel
                  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                  loading={isLoading}
                />
```

Replace with:

```jsx
                <DictationPanel
                  value={draft}
                  onChange={setDraft}
                  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                  loading={isLoading}
                />
```

- [ ] **Step 7: Clear draft on successful `processSession` in `handleSendDictation`**

Find inside `handleSendDictation` (around line 443):

```js
      const noteData = await processSession(selectedPatientId, dictation, format);
```

Add `clearDraft()` on the line immediately after:

```js
      const noteData = await processSession(selectedPatientId, dictation, format);
      clearDraft();
```

- [ ] **Step 8: Clear draft when deleting a patient in `handleDeleteConversation`**

Find:

```js
  const handleDeleteConversation = async (sessionId, patientId) => {
    try {
      if (patientId) await archivePatientSessions(patientId);
      setConversations(prev => prev.filter(c => c.patient_id !== patientId));
    } catch (err) {
      console.error("Error archiving conversation:", err);
    }
  };
```

Replace with:

```js
  const handleDeleteConversation = async (sessionId, patientId) => {
    try {
      if (patientId) await archivePatientSessions(patientId);
      useDraft.clearDraftFor(patientId);
      setConversations(prev => prev.filter(c => c.patient_id !== patientId));
    } catch (err) {
      console.error("Error archiving conversation:", err);
    }
  };
```

- [ ] **Step 8b: Pass `draftPatientIds` to the mobile `<Sidebar>` (~line 566)**

Find:

```jsx
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
      />
```

Replace with:

```jsx
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
        draftPatientIds={draftPatientIds}
      />
```

> Note: `Sidebar.jsx` was already patched to accept `draftPatientIds` and render "Borrador"/"Confirmada" badges matching the desktop design.

- [ ] **Step 9: Run the full test suite**

```bash
cd frontend && npm run test --run
```

Expected: all existing tests PASS. No regressions.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(App): wire useDraft — sidebar badges, panel label, clear on success"
```
