# Note Empty State — Design Spec

**Date:** 2026-04-16  
**Branch:** `feature/note-empty-state`  
**Status:** Approved

---

## Problem

The Nota panel (desktop and mobile) derives its content from `latestNoteMsg`, which scans the full `messages[]` array. Both panels already guard against `latestNoteMsg === null` with a placeholder — but that guard never fires for patients with prior sessions, because `messages[]` is populated with historical notes by `loadPatientChat`. As a result, the Nota panel immediately shows the patient's last note even before the clinician has dictated anything in the current session.

The clinician should see a clean slate every time they open or switch to a patient.

---

## Goal

The Nota panel shows no note content until the clinician explicitly clicks "Generar nota →" in the current session. Before that action, it shows a clear empty state. After that action, it shows the loading indicator, then the result (or error).

---

## Approach: Dedicated `currentSessionNote` state

Add a new state variable `currentSessionNote` that models only the note for the **active dictation session**, independent of message history.

### State definition

```js
const [currentSessionNote, setCurrentSessionNote] = useState(null);
```

`null` means "no note has been generated in this session."

### Reset triggers

Reset to `null` anywhere `loadPatientChat` is called — which covers all three call sites:

- `handleSelectConversation` — clinician switches to an existing patient
- `handleSavePatient` — clinician creates a new patient from the sidebar
- `handleModalPatientCreated` — clinician creates a patient from the modal

In practice, add `setCurrentSessionNote(null)` at the top of `loadPatientChat`.

### Update triggers (inside `handleSendDictation`)

| Moment | Value set |
|--------|-----------|
| User clicks "Generar nota" | `{ type: 'loading' }` |
| API returns successfully (SOAP) | `{ type: 'bot', noteData, sessionId: noteData.session_id, readOnly: false }` |
| API returns error | `{ type: 'error', text: 'Anomalía de conexión: ' + err.message }` |

Note on `readOnly: false`: `SoapNoteDocument` uses `readOnly` to show/hide the confirm button. Setting it to `false` here is intentional — a freshly generated note must be confirmable. This differs from `messages[]` where `readOnly` is added later by `markPendingNotesReadOnly`; for `currentSessionNote` it is set explicitly at creation time.

### Panel rendering logic

Both the desktop right panel and the mobile "Nota" tab replace their `latestNoteMsg` reference with `currentSessionNote`:

```
currentSessionNote === null           → empty state
currentSessionNote.type === 'loading' → loading indicator
currentSessionNote.type === 'error'   → error message
currentSessionNote.type === 'bot'     → SoapNoteDocument
```

`latestNoteMsg` is preserved as-is (not removed), since it may have other uses in the codebase.

---

## Empty State UI

Displayed when `currentSessionNote === null`.

**Desktop:** The current desktop Nota panel empty state (lines 598–618 of App.jsx) renders a custom SVG + gray skeleton bars. **Replace it entirely** with the new empty state described below.

**Mobile:** The current mobile Nota tab already shows a plain-text placeholder (`text-ink-tertiary text-[14px] text-center mt-10`). Replace it with the new empty state as well.

**New empty state structure** — uses the same icon+container pattern as the `EMPTY_STATE` constant (lines 26–37 of App.jsx), with note-specific copy:

- Wrapper: `flex flex-col items-center justify-center gap-4 text-center px-8 h-full`
- Icon container: `w-14 h-14 rounded-2xl bg-parchment-dark border border-ink/[0.07] flex items-center justify-center`  
  (`bg-parchment-dark` is a custom Tailwind token already used in the project — verify it resolves before use)
- Document SVG: `w-7 h-7 text-ink-muted`, same path as the document icon in `EMPTY_STATE`
- Primary text: **"Aún no hay nota generada"** — `text-ink-secondary text-sm font-medium`
- Secondary text: **"Dicta los puntos de la sesión y presiona «Generar nota →»"** — `text-ink-tertiary text-xs mt-1`

No borders, cards, or shadows on the text container.

---

## Mobile behavior preserved

When `handleSendDictation` is called with `format === 'SOAP'`, the app already does `setMobileTab('nota')`. This behavior is unchanged — the user is taken to the Nota tab where they see the loading state immediately.

---

## Race condition: switching patients mid-generation

If the clinician switches patient while an API call is in flight, `loadPatientChat` resets `currentSessionNote` to `null` — the UI is immediately correct. However, when the in-flight `processSession` promise resolves, it will call `setCurrentSessionNote` with a stale result.

**Decision: out of scope for this change.** The impact is low (the clinician switched away intentionally), and the correct fix (AbortController or patient-ID snapshot guard) adds complexity beyond the scope of this UI-only change. Deferred to a future hardening pass.

---

## Files affected

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Add `currentSessionNote` state; reset in `loadPatientChat`; update in `handleSendDictation`; replace `latestNoteMsg` in desktop and mobile Nota panels |

No other files need changes.

---

## Out of scope

- Persisting `currentSessionNote` across page reloads
- Showing historical notes in the Nota panel (that is the Historial tab's job)
- Any changes to the Historial tab
- Race condition guard for mid-generation patient switch (deferred)
