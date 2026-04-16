# Note Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Nota panel shows a clean empty state until the clinician clicks "Generar nota →", hiding any previously-generated notes from history.

**Architecture:** Add a `currentSessionNote` state variable to `App.jsx` that tracks only the note from the active dictation session. It resets to `null` in `loadPatientChat` and is populated by `handleSendDictation`. Both desktop and mobile Nota panels render from this state instead of the derived `latestNoteMsg`. A hoisted `NOTE_EMPTY_STATE` constant keeps the empty state JSX DRY across both panels.

**Tech Stack:** React 18, Vitest, @testing-library/react, @testing-library/user-event

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Add `NOTE_EMPTY_STATE` constant; add `currentSessionNote` state; reset in `loadPatientChat`; update in `handleSendDictation`; replace `latestNoteMsg` in desktop + mobile Nota panels |
| `frontend/src/App.test.jsx` | Unit tests for the `currentSessionNote` shape contracts |
| `frontend/src/App.integration.test.jsx` | Integration tests for Nota panel behavior |

---

## Task 1: Create branch

- [ ] **Step 1: Create and push branch**

```bash
git checkout dev
git pull origin dev
git checkout -b feature/note-empty-state
git push -u origin feature/note-empty-state
```

Expected: branch created locally and on remote, tracking set.

---

## Task 2: Add `NOTE_EMPTY_STATE` hoisted constant

**Files:**
- Modify: `frontend/src/App.jsx`

The empty state markup is identical in desktop and mobile. Define it once as a hoisted constant alongside the existing `EMPTY_STATE` and `LOADING_DOTS` constants (after line ~45).

- [ ] **Step 1: Add constant after `LOADING_DOTS`**

Insert after the `LOADING_DOTS` constant definition:

```jsx
const NOTE_EMPTY_STATE = (
  <div className="flex flex-col items-center justify-center gap-4 text-center px-8 h-full">
    <div className="w-14 h-14 rounded-2xl bg-parchment-dark border border-ink/[0.07] flex items-center justify-center">
      <svg className="w-7 h-7 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <div>
      <p className="text-ink-secondary text-sm font-medium">Aún no hay nota generada</p>
      <p className="text-ink-tertiary text-xs mt-1">Dicta los puntos de la sesión y presiona «Generar nota →»</p>
    </div>
  </div>
);
```

Note: `bg-parchment-dark` is a custom Tailwind token already used in the existing `EMPTY_STATE` constant at line ~27 of this file — no fallback needed.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add NOTE_EMPTY_STATE hoisted constant"
```

---

## Task 3: Add `currentSessionNote` state and reset in `loadPatientChat`

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add state declaration**

In the `App` function body, after the `mobileTab` state declaration (line ~130), add:

```js
const [currentSessionNote, setCurrentSessionNote] = useState(null);
```

- [ ] **Step 2: Reset in `loadPatientChat`**

`loadPatientChat` starts at line ~214. The actual body (in order) is:

```js
setSelectedPatientId(patientId);
setSelectedPatientName(patientName);
setMobileTab('dictar');
setSessionHistory(history);
setExpandedSessionId(null);
setDesktopMode('session');
setReviewExpandedSessionId(null);
// Reset evolution state for new patient (evolutionMessages Map se conserva)
setPatientProfile(null);
setEvolutionError(null);
setEvolutionSending(false);
```

Add `setCurrentSessionNote(null);` as the next line after `setEvolutionSending(false);`, before the `if (history.length === 0)` check. Do a targeted single-line insertion — do not replace the whole block.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add currentSessionNote state, reset on patient load"
```

---

## Task 4: Update `handleSendDictation` to populate `currentSessionNote`

**Files:**
- Modify: `frontend/src/App.jsx`

`handleSendDictation` is at line ~431. Its current structure:

```js
const handleSendDictation = async (dictation, format) => {
  setMessages(prev => [...]);
  if (format === 'SOAP') setMobileTab('nota');
  try {
    const noteData = await processSession(...);
    const botMessage = ...;
    setMessages(prev => [...prev.slice(0, -1), botMessage]);
    fetchConversations();
  } catch (err) {
    setMessages(prev => [...prev.slice(0, -1), { type: 'error', ... }]);
  }
};
```

- [ ] **Step 1: Set loading state on entry**

Add immediately after `if (format === 'SOAP') setMobileTab('nota');`:

```js
if (format === 'SOAP') setCurrentSessionNote({ type: 'loading' });
```

- [ ] **Step 2: Set success state**

Add immediately after `setMessages(prev => [...prev.slice(0, -1), botMessage]);` and before `fetchConversations();`:

```js
if (format === 'SOAP') {
  setCurrentSessionNote({
    type: 'bot',
    noteData,
    sessionId: noteData.session_id,
    readOnly: false,
  });
}
```

- [ ] **Step 3: Set error state**

Add immediately after the existing `setMessages(...)` call in the `catch` block:

```js
if (format === 'SOAP') {
  setCurrentSessionNote({
    type: 'error',
    text: 'Anomalía de conexión: ' + err.message,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: populate currentSessionNote in handleSendDictation"
```

---

## Task 5: Replace desktop Nota panel

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~596–635)

- [ ] **Step 1: Replace the render block**

The current desktop block (lines ~598–634) reads:

```jsx
{latestNoteMsg === null ? (
  <div className="h-full flex flex-col items-center justify-center gap-4">
    <svg className="w-8 h-8 text-gray-200" ...>...</svg>
    <div className="flex flex-col items-center gap-2">
      <div className="h-2 w-32 bg-gray-100 rounded-full" />
      <div className="h-2 w-24 bg-gray-100 rounded-full" />
      <div className="h-2 w-28 bg-gray-100 rounded-full" />
    </div>
  </div>
) : latestNoteMsg.type === 'loading' ? (
  ...
) : latestNoteMsg.type === 'error' ? (
  ...
) : latestNoteMsg.type === 'bot' && latestNoteMsg.noteData ? (
  <SoapNoteDocument noteData={latestNoteMsg.noteData} onConfirm={fetchConversations} readOnly={latestNoteMsg.readOnly} />
) : null}
```

Replace entirely with:

```jsx
{currentSessionNote === null ? (
  NOTE_EMPTY_STATE
) : currentSessionNote.type === 'loading' ? (
  <div className="flex items-center gap-3 py-6">
    {LOADING_DOTS}
    <span className="text-ink-tertiary text-[14px]">Generando nota SOAP…</span>
  </div>
) : currentSessionNote.type === 'error' ? (
  <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
    <strong className="font-medium">Error:</strong> {currentSessionNote.text}
  </div>
) : currentSessionNote.type === 'bot' && currentSessionNote.noteData ? (
  <SoapNoteDocument
    noteData={currentSessionNote.noteData}
    onConfirm={fetchConversations}
    readOnly={currentSessionNote.readOnly}
  />
) : null}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: desktop Nota panel uses currentSessionNote with empty state"
```

---

## Task 6: Replace mobile Nota tab

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~803–835)

- [ ] **Step 1: Replace the render block**

The current mobile block (lines ~807–832) uses `latestNoteMsg`. Replace only the conditional inside the scroll container:

```jsx
{currentSessionNote === null ? (
  NOTE_EMPTY_STATE
) : currentSessionNote.type === 'loading' ? (
  <div className="flex gap-2 items-center py-4">
    {[0, 0.2, 0.4].map((d, i) => (
      <div key={i} className="w-2 h-2 rounded-full bg-ink-muted animate-pulse" style={{ animationDelay: `${d}s` }} />
    ))}
    <span className="text-ink-tertiary text-sm">Generando nota…</span>
  </div>
) : currentSessionNote.type === 'error' ? (
  <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
    <strong>Error:</strong> {currentSessionNote.text}
  </div>
) : currentSessionNote.type === 'bot' && currentSessionNote.noteData ? (
  <SoapNoteDocument
    noteData={currentSessionNote.noteData}
    onConfirm={fetchConversations}
    readOnly={currentSessionNote.readOnly}
  />
) : null}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: mobile Nota tab uses currentSessionNote with empty state"
```

---

## Task 7: Unit tests

**Files:**
- Modify: `frontend/src/App.test.jsx`

Unit tests for the `currentSessionNote` shape contracts — verifying the data structures produced by `handleSendDictation` without mounting the component.

- [ ] **Step 1: Add unit tests**

Add a new `describe` block at the bottom of `frontend/src/App.test.jsx`:

```js
describe('currentSessionNote shapes', () => {
  it('loading shape has type:loading and no noteData', () => {
    const note = { type: 'loading' };
    expect(note.type).toBe('loading');
    expect(note.noteData).toBeUndefined();
  });

  it('bot shape has noteData, sessionId from noteData.session_id, and readOnly:false', () => {
    const noteData = { session_id: 'sess-42', clinical_note: { structured_note: {} } };
    const note = {
      type: 'bot',
      noteData,
      sessionId: noteData.session_id,
      readOnly: false,
    };
    expect(note.type).toBe('bot');
    expect(note.noteData).toBe(noteData);
    expect(note.sessionId).toBe('sess-42');
    expect(note.readOnly).toBe(false);
  });

  it('error shape has type:error and text with "Anomalía de conexión:" prefix', () => {
    const err = new Error('Network timeout');
    const note = { type: 'error', text: 'Anomalía de conexión: ' + err.message };
    expect(note.type).toBe('error');
    expect(note.text).toBe('Anomalía de conexión: Network timeout');
  });

  it('null represents no note generated in this session', () => {
    const note = null;
    expect(note).toBeNull();
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
cd frontend && npx vitest run src/App.test.jsx
```

Expected: all tests in `App.test.jsx` pass, including the new `currentSessionNote shapes` block.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.test.jsx
git commit -m "test: unit tests for currentSessionNote shapes"
```

---

## Task 8: Integration tests

**Files:**
- Modify: `frontend/src/App.integration.test.jsx`

- [ ] **Step 1: Add integration test describe block**

Add a new `describe` block at the bottom of `frontend/src/App.integration.test.jsx`:

```js
describe('App - Nota panel empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listConversations.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'Ana López' }
    ])
    // Patient has a confirmed SOAP session in history
    api.getPatientSessions.mockResolvedValue([
      {
        id: 's1',
        format: 'SOAP',
        session_number: 1,
        status: 'confirmed',
        raw_dictation: 'Dictado previo',
        ai_response: '**S — Sesión previa**',
        structured_note: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
        detected_patterns: [],
        alerts: [],
      }
    ])
    api.getPatientProfile.mockResolvedValue({ profile: { recurring_themes: [], risk_factors: [] } })
    api.processSession.mockResolvedValue({
      session_id: 'new-sess',
      clinical_note: {
        structured_note: { subjective: 'Nueva S', objective: 'O', assessment: 'A', plan: 'P' },
        detected_patterns: [],
        alerts: [],
        session_id: 'new-sess',
      },
      text_fallback: '**S — Nueva sesión**',
    })
  })

  it('shows empty state in Nota tab when patient with history is selected', async () => {
    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    // Switch to Nota tab (use exact:false in case tab has minor whitespace)
    const notaTab = await screen.findByRole('button', { name: /nota/i, exact: false })
    await user.click(notaTab)

    expect(await screen.findByText('Aún no hay nota generada')).toBeInTheDocument()
    expect(screen.getByText(/Dicta los puntos de la sesión/)).toBeInTheDocument()
  })

  it('shows loading state while generating note', async () => {
    // Delay the API response so we can assert on the loading state
    api.processSession.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        session_id: 'new-sess',
        clinical_note: { structured_note: {}, detected_patterns: [], alerts: [], session_id: 'new-sess' },
        text_fallback: '',
      }), 200))
    )

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    // Type in Dictar tab and click generate
    const dictarTab = await screen.findByRole('button', { name: /dictar/i })
    await user.click(dictarTab)
    const textarea = screen.getByPlaceholderText(/Dicta los puntos clave/i)
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click(screen.getByRole('button', { name: /generar nota/i }))

    // handleSendDictation auto-switches to Nota tab — loading indicator must appear
    expect(await screen.findByText(/Generando nota/i)).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay nota generada')).not.toBeInTheDocument()
  })

  it('shows note after generation completes', async () => {
    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    const dictarTab = await screen.findByRole('button', { name: /dictar/i })
    await user.click(dictarTab)
    const textarea = screen.getByPlaceholderText(/Dicta los puntos clave/i)
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click(screen.getByRole('button', { name: /generar nota/i }))

    // Wait for loading to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Generando nota/i)).not.toBeInTheDocument()
    })
    // Empty state gone, note content visible
    expect(screen.queryByText('Aún no hay nota generada')).not.toBeInTheDocument()
    // SoapNoteDocument should render (it receives structured_note with subjective: 'Nueva S')
    expect(await screen.findByText(/Nueva S/i)).toBeInTheDocument()
  })

  it('shows error state when generation fails', async () => {
    api.processSession.mockRejectedValue(new Error('Server unreachable'))

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    const dictarTab = await screen.findByRole('button', { name: /dictar/i })
    await user.click(dictarTab)
    const textarea = screen.getByPlaceholderText(/Dicta los puntos clave/i)
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click(screen.getByRole('button', { name: /generar nota/i }))

    await waitFor(() => {
      expect(screen.getByText(/Anomalía de conexión: Server unreachable/)).toBeInTheDocument()
    })
  })

  it('resets to empty state when switching to a different patient', async () => {
    api.listConversations.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'Ana López' },
      { patient_id: 'p2', patient_name: 'Carlos Ruiz' },
    ])
    api.getPatientSessions
      .mockResolvedValueOnce([
        { id: 's1', format: 'SOAP', session_number: 1, status: 'confirmed',
          raw_dictation: 'Dictado', ai_response: '**S**',
          structured_note: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
          detected_patterns: [], alerts: [] }
      ])
      .mockResolvedValueOnce([]) // p2 has no history

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())

    // Select Ana and generate a note
    const anas = await screen.findAllByText('Ana López')
    await user.click(anas[0])
    const dictarTab = await screen.findByRole('button', { name: /dictar/i })
    await user.click(dictarTab)
    const textarea = screen.getByPlaceholderText(/Dicta los puntos clave/i)
    await user.type(textarea, 'Sesión de Ana.')
    await user.click(screen.getByRole('button', { name: /generar nota/i }))
    await waitFor(() => expect(api.processSession).toHaveBeenCalled())

    // Switch to Carlos
    const carloss = await screen.findAllByText('Carlos Ruiz')
    await user.click(carloss[0])

    // Nota tab must reset to empty state
    const notaTab = await screen.findByRole('button', { name: /nota/i, exact: false })
    await user.click(notaTab)
    expect(await screen.findByText('Aún no hay nota generada')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run integration tests**

```bash
cd frontend && npx vitest run src/App.integration.test.jsx
```

Expected: all tests in the file pass, including the new `Nota panel empty state` block.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.integration.test.jsx
git commit -m "test: integration tests for Nota panel empty state behavior"
```

---

## Task 9: Run full test suite

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass. No regressions in existing suites.

- [ ] **Step 2: If any test fails, diagnose and fix before proceeding**

---

## Task 10: Final commit and PR

- [ ] **Step 1: Verify branch is clean**

```bash
git status
git log --oneline dev..HEAD
```

Expected: 7 commits on this branch (Tasks 2–8), nothing unstaged.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --base dev \
  --title "feat: Nota panel shows empty state until note is generated" \
  --body "$(cat <<'EOF'
## Summary
- Adds `currentSessionNote` state to track only the active session's note
- Adds `NOTE_EMPTY_STATE` hoisted constant (reused in desktop + mobile)
- Nota panel (desktop + mobile) shows empty state until clinician clicks \"Generar nota →\"
- Resets on patient switch — clinician always starts with a clean slate

## Test plan
- [ ] Select a patient with prior sessions → Nota tab shows empty state, not the last note
- [ ] Click \"Generar nota\" → tab auto-switches to Nota, loading indicator appears
- [ ] Wait for generation → note appears, confirm button works
- [ ] Simulate API error → error message shown in Nota tab
- [ ] Switch patients → Nota tab resets to empty state

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
