# Edición Inline Nota Draft — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al psicólogo editar cualquier campo de la nota clínica (SOAP o personalizada) antes de confirmarla, directamente en la interfaz sin modo especial.

**Architecture:** Estado local `editedFields` en cada componente de nota se inicializa con los valores generados por la IA y se actualiza en cada blur. Los campos SOAP son divs clickeables que se convierten en textarea al activarse. Alertas y patrones son chips editables. `handleConfirm` siempre envía `editedFields` al backend. `CustomNoteDocument` pasa sus valores editados a `onConfirm(editedValues)` y App.jsx los usa para la llamada a la API.

**Tech Stack:** React 18, Vitest + @testing-library/react, jsdom

---

## File Map

| Archivo | Acción |
|---------|--------|
| `frontend/src/components/SoapNoteDocument.jsx` | Modificar — estado edición, campos SOAP, alertas, patrones |
| `frontend/src/components/SoapNoteDocument.test.jsx` | Modificar — nuevos tests + actualizar test roto |
| `frontend/src/components/CustomNoteDocument.jsx` | Modificar — estado edición, campos texto |
| `frontend/src/components/CustomNoteDocument.test.jsx` | Crear — tests para edición custom |
| `frontend/src/App.jsx` | Modificar — 2 handlers `onConfirm` de custom (desktop + mobile) |

---

## Task 1: Edición inline de campos SOAP

**Files:**
- Modify: `frontend/src/components/SoapNoteDocument.jsx`
- Modify: `frontend/src/components/SoapNoteDocument.test.jsx`

- [ ] **Step 1: Escribir tests que fallen — edición de campo SOAP**

Agregar al final de `describe('SoapNoteDocument', () => {` en `frontend/src/components/SoapNoteDocument.test.jsx`, antes del cierre `})`:

```javascript
// ── Edit behavior (draft mode) ───────────────
it('muestra hint de edición en modo draft', () => {
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)
  expect(screen.getByText('Toca cualquier campo para editar')).toBeInTheDocument()
})

it('no muestra hint de edición en modo readOnly', () => {
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={true} />)
  expect(screen.queryByText('Toca cualquier campo para editar')).not.toBeInTheDocument()
})

it('click en campo SOAP muestra textarea editable', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  await user.click(screen.getByText('Paciente refiere ansiedad laboral'))

  expect(screen.getByRole('textbox')).toBeInTheDocument()
})

it('blur en textarea guarda el valor editado', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  await user.click(screen.getByText('Paciente refiere ansiedad laboral'))
  const textarea = screen.getByRole('textbox')
  await user.clear(textarea)
  await user.type(textarea, 'Paciente llega tranquilo esta semana')
  await user.tab()

  expect(screen.getByText('Paciente llega tranquilo esta semana')).toBeInTheDocument()
})

it('confirmar envía el valor editado al backend', async () => {
  const user = userEvent.setup()
  confirmNote.mockResolvedValueOnce({})

  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} onConfirm={vi.fn()} />)

  await user.click(screen.getByText('Paciente refiere ansiedad laboral'))
  const textarea = screen.getByRole('textbox')
  await user.clear(textarea)
  await user.type(textarea, 'Texto editado')
  await user.tab()

  await user.click(screen.getByRole('button', { name: /Confirmar/i }))

  await waitFor(() => {
    expect(confirmNote).toHaveBeenCalledWith('sess-123', expect.objectContaining({
      structured_note: expect.objectContaining({ subjective: 'Texto editado' }),
    }))
  })
})

it('campo SOAP no es clickeable en modo readOnly', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={true} />)

  await user.click(screen.getByText('Paciente refiere ansiedad laboral'))

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```

Esperado: los 5 tests nuevos fallan (el componente no tiene la funcionalidad todavía).

- [ ] **Step 3: Agregar estado de edición a SoapNoteDocument**

En `frontend/src/components/SoapNoteDocument.jsx`, después de la línea `const hasStructuredNote = ...` (línea 53), agregar:

```javascript
const [editedFields, setEditedFields] = useState({
  subjective: noteContent.subjective ?? '',
  objective: noteContent.objective ?? '',
  assessment: noteContent.assessment ?? '',
  plan: noteContent.plan ?? '',
  alerts: noteData.clinical_note?.alerts ?? [],
  detected_patterns: noteData.clinical_note?.detected_patterns ?? [],
})
const [activeField, setActiveField] = useState(null)
const [newAlertInput, setNewAlertInput] = useState(false)
const [newPatternInput, setNewPatternInput] = useState(false)
```

- [ ] **Step 4: Actualizar `handleConfirm` para usar `editedFields`**

Reemplazar el cuerpo del `try` en `handleConfirm` (actualmente usa `noteContent`, `patterns`, `alerts`):

```javascript
const handleConfirm = async () => {
  setSaving(true)
  setSaveError(null)
  try {
    const sid = noteData.clinical_note?.session_id || noteData.session_id
    await confirmNote(sid, {
      format: 'SOAP',
      structured_note: {
        subjective: editedFields.subjective,
        objective: editedFields.objective,
        assessment: editedFields.assessment,
        plan: editedFields.plan,
      },
      detected_patterns: editedFields.detected_patterns,
      alerts: editedFields.alerts,
    })
    setConfirmed(true)
  } catch (err) {
    setSaveError(err.message)
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 5: Agregar hint de edición y actualizar renderizado de secciones SOAP**

En el JSX del componente, reemplazar el bloque del comentario `{/* SOAP sections */}` (líneas 104-125) completo por:

```jsx
{/* Edit hint */}
{!readOnly && !compact && (
  <p className="font-sans text-[11px] text-right mb-4" style={{ color: MUTED }}>
    Toca cualquier campo para editar
  </p>
)}

{/* SOAP sections */}
{hasStructuredNote && SECTIONS.map(({ key, label }, sectionIndex) => {
  const content = editedFields[key]
  const hasContent = !!content
  const isActive = activeField === key
  return (
    <div key={key} className={sectionIndex > 0 ? (compact ? 'mt-6' : 'mt-8') : ''}>
      <p
        className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase"
        style={{ fontVariant: 'small-caps', color: hasContent ? SAGE : MUTED }}
      >
        {label}
      </p>
      <hr className="border-0 border-t border-current mt-1 mb-3" style={{ color: hasContent ? `${SAGE}33` : `${MUTED}33` }} />
      {!readOnly && isActive ? (
        <textarea
          autoFocus
          defaultValue={content}
          className="font-serif text-[15px] leading-relaxed w-full resize-none rounded-md p-2 outline-none"
          style={{ border: `1.5px solid ${SAGE}`, background: '#fffef9', color: INK, overflow: 'hidden' }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
          onBlur={(e) => { setEditedFields(prev => ({ ...prev, [key]: e.target.value })); setActiveField(null) }}
        />
      ) : (
        <p
          className="font-serif text-[15px] leading-relaxed rounded-md p-2"
          style={{
            color: INK,
            cursor: readOnly ? 'default' : 'text',
            border: readOnly ? 'none' : '1.5px dashed #d1d5db',
          }}
          onClick={() => !readOnly && setActiveField(key)}
        >
          {content || <span style={{ color: MUTED }}>—</span>}
        </p>
      )}
    </div>
  )
})}
```

- [ ] **Step 6: Ejecutar todos los tests de SoapNoteDocument**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```

Esperado: todos los tests pasan. Si el test `'click en Confirmar llama confirmNote con session_id'` falla, verificar que `editedFields` se inicializa correctamente desde `noteContent`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SoapNoteDocument.jsx frontend/src/components/SoapNoteDocument.test.jsx
git commit -m "feat: edición inline de campos SOAP en nota draft"
```

---

## Task 2: Alertas y patrones — chips editables

**Files:**
- Modify: `frontend/src/components/SoapNoteDocument.jsx`
- Modify: `frontend/src/components/SoapNoteDocument.test.jsx`

- [ ] **Step 1: Actualizar test existente roto y escribir nuevos tests**

En `frontend/src/components/SoapNoteDocument.test.jsx`:

**1a.** Reemplazar el test `'no muestra alertas cuando array está vacío'` por dos tests:

```javascript
it('no muestra sección alertas cuando readOnly=true y array vacío', () => {
  const noteData = {
    ...STRUCTURED_NOTE_DATA,
    clinical_note: { ...STRUCTURED_NOTE_DATA.clinical_note, alerts: [] },
  }
  render(<SoapNoteDocument noteData={noteData} readOnly={true} />)
  expect(screen.queryByText('Alertas detectadas')).not.toBeInTheDocument()
})

it('muestra sección alertas en modo draft aunque esté vacía', () => {
  const noteData = {
    ...STRUCTURED_NOTE_DATA,
    clinical_note: { ...STRUCTURED_NOTE_DATA.clinical_note, alerts: [] },
  }
  render(<SoapNoteDocument noteData={noteData} readOnly={false} />)
  expect(screen.getByText('Alertas detectadas')).toBeInTheDocument()
})
```

**1b.** Agregar al bloque de edición los tests de alertas/patrones:

```javascript
// ── Edición de alertas ────────────────────
it('botón × elimina una alerta', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const removeBtn = screen.getByRole('button', { name: 'Eliminar alerta' })
  await user.click(removeBtn)

  expect(screen.queryByText('Riesgo de burnout')).not.toBeInTheDocument()
})

it('+ Agregar en alertas muestra input', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const addBtns = screen.getAllByRole('button', { name: '+ Agregar' })
  await user.click(addBtns[0]) // primer botón = alertas

  expect(screen.getByPlaceholderText('Nueva alerta…')).toBeInTheDocument()
})

it('Enter en input de alerta agrega la alerta', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const addBtns = screen.getAllByRole('button', { name: '+ Agregar' })
  await user.click(addBtns[0])
  const input = screen.getByPlaceholderText('Nueva alerta…')
  await user.type(input, 'Riesgo de recaída')
  await user.keyboard('{Enter}')

  expect(screen.getByText('Riesgo de recaída')).toBeInTheDocument()
  expect(screen.queryByPlaceholderText('Nueva alerta…')).not.toBeInTheDocument()
})

it('blur con texto vacío en input de alerta no agrega nada', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const addBtns = screen.getAllByRole('button', { name: '+ Agregar' })
  await user.click(addBtns[0])
  const input = screen.getByPlaceholderText('Nueva alerta…')
  await user.tab() // blur sin texto

  expect(screen.queryByPlaceholderText('Nueva alerta…')).not.toBeInTheDocument()
  // alerta original sigue ahí
  expect(screen.getByText('Riesgo de burnout')).toBeInTheDocument()
})

// ── Edición de patrones ───────────────────
it('botón × elimina un patrón', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const removeBtns = screen.getAllByRole('button', { name: 'Eliminar patrón' })
  await user.click(removeBtns[0])

  expect(screen.queryByText(/ansiedad recurrente/i)).not.toBeInTheDocument()
})

it('Enter en input de patrón agrega el patrón', async () => {
  const user = userEvent.setup()
  render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)

  const addBtns = screen.getAllByRole('button', { name: '+ Agregar' })
  await user.click(addBtns[1]) // segundo botón = patrones
  const input = screen.getByPlaceholderText('Nuevo patrón…')
  await user.type(input, 'evitación social')
  await user.keyboard('{Enter}')

  expect(screen.getByText('evitación social')).toBeInTheDocument()
})
```

- [ ] **Step 2: Ejecutar tests para verificar que los nuevos fallan**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```

Esperado: los tests de alertas/patrones nuevos fallan; el test `'no muestra alertas cuando array está vacío'` también falla si aún no fue reemplazado.

- [ ] **Step 3: Reemplazar renderizado de alertas en SoapNoteDocument**

Reemplazar el bloque `{/* Alerts */}` (líneas 127-137 aproximadamente) por:

```jsx
{/* Alerts */}
{(editedFields.alerts.length > 0 || !readOnly) && (
  <div className="mt-8">
    <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-red-600 mb-2">
      Alertas detectadas
    </p>
    {readOnly ? (
      <ul className="font-sans text-[14px] text-red-700 space-y-1 list-disc pl-4">
        {editedFields.alerts.map((a, i) => (
          <li key={i}>{a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>
        ))}
      </ul>
    ) : (
      <div className="flex flex-wrap gap-2 items-center">
        {editedFields.alerts.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[12px] font-sans px-3 py-1 rounded-full">
            {a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
            <button
              onClick={() => setEditedFields(prev => ({
                ...prev,
                alerts: prev.alerts.filter((_, idx) => idx !== i),
              }))}
              className="ml-1 text-red-500 hover:text-red-700 font-bold leading-none"
              aria-label="Eliminar alerta"
            >
              ×
            </button>
          </span>
        ))}
        {newAlertInput ? (
          <input
            autoFocus
            type="text"
            placeholder="Nueva alerta…"
            className="font-sans text-[12px] border border-red-300 rounded-full px-3 py-1 outline-none"
            style={{ background: '#fef2f2' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                setEditedFields(prev => ({ ...prev, alerts: [...prev.alerts, e.target.value.trim()] }))
                setNewAlertInput(false)
              } else if (e.key === 'Escape') {
                setNewAlertInput(false)
              }
            }}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                setEditedFields(prev => ({ ...prev, alerts: [...prev.alerts, e.target.value.trim()] }))
              }
              setNewAlertInput(false)
            }}
          />
        ) : (
          <button
            onClick={() => setNewAlertInput(true)}
            className="inline-flex items-center font-sans text-[12px] text-red-600 border border-dashed border-red-300 rounded-full px-3 py-1 hover:bg-red-50 transition-colors"
          >
            + Agregar
          </button>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Reemplazar renderizado de patrones en SoapNoteDocument**

Reemplazar el bloque `{/* Patterns */}` (líneas 139-149 aproximadamente) por:

```jsx
{/* Patterns */}
{(editedFields.detected_patterns.length > 0 || !readOnly) && (
  <div className="mt-6">
    <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-[#c4935a] mb-2">
      Patrones evolutivos
    </p>
    {readOnly ? (
      <ul className="font-sans text-[14px] text-[#92681e] space-y-1 list-disc pl-4">
        {editedFields.detected_patterns.map((p, i) => (
          <li key={i}>{p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>
        ))}
      </ul>
    ) : (
      <div className="flex flex-wrap gap-2 items-center">
        {editedFields.detected_patterns.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[12px] font-sans px-3 py-1 rounded-full">
            {p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
            <button
              onClick={() => setEditedFields(prev => ({
                ...prev,
                detected_patterns: prev.detected_patterns.filter((_, idx) => idx !== i),
              }))}
              className="ml-1 text-amber-500 hover:text-amber-700 font-bold leading-none"
              aria-label="Eliminar patrón"
            >
              ×
            </button>
          </span>
        ))}
        {newPatternInput ? (
          <input
            autoFocus
            type="text"
            placeholder="Nuevo patrón…"
            className="font-sans text-[12px] border border-amber-300 rounded-full px-3 py-1 outline-none"
            style={{ background: '#fffbeb' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                setEditedFields(prev => ({ ...prev, detected_patterns: [...prev.detected_patterns, e.target.value.trim()] }))
                setNewPatternInput(false)
              } else if (e.key === 'Escape') {
                setNewPatternInput(false)
              }
            }}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                setEditedFields(prev => ({ ...prev, detected_patterns: [...prev.detected_patterns, e.target.value.trim()] }))
              }
              setNewPatternInput(false)
            }}
          />
        ) : (
          <button
            onClick={() => setNewPatternInput(true)}
            className="inline-flex items-center font-sans text-[12px] text-[#c4935a] border border-dashed border-amber-300 rounded-full px-3 py-1 hover:bg-amber-50 transition-colors"
          >
            + Agregar
          </button>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Ejecutar todos los tests de SoapNoteDocument**

```bash
cd frontend && npx vitest run src/components/SoapNoteDocument.test.jsx
```

Esperado: todos los tests pasan. Si el test `'convierte snake_case en alertas a texto legible'` falla, verificar que el chip usa la misma lógica `.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SoapNoteDocument.jsx frontend/src/components/SoapNoteDocument.test.jsx
git commit -m "feat: alertas y patrones como chips editables en nota draft"
```

---

## Task 3: Edición de campos personalizados (CustomNoteDocument + App.jsx)

**Files:**
- Modify: `frontend/src/components/CustomNoteDocument.jsx`
- Create: `frontend/src/components/CustomNoteDocument.test.jsx`
- Modify: `frontend/src/App.jsx` (2 lugares: desktop ~línea 747 y mobile ~línea 1013)

- [ ] **Step 1: Crear test file con tests que fallan**

Crear `frontend/src/components/CustomNoteDocument.test.jsx`:

```javascript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CustomNoteDocument from './CustomNoteDocument'

const TEMPLATE_FIELDS = [
  { id: 'motivo', label: 'Motivo de consulta', type: 'text', order: 0 },
  { id: 'estado', label: 'Estado de ánimo', type: 'scale', order: 1 },
  { id: 'tecnicas', label: 'Técnicas aplicadas', type: 'checkbox', options: ['TCC', 'Mindfulness'], order: 2 },
]

const VALUES = {
  motivo: 'Ansiedad laboral persistente',
  estado: 7,
  tecnicas: ['TCC'],
}

describe('CustomNoteDocument', () => {
  // ── Rendering ─────────────────────────────
  it('renderiza los campos del template', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('Motivo de consulta')).toBeInTheDocument()
    expect(screen.getByText('Estado de ánimo')).toBeInTheDocument()
    expect(screen.getByText('Técnicas aplicadas')).toBeInTheDocument()
  })

  it('muestra el valor de campo texto', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('Ansiedad laboral persistente')).toBeInTheDocument()
  })

  it('muestra badge BORRADOR en modo draft', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('BORRADOR')).toBeInTheDocument()
  })

  it('no muestra badge BORRADOR en modo readOnly', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} readOnly />)
    expect(screen.queryByText('BORRADOR')).not.toBeInTheDocument()
  })

  // ── Edit behavior ─────────────────────────
  it('campo texto tiene borde dashed en modo draft', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    const textDiv = screen.getByText('Ansiedad laboral persistente')
    expect(textDiv).toHaveStyle({ cursor: 'text' })
  })

  it('click en campo texto muestra textarea', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('blur en textarea guarda el valor editado', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'Estrés laboral crónico')
    await user.tab()

    expect(screen.getByText('Estrés laboral crónico')).toBeInTheDocument()
  })

  it('confirmar llama onConfirm con los valores editados', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} onConfirm={onConfirm} />)

    // Editar el campo motivo
    await user.click(screen.getByText('Ansiedad laboral persistente'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'Estrés laboral crónico')
    await user.tab()

    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ motivo: 'Estrés laboral crónico' })
      )
    })
  })

  it('campo texto NO es clickeable en readOnly', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} readOnly />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
cd frontend && npx vitest run src/components/CustomNoteDocument.test.jsx
```

Esperado: los tests de edición fallan (el componente no tiene la funcionalidad todavía). Los tests de renderizado básico deberían pasar.

- [ ] **Step 3: Agregar estado de edición a CustomNoteDocument**

En `frontend/src/components/CustomNoteDocument.jsx`, agregar estado después de los `useState` existentes (línea 44, justo antes de `const sorted = ...`):

```javascript
const [editedValues, setEditedValues] = useState({ ...values })
const [activeField, setActiveField] = useState(null)
```

- [ ] **Step 4: Actualizar `handleConfirm` para pasar `editedValues`**

Reemplazar el `handleConfirm` actual en `CustomNoteDocument.jsx` (líneas 48-56):

```javascript
const handleConfirm = async () => {
  setSaving(true);
  try {
    await onConfirm?.(editedValues);
    setConfirmed(true);
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 5: Cambiar renderizado de campo `text` a click-to-textarea**

En `CustomNoteDocument.jsx`, reemplazar el bloque `{field.type === 'text' && (` (líneas 90-94):

```jsx
{field.type === 'text' && (
  activeField === field.id ? (
    <textarea
      autoFocus
      defaultValue={editedValues[field.id] ?? ''}
      className="font-serif text-[14px] leading-relaxed w-full resize-none rounded-md p-2 outline-none"
      style={{ border: '1.5px solid #5a9e8a', background: '#fffef9', color: '#18181b', overflow: 'hidden' }}
      ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
      onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
      onBlur={(e) => {
        setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))
        setActiveField(null)
      }}
    />
  ) : (
    <p
      className="font-serif text-[14px] leading-relaxed rounded-md p-2 whitespace-pre-wrap"
      style={{
        cursor: readOnly ? 'default' : 'text',
        border: readOnly ? 'none' : '1.5px dashed #d1d5db',
      }}
      onClick={() => !readOnly && setActiveField(field.id)}
    >
      {editedValues[field.id] || <span className="italic text-ink-tertiary">Sin información</span>}
    </p>
  )
)}
```

- [ ] **Step 6: Actualizar `onConfirm` de CustomNoteDocument en App.jsx — desktop**

En `frontend/src/App.jsx`, alrededor de la línea 747 (dentro del bloque `currentSessionNote.noteData?.format === 'custom'` del panel desktop), cambiar:

```javascript
// ANTES:
onConfirm={async () => {
  const sid = currentSessionNote.noteData.session_id;
  await confirmNote(sid, {
    format: 'custom',
    custom_fields: currentSessionNote.noteData.custom_fields,
  });
  setNewlyConfirmedSessionId(sid);
  fetchPatientSessions(selectedPatientId);
  fetchConversations();
  setDesktopMode('review');
  setCurrentSessionNote(null);
  setToast('Sesión confirmada — nota guardada en historial');
  setTimeout(() => setToast(null), 3500);
}}

// DESPUÉS:
onConfirm={async (editedValues) => {
  const sid = currentSessionNote.noteData.session_id;
  await confirmNote(sid, {
    format: 'custom',
    custom_fields: editedValues,
  });
  setNewlyConfirmedSessionId(sid);
  fetchPatientSessions(selectedPatientId);
  fetchConversations();
  setDesktopMode('review');
  setCurrentSessionNote(null);
  setToast('Sesión confirmada — nota guardada en historial');
  setTimeout(() => setToast(null), 3500);
}}
```

- [ ] **Step 7: Actualizar `onConfirm` de CustomNoteDocument en App.jsx — mobile**

En `frontend/src/App.jsx`, alrededor de la línea 1013 (dentro del bloque `mobileTab === 'nota'` y `format === 'custom'`), cambiar:

```javascript
// ANTES:
onConfirm={async () => {
  const sid = currentSessionNote.noteData.session_id;
  await confirmNote(sid, {
    format: 'custom',
    custom_fields: currentSessionNote.noteData.custom_fields,
  });
  setNewlyConfirmedSessionId(sid);
  fetchPatientSessions(selectedPatientId);
  fetchConversations();
  setCurrentSessionNote(null);
  setToast('Sesión confirmada — nota guardada en historial');
  setTimeout(() => setToast(null), 3500);
}}

// DESPUÉS:
onConfirm={async (editedValues) => {
  const sid = currentSessionNote.noteData.session_id;
  await confirmNote(sid, {
    format: 'custom',
    custom_fields: editedValues,
  });
  setNewlyConfirmedSessionId(sid);
  fetchPatientSessions(selectedPatientId);
  fetchConversations();
  setCurrentSessionNote(null);
  setToast('Sesión confirmada — nota guardada en historial');
  setTimeout(() => setToast(null), 3500);
}}
```

- [ ] **Step 8: Ejecutar todos los tests**

```bash
cd frontend && npx vitest run src/components/CustomNoteDocument.test.jsx
```

Esperado: todos los tests de CustomNoteDocument pasan.

```bash
cd frontend && npx vitest run
```

Esperado: toda la suite pasa sin errores.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/CustomNoteDocument.jsx frontend/src/components/CustomNoteDocument.test.jsx frontend/src/App.jsx
git commit -m "feat: edición inline de campos personalizados en nota draft custom"
```

---

## Verificación final

- [ ] Iniciar frontend y backend en local (`.\start-backend.ps1` y `.\start-frontend.ps1`)
- [ ] Generar una nota SOAP: verificar que los campos muestran borde dashed, click activa textarea, blur guarda, confirmar envía valores editados
- [ ] Generar una nota personalizada: verificar que campos texto son editables, confirmar guarda los valores editados
- [ ] Revisar en mobile (DevTools → modo responsive): verificar tap funciona igual
- [ ] Abrir nota confirmada en historial: verificar que es readOnly (sin borde, sin hint)
