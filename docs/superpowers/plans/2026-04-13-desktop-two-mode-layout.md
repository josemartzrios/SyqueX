# Desktop Two-Mode Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un segmented control "Sesión | Revisión" al header de desktop que alterna entre el layout split actual y un nuevo modo Revisión con Historial (380px) + EvolucionPanel (flex) en pantalla completa.

**Architecture:** `desktopMode` state en `App.jsx` controla qué render path toma el área de trabajo desktop. `PatientHeader` recibe `mode`/`onModeChange` como props opcionales y renderiza el segmented control en su branch desktop. El modo Revisión reutiliza `EvolucionPanel` (ya existe) y `SoapNoteDocument compact` (ya existe) — sin componentes nuevos. El acordeón del Historial en modo Revisión usa `reviewExpandedSessionId` (estado separado) para no contaminar `expandedSessionId` del modo Sesión.

**Tech Stack:** React 18, Vitest + Testing Library, Tailwind CSS vía CDN

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `frontend/src/App.jsx` | Modify | New states (`desktopMode`, `reviewExpandedSessionId`), reset in `loadPatientChat`, new `useEffect` lazy load desktop, render condicional modo Revisión, props a PatientHeader |
| `frontend/src/components/PatientHeader.jsx` | Modify | New props `mode`/`onModeChange`, segmented control en branch desktop |
| `frontend/src/components/PatientHeader.test.jsx` | Modify | Extend con tests del segmented control |
| `frontend/src/App.test.jsx` | Modify | Tests de `desktopMode` state: reset en `loadPatientChat`, lazy load trigger |

---

## Task 1: Crear la feature branch

**Files:** ninguno

- [ ] **Step 1: Crear y posicionarse en la branch**

```bash
cd /c/Users/josma/OneDrive/Escritorio/SyqueX
git checkout dev
git pull
git checkout -b feature/desktop-two-mode-layout
```

Expected: `Switched to a new branch 'feature/desktop-two-mode-layout'`

---

## Task 2: Tests de PatientHeader — segmented control

**Files:**
- Modify: `frontend/src/components/PatientHeader.test.jsx`

Estos tests fallarán hasta que PatientHeader tenga las nuevas props. Escribirlos primero.

- [ ] **Step 1: Abrir `frontend/src/components/PatientHeader.test.jsx` y agregar al final del `describe` los siguientes tests**

```jsx
// ── Segmented control (desktop mode toggle) ──────────────
it('no renderiza segmented control si onModeChange no se pasa', () => {
  render(<PatientHeader patientName="Ana García" sessionCount={2} />)
  expect(screen.queryByRole('button', { name: /Sesión/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /Revisión/i })).toBeNull()
})

it('renderiza segmented control en desktop cuando onModeChange está presente', () => {
  render(
    <PatientHeader
      patientName="Ana García"
      sessionCount={2}
      mode="session"
      onModeChange={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: /Sesión/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Revisión/i })).toBeInTheDocument()
})

it('no renderiza segmented control en modo compact aunque onModeChange esté presente', () => {
  render(
    <PatientHeader
      patientName="Ana García"
      sessionCount={2}
      compact
      mode="session"
      onModeChange={() => {}}
    />
  )
  expect(screen.queryByRole('button', { name: /Sesión/i })).toBeNull()
})

it('llama onModeChange("review") al hacer clic en "Revisión"', async () => {
  const user = userEvent.setup()
  const onModeChange = vi.fn()
  render(
    <PatientHeader
      patientName="Ana García"
      sessionCount={2}
      mode="session"
      onModeChange={onModeChange}
    />
  )
  await user.click(screen.getByRole('button', { name: /Revisión/i }))
  expect(onModeChange).toHaveBeenCalledWith('review')
})

it('llama onModeChange("session") al hacer clic en "Sesión"', async () => {
  const user = userEvent.setup()
  const onModeChange = vi.fn()
  render(
    <PatientHeader
      patientName="Ana García"
      sessionCount={2}
      mode="review"
      onModeChange={onModeChange}
    />
  )
  await user.click(screen.getByRole('button', { name: /Sesión/i }))
  expect(onModeChange).toHaveBeenCalledWith('session')
})
```

- [ ] **Step 2: Añadir imports necesarios al inicio del test file** (si no están ya)

```js
import { vi } from 'vitest'
import userEvent from '@testing-library/user-event'
```

- [ ] **Step 3: Correr los tests nuevos para verificar que fallan**

```bash
cd frontend
npx vitest run src/components/PatientHeader.test.jsx
```

Expected: los 5 tests nuevos fallan con algo como `Cannot find role 'button'` o similar. Los tests existentes siguen pasando.

---

## Task 3: Implementar segmented control en PatientHeader

**Files:**
- Modify: `frontend/src/components/PatientHeader.jsx`

- [ ] **Step 1: Agregar las nuevas props a la firma del componente**

Abrir `frontend/src/components/PatientHeader.jsx`. Cambiar la línea 13:

```jsx
// ANTES:
export default function PatientHeader({ patientName, sessionCount = 0, compact = false }) {

// DESPUÉS:
export default function PatientHeader({ patientName, sessionCount = 0, compact = false, mode = 'session', onModeChange }) {
```

- [ ] **Step 2: Agregar el segmented control al branch desktop (línea ~43)**

En el return del branch desktop (la última función `return`, sin `compact`), añadir el control dentro del `<header>` existente. Reemplazar el `<header>` completo:

```jsx
/* Desktop header bar */
return (
  <header className="px-6 py-3.5 border-b border-black/[0.07] bg-white flex items-center gap-3 flex-shrink-0 min-h-[52px]">
    <div className="w-7 h-7 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
      {initials}
    </div>
    <span className="text-[#18181b] text-[15px] font-semibold">{patientName}</span>
    <span className="text-ink-muted text-[12px] ml-1">
      · {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}
    </span>

    {/* Segmented control — solo desktop, solo si onModeChange está presente */}
    {onModeChange && (
      <div className="ml-auto flex bg-[#f4f4f2] rounded-lg p-0.5 gap-0.5">
        <button
          onClick={() => onModeChange('session')}
          className={`px-3 py-1 rounded-md text-[12px] transition-all ${
            mode === 'session'
              ? 'bg-white shadow-sm font-medium text-[#18181b]'
              : 'text-[#9ca3af] hover:text-[#6b7280]'
          }`}
        >
          Sesión
        </button>
        <button
          onClick={() => onModeChange('review')}
          className={`px-3 py-1 rounded-md text-[12px] transition-all ${
            mode === 'review'
              ? 'bg-white shadow-sm font-medium text-[#18181b]'
              : 'text-[#9ca3af] hover:text-[#6b7280]'
          }`}
        >
          Revisión
        </button>
      </div>
    )}
  </header>
);
```

- [ ] **Step 3: Correr todos los tests de PatientHeader**

```bash
npx vitest run src/components/PatientHeader.test.jsx
```

Expected: todos los tests pasan (los anteriores + los 5 nuevos).

- [ ] **Step 4: Commit**

```bash
cd /c/Users/josma/OneDrive/Escritorio/SyqueX
git add frontend/src/components/PatientHeader.jsx frontend/src/components/PatientHeader.test.jsx
git commit -m "feat(PatientHeader): add mode segmented control for desktop two-mode layout"
```

---

## Task 4: Agregar estados a App.jsx y reset en loadPatientChat

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Agregar tests de estado en `App.test.jsx`**

En `frontend/src/App.test.jsx`, añadir tests que verifican el comportamiento de `desktopMode`. Los tests de App.jsx usan las funciones exportadas del módulo (como `toggleExpandedSession` y `markPendingNotesReadOnly`). Verificar que exportamos `loadPatientChat` — si no está exportada, testear el efecto secundario vía integración.

Añadir al final de `frontend/src/App.test.jsx`:

```js
import { toggleExpandedSession } from './App'

describe('toggleExpandedSession', () => {
  it('returns clicked id when nothing is expanded', () => {
    expect(toggleExpandedSession(null, '42')).toBe('42')
  })

  it('returns null when clicking the already-expanded session (collapse)', () => {
    expect(toggleExpandedSession('42', '42')).toBeNull()
  })

  it('returns new id when switching from one session to another', () => {
    expect(toggleExpandedSession('42', '99')).toBe('99')
  })
})
```

Nota: `toggleExpandedSession` ya está exportada en App.jsx (línea 113). Si App.test.jsx ya tiene estos tests, omitir.

- [ ] **Step 2: Correr App.test.jsx para establecer baseline**

```bash
npx vitest run src/App.test.jsx
```

Expected: todos los tests existentes pasan.

- [ ] **Step 3: Agregar los dos nuevos estados en App.jsx**

Abrir `frontend/src/App.jsx`. Localizar el bloque de estados (alrededor de línea 130). Después de la línea `const [expandedSessionId, setExpandedSessionId] = useState(null);`, agregar:

```jsx
// Desktop two-mode layout state
const [desktopMode, setDesktopMode] = useState('session'); // 'session' | 'review'
const [reviewExpandedSessionId, setReviewExpandedSessionId] = useState(null);
```

- [ ] **Step 4: Agregar reset de los nuevos estados en `loadPatientChat`**

En la función `loadPatientChat` (línea ~210), después de `setExpandedSessionId(null);`, agregar:

```jsx
setDesktopMode('session');
setReviewExpandedSessionId(null);
```

- [ ] **Step 5: Correr los tests para confirmar que no hay regresiones**

```bash
npx vitest run src/App.test.jsx
```

Expected: todos pasan.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(App): add desktopMode and reviewExpandedSessionId states with reset on patient switch"
```

---

## Task 5: Agregar useEffect lazy load para modo Revisión

**Files:**
- Modify: `frontend/src/App.jsx`

El effect se añade después del useEffect existente de mobile evolución (línea ~400).

- [ ] **Step 1: Agregar el useEffect en App.jsx**

Después del bloque:
```jsx
useEffect(() => {
  if (mobileTab === 'evolucion' && selectedPatientId) {
    ...
  }
}, [mobileTab, selectedPatientId]);
```

Agregar inmediatamente después:

```jsx
// Desktop: lazy load evolution cuando se activa modo Revisión
useEffect(() => {
  if (desktopMode === 'review' && selectedPatientId) {
    if (!evolutionMessagesRef.current.has(selectedPatientId)) {
      loadEvolutionChat(selectedPatientId);
    }
    if (!patientProfile) {
      loadPatientProfile(selectedPatientId);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [desktopMode, selectedPatientId]);
```

- [ ] **Step 2: Correr todos los tests**

```bash
npx vitest run
```

Expected: todos pasan. No hay regresiones.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(App): lazy load evolution data when desktop mode switches to review"
```

---

## Task 6: Pasar props de modo a PatientHeader en App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Localizar el render de PatientHeader en el layout desktop (~línea 553)**

```jsx
<PatientHeader
  patientName={hasActivePatient ? selectedPatientName : null}
  sessionCount={sessionHistory.filter(s => s.status === 'confirmed').length}
/>
```

Reemplazar por:

```jsx
<PatientHeader
  patientName={hasActivePatient ? selectedPatientName : null}
  sessionCount={sessionHistory.filter(s => s.status === 'confirmed').length}
  mode={desktopMode}
  onModeChange={hasActivePatient ? setDesktopMode : undefined}
/>
```

Nota: `onModeChange` solo se pasa cuando hay paciente activo — cuando no hay paciente, `onModeChange` es `undefined` y el control no aparece (guard ya en PatientHeader).

- [ ] **Step 2: Verificar que el PatientHeader en mobile NO recibe las nuevas props**

El `<PatientHeader ... compact />` dentro del layout mobile (~línea 694) no debe recibir `mode` ni `onModeChange`. Verificar que sigue siendo:

```jsx
<PatientHeader
  patientName={selectedPatientName}
  sessionCount={sessionHistory.filter(s => s.status === 'confirmed').length}
  compact
/>
```

- [ ] **Step 3: Correr suite completa de tests**

```bash
npx vitest run
```

Expected: todos pasan, sin regresiones en App.test.jsx ni App.integration.test.jsx.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(App): wire mode props to PatientHeader for desktop segmented control"
```

---

## Task 7: Implementar render del modo Revisión en App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

Este es el paso más largo. Reemplaza el contenido del area de trabajo desktop cuando `desktopMode === 'review'`.

- [ ] **Step 1: Localizar el bloque del split-view desktop (~línea 563)**

```jsx
{/* Split: Dictation (320px) | Note (flex) */}
<div className="flex-1 flex overflow-hidden min-h-0">
  ...
</div>
```

Este bloque entero (el split de dictado + nota) está dentro de:

```jsx
{!hasActivePatient ? (
  EMPTY_STATE
) : (
  /* Split: Dictation (320px) | Note (flex) */
  <div className="flex-1 flex overflow-hidden min-h-0">
```

- [ ] **Step 2: Envolver en condicional `desktopMode`**

Reemplazar:

```jsx
{!hasActivePatient ? (
  EMPTY_STATE
) : (
  /* Split: Dictation (320px) | Note (flex) */
  <div className="flex-1 flex overflow-hidden min-h-0">
    {/* ... todo el contenido actual del split ... */}
  </div>
)}
```

Por:

```jsx
{!hasActivePatient ? (
  EMPTY_STATE
) : desktopMode === 'review' ? (
  /* ── MODO REVISIÓN: Historial | Evolución ── */
  <div className="flex-1 flex overflow-hidden min-h-0">

    {/* Panel Historial — 380px */}
    <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#fafaf9]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-black/[0.07] flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          Historial de sesiones
        </span>
      </div>
      {/* Lista de sesiones */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* IMPORTANTE: iterar soapSessions (ya filtrado: format !== 'chat'), NO sessionHistory */}
        {soapSessions.length === 0 ? (
          <p className="text-ink-tertiary text-[13px] text-center mt-10">
            Sin sesiones confirmadas aún.
          </p>
        ) : (
          <div className="space-y-2">
            {soapSessions.map((s, i) => {
              const isExpanded = reviewExpandedSessionId === String(s.id);
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
                    onClick={() => {
                      if (!hasNote) return;
                      setReviewExpandedSessionId(prev =>
                        prev === String(s.id) ? null : String(s.id)
                      );
                    }}
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                      s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">
                        Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
                      </p>
                      {s.raw_dictation && (
                        <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">
                          {s.raw_dictation}
                        </p>
                      )}
                      <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${
                        s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'
                      }`}>
                        {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                      </span>
                    </div>
                    {hasNote && (
                      <svg
                        className={`w-4 h-4 mt-1 flex-shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180 text-[#5a9e8a]' : 'text-[#9ca3af]'
                        }`}
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
    </div>

    {/* Panel Evolución — flex */}
    <EvolucionPanel
      patient={{ id: selectedPatientId, name: selectedPatientName }}
      messages={evolutionMessages.get(selectedPatientId) || []}
      profile={patientProfile}
      loading={evolutionLoading}
      onSend={handleEvolutionSend}
      sending={evolutionSending}
      error={evolutionError}
    />
  </div>
) : (
  /* ── MODO SESIÓN: split Dictation | Note (sin cambios) ── */
  <div className="flex-1 flex overflow-hidden min-h-0">
    {/* ... contenido actual del split sin cambios ... */}
  </div>
)}
```

- [ ] **Step 3: Verificar que el import de EvolucionPanel ya está en App.jsx**

Al inicio del archivo buscar:
```jsx
import EvolucionPanel from './components/EvolucionPanel'
```

Si no está, agregarlo.

- [ ] **Step 4: Correr todos los tests**

```bash
npx vitest run
```

Expected: todos pasan. Prestar atención a `App.integration.test.jsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(App): implement desktop Revisión mode with Historial accordion and Evolución panel"
```

---

## Task 8: Smoke test manual

Estos pasos no son automáticos — requieren el browser.

- [ ] **Step 1: Levantar el stack local**

```bash
# Terminal 1 — Backend
cd /c/Users/josma/OneDrive/Escritorio/SyqueX
./start-backend.ps1

# Terminal 2 — Frontend
cd frontend
npm run dev
# → http://localhost:5173
```

- [ ] **Step 2: Smoke test — flujo completo**

1. Abrir `http://localhost:5173` → login con `ana@syquex.demo / demo1234`
2. Seleccionar un paciente → confirmar que el header muestra el segmented control `[Sesión] [Revisión]`
3. **Modo Sesión**: el layout split (dictado izquierda + nota derecha) funciona igual que antes — generar una nota SOAP
4. **Cambiar a Revisión**: hacer clic en "Revisión" → el layout cambia a Historial + Evolución
5. **Historial**: expandir una sesión confirmada → la nota SOAP aparece completa y legible dentro de los 380px
6. **Evolución**: enviar un mensaje → respuesta del agente aparece correctamente
7. **Cambiar de paciente**: seleccionar otro paciente → el modo regresa a "Sesión" automáticamente
8. **Volver a Revisión** con el nuevo paciente → el historial y el chat de Evolución cargan correctamente
9. **Tablet (1024px)**: reducir el browser a ~1024px de ancho → los paneles de Revisión deben ser usables con scroll vertical
10. **Mobile** (< 768px): confirmar que los 4 tabs (Dictar/Nota/Historial/Evolución) funcionan sin regresiones

- [ ] **Step 3: Confirmar que no hay regresiones en el flujo SOAP**

En modo Sesión: dictar → generar → confirmar → la sesión aparece en el historial del modo Revisión.

---

## Task 9: Correr suite completa y hacer PR

- [ ] **Step 1: Correr todos los tests**

```bash
cd frontend
npx vitest run
```

Expected: todos pasan, 0 failures.

- [ ] **Step 2: Push y crear PR hacia `dev`**

```bash
cd /c/Users/josma/OneDrive/Escritorio/SyqueX
git push -u origin feature/desktop-two-mode-layout
gh pr create \
  --base dev \
  --title "feat: desktop two-mode layout — Sesión / Revisión" \
  --body "## Summary
- Agrega segmented control 'Sesión | Revisión' en el header de desktop
- Modo Revisión: Historial (380px) + EvolucionPanel (flex) en pantalla completa
- Historial: acordeón con SOAP expandible, sin aplastar en 320px
- Evolución: reutiliza EvolucionPanel existente (sin cambios al componente)
- Mobile y flujo SOAP intactos

## Test plan
- [ ] Todos los tests de Vitest pasan (\`npx vitest run\`)
- [ ] PatientHeader: segmented control renderiza/no renderiza según props
- [ ] Smoke test completo según Task 8"
```
