# Frontend Unit Tests Design

**Date:** 2026-03-24
**Status:** Approved

## Scope

Add unit tests for the two actively used interactive components in the frontend MVP. PatientCard and SessionHistory are excluded because they are being deleted as unused components.

**Framework:** Vitest + @testing-library/react + @testing-library/user-event v14 (already configured in vite.config.js + test-setup.js)

---

## Component Props Contracts

### ChatInput
```
onSend: (text: string, format: 'chat' | 'SOAP') => void  // required
loading: boolean  // required, default false
```

### Sidebar
```
open: boolean  // required
onClose: () => void  // required
conversations: ConversationItem[]  // required
onSelectConversation: (conv: ConversationItem) => void  // required
onDeleteConversation: (id, patientId) => void  // required
```

### ConversationItem shape (for Sidebar tests)
```js
{
  id: 'session-id',
  patient_id: 'patient-id',   // MUST be unique per item in multi-item fixtures
  patient_name: 'María López',
  session_date: '2026-01-15',
  session_number: 3,
  status: 'confirmed',        // or 'draft'
  dictation_preview: 'Texto de ejemplo...',
}
```

**Important:** Sidebar uses `conv.patient_id` as the React `key` prop. All fixture arrays with multiple items must have distinct `patient_id` values or React will silently deduplicate items.

---

## Required Component Modifications

**`Sidebar.jsx`** — before writing tests, add the following attributes:
1. `data-testid="sidebar-panel"` on the sliding panel `<div>` (the `fixed left-0 top-0 h-full` div) — always in the DOM
2. `data-testid="sidebar-backdrop"` on the backdrop `<div>` (the `fixed inset-0` div inside `{open && (...)}`) — only in DOM when `open=true`
3. `aria-label="Cerrar"` on the X close button

These are the only component modifications required.

---

## Files to Create

### 1. `frontend/src/components/ChatInput.test.jsx` — 8 tests

**userEvent setup:** Use `const user = userEvent.setup()` inside each test (per-test instance).

**Pre-seeding text for loading tests:** Tests #7 and #8 require non-empty text while `loading=true`. Use `rerender`: render with `loading={false}`, type text via `user.type`, then call `rerender(<ChatInput onSend={onSend} loading={true} />)`.

| # | Test | Detail |
|---|------|--------|
| 1 | Renders textarea, "Generar nota clínica" button, and "Chat" button | `screen.getByRole('textbox')`, `screen.getByText(/Generar nota clínica/i)`, `screen.getByText('Chat')` |
| 2 | Typing text updates word count: "3 palabras" for 3 words, "1 palabra" for 1 word | `user.type(textarea, 'uno dos tres')` → `screen.getByText('3 palabras')`; second assertion with single word → `screen.getByText('1 palabra')` |
| 3 | Empty input: both buttons disabled, hint text shown | assert both buttons `disabled`; `screen.getByText('Enter para chat · Shift+Enter nueva línea')` (exact string match) |
| 4 | `Enter` (no Shift, `loading=false`) calls `onSend(text, 'chat')` and clears textarea | type text, `user.keyboard('{Enter}')`, assert `onSend` called with `[text, 'chat']`, assert textarea value `''` |
| 5 | `Shift+Enter` does NOT call `onSend` | type text, `user.keyboard('{Shift>}{Enter}{/Shift}')`, assert `onSend` not called |
| 6 | Click "Generar nota clínica" calls `onSend(text, 'SOAP')` and clears textarea | type text, `user.click(getByText(/Generar nota clínica/i))`, assert `onSend` called with `[text, 'SOAP']`, assert textarea `''` |
| 7 | `loading=true`: textarea disabled, both buttons disabled | render with `loading=false`, type text, `rerender` with `loading=true`; assert textarea `disabled`, assert both buttons `disabled` |
| 8 | `loading=true`: `Enter` does NOT call `onSend` | render with `loading=false`, type text, `rerender` with `loading=true`, `user.keyboard('{Enter}')`, assert `onSend` not called |

---

### 2. `frontend/src/components/Sidebar.test.jsx` — 9 tests

**userEvent setup:** Use `const user = userEvent.setup()` per test.

**Query strategies:**
- Sliding panel (always in DOM): `screen.getByTestId('sidebar-panel')`
- Backdrop (only when `open=true`): `screen.getByTestId('sidebar-backdrop')`
- X button: `screen.getByRole('button', { name: /cerrar/i })`
- Delete button (initial): `screen.getByTitle('Archivar sesión')`
- Delete button (after first click): re-query as `screen.getByTitle('Confirmar')`
- Conversation item: `screen.getByText('María López')` (by patient name)
- Session count badge: `screen.getByText('3 sesiones')` / `screen.getByText('1 sesión')`

**Delete tests setup:** Use a single-item `conversations` array to avoid multiple matching delete buttons.

**Multi-item fixture for tests #6 and #7:** Use 3 items with distinct `patient_id` values (e.g., `'p1'`, `'p2'`, `'p3'`).

**Call order assertion (test #7):** Vitest does not have `toHaveBeenCalledBefore`. Use `invocationCallOrder`:
```js
expect(onSelectConversation.mock.invocationCallOrder[0])
  .toBeLessThan(onClose.mock.invocationCallOrder[0])
```

| # | Test | Detail |
|---|------|--------|
| 1 | `open=false`: sidebar panel has class `-translate-x-full` | `screen.getByTestId('sidebar-panel')`, assert `classList.contains('-translate-x-full')` — do NOT query backdrop (not in DOM when `open=false`) |
| 2 | `open=true`: sidebar panel has class `translate-x-0` | `screen.getByTestId('sidebar-panel')`, assert `classList.contains('translate-x-0')` |
| 3 | Clicking backdrop calls `onClose` | render with `open=true`; `user.click(screen.getByTestId('sidebar-backdrop'))`, assert `onClose` called |
| 4 | Clicking X button calls `onClose` | `user.click(screen.getByRole('button', { name: /cerrar/i }))`, assert `onClose` called |
| 5 | Empty state: shows "Sin sesiones registradas" when `conversations=[]` | render with `conversations={[]}`, `screen.getByText(/Sin sesiones registradas/i)` |
| 6 | Count badge: "3 sesiones" for 3 items, "1 sesión" for 1 item | render with 3 distinct-`patient_id` items → `screen.getByText('3 sesiones')`; render with 1 item → `screen.getByText('1 sesión')` |
| 7 | Clicking a conversation calls `onSelectConversation` before `onClose` | `user.click(screen.getByText('María López'))`, assert both called; assert `invocationCallOrder` of `onSelectConversation[0]` < `onClose[0]` |
| 8 | First delete click: title becomes "Confirmar", `onDeleteConversation` NOT called | 1-item list; `user.click(getByTitle('Archivar sesión'))`; assert `getByTitle('Confirmar')` exists; assert `onDeleteConversation` not called |
| 9 | Second delete click: `onDeleteConversation` called | 1-item list; `user.click(getByTitle('Archivar sesión'))`; re-query `user.click(getByTitle('Confirmar'))`; assert `onDeleteConversation` called once |

**Out of scope for Sidebar:** Status-based rendering (`confirmed` badge) — visual-only, not tested.

---

## Test Patterns

- All component tests use `@testing-library/react` `render` + `screen` queries
- User interactions use `@testing-library/user-event` v14 with per-test `userEvent.setup()`
- Callbacks mocked with `vi.fn()`
- No snapshot tests — query by role/text/title/testid for resilience
- Import `vi` from `vitest` for mocks
- Call order: use `mock.invocationCallOrder[0]` comparisons (no external lib needed)

---

## Out of Scope

- `SessionHistory.test.jsx` — component deleted
- `PatientCard.test.jsx` — component deleted
- `api.js` tests — separate future task
- Timeout/timer tests for delete auto-reset (3s) — excluded per user decision
- Status-based rendering in Sidebar — visual-only, not tested
