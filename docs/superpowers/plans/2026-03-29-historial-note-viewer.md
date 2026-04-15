# Historial Note Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make session items in the Historial tab expandable to show the full SOAP note inline as an accordion.

**Architecture:** Add a `compact` prop to the existing `SoapNoteDocument` component (reduces padding, hides header). Add `expandedSessionId` state to `App.jsx` with a toggle handler. Wire clickable session items in both mobile Historial tab and desktop sidebar history list to expand/collapse with the SOAP note rendered via `SoapNoteDocument`.

**Tech Stack:** React 18, Tailwind CSS (CDN), Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-29-historial-note-viewer-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/SoapNoteDocument.jsx` | Modify | Add `compact` prop — hides header, reduces padding |
| `frontend/src/components/SoapNoteDocument.test.jsx` | Modify | Add tests for `compact` behavior |
| `frontend/src/App.jsx` | Modify | Add `expandedSessionId` state, toggle handler, accordion UI in mobile Historial tab + desktop sidebar |
| `frontend/src/App.test.jsx` | Modify | Add test for toggle handler logic |

---

### Task 1: Add `compact` prop to SoapNoteDocument

**Files:**
- Modify: `frontend/src/components/SoapNoteDocument.test.jsx`
- Modify: `frontend/src/components/SoapNoteDocument.jsx`

- [ ] **Step 1: Write failing tests for compact mode**

Add these tests to the existing `describe('SoapNoteDocument')` block in `frontend/src/components/SoapNoteDocument.test.jsx`:

```jsx
// ── Compact mode ──────────────────────────
it('oculta header "Nota Clínica · SOAP" cuando compact=true', () => {
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly compact />)
  expect(screen.queryByText('Nota Clínica · SOAP')).not.toBeInTheDocument()
})

it('muestra header "Nota Clínica · SOAP" cuando compact=false (default)', () => {
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
  expect(screen.getByText('Nota Clínica · SOAP')).toBeInTheDocument()
})

it('aplica padding reducido cuando compact=true', () => {
  const { container } = render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly compact />)
  const root = container.firstChild
  expect(root.className).toContain('px-5')
  expect(root.className).toContain('py-4')
  expect(root.className).not.toContain('px-6')
  expect(root.className).not.toContain('py-6')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx`
Expected: FAIL — `compact` prop doesn't exist yet

- [ ] **Step 3: Implement compact prop in SoapNoteDocument**

In `frontend/src/components/SoapNoteDocument.jsx`:

1. Change the function signature from:
```jsx
export default function SoapNoteDocument({ noteData, onConfirm, readOnly = false })
```
to:
```jsx
export default function SoapNoteDocument({ noteData, onConfirm, readOnly = false, compact = false })
```

2. Change the root `<div>` className from:
```jsx
<div className="font-serif px-6 py-6 max-w-prose">
```
to:
```jsx
<div className={`font-serif max-w-prose ${compact ? 'px-5 py-4' : 'px-6 py-6'}`}>
```

3. Wrap the header label in a compact check — change:
```jsx
{hasStructuredNote && (
  <p className="font-sans text-[10px] font-bold tracking-[0.14em] uppercase mb-6" style={{ color: SAGE }}>
    Nota Clínica · SOAP
  </p>
)}
```
to:
```jsx
{hasStructuredNote && !compact && (
  <p className="font-sans text-[10px] font-bold tracking-[0.14em] uppercase mb-6" style={{ color: SAGE }}>
    Nota Clínica · SOAP
  </p>
)}
```

4. Change the SOAP section spacing — in the `SECTIONS.map` callback, change:
```jsx
<div key={key} className={sectionIndex > 0 ? 'mt-8' : ''}>
```
to:
```jsx
<div key={key} className={sectionIndex > 0 ? (compact ? 'mt-6' : 'mt-8') : ''}>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SoapNoteDocument.jsx frontend/src/components/SoapNoteDocument.test.jsx
git commit -m "feat(SoapNoteDocument): add compact prop for accordion context"
```

---

### Task 2: Add expandedSessionId state and toggle handler to App.jsx

**Files:**
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write test for toggle logic**

Add to `frontend/src/App.test.jsx` at the end of the file:

```jsx
describe('toggleExpandedSession', () => {
  // Mirrors the toggle logic that will live in App.jsx
  function toggleExpandedSession(currentId, clickedId) {
    return currentId === clickedId ? null : clickedId
  }

  it('expands a session when none is expanded', () => {
    expect(toggleExpandedSession(null, 'sess-5')).toBe('sess-5')
  })

  it('collapses the session when clicking the same one', () => {
    expect(toggleExpandedSession('sess-5', 'sess-5')).toBe(null)
  })

  it('switches to a different session when one is already expanded', () => {
    expect(toggleExpandedSession('sess-5', 'sess-3')).toBe('sess-3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: FAIL — `toggleExpandedSession` is not exported

- [ ] **Step 3: Add state and handler to App.jsx**

In `frontend/src/App.jsx`:

1. Add state after the `sessionHistory` state declaration (line ~116):
```jsx
const [expandedSessionId, setExpandedSessionId] = useState(null);
```

2. Add the toggle handler after `handleModalPatientCreated` (around line ~312):
```jsx
const handleToggleSession = (sessionId) => {
  setExpandedSessionId(prev => prev === sessionId ? null : sessionId);
};
```

3. Reset `expandedSessionId` when switching patients — in `loadPatientChat`, after `setSessionHistory(history)` (line ~143):
```jsx
setExpandedSessionId(null);
```

4. Export the toggle logic for testing — add before the `App` function:
```jsx
export function toggleExpandedSession(currentId, clickedId) {
  return currentId === clickedId ? null : clickedId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(App): add expandedSessionId state and toggle handler"
```

---

### Task 3: Wire accordion UI in mobile Historial tab

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~600-625, the mobile `historial` tab section)

- [ ] **Step 1: Replace static session items with clickable accordion**

Replace the mobile Historial tab block (lines ~600-625) from:

```jsx
{/* Tab: Historial */}
{mobileTab === 'historial' && (
  <div className="flex-1 overflow-y-auto px-4 py-4">
    {soapSessions.length === 0 ? (
        <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
      ) : (
        <div className="space-y-2">
          {soapSessions.map((s, i) => (
            <div key={s.id || i} className="bg-[#f4f4f2] rounded-xl px-4 py-3 flex items-start gap-3">
              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
                </p>
                {s.raw_dictation && (
                  <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
                )}
                <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'}`}>
                  {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
  </div>
)}
```

With:

```jsx
{/* Tab: Historial */}
{mobileTab === 'historial' && (
  <div className="flex-1 overflow-y-auto px-4 py-4">
    {soapSessions.length === 0 ? (
        <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
      ) : (
        <div className="space-y-2">
          {soapSessions.map((s, i) => {
            const isExpanded = expandedSessionId === String(s.id);
            const hasNote = s.status === 'confirmed' && s.structured_note;
            return (
              <div
                key={s.id || i}
                className={`rounded-xl overflow-hidden transition-all ${
                  isExpanded
                    ? 'bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25'
                    : 'bg-[#f4f4f2]'
                }`}
              >
                <div
                  className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
                  onClick={() => hasNote && handleToggleSession(String(s.id))}
                >
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">
                      Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
                    </p>
                    {s.raw_dictation && (
                      <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
                    )}
                    <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'}`}>
                      {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                    </span>
                  </div>
                  {hasNote && (
                    <svg
                      className={`w-4 h-4 mt-1 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-[#5a9e8a]' : 'text-[#9ca3af]'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </div>
                {isExpanded && hasNote && (
                  <div className="border-t border-ink/[0.06]">
                    <SoapNoteDocument
                      noteData={{
                        clinical_note: {
                          structured_note: s.structured_note,
                          detected_patterns: s.detected_patterns || [],
                          alerts: s.alerts || [],
                          session_id: String(s.id),
                        },
                        text_fallback: s.ai_response,
                      }}
                      readOnly
                      compact
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
  </div>
)}
```

- [ ] **Step 2: Manual test — mobile Historial tab**

Run: `cd frontend && npm run dev`
1. Open browser at `http://localhost:5173` with mobile viewport (DevTools → toggle device toolbar)
2. Select a patient with confirmed sessions
3. Go to Historial tab
4. Tap a confirmed session → should expand with SOAP note
5. Tap same session → should collapse
6. Tap a different session → first should collapse, second should expand
7. Verify chevron rotates and border changes on expand

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(Historial): accordion expand for mobile tab with SOAP note"
```

---

### Task 4: Wire accordion UI in desktop sidebar history list

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~446-461, the desktop sidebar history section)

- [ ] **Step 1: Replace static desktop history list with clickable accordion**

Replace the desktop history section (lines ~446-461) from:

```jsx
{/* Session history list below dictation */}
{sessionHistory.length > 0 && (
  <div className="flex-1 overflow-y-auto border-t border-black/[0.07] px-4 py-3">
    <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-2">Historial</p>
    <div className="space-y-1">
      {sessionHistory.map((s, i) => (
        <div key={s.id || i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/[0.04] transition-colors">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
          <span className="text-[12px] text-ink-secondary truncate">
            Sesión #{s.session_number || (sessionHistory.length - i)} · {formatDate(s.session_date)}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

With:

```jsx
{/* Session history list below dictation */}
{soapSessions.length > 0 && (
  <div className="flex-1 overflow-y-auto border-t border-black/[0.07] px-4 py-3">
    <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-2">Historial</p>
    <div className="space-y-1">
      {soapSessions.map((s, i) => {
        const isExpanded = expandedSessionId === String(s.id);
        const hasNote = s.status === 'confirmed' && s.structured_note;
        return (
          <div
            key={s.id || i}
            className={`rounded-lg overflow-hidden transition-all ${
              isExpanded ? 'bg-[#fafaf9] border border-[#5a9e8a]/25' : ''
            }`}
          >
            <div
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/[0.04] transition-colors cursor-pointer"
              onClick={() => hasNote && handleToggleSession(String(s.id))}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
              <span className="text-[12px] text-ink-secondary truncate flex-1">
                Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
              </span>
              {hasNote && (
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-[#5a9e8a]' : 'text-[#9ca3af]'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9l6 6 6-6" />
                </svg>
              )}
            </div>
            {isExpanded && hasNote && (
              <div className="border-t border-ink/[0.06]">
                <SoapNoteDocument
                  noteData={{
                    clinical_note: {
                      structured_note: s.structured_note,
                      detected_patterns: s.detected_patterns || [],
                      alerts: s.alerts || [],
                      session_id: String(s.id),
                    },
                    text_fallback: s.ai_response,
                  }}
                  readOnly
                  compact
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 2: Manual test — desktop sidebar**

Run: `cd frontend && npm run dev`
1. Open browser at `http://localhost:5173` (desktop width)
2. Select a patient with confirmed sessions
3. Click a session in the left sidebar history list → should expand SOAP note below the item
4. Click same → collapse
5. Click different → switches
6. Verify accordion state is shared between mobile and desktop (same `expandedSessionId`)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(Historial): accordion expand for desktop sidebar history list"
```

---

### Task 5: Run full test suite and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run production build to verify no errors**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Final manual smoke test**

1. Mobile: Dictar → Nota → Historial → expand session → collapse → switch patient → verify reset
2. Desktop: same flow in sidebar
3. Verify `SoapNoteDocument` in non-compact mode (Nota tab) still works as before

- [ ] **Step 4: Commit any remaining fixes if needed**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
