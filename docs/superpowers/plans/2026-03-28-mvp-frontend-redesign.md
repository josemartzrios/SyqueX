# MVP Frontend Redesign — Documentation-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SyqueX's chat-first frontend with a documentation-first split-view: dictation panel left, SOAP note document right, mobile 3-tab layout.

**Architecture:** Incremental replacement — App.jsx state and callbacks stay untouched; only the `return()` render layer is replaced. Four new components are created; two existing components get visual-only redesigns. Backend and `api.js` are not touched.

**Tech Stack:** React 18, Vite, Tailwind CSS (CDN), Vitest + @testing-library/react

---

## Setup

- [ ] **Create feature branch**

```bash
cd "C:/Users/josma/OneDrive/Escritorio/SyqueX"
git checkout dev
git pull
git checkout -b feature/documentation-first-ui
```

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/index.html` | Modify | Add CSS variables (design tokens), Georgia font, update Tailwind colors |
| `frontend/src/App.jsx` | Modify render only | New layout shell: desktop split-view + mobile tabs; add `showNewPatientModal` state |
| `frontend/src/components/MobileTabNav.jsx` | Modify | Change third tab from `evolucion` to `historial` |
| `frontend/src/components/PatientSidebar.jsx` | Create | Desktop persistent sidebar: patient list + "+ Nuevo paciente" button |
| `frontend/src/components/DictationPanel.jsx` | Create | Textarea + "Generar nota" button with loading/idle/error states |
| `frontend/src/components/SoapNoteDocument.jsx` | Create | Documentation-first S/O/A/P renderer with serif typography and state colors |
| `frontend/src/components/PatientHeader.jsx` | Create | Patient name + confirmed session count strip |
| `frontend/src/components/NewPatientModal.jsx` | Create | Modal: patient name input → `createPatient()` |
| `frontend/src/components/DictationPanel.test.jsx` | Create | Tests for DictationPanel |
| `frontend/src/components/SoapNoteDocument.test.jsx` | Create | Tests for SoapNoteDocument |
| `frontend/src/components/NewPatientModal.test.jsx` | Create | Tests for NewPatientModal |

**Run tests with:** `cd frontend && npx vitest run`

---

## Task 1: Design Tokens

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add CSS variables and Georgia font to index.html**

Replace the entire `<script>` tailwind config block AND the `<style>` block in `frontend/index.html` with:

```html
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            ink: {
              DEFAULT: '#18181b',
              secondary: '#52525b',
              tertiary: '#a1a1aa',
              muted: '#d4d4d8',
            },
            sage: {
              DEFAULT: '#5a9e8a',
              dark: '#4a8a78',
              light: '#edf6f3',
              50: '#f4faf8',
            },
            amber: {
              clinical: '#c4935a',
            },
            sidebar: '#f4f4f2',
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            serif: ['Georgia', '"Times New Roman"', 'serif'],
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-base: #ffffff;
      --color-sidebar: #f4f4f2;
      --color-sage: #5a9e8a;
      --color-amber: #c4935a;
      --color-ink: #18181b;
      --color-muted: #9ca3af;
    }
    body { background-color: #ffffff; color: #18181b; font-family: 'Inter', system-ui, sans-serif; overflow: hidden; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    .font-serif { font-family: Georgia, 'Times New Roman', serif; }
  </style>
```

- [ ] **Step 2: Verify dev server shows white background (not parchment)**

Run: `cd frontend && npm run dev`
Open http://localhost:5173 — background should be white (#ffffff), text dark.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add documentation-first design tokens and typography"
```

---

## Task 2: MobileTabNav — swap Evolución → Historial

**Files:**
- Modify: `frontend/src/components/MobileTabNav.jsx`

- [ ] **Step 1: Change tab list**

Replace the `tabs` array:

```js
const tabs = [
  { id: 'dictar',    label: 'Dictar' },
  { id: 'nota',      label: 'Nota' },
  { id: 'historial', label: 'Historial' },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MobileTabNav.jsx
git commit -m "feat: replace Evolución tab with Historial in mobile nav"
```

---

## Task 3: DictationPanel component

**Files:**
- Create: `frontend/src/components/DictationPanel.jsx`
- Create: `frontend/src/components/DictationPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/DictationPanel.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

const noop = () => {}

describe('DictationPanel', () => {
  it('renders textarea and submit button', () => {
    render(<DictationPanel onSend={noop} isLoading={false} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeInTheDocument()
  })

  it('submit button is disabled and textarea readOnly when isLoading=true', () => {
    render(<DictationPanel onSend={noop} isLoading={true} />)
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readOnly')
  })

  it('calls onSend with trimmed textarea value on button click', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<DictationPanel onSend={onSend} isLoading={false} />)
    await user.type(screen.getByRole('textbox'), '  Paciente llegó ansioso  ')
    await user.click(screen.getByRole('button', { name: /generar nota/i }))
    expect(onSend).toHaveBeenCalledWith('Paciente llegó ansioso')
  })

  it('does not call onSend when textarea is empty', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<DictationPanel onSend={onSend} isLoading={false} />)
    await user.click(screen.getByRole('button', { name: /generar nota/i }))
    expect(onSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```
Expected: FAIL — `DictationPanel` not found.

- [ ] **Step 3: Implement DictationPanel**

Create `frontend/src/components/DictationPanel.jsx`:

```jsx
import { useState } from 'react'

export default function DictationPanel({ onSend, isLoading }) {
  const [dictation, setDictation] = useState('')

  const handleSubmit = () => {
    const trimmed = dictation.trim()
    if (!trimmed) return
    onSend(trimmed)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date label */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Textarea */}
      <div className="flex-1 px-5 overflow-y-auto">
        <textarea
          className="w-full h-full min-h-[160px] resize-none border border-ink/[0.10] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-ink bg-white outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-colors placeholder-ink-muted"
          placeholder="Dicta los puntos clave de la sesión…"
          value={dictation}
          onChange={(e) => setDictation(e.target.value)}
          readOnly={isLoading}
        />
      </div>

      {/* Action bar */}
      <div className="px-5 py-4 border-t border-ink/[0.06] flex gap-3 flex-shrink-0">
        {/* Voice button — disabled, Fase 2 */}
        <button
          disabled
          className="px-4 py-2.5 bg-sidebar border border-ink/[0.10] rounded-xl text-[12px] font-medium text-ink-muted opacity-50 cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span className="hidden sm:inline">Próximamente</span>
        </button>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 py-2.5 bg-sage hover:bg-sage-dark disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-white rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generando…
            </>
          ) : (
            'Generar nota →'
          )}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx
git commit -m "feat: add DictationPanel component with loading states"
```

---

## Task 4: SoapNoteDocument component

**Files:**
- Create: `frontend/src/components/SoapNoteDocument.jsx`
- Create: `frontend/src/components/SoapNoteDocument.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/SoapNoteDocument.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SoapNoteDocument from './SoapNoteDocument'

vi.mock('../api', () => ({
  confirmNote: vi.fn().mockResolvedValue({ ok: true })
}))

const NOTE_DATA = {
  clinical_note: {
    structured_note: {
      subjective: 'Paciente refiere ansiedad moderada.',
      objective: 'Contacto visual adecuado.',
      assessment: 'Trastorno de ansiedad generalizada.',
      plan: 'Continuar TCC semanal.',
    },
    detected_patterns: [],
    alerts: [],
    session_id: 'sess-1',
  },
  text_fallback: null,
}

describe('SoapNoteDocument', () => {
  it('shows placeholder when noteData is null and not loading', () => {
    render(<SoapNoteDocument noteData={null} sessionId={null} isLoading={false} onConfirm={() => {}} />)
    expect(screen.getByText(/genera una nota/i)).toBeInTheDocument()
  })

  it('shows generating indicator when isLoading=true', () => {
    render(<SoapNoteDocument noteData={null} sessionId={null} isLoading={true} onConfirm={() => {}} />)
    expect(screen.getByText(/generando/i)).toBeInTheDocument()
  })

  it('renders four SOAP section labels when noteData is provided', () => {
    render(<SoapNoteDocument noteData={NOTE_DATA} sessionId="sess-1" isLoading={false} onConfirm={() => {}} />)
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getByText('O')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('renders SOAP content in the document', () => {
    render(<SoapNoteDocument noteData={NOTE_DATA} sessionId="sess-1" isLoading={false} onConfirm={() => {}} />)
    expect(screen.getByText(/ansiedad moderada/i)).toBeInTheDocument()
    expect(screen.getByText(/contacto visual/i)).toBeInTheDocument()
  })

  it('shows Confirmar button when noteData present and not readOnly', () => {
    render(<SoapNoteDocument noteData={NOTE_DATA} sessionId="sess-1" isLoading={false} onConfirm={() => {}} readOnly={false} />)
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument()
  })

  it('hides Confirmar button when readOnly=true', () => {
    render(<SoapNoteDocument noteData={NOTE_DATA} sessionId="sess-1" isLoading={false} onConfirm={() => {}} readOnly={true} />)
    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```
Expected: FAIL — `SoapNoteDocument` not found.

- [ ] **Step 3: Implement SoapNoteDocument**

> **Note on `confirmNote` body:** The existing `api.js` `confirmNote(sessionId, noteData)` sends `{ edited_note: noteData }`. However the existing `NoteReview` already calls it with a structured payload `{ format, structured_note, detected_patterns, alerts }`. The backend accepts this form — it's what the existing app uses in production. The new component replicates the same call pattern.

Create `frontend/src/components/SoapNoteDocument.jsx`:

```jsx
import { useState } from 'react'
import { confirmNote } from '../api'

// Parse text fallback into structured note if backend didn't return structured_note
function parseSoapText(text) {
  if (!text) return null
  const labels = { subjective: 'Subjetivo', objective: 'Objetivo', assessment: 'Análisis', plan: 'Plan' }
  const keys = Object.keys(labels)
  const result = {}
  keys.forEach((key, i) => {
    const label = labels[key]
    const nextLabel = i < keys.length - 1 ? labels[keys[i + 1]] : null
    const pattern = nextLabel
      ? new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${nextLabel}:)`, 'i')
      : new RegExp(`${label}:\\s*([\\s\\S]*)`, 'i')
    const match = text.match(pattern)
    if (match) {
      const value = match[1].trim()
      if (value && value.toLowerCase() !== 'no mencionado') result[key] = value
    }
  })
  return Object.keys(result).length > 0 ? { structured_note: result } : null
}

const SECTIONS = [
  { key: 'subjective',  letter: 'S', label: 'Subjetivo'  },
  { key: 'objective',   letter: 'O', label: 'Objetivo'   },
  { key: 'assessment',  letter: 'A', label: 'Análisis'   },
  { key: 'plan',        letter: 'P', label: 'Plan'        },
]

// Label color class by note state
function labelColorClass(state) {
  if (state === 'loading') return 'text-amber-clinical'
  if (state === 'done')    return 'text-sage'
  return 'text-ink-muted'   // pending
}

export default function SoapNoteDocument({ noteData, sessionId, isLoading, onConfirm, readOnly = false }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Resolve structured note
  const parsedNote = noteData && !noteData.clinical_note && noteData.text_fallback
    ? parseSoapText(noteData.text_fallback)
    : null
  const clinicalNote = noteData?.clinical_note || parsedNote
  const noteContent  = clinicalNote?.structured_note || {}
  const hasNote      = clinicalNote && Object.keys(noteContent).length > 0

  const noteState = isLoading ? 'loading' : hasNote ? 'done' : 'pending'

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const sid = noteData?.clinical_note?.session_id || sessionId
      if (!sid) return
      await confirmNote(sid, {
        format: 'SOAP',
        structured_note: noteContent,
        detected_patterns: noteData?.clinical_note?.detected_patterns || [],
        alerts: noteData?.clinical_note?.alerts || [],
      })
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        if (onConfirm) onConfirm()
      }, 2000)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Placeholder: no note yet ───────────────────────────────────────────────
  if (!isLoading && !hasNote) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-8 text-center gap-3">
        <p className="text-ink-muted text-[13px]">Genera una nota para verla aquí</p>
        <p className="text-ink-muted/60 text-[11px]">Dicta la sesión y presiona "Generar nota →"</p>
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading && !hasNote) {
    return (
      <div className="flex flex-col h-full px-6 pt-6 overflow-y-auto">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted mb-1">Nota Clínica · SOAP</p>
          <p className="text-[11px] text-amber-clinical animate-pulse">Generando nota clínica…</p>
        </div>
        {SECTIONS.map(({ letter, label }) => (
          <div key={letter} className="mb-8">
            <div className="flex items-baseline gap-3 mb-2">
              <span className={`text-[11px] font-black tracking-[0.18em] uppercase ${labelColorClass('loading')}`}>{letter}</span>
              <span className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${labelColorClass('loading')}`}>{label}</span>
            </div>
            <div className="h-4 bg-ink-muted/10 rounded animate-pulse w-3/4 mb-2" />
            <div className="h-4 bg-ink-muted/10 rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  // ── Note rendered ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-6 pt-6 overflow-y-auto">
        {/* Document header */}
        <div className="mb-6 pb-3 border-b border-ink/[0.08]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sage">Nota Clínica · SOAP</p>
          <p className="text-[11px] text-ink-muted mt-0.5">Generado por IA · revisar antes de confirmar</p>
        </div>

        {/* SOAP sections */}
        {SECTIONS.map(({ key, letter, label }) => {
          const content = noteContent[key]
          if (!content) return null
          return (
            <div key={key} className="mb-8">
              <div className="flex items-baseline gap-3 mb-2">
                <span className={`text-[11px] font-black tracking-[0.18em] uppercase ${labelColorClass(noteState)}`}>
                  {letter}
                </span>
                <span className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${labelColorClass(noteState)}`}>
                  {label}
                </span>
              </div>
              <p className="font-serif text-[15px] leading-[1.75] text-ink-secondary whitespace-pre-wrap">
                {content}
              </p>
            </div>
          )
        })}

        {/* Alerts */}
        {(noteData?.clinical_note?.alerts || []).length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200/60 rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-700 mb-2">⚠ Alertas</p>
            <ul className="list-disc pl-4 text-red-800 text-[13px] space-y-1">
              {noteData.clinical_note.alerts.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Confirm bar — only when not readOnly */}
      {!readOnly && (
        <div className="px-6 py-4 border-t border-ink/[0.08] flex items-center justify-between flex-shrink-0">
          {!saved ? (
            <>
              <span className="text-[11px] text-ink-muted tracking-[0.06em] font-semibold uppercase">Borrador</span>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="bg-sage hover:bg-sage-dark disabled:opacity-60 text-white text-[13px] font-medium rounded-xl px-5 py-2 transition-colors"
              >
                {saving ? 'Guardando…' : '✓ Confirmar y guardar'}
              </button>
            </>
          ) : (
            <span className="ml-auto text-sage text-[13px] font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Guardada ✓
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SoapNoteDocument.jsx frontend/src/components/SoapNoteDocument.test.jsx
git commit -m "feat: add SoapNoteDocument with documentation-first SOAP typography"
```

---

## Task 5: PatientSidebar + PatientHeader

**Files:**
- Create: `frontend/src/components/PatientSidebar.jsx`
- Create: `frontend/src/components/PatientHeader.jsx`

These are presentational components — no tests required beyond visual verification.

- [ ] **Step 1: Create PatientSidebar**

Create `frontend/src/components/PatientSidebar.jsx`:

```jsx
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function PatientSidebar({ conversations, selectedPatientId, onSelectPatient, onNewPatient }) {
  return (
    <aside className="hidden md:flex w-[216px] flex-col border-r border-ink/[0.08] bg-sidebar flex-shrink-0 h-full">

      {/* Logo header */}
      <div className="px-5 py-4 border-b border-ink/[0.08] flex items-center justify-between flex-shrink-0">
        <span className="font-semibold text-ink text-[15px] tracking-tight">SyqueX</span>
        <span className="text-[10px] text-ink-muted font-mono">v2</span>
      </div>

      {/* Patients label + New button */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-muted font-bold">Pacientes</span>
        <button
          onClick={onNewPatient}
          title="Nuevo paciente"
          className="w-6 h-6 flex items-center justify-center rounded-lg text-sage hover:bg-sage-light transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-ink-muted text-[12px]">Sin pacientes aún.</p>
            <p className="text-ink-muted/70 text-[11px] mt-1">Crea un paciente para comenzar.</p>
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.patient_id}
              onClick={() => onSelectPatient(conv)}
              className={`w-full text-left px-3 py-2.5 mx-0 flex items-center gap-3 transition-colors
                ${conv.patient_id === selectedPatientId
                  ? 'bg-sage-light border-r-2 border-sage'
                  : 'hover:bg-white/60'
                }`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0
                ${conv.patient_id === selectedPatientId ? 'bg-sage text-white' : 'bg-ink-muted/20 text-ink-secondary'}`}>
                {initials(conv.patient_name)}
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-medium truncate ${conv.patient_id === selectedPatientId ? 'text-ink' : 'text-ink-secondary'}`}>
                  {conv.patient_name}
                </p>
                {conv.session_date && (
                  <p className="text-[11px] text-ink-muted truncate">
                    {conv.session_number ? `Sesión #${conv.session_number} · ` : ''}{formatDate(conv.session_date)}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create PatientHeader**

Create `frontend/src/components/PatientHeader.jsx`:

```jsx
function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function PatientHeader({ name, confirmedCount }) {
  return (
    <div className="px-5 py-3 border-b border-ink/[0.08] flex items-center gap-3 bg-white flex-shrink-0">
      <div className="w-9 h-9 rounded-full bg-sage flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
        {initials(name)}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink leading-tight">{name}</p>
        <p className="text-[11px] text-ink-muted">
          {confirmedCount === 0
            ? 'Primera sesión'
            : `${confirmedCount} ${confirmedCount === 1 ? 'sesión confirmada' : 'sesiones confirmadas'}`}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PatientSidebar.jsx frontend/src/components/PatientHeader.jsx
git commit -m "feat: add PatientSidebar and PatientHeader components"
```

---

## Task 6: NewPatientModal

**Files:**
- Create: `frontend/src/components/NewPatientModal.jsx`
- Create: `frontend/src/components/NewPatientModal.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/NewPatientModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NewPatientModal from './NewPatientModal'

const mockCreatePatient = vi.fn()
vi.mock('../api', () => ({
  createPatient: (...args) => mockCreatePatient(...args)
}))

describe('NewPatientModal', () => {
  beforeEach(() => {
    mockCreatePatient.mockReset()
  })

  it('renders name input and submit button', () => {
    render(<NewPatientModal onSuccess={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NewPatientModal onSuccess={() => {}} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls createPatient with name and calls onSuccess on success', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockCreatePatient.mockResolvedValue({ id: 'p1', name: 'Ana García' })
    render(<NewPatientModal onSuccess={onSuccess} onClose={() => {}} />)
    await user.type(screen.getByRole('textbox'), 'Ana García')
    await user.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(mockCreatePatient).toHaveBeenCalledWith('Ana García')
  })

  it('shows inline error message when API fails', async () => {
    const user = userEvent.setup()
    mockCreatePatient.mockRejectedValue(new Error('Server error'))
    render(<NewPatientModal onSuccess={() => {}} onClose={() => {}} />)
    await user.type(screen.getByRole('textbox'), 'Paciente Falla')
    await user.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() => expect(screen.getByText(/no se pudo crear/i)).toBeInTheDocument())
  })

  it('does not submit when name is empty', async () => {
    const user = userEvent.setup()
    render(<NewPatientModal onSuccess={() => {}} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /crear/i }))
    expect(mockCreatePatient).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/NewPatientModal.test.jsx
```
Expected: FAIL — `NewPatientModal` not found.

- [ ] **Step 3: Implement NewPatientModal**

Create `frontend/src/components/NewPatientModal.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'
import { createPatient } from '../api'

export default function NewPatientModal({ onSuccess, onClose }) {
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const inputRef              = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const patient = await createPatient(trimmed)
      onSuccess(patient)
    } catch (err) {
      setError('No se pudo crear el paciente. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-sm w-full p-7 flex flex-col gap-5">

        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-sage font-bold mb-1">Nuevo paciente</p>
          <h2 className="text-ink text-[17px] font-semibold leading-snug">¿Cómo se llama el paciente?</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="text"
            placeholder="Nombre completo"
            className="w-full border border-ink/[0.15] rounded-xl px-4 py-2.5 text-[14px] text-ink placeholder-ink-muted outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {error && (
            <p className="text-[12px] text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-ink/[0.12] rounded-xl text-[14px] font-medium text-ink-secondary hover:bg-sidebar transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 bg-sage hover:bg-sage-dark disabled:opacity-60 text-white rounded-xl text-[14px] font-semibold transition-colors"
          >
            {saving ? 'Creando…' : 'Crear paciente'}
          </button>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/NewPatientModal.test.jsx
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NewPatientModal.jsx frontend/src/components/NewPatientModal.test.jsx
git commit -m "feat: add NewPatientModal — patient creation with inline error handling"
```

---

## Task 7: App.jsx — New Render Layer

**Files:**
- Modify: `frontend/src/App.jsx`

This is the final assembly task. Replace the entire `return()` of App function with the new layout. Keep all state and callbacks intact.

> ⚠️ Read App.jsx carefully before editing. The state/callbacks section (lines 151–315) must not be touched. Only `return(...)` at lines 317–629 is replaced.

- [ ] **Step 1: Add new imports and state to App.jsx**

At the top of App.jsx, **replace the entire imports block** (lines 1–8). The following components are intentionally dropped: `ChatInput`, `NoteReview`, `MobileHistoryChips`, `MobileEvolucion` — they are replaced by the new components below.

```jsx
import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MobileTabNav from './components/MobileTabNav.jsx'
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions } from './api'
import PatientSidebar from './components/PatientSidebar.jsx'
import PatientHeader from './components/PatientHeader.jsx'
import DictationPanel from './components/DictationPanel.jsx'
import SoapNoteDocument from './components/SoapNoteDocument.jsx'
import NewPatientModal from './components/NewPatientModal.jsx'
```

In the App() function body, after `const mobileScrollRef = useRef(null)`, add:

```jsx
const [showNewPatientModal, setShowNewPatientModal] = useState(false)
```

Add this function after `handleSavePatient`. Note: `createPatient` returns a patient object with `.id` and `.name` from the backend — use those directly.

```jsx
const handleModalSuccess = (patient) => {
  setShowNewPatientModal(false)
  fetchConversations()
  loadPatientChat(String(patient.id), patient.name)
}
```

- [ ] **Step 2: Derive activeNote from messages**

Add these computed values immediately before the `return()` statement:

```jsx
// Derive active note from messages array
const activeNoteMsg = [...messages].reverse().find(m => m.type === 'bot' && m.noteData) || null
const activeNoteData   = activeNoteMsg?.noteData   || null
const activeSessionId  = activeNoteMsg?.sessionId  || null
const activeNoteReadOnly = activeNoteMsg?.readOnly || false
const confirmedCount = sessionHistory.filter(s => s.status === 'confirmed').length
```

- [ ] **Step 3: Replace the return() with new layout**

Replace everything from `return (` to the closing `);` (lines 317–629) with:

```jsx
  return (
    <div className="h-screen bg-white font-sans flex overflow-hidden">

      {/* Desktop persistent sidebar */}
      <PatientSidebar
        conversations={conversations}
        selectedPatientId={selectedPatientId}
        onSelectPatient={handleSelectConversation}
        onNewPatient={() => setShowNewPatientModal(true)}
      />

      {/* Mobile slide-over sidebar — kept for patient switching on mobile */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Main work area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden px-4 py-3 border-b border-ink/[0.08] bg-white flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-ink-secondary hover:bg-sidebar transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-ink text-[15px] tracking-tight">SyqueX</span>
          <button
            onClick={() => setShowNewPatientModal(true)}
            className="p-2 rounded-lg text-sage hover:bg-sage-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </header>

        {/* Empty state — no patient selected */}
        {!hasActivePatient && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-sidebar border border-ink/[0.07] flex items-center justify-center">
              <svg className="w-7 h-7 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-ink-secondary text-sm font-medium">Sin expediente activo</p>
              <p className="text-ink-muted text-xs mt-1">Selecciona un paciente o crea uno nuevo</p>
            </div>
          </div>
        )}

        {/* Active patient workspace */}
        {hasActivePatient && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Patient header */}
            <PatientHeader
              name={selectedPatientName}
              confirmedCount={confirmedCount}
            />

            {/* ── DESKTOP: split-view (md+) ── */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">

              {/* Left: Dictation panel — fixed 320px */}
              <div className="w-[320px] flex-shrink-0 border-r border-ink/[0.08] flex flex-col">
                <DictationPanel
                  onSend={(dictation) => handleSendDictation(dictation, 'SOAP')}
                  isLoading={isLoading}
                />
              </div>

              {/* Right: SOAP note document — flex */}
              <div className="flex-1 flex flex-col min-w-0">
                <SoapNoteDocument
                  noteData={activeNoteData}
                  sessionId={activeSessionId}
                  isLoading={isLoading}
                  onConfirm={fetchConversations}
                  readOnly={activeNoteReadOnly}
                />
              </div>
            </div>

            {/* ── MOBILE: 3 tabs (md:hidden) ── */}
            <div className="flex flex-col flex-1 min-h-0 md:hidden">
              <MobileTabNav activeTab={mobileTab} onTabChange={setMobileTab} />

              {/* Tab: Dictar */}
              {mobileTab === 'dictar' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <DictationPanel
                    onSend={(dictation) => handleSendDictation(dictation, 'SOAP')}
                    isLoading={isLoading}
                  />
                </div>
              )}

              {/* Tab: Nota */}
              {mobileTab === 'nota' && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <SoapNoteDocument
                    noteData={activeNoteData}
                    sessionId={activeSessionId}
                    isLoading={isLoading}
                    onConfirm={fetchConversations}
                    readOnly={activeNoteReadOnly}
                  />
                </div>
              )}

              {/* Tab: Historial — inline render (SessionHistory component exists but isn't used here
                  to avoid prop-shape wrangling; it's kept for future reuse) */}
              {mobileTab === 'historial' && (
                <div ref={mobileScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {sessionHistory.filter(s => s.status === 'confirmed').length === 0 ? (
                    <p className="text-ink-muted text-[13px] text-center mt-8">Sin sesiones confirmadas aún.</p>
                  ) : (
                    sessionHistory
                      .filter(s => s.status === 'confirmed')
                      .map((s, i) => (
                        <div key={s.id || i} className="border border-ink/[0.08] rounded-xl p-4 bg-sidebar/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-[0.10em] text-sage">
                              Sesión #{s.session_number || (i + 1)}
                            </span>
                            <span className="text-[11px] text-ink-muted">
                              {s.session_date ? new Date(s.session_date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            </span>
                          </div>
                          {s.raw_dictation && (
                            <p className="text-[13px] text-ink-secondary line-clamp-3 font-serif leading-relaxed">
                              {s.raw_dictation}
                            </p>
                          )}
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New patient modal */}
      {showNewPatientModal && (
        <NewPatientModal
          onSuccess={handleModalSuccess}
          onClose={() => setShowNewPatientModal(false)}
        />
      )}
    </div>
  )
```

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npx vitest run
```
Expected: All existing tests pass (Sidebar, NoteReview, ChatInput) + new tests pass.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`, open http://localhost:5173. Verify:
- White background, Inter font in UI, sidebar visible on left (desktop)
- Patient list shows in sidebar
- Clicking a patient shows PatientHeader + split-view (desktop)
- Dictation textarea + "Generar nota" button visible
- Dictating and generating shows SOAP in right panel in serif typography
- "Confirmar y guardar" button visible on unconfirmed note
- On mobile (375px DevTools): 3 tabs visible (Dictar / Nota / Historial)
- "+ Nuevo paciente" opens modal, creates patient, adds to sidebar

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: replace App.jsx render with documentation-first split-view layout"
```

---

## Final: Run all tests + push branch

- [ ] **Run full test suite**

```bash
cd frontend && npx vitest run
```
Expected: All tests pass.

- [ ] **Push feature branch**

```bash
git push -u origin feature/documentation-first-ui
```
