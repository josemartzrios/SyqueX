# Auto-Close Unconfirmed SOAP Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user sends a new message while there is an unconfirmed SOAP note in the chat, automatically disable that note's action buttons (read-only mode) without touching the database.

**Architecture:** A single state transformation inside `handleSendDictation` in `App.jsx` — before appending the new user message, map over the existing `messages` array and set `readOnly: true` on every `type: 'bot'` message that has `noteData`. `NoteReview` already hides its CTA bar when `readOnly` is `true`, so no changes are needed in that component.

**Tech Stack:** React 18, Vitest

---

### Task 1: Add pure helper function and test

The logic that marks pending notes as read-only is pure (no side effects). Extract it as a named function so it can be tested directly without mounting the component.

**Files:**
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write the failing test**

Add this `describe` block at the bottom of `frontend/src/App.test.jsx`, after the existing `buildChatMessages` suite.

> The helper is defined inline here temporarily; Task 2 will move it to `App.jsx` and import it.

```js
// Inline temporal — se moverá a App.jsx en Task 2
function markPendingNotesReadOnly(messages) {
  return messages.map(msg =>
    msg.type === 'bot' && msg.noteData
      ? { ...msg, readOnly: true }
      : msg
  )
}

describe('markPendingNotesReadOnly', () => {
  it('pone readOnly:true en mensajes bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Dictado' },
      { role: 'assistant', type: 'bot', noteData: { clinical_note: null, text_fallback: 'S — ...' }, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0]).toEqual(messages[0])          // user msg sin cambios
    expect(result[1].readOnly).toBe(true)
  })

  it('no modifica mensajes que no son bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Hola' },
      { role: 'assistant', type: 'chat', text: 'Respuesta libre' },
      { role: 'assistant', type: 'error', text: 'Error' },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result).toEqual(messages)
  })

  it('marca múltiples notas SOAP pendientes en el mismo chat', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
      { role: 'user', text: 'Segundo dictado' },
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
    expect(result[2].readOnly).toBe(true)
  })

  it('no rompe notas ya confirmadas (readOnly:true)', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: true },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify the suite loads cleanly**

```bash
cd frontend && npm run test -- --reporter=verbose App.test.jsx
```

Expected: all `markPendingNotesReadOnly` tests pass (the helper is defined inline in the test file for now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.test.jsx
git commit -m "test: add markPendingNotesReadOnly unit tests"
```

---

### Task 2: Implement the helper in App.jsx and wire it into handleSendDictation

**Files:**
- Modify: `frontend/src/App.jsx` (add and **export** helper, call it in `handleSendDictation`)
- Modify: `frontend/src/App.test.jsx` (remove inline helper definition, import the exported helper from `../App`)

- [ ] **Step 1: Add and export the helper function to App.jsx**

In `frontend/src/App.jsx`, add this function just before the `App` component definition (search for `export default function App`):

```js
export function markPendingNotesReadOnly(messages) {
  return messages.map(msg =>
    msg.type === 'bot' && msg.noteData
      ? { ...msg, readOnly: true }
      : msg
  )
}
```

- [ ] **Step 2: Replace inline helper in App.test.jsx with import**

In `frontend/src/App.test.jsx`, remove the inline `function markPendingNotesReadOnly` definition and replace it with an import at the top of the file:

```js
import { markPendingNotesReadOnly } from '../App'
```

Run the tests again to confirm they still pass:

```bash
cd frontend && npm run test -- --reporter=verbose App.test.jsx
```

Expected: all tests pass.

- [ ] **Step 3: Call it inside handleSendDictation**

Find `handleSendDictation` in `App.jsx` (~line 258). It currently starts with:

```js
const handleSendDictation = async (dictation, format) => {
  setMessages(prev => [
    ...prev,
    { role: 'user', text: dictation },
    { role: 'assistant', type: 'loading' }
  ]);
```

Replace with:

```js
const handleSendDictation = async (dictation, format) => {
  setMessages(prev => [
    ...markPendingNotesReadOnly(prev),
    { role: 'user', text: dictation },
    { role: 'assistant', type: 'loading' }
  ]);
```

- [ ] **Step 4: Run the full test suite to verify nothing breaks**

```bash
cd frontend && npm run test -- --reporter=verbose
```

Expected: all existing tests pass, including the new `markPendingNotesReadOnly` suite.

- [ ] **Step 5: Manual smoke test**

1. Start the app (`npm run dev` in `/frontend`)
2. Select a patient, send a SOAP dictation — confirm the "Confirmar nota" button appears
3. Without confirming, type a new dictation and send
4. Verify: the previous SOAP note is still visible but its CTA bar (buttons) has disappeared
5. Confirm the new note's buttons are active

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: auto-disable unconfirmed SOAP note buttons when new message is sent"
```
