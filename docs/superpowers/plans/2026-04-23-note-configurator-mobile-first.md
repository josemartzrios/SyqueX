# OnboardingScreen + NoteConfigurator — Mobile-First Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `OnboardingScreen` y `NoteConfigurator` para funcionar correctamente desde 300px, corrigiendo el bug de navegación que atrapa al usuario en el onboarding al elegir "Personalizar".

**Architecture:** Tres cambios estructurales: (1) App.jsx mueve el `NoteConfigurator` al bloque de onboarding para que sea alcanzable cuando `!onboardingCompleted`; (2) `OnboardingScreen` elimina "Decidir después" y convierte las cards en botones tappables; (3) `NoteConfigurator` elimina tabs mobile y reduce chrome de 192px a 92px, añadiendo acordeón inline y preview colapsable.

**Tech Stack:** React 18, Tailwind CSS (CDN), Vitest + Testing Library

---

## File Map

| Archivo | Tipo | Qué cambia |
|---------|------|-----------|
| `frontend/src/App.jsx` | Modify | Bloque onboarding: añadir `else if (showNoteConfigurator)`; eliminar `onSkip` |
| `frontend/src/components/OnboardingScreen.jsx` | Rewrite | Cards tappables, sin `onSkip`, mobile-first |
| `frontend/src/components/OnboardingScreen.test.jsx` | Rewrite | Eliminar tests `onSkip`; clicks en cards |
| `frontend/src/components/TemplateFieldEditor.jsx` | Modify | `p-4→py-2 px-3`; `text-xl→text-base` en iconos |
| `frontend/src/components/NoteConfigurator.jsx` | Rewrite | Sin tabs; chrome compacto; acordeón; ↑↓; preview inline colapsable |
| `frontend/src/components/NoteConfigurator.test.jsx` | Rewrite | Eliminar tests de tabs; añadir ↑↓, acordeón, preview collapse |

`NotePreview.jsx` — sin cambios.

---

## Task 1: Fix App.jsx — navigation bug + remove onSkip

**Files:**
- Modify: `frontend/src/App.jsx:585-610`

### Context

El bloque `if (!onboardingCompleted && template !== null)` (línea 586) termina en un `else { return <OnboardingScreen> }`. Cuando el usuario elige "Personalizar", `onSelectCustom` hace `setShowNoteConfigurator(true)` pero `onboardingCompleted` sigue en `false`, por lo que en el siguiente render el bloque early-return vuelve a ejecutarse y retorna `<OnboardingScreen>`. El `<NoteConfigurator>` en el `return (` principal nunca se alcanza.

**Fix:** Reemplazar el bloque completo de onboarding en App.jsx.

- [ ] **Step 1: Localizar y reemplazar el bloque onboarding**

Reemplazar desde `// Onboarding Screen Logic` (línea 585) hasta el cierre `}` de la condición (línea 611):

```jsx
// Onboarding Screen Logic
if (!onboardingCompleted && template !== null) {
  if (template.fields?.length > 0) {
    localStorage.setItem('syquex_onboarding_done', 'true');
    setOnboardingCompleted(true);
  } else if (showNoteConfigurator) {
    return (
      <NoteConfigurator
        initialFields={[]}
        isFirstTime={true}
        onSave={async (fields) => {
          await saveTemplate(fields);
          setTemplate({ fields });
          setNoteFormat('custom');
          localStorage.setItem('syquex_onboarding_done', 'true');
          setOnboardingCompleted(true);
          setShowNoteConfigurator(false);
        }}
        onCancel={() => {
          setShowNoteConfigurator(false);
        }}
      />
    );
  } else {
    return (
      <OnboardingScreen
        onSelectSoap={() => {
          setNoteFormat('soap');
          localStorage.setItem('syquex_onboarding_done', 'true');
          setOnboardingCompleted(true);
        }}
        onSelectCustom={() => {
          setShowNoteConfigurator(true);
        }}
      />
    );
  }
}
```

- [ ] **Step 2: Verificar que el overlay del main return sigue funcionando (edición post-onboarding)**

El `showNoteConfigurator` overlay que existe dentro del `return (` principal (línea 615) se usa cuando el usuario edita su plantilla desde "Editar plantilla" (ya con `onboardingCompleted=true`). Ese bloque debe quedar intacto — solo verifica que su `onCancel` ya no necesita marcar onboarding como done (ahora simplemente cierra):

```jsx
// En el main return (línea ~615), debe quedar así:
{showNoteConfigurator && (
  <NoteConfigurator
    initialFields={template?.fields || []}
    isFirstTime={false}
    onSave={async (fields) => {
      await saveTemplate(fields);
      setTemplate({ fields });
      setNoteFormat('custom');
      setShowNoteConfigurator(false);
    }}
    onCancel={() => {
      setShowNoteConfigurator(false);
    }}
  />
)}
```

> Nota: si el bloque existente en el main return aún referencia `isConfiguratorFirstTime`, simplifica a `isFirstTime={false}` hardcodeado — en ese punto onboarding ya está completo.

- [ ] **Step 3: Commit**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Esperado: tests existentes pasan (App.test.jsx no toca onboarding flow).

```bash
git add frontend/src/App.jsx
git commit -m "fix: navigation bug — NoteConfigurator unreachable during onboarding"
```

---

## Task 2: Update OnboardingScreen tests (write failing tests first)

**Files:**
- Rewrite: `frontend/src/components/OnboardingScreen.test.jsx`

- [ ] **Step 1: Reemplazar el archivo de tests completo**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingScreen from './OnboardingScreen';

describe('OnboardingScreen', () => {
  it('renders heading and both cards', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.getByText('¿Cómo quieres documentar tus sesiones?')).toBeInTheDocument();
    expect(screen.getByText('Formato SOAP')).toBeInTheDocument();
    expect(screen.getByText('Nota personalizada')).toBeInTheDocument();
  });

  it('does not render "Decidir después" link', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.queryByText(/Decidir después/i)).not.toBeInTheDocument();
  });

  it('does not accept onSkip prop (no "Decidir después" button)', () => {
    // Component should render without errors when onSkip is not passed
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Decidir después/i })).not.toBeInTheDocument();
  });

  it('calls onSelectSoap when SOAP card is clicked', () => {
    const handleSoap = vi.fn();
    render(<OnboardingScreen onSelectSoap={handleSoap} onSelectCustom={vi.fn()} />);
    fireEvent.click(screen.getByText('Formato SOAP'));
    expect(handleSoap).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectCustom when custom card is clicked', () => {
    const handleCustom = vi.fn();
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={handleCustom} />);
    fireEvent.click(screen.getByText('Nota personalizada'));
    expect(handleCustom).toHaveBeenCalledTimes(1);
  });

  it('renders SOAP pills (S, O, A, P)', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.getByText(/S.*Subjetivo/i)).toBeInTheDocument();
    expect(screen.getByText(/O.*Objetivo/i)).toBeInTheDocument();
    expect(screen.getByText(/A.*Análisis/i)).toBeInTheDocument();
    expect(screen.getByText(/P.*Plan/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
cd frontend && npx vitest run src/components/OnboardingScreen.test.jsx --reporter=verbose
```

Esperado: 2–3 tests fallan porque el componente actual tiene `onSkip`, botones separados y no cards tappables.

---

## Task 3: Rewrite OnboardingScreen.jsx (mobile-first tappable cards)

**Files:**
- Rewrite: `frontend/src/components/OnboardingScreen.jsx`

- [ ] **Step 1: Reemplazar el componente completo**

```jsx
export default function OnboardingScreen({ onSelectSoap, onSelectCustom }) {
  return (
    <div className="min-h-screen bg-[#f4f4f2] font-sans">
      <div className="p-4 md:p-8 flex flex-col min-h-screen">

        {/* Logo inline */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 bg-white border border-[#18181b]/[0.08] shadow-sm rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-[#5a9e8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-serif font-bold text-base text-[#18181b]">SyqueX</span>
        </div>

        <h1 className="text-[20px] md:text-[26px] font-bold text-[#18181b] leading-tight mb-1">
          ¿Cómo quieres documentar tus sesiones?
        </h1>
        <p className="text-[12px] text-[#6b7280] mb-5">
          Solo te preguntamos una vez.
        </p>

        <div className="space-y-3">
          {/* Card SOAP */}
          <div
            onClick={onSelectSoap}
            className="border border-black/[0.08] rounded-xl p-4 md:p-5 cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>📄</span>
                <h3 className="font-semibold text-[#18181b]">Formato SOAP</h3>
              </div>
              <span className="text-[10px] font-medium bg-[#f4f4f2] text-[#6b7280] px-2 py-0.5 rounded">
                Estándar ›
              </span>
            </div>
            <p className="hidden md:block text-[13px] text-[#6b7280] mt-2 mb-3">
              Estructura clásica de documentación usada en psicología y medicina. El agente organiza tu dictado en cuatro secciones automáticamente.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { letter: 'S', label: 'Subjetivo' },
                { letter: 'O', label: 'Objetivo' },
                { letter: 'A', label: 'Análisis' },
                { letter: 'P', label: 'Plan' },
              ].map(({ letter, label }) => (
                <span
                  key={letter}
                  className="text-[10px] md:text-[11px] bg-[#f4f4f2] text-[#18181b] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md font-medium"
                >
                  <span className="text-[#5a9e8a] font-bold">{letter}</span> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Card Personalizada */}
          <div
            onClick={onSelectCustom}
            className="border-2 border-[#5a9e8a] bg-[#f0f8f5]/50 rounded-xl p-4 md:p-5 cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>✏️</span>
                <h3 className="font-semibold text-[#18181b]">Nota personalizada</h3>
              </div>
              <span className="text-[10px] font-medium bg-[#5a9e8a] text-white px-2 py-0.5 rounded">
                Recomendado ›
              </span>
            </div>
            <p className="hidden md:block text-[13px] text-[#6b7280] mt-2 mb-3">
              Diseña los campos que tú ya usas en tu práctica. El agente aprende tu formato y lo llena desde el dictado.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['Motivo', 'Estado', 'Intervenciones'].map((label) => (
                <span
                  key={label}
                  className="text-[10px] md:text-[11px] bg-white border border-black/[0.06] text-[#6b7280] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md"
                >
                  {label}
                </span>
              ))}
              <span className="text-[10px] md:text-[11px] bg-[#f4f4f2] text-[#6b7280] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md">
                + campos…
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Correr tests y verificar que pasan**

```bash
cd frontend && npx vitest run src/components/OnboardingScreen.test.jsx --reporter=verbose
```

Esperado: 6/6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OnboardingScreen.jsx frontend/src/components/OnboardingScreen.test.jsx
git commit -m "feat: OnboardingScreen mobile-first — tappable cards, remove onSkip"
```

---

## Task 4: Update NoteConfigurator tests (write failing tests first)

**Files:**
- Rewrite: `frontend/src/components/NoteConfigurator.test.jsx`

- [ ] **Step 1: Reemplazar el archivo de tests completo**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NoteConfigurator from './NoteConfigurator';

describe('NoteConfigurator', () => {
  // ── Render básico ──────────────────────────────────────────────────────────

  it('renders title and empty state', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Configura tu nota')).toBeInTheDocument();
    expect(screen.getByText('Agrega secciones abajo para comenzar')).toBeInTheDocument();
  });

  it('does NOT render Diseñar / Vista previa tabs', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Diseñar')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows ✕ Cerrar button in topbar when isFirstTime=false', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={false} />);
    expect(screen.getByText('✕ Cerrar')).toBeInTheDocument();
  });

  it('does NOT show ✕ Cerrar button when isFirstTime=true', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={true} />);
    expect(screen.queryByText('✕ Cerrar')).not.toBeInTheDocument();
    expect(screen.queryByText('Saltar')).not.toBeInTheDocument();
  });

  it('shows "Guardar y entrar →" when isFirstTime=true', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={true} />);
    const saveBtn = screen.getByText('Guardar y entrar →');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });

  it('shows "Guardar cambios" when isFirstTime=false', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={false} />);
    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
  });

  // ── Añadir secciones ───────────────────────────────────────────────────────

  it('adds a section when a suggested chip is clicked', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.getByText('Motivo de consulta', { selector: 'p' })).toBeInTheDocument();
  });

  it('adds a custom section when typed and submitted via button', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Nombre personalizado…'), {
      target: { value: 'Mi Sección Custom' },
    });
    fireEvent.click(screen.getByText('+ Agregar'));
    expect(screen.getByText('Mi Sección Custom', { selector: 'p' })).toBeInTheDocument();
  });

  it('adds a custom section when Enter is pressed in input', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('Nombre personalizado…');
    fireEvent.change(input, { target: { value: 'Sección Enter' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByText('Sección Enter', { selector: 'p' })).toBeInTheDocument();
  });

  it('chip becomes unavailable after its section is added', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.queryByText('+ Motivo de consulta')).not.toBeInTheDocument();
  });

  // ── Acordeón ───────────────────────────────────────────────────────────────

  it('adding a section opens its accordion automatically', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    // TemplateFieldEditor shows field type buttons — "Texto libre" is one of them
    expect(screen.getByText('Texto libre')).toBeInTheDocument();
  });

  it('clicking the active row closes the accordion', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.getByText('Texto libre')).toBeInTheDocument();
    // Click on the label text inside the row (bubbles to row onClick)
    fireEvent.click(screen.getByText('Motivo de consulta', { selector: 'p' }));
    expect(screen.queryByText('Texto libre')).not.toBeInTheDocument();
  });

  it('opening a second section closes the first', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    // Estado de ánimo chip adds and opens accordion for Estado
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // TemplateFieldEditor label shows the active field name
    expect(screen.getByText('Tipo de campo — Estado de ánimo')).toBeInTheDocument();
    // Now click on Motivo row to switch
    fireEvent.click(screen.getByText('Motivo de consulta', { selector: 'p' }));
    expect(screen.getByText('Tipo de campo — Motivo de consulta')).toBeInTheDocument();
    expect(screen.queryByText('Tipo de campo — Estado de ánimo')).not.toBeInTheDocument();
  });

  // ── Reorden ↑↓ ────────────────────────────────────────────────────────────

  it('↑ button moves a field upward', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // Fields are [Motivo(0), Estado(1)]. Click ↑ on Estado (index 1).
    const upButtons = screen.getAllByRole('button', { name: 'Mover arriba' });
    fireEvent.click(upButtons[1]); // Estado's ↑ button
    const labels = screen.getAllByText(/Motivo de consulta|Estado de ánimo/, { selector: 'p' });
    expect(labels[0].textContent).toBe('Estado de ánimo');
    expect(labels[1].textContent).toBe('Motivo de consulta');
  });

  it('↓ button moves a field downward', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // Fields are [Motivo(0), Estado(1)]. Click ↓ on Motivo (index 0).
    const downButtons = screen.getAllByRole('button', { name: 'Mover abajo' });
    fireEvent.click(downButtons[0]); // Motivo's ↓ button
    const labels = screen.getAllByText(/Motivo de consulta|Estado de ánimo/, { selector: 'p' });
    expect(labels[0].textContent).toBe('Estado de ánimo');
    expect(labels[1].textContent).toBe('Motivo de consulta');
  });

  // ── Preview inline ─────────────────────────────────────────────────────────

  it('preview section is expanded by default (shows ∧ chevron)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('∧')).toBeInTheDocument();
  });

  it('clicking the preview header collapses the preview (∧ → ∨)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('∧'));
    expect(screen.getByText('∨')).toBeInTheDocument();
    expect(screen.queryByText('∧')).not.toBeInTheDocument();
  });

  it('clicking the preview header again expands the preview (∨ → ∧)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('∧'));
    fireEvent.click(screen.getByText('∨'));
    expect(screen.getByText('∧')).toBeInTheDocument();
  });

  // ── Cancelar / Guardar ─────────────────────────────────────────────────────

  it('calls onCancel when ← Volver is clicked', () => {
    const handleCancel = vi.fn();
    render(<NoteConfigurator onSave={vi.fn()} onCancel={handleCancel} />);
    fireEvent.click(screen.getByText('← Volver'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with correct fields when save button is clicked', async () => {
    const handleSave = vi.fn();
    render(<NoteConfigurator onSave={handleSave} onCancel={vi.fn()} isFirstTime={true} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('Guardar y entrar →'));
    expect(handleSave).toHaveBeenCalledTimes(1);
    const fields = handleSave.mock.calls[0][0];
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Motivo de consulta');
  });
});
```

- [ ] **Step 2: Correr tests y verificar que la mayoría fallan**

```bash
cd frontend && npx vitest run src/components/NoteConfigurator.test.jsx --reporter=verbose
```

Esperado: muchos tests fallan — "Agrega secciones abajo para comenzar" no existe todavía, no hay `∧`, no hay `↑`/`↓` con aria-label, etc.

---

## Task 5: Compact TemplateFieldEditor.jsx

**Files:**
- Modify: `frontend/src/components/TemplateFieldEditor.jsx`

- [ ] **Step 1: Reducir iconos de `text-xl` a `text-base`**

Reemplazar las 4 líneas de iconos:

```jsx
// Antes
const FieldIcons = {
  text: () => <span className="text-xl">📝</span>,
  scale: () => <span className="text-xl">📊</span>,
  options: () => <span className="text-xl">☑️</span>,
  date: () => <span className="text-xl">📅</span>,
};

// Después
const FieldIcons = {
  text: () => <span className="text-base">📝</span>,
  scale: () => <span className="text-base">📊</span>,
  options: () => <span className="text-base">☑️</span>,
  date: () => <span className="text-base">📅</span>,
};
```

- [ ] **Step 2: Reducir padding y fuente de los botones de tipo**

```jsx
// Antes
className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${...}`}
// label text:
<span className={`text-[12px] font-medium mt-2 ${...}`}>

// Después
className={`flex flex-col items-center justify-center py-2 px-3 rounded-xl border transition-all ${...}`}
// label text:
<span className={`text-[11px] font-medium mt-1 ${...}`}>
```

- [ ] **Step 3: Correr tests (no hay tests de TemplateFieldEditor — verificar que nada se rompe)**

```bash
cd frontend && npx vitest run --reporter=verbose
```

Esperado: ningún test nuevo falla por este cambio.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TemplateFieldEditor.jsx
git commit -m "style: TemplateFieldEditor — compact type buttons for accordion layout"
```

---

## Task 6: Rewrite NoteConfigurator.jsx

**Files:**
- Rewrite: `frontend/src/components/NoteConfigurator.jsx`

- [ ] **Step 1: Reemplazar el componente completo**

```jsx
import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TemplateFieldEditor from './TemplateFieldEditor';
import NotePreview from './NotePreview';

const SUGGESTED_SECTIONS = [
  'Motivo de consulta', 'Estado de ánimo', 'Intervenciones',
  'Acuerdos y tareas', 'Escala de malestar', 'Objetivos',
  'Riesgos', 'Observaciones', 'Recursos',
];

function emptyField(label = '', type = 'text') {
  return { id: uuidv4(), label, type, options: [], order: 0 };
}

const TYPE_ICONS = { text: '📝', scale: '📊', options: '☑️', date: '📅' };

export default function NoteConfigurator({ initialFields = [], onSave, onCancel, isFirstTime = false }) {
  const [fields, setFields] = useState(initialFields.length > 0 ? initialFields : []);
  const [activeFieldIndex, setActiveFieldIndex] = useState(initialFields.length > 0 ? 0 : -1);
  const [saving, setSaving] = useState(false);
  const [customSectionName, setCustomSectionName] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(true);

  const dragItem = useRef();
  const dragOverItem = useRef();

  const handleDragStart = (e, index) => { dragItem.current = index; };
  const handleDragEnter = (e, index) => { dragOverItem.current = index; };
  const handleDragEnd = () => {
    const copy = [...fields];
    const item = copy[dragItem.current];
    copy.splice(dragItem.current, 1);
    copy.splice(dragOverItem.current, 0, item);
    dragItem.current = null;
    dragOverItem.current = null;
    const updated = copy.map((f, i) => ({ ...f, order: i + 1 }));
    setFields(updated);
    setActiveFieldIndex(updated.indexOf(item));
  };

  const toggleAccordion = (idx) => {
    setActiveFieldIndex(prev => prev === idx ? -1 : idx);
  };

  const moveField = (e, idx, direction) => {
    e.stopPropagation();
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const copy = [...fields];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    const updated = copy.map((f, i) => ({ ...f, order: i + 1 }));
    setFields(updated);
    if (activeFieldIndex === idx) setActiveFieldIndex(newIdx);
    else if (activeFieldIndex === newIdx) setActiveFieldIndex(idx);
  };

  const addField = (label = '') => {
    const newF = emptyField(label);
    newF.order = fields.length + 1;
    const newFields = [...fields, newF];
    setFields(newFields);
    setActiveFieldIndex(newFields.length - 1);
  };

  const handleAddCustomSection = (e) => {
    e.preventDefault();
    if (customSectionName.trim()) {
      addField(customSectionName.trim());
      setCustomSectionName('');
    }
  };

  const updateActiveField = (updated) => {
    setFields(prev => prev.map((f, i) => i === activeFieldIndex ? updated : f));
  };

  const removeField = (e, idx) => {
    e.stopPropagation();
    const newFields = fields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 }));
    setFields(newFields);
    setActiveFieldIndex(prev => {
      if (prev === idx) return newFields.length > 0 ? Math.max(0, idx - 1) : -1;
      if (prev > idx) return prev - 1;
      return prev;
    });
  };

  const canSave = fields.length > 0 && fields.every(f => f.label.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  const usedLabels = new Set(fields.map(f => f.label.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col font-sans">

      {/* Topbar — h-10 mobile, h-16 desktop */}
      <div className="h-10 md:h-16 border-b border-black/[0.08] flex items-center justify-between px-4 md:px-6 bg-[#f4f4f2] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-white border border-[#18181b]/[0.08] shadow-sm rounded-xl flex items-center justify-center">
            <svg className="w-3.5 h-3.5 md:w-5 md:h-5 text-[#5a9e8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-[#18181b]">Configura tu nota</span>
        </div>
        {!isFirstTime && (
          <button
            onClick={onCancel}
            className="text-[12px] text-[#6b7280] hover:text-[#18181b] font-medium transition-colors"
          >
            ✕ Cerrar
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Panel / Single scroll column */}
        <div className="w-full md:w-[450px] flex-shrink-0 flex flex-col border-r border-black/[0.08] bg-white overflow-y-auto">
          <div className="p-4 md:p-6 space-y-6">

            {/* Section A — Lista de secciones */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] block mb-2">
                Secciones de la nota
              </label>

              {fields.length === 0 ? (
                <div className="border border-dashed border-black/20 rounded-xl p-4 text-[12px] text-center text-[#6b7280]">
                  Agrega secciones abajo para comenzar
                </div>
              ) : (
                <div className="space-y-1.5">
                  {fields.map((field, idx) => {
                    const isActive = activeFieldIndex === idx;
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnter={(e) => handleDragEnter(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`rounded-xl border transition-all ${
                          isActive
                            ? 'border-[#5a9e8a] bg-[#f0f8f5]'
                            : 'border-black/[0.06] bg-white hover:border-black/[0.15]'
                        }`}
                      >
                        {/* Row header */}
                        <div
                          className="flex items-center gap-1.5 py-2.5 px-3 cursor-pointer"
                          onClick={() => toggleAccordion(idx)}
                        >
                          <span className="text-[#9ca3af] cursor-grab select-none px-0.5">⠿</span>
                          <span className="text-sm flex-shrink-0">
                            {TYPE_ICONS[field.type] || '📝'}
                          </span>
                          <p className={`flex-1 text-[13px] font-medium truncate ${isActive ? 'text-[#5a9e8a]' : 'text-[#18181b]'}`}>
                            {field.label || 'Sección sin nombre'}
                          </p>
                          <button
                            onClick={(e) => moveField(e, idx, 'up')}
                            disabled={idx === 0}
                            aria-label="Mover arriba"
                            className="p-1.5 text-[#9ca3af] hover:text-[#18181b] disabled:opacity-30 transition-colors"
                          >
                            ↑
                          </button>
                          <button
                            onClick={(e) => moveField(e, idx, 'down')}
                            disabled={idx === fields.length - 1}
                            aria-label="Mover abajo"
                            className="p-1.5 text-[#9ca3af] hover:text-[#18181b] disabled:opacity-30 transition-colors"
                          >
                            ↓
                          </button>
                          <button
                            onClick={(e) => removeField(e, idx)}
                            aria-label="Eliminar sección"
                            className="p-1.5 rounded-md text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Accordion body */}
                        {isActive && (
                          <div className="border-t border-[#5a9e8a]/20 px-3 py-2">
                            <TemplateFieldEditor
                              field={field}
                              onChange={updateActiveField}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section B — Agregar sección */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] block mb-2">
                Agregar sección
              </label>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {SUGGESTED_SECTIONS.filter(s => !usedLabels.has(s.toLowerCase())).map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => addField(suggestion)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[#f4f4f2] text-[#18181b] hover:bg-[#eae8e5] transition-colors"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddCustomSection} className="flex gap-2">
                <input
                  type="text"
                  value={customSectionName}
                  onChange={(e) => setCustomSectionName(e.target.value)}
                  placeholder="Nombre personalizado…"
                  className="flex-1 bg-white border border-black/[0.1] rounded-xl px-3 py-2 text-[13px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20"
                />
                <button
                  type="submit"
                  disabled={!customSectionName.trim()}
                  className="px-3 py-2 rounded-xl text-[13px] font-medium bg-[#f4f4f2] text-[#18181b] hover:bg-[#eae8e5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Agregar
                </button>
              </form>
            </div>

            {/* Section C — Vista previa inline (solo mobile; desktop usa panel derecho) */}
            <div className="md:hidden">
              <button
                className="w-full flex items-center justify-between py-2 border-t border-black/[0.06]"
                onClick={() => setPreviewExpanded(prev => !prev)}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">
                  Vista previa
                </span>
                <span className="text-[#6b7280] text-sm">
                  {previewExpanded ? '∧' : '∨'}
                </span>
              </button>
              {previewExpanded && (
                <div className="mt-2">
                  <NotePreview fields={fields} activeFieldIndex={activeFieldIndex} />
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Panel — Preview desktop only */}
        <div className="hidden md:flex flex-1 bg-[#f4f4f2] p-6 lg:p-10 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full">
            <h3 className="text-[14px] font-medium text-[#6b7280] mb-4 text-center">Vista previa</h3>
            <NotePreview fields={fields} activeFieldIndex={activeFieldIndex} />
          </div>
        </div>

      </div>

      {/* Bottombar — h-[52px] mobile, h-20 desktop */}
      <div className="h-[52px] md:h-20 border-t border-black/[0.08] flex items-center justify-between px-4 md:px-6 bg-white flex-shrink-0">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#18181b] hover:bg-[#f4f4f2] transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`px-5 py-2 rounded-xl text-[13px] font-medium text-white transition-all ${
            !canSave || saving
              ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed'
              : 'bg-[#5a9e8a] hover:bg-[#4a8a78] shadow-sm'
          }`}
        >
          {saving ? 'Guardando…' : (isFirstTime ? 'Guardar y entrar →' : 'Guardar cambios')}
        </button>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Correr los tests del configurador**

```bash
cd frontend && npx vitest run src/components/NoteConfigurator.test.jsx --reporter=verbose
```

Esperado: todos los tests pasan.

- [ ] **Step 3: Correr suite completa para detectar regresiones**

```bash
cd frontend && npx vitest run --reporter=verbose
```

Esperado: todos los tests de todos los componentes pasan.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NoteConfigurator.jsx frontend/src/components/NoteConfigurator.test.jsx
git commit -m "feat: NoteConfigurator mobile-first — accordion, ↑↓ reorder, inline preview, compact chrome"
```

---

## Self-Review Checklist

### Spec coverage

| Requisito spec | Task que lo implementa |
|---------------|----------------------|
| Bug navegación `else if (showNoteConfigurator)` | Task 1 |
| Eliminar `onSkip` / "Decidir después" | Task 1, 2, 3 |
| Cards tappables OnboardingScreen | Task 3 |
| `hidden md:block` para texto descriptivo largo | Task 3 |
| Pills `text-[10px] md:text-[11px]` | Task 3 |
| Topbar `h-10 md:h-16` | Task 6 |
| Bottombar `h-[52px] md:h-20` | Task 6 |
| Sin tabs Diseñar/Vista previa | Task 6 |
| "✕ Cerrar" solo cuando `isFirstTime=false` | Task 6 |
| "← Volver" vuelve a OnboardingScreen sin completar onboarding | Task 1 (onCancel) |
| Acordeón — una sección a la vez | Task 6 |
| Botones ↑↓ con swap | Task 6 |
| Preview inline colapsable con chevron, expandida por defecto | Task 6 |
| Desktop split-panel (md+) | Task 6 |
| `TemplateFieldEditor` botones compactos | Task 5 |
| Tests OnboardingScreen actualizados | Task 2, 3 |
| Tests NoteConfigurator actualizados | Task 4, 6 |

### Notas de consistencia
- `activeFieldIndex === -1` es el estado "ningún acordeón abierto" — usado en Task 6 y referenciado en Task 4 tests.
- `aria-label="Mover arriba"` / `aria-label="Mover abajo"` en los botones ↑↓ — definidos en Task 6, usados en Task 4 tests (`getAllByRole('button', { name: 'Mover arriba' })`).
- Texto empty state exacto: `"Agrega secciones abajo para comenzar"` — en Task 4 tests y Task 6 JSX.
- Placeholder input: `"Nombre personalizado…"` — en Task 4 tests y Task 6 JSX.
- Save button text: `"Guardar y entrar →"` (sin "a SyqueX") — en Task 4 tests y Task 6 JSX.
- `"Tipo de campo — {field.label}"` es el texto del label en TemplateFieldEditor (línea 26 del archivo actual) — usado en los tests de acordeón en Task 4.
