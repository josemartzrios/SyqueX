# Onboarding Post-Login + Rediseño Configurador de Nota Personalizada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo reactivo de configuración de nota (modal post-dictado + PDF upload) con un onboarding post-login de pantalla completa, un configurador visual con preview en vivo, y un pill toggle en el panel de dictado.

**Architecture:** Tres componentes nuevos (`OnboardingScreen`, `NoteConfigurator`, `NotePreview`) + actualización de `DictationPanel` y `App.jsx`. El estado de onboarding y formato de nota se persiste en `localStorage`. Sin cambios en backend — reutiliza los endpoints `getTemplate`/`saveTemplate` existentes.

**Tech Stack:** React 18, Vite, Tailwind CSS (CDN), `uuid` (ya instalado), `@testing-library/react` + Vitest para tests.

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear | `frontend/src/components/NotePreview.jsx` | Preview estática en vivo de los campos del template |
| Crear | `frontend/src/components/NoteConfigurator.jsx` | Split panel: lista de secciones + NotePreview. Usado tanto en onboarding como en edición overlay |
| Crear | `frontend/src/components/OnboardingScreen.jsx` | Pantalla completa post-login: tarjetas SOAP vs Personalizada |
| Crear | `frontend/src/components/NotePreview.test.jsx` | Tests de NotePreview |
| Crear | `frontend/src/components/NoteConfigurator.test.jsx` | Tests de NoteConfigurator |
| Crear | `frontend/src/components/OnboardingScreen.test.jsx` | Tests de OnboardingScreen |
| Modificar | `frontend/src/components/TemplateFieldEditor.jsx` | Quitar `guiding_question`; selector de tipo con iconos 2×2 |
| Modificar | `frontend/src/components/DictationPanel.jsx` | Añadir pill toggle SOAP/Personalizada + link "Editar plantilla" |
| Modificar | `frontend/src/components/DictationPanel.test.jsx` | Añadir tests para el toggle |
| Modificar | `frontend/src/App.jsx` | Lógica de onboarding, noteFormat state, overlay del configurador, eliminar trigger reactivo |
| Modificar | `frontend/src/api.js` | Eliminar `analyzePdf` |
| Eliminar | `frontend/src/components/TemplateSetupModal.jsx` | Reemplazado por OnboardingScreen + NoteConfigurator |
| Eliminar | `frontend/src/components/TemplatePdfUpload.jsx` | PDF upload eliminado completamente |
| Eliminar | `frontend/src/components/TemplateWizard.jsx` | Reemplazado por NoteConfigurator |

---

## Task 1: NotePreview — componente de preview en vivo

**Files:**
- Create: `frontend/src/components/NotePreview.jsx`
- Create: `frontend/src/components/NotePreview.test.jsx`

---

- [ ] **Step 1.1: Crear NotePreview.jsx**

```jsx
// frontend/src/components/NotePreview.jsx

function FieldPlaceholder({ type, isActive }) {
  const barCls = `rounded h-2 ${isActive ? 'bg-[#f5e8d8]' : 'bg-[#f0f0ee]'}`;
  if (type === 'text') return (
    <div className="space-y-1.5">
      <div className={`${barCls} w-full`} />
      <div className={`${barCls} w-3/4`} />
    </div>
  );
  if (type === 'scale') return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-semibold font-sans ${
            isActive ? 'bg-[#f5e8d8] text-[#c4935a]' : 'bg-[#f0f0ee] text-[#9ca3af]'
          }`}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
  if (type === 'checkbox') return (
    <div className="space-y-1.5">
      {['Opción A', 'Opción B', 'Opción C'].map((o) => (
        <div key={o} className="flex items-center gap-2">
          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 ${isActive ? 'border-[#c4935a]' : 'border-[#d1d5db]'}`} />
          <span className={`text-[12px] font-sans ${isActive ? 'text-[#c4935a]' : 'text-[#9ca3af]'}`}>{o}</span>
        </div>
      ))}
    </div>
  );
  if (type === 'date') return (
    <span className={`text-[12px] font-sans ${isActive ? 'text-[#c4935a]' : 'text-[#9ca3af]'}`}>
      dd/mm/aaaa
    </span>
  );
  // list type fallback
  return <div className={`${barCls} w-1/2`} />;
}

export default function NotePreview({ fields = [], activeFieldId = null }) {
  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] p-5">
      <p className="font-sans text-[10px] text-[#9ca3af] uppercase tracking-[0.10em] mb-4">
        {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {sorted.length === 0 && (
        <p className="text-[12px] text-[#9ca3af] italic font-sans">
          Agrega secciones para ver la vista previa…
        </p>
      )}
      {sorted.map((field) => {
        const isActive = field.id === activeFieldId;
        return (
          <div key={field.id} className="mb-5">
            <p className={`font-sans text-[10px] uppercase tracking-[0.12em] font-bold mb-2 ${
              isActive ? 'text-[#c4935a]' : 'text-[#5a9e8a]'
            }`}>
              {field.label || 'Sin nombre'}
            </p>
            <FieldPlaceholder type={field.type} isActive={isActive} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 1.2: Escribir tests de NotePreview**

```jsx
// frontend/src/components/NotePreview.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NotePreview from './NotePreview';

const field = (overrides = {}) => ({
  id: 'f1', label: 'Motivo de consulta', type: 'text', order: 1, ...overrides,
});

describe('NotePreview', () => {
  it('shows empty state when no fields', () => {
    render(<NotePreview fields={[]} />);
    expect(screen.getByText(/Agrega secciones/)).toBeInTheDocument();
  });

  it('renders field label', () => {
    render(<NotePreview fields={[field()]} />);
    expect(screen.getByText('Motivo de consulta')).toBeInTheDocument();
  });

  it('renders 10 scale dots for scale type', () => {
    render(<NotePreview fields={[field({ type: 'scale' })]} />);
    // scale renders 1-10 numbers
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('highlights active field label in amber class', () => {
    render(<NotePreview fields={[field()]} activeFieldId="f1" />);
    const label = screen.getByText('Motivo de consulta');
    expect(label.className).toContain('c4935a'); // amber color
  });

  it('non-active field label uses sage class', () => {
    render(<NotePreview fields={[field()]} activeFieldId="other-id" />);
    const label = screen.getByText('Motivo de consulta');
    expect(label.className).toContain('5a9e8a'); // sage color
  });

  it('renders checkbox options placeholder', () => {
    render(<NotePreview fields={[field({ type: 'checkbox' })]} />);
    expect(screen.getByText('Opción A')).toBeInTheDocument();
  });

  it('renders date placeholder text', () => {
    render(<NotePreview fields={[field({ type: 'date' })]} />);
    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.3: Ejecutar tests y verificar que pasan**

```bash
cd frontend && npx vitest run src/components/NotePreview.test.jsx
```

Esperado: 7 tests PASS.

- [ ] **Step 1.4: Commit**

```bash
git add frontend/src/components/NotePreview.jsx frontend/src/components/NotePreview.test.jsx
git commit -m "feat: add NotePreview — live template preview component"
```

---

## Task 2: Actualizar TemplateFieldEditor — quitar guiding_question, iconos 2×2

**Files:**
- Modify: `frontend/src/components/TemplateFieldEditor.jsx`

---

- [ ] **Step 2.1: Reescribir TemplateFieldEditor.jsx**

Reemplaza el contenido completo del archivo:

```jsx
// frontend/src/components/TemplateFieldEditor.jsx

const FIELD_TYPES = [
  { value: 'text',     label: 'Texto',   icon: '📝' },
  { value: 'scale',    label: 'Escala',  icon: '📊' },
  { value: 'checkbox', label: 'Opciones', icon: '☑️' },
  { value: 'date',     label: 'Fecha',   icon: '📅' },
];

export default function TemplateFieldEditor({ field, onChange, onDelete }) {
  const needsOptions = field.type === 'checkbox';

  const updateOptions = (e) => {
    const options = e.target.value.split('\n').filter(Boolean);
    onChange({ ...field, options });
  };

  return (
    <div className="bg-[#f9f9f8] rounded-xl p-3 border border-ink/[0.07]">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ca3af] mb-2">
        Tipo de campo — {field.label || 'sin nombre'}
      </p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {FIELD_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange({ ...field, type: t.value, options: field.options })}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[10.5px] font-medium transition-all ${
              field.type === t.value
                ? 'border-[#5a9e8a] bg-[#f0f8f5] text-[#3d7a65]'
                : 'border-ink/[0.09] bg-white text-[#6b7280] hover:border-ink/20'
            }`}
          >
            <span className="text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {needsOptions && (
        <div>
          <p className="text-[10px] text-[#9ca3af] mb-1">Opciones (una por línea)</p>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={updateOptions}
            placeholder={"Opción A\nOpción B\nOpción C"}
            rows={3}
            className="w-full bg-white border border-ink/[0.09] rounded-lg px-3 py-2 text-[13px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2.2: Verificar que los tests existentes del proyecto siguen pasando**

```bash
cd frontend && npx vitest run
```

Esperado: todos los tests existentes PASS (TemplateFieldEditor no tiene tests propios actualmente).

- [ ] **Step 2.3: Commit**

```bash
git add frontend/src/components/TemplateFieldEditor.jsx
git commit -m "feat: redesign TemplateFieldEditor — icon grid, remove guiding_question"
```

---

## Task 3: Crear NoteConfigurator — split panel constructor + preview

**Files:**
- Create: `frontend/src/components/NoteConfigurator.jsx`
- Create: `frontend/src/components/NoteConfigurator.test.jsx`

---

- [ ] **Step 3.1: Crear NoteConfigurator.jsx**

```jsx
// frontend/src/components/NoteConfigurator.jsx
import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TemplateFieldEditor from './TemplateFieldEditor';
import NotePreview from './NotePreview';

const SUGGESTED = [
  'Motivo de consulta', 'Estado de ánimo', 'Intervenciones',
  'Acuerdos y tareas', 'Escala de malestar', 'Objetivos',
  'Riesgos', 'Observaciones', 'Recursos',
];

const TYPE_ICONS = { text: '📝', scale: '📊', checkbox: '☑️', list: '📋', date: '📅' };

function emptyField(label, order) {
  return { id: uuidv4(), label, type: 'text', options: [], order };
}

// mode: 'onboarding' | 'edit'
// onboarding → saveLabel "Guardar y entrar a SyqueX →", "Saltar" sale de la app
// edit       → saveLabel "Guardar cambios", "Saltar" cierra el overlay
export default function NoteConfigurator({ initialFields = [], onSave, onSkip, onBack, mode = 'onboarding' }) {
  const [fields, setFields] = useState(
    initialFields.length > 0
      ? initialFields.map((f, i) => ({ ...f, order: f.order ?? i + 1 }))
      : []
  );
  const [activeId, setActiveId] = useState(null);
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState('design'); // 'design' | 'preview'
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const usedLabels = new Set(fields.map((f) => f.label.toLowerCase()));
  const activeField = fields.find((f) => f.id === activeId) ?? null;
  const saveLabel = mode === 'onboarding' ? 'Guardar y entrar a SyqueX →' : 'Guardar cambios';

  const addField = (label) => {
    const field = emptyField(label, fields.length + 1);
    setFields((prev) => [...prev, field]);
    setActiveId(field.id);
  };

  const addCustom = () => {
    const trimmed = customLabel.trim();
    if (!trimmed) return;
    addField(trimmed);
    setCustomLabel('');
  };

  const updateField = (id, updated) =>
    setFields((prev) => prev.map((f) => (f.id === id ? updated : f)));

  const removeField = (id) => {
    setFields((prev) =>
      prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i + 1 }))
    );
    if (activeId === id) setActiveId(null);
  };

  const handleDragStart = (id) => { dragItem.current = id; };
  const handleDragEnter = (id) => { dragOver.current = id; };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOver.current;
    dragItem.current = null;
    dragOver.current = null;
    if (!from || !to || from === to) return;
    setFields((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((f) => f.id === from);
      const toIdx = next.findIndex((f) => f.id === to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (fields.length === 0 || saving) return;
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* Topbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink/[0.07] flex-shrink-0">
        <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#5a9e8a]">SyqueX</span>
        <span className="text-[13px] font-medium text-[#18181b] hidden sm:block">Configura tu nota</span>
        <button onClick={onSkip} className="text-[11px] text-[#9ca3af] underline underline-offset-2">
          Saltar por ahora
        </button>
      </div>

      {/* Mobile tabs */}
      <div className="flex sm:hidden border-b border-ink/[0.07] flex-shrink-0">
        {[['design', 'Diseñar'], ['preview', 'Vista previa']].map(([t, label]) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
              mobileTab === t
                ? 'text-[#5a9e8a] border-b-2 border-[#5a9e8a]'
                : 'text-[#9ca3af]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Split body */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left: constructor */}
        <div className={`flex flex-col overflow-y-auto p-4 sm:p-5 gap-4 w-full sm:w-1/2 sm:border-r border-ink/[0.07] ${
          mobileTab === 'preview' ? 'hidden sm:flex' : 'flex'
        }`}>
          <div>
            <p className="text-[15px] font-bold text-[#18181b]">Diseña tu nota</p>
            <p className="text-[12px] text-[#6b7280] mt-1">Agrega secciones. Arrastra para reordenar.</p>
          </div>

          {/* Sections list */}
          {fields.length > 0 && (
            <div className="flex flex-col gap-2">
              {fields.map((field) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => handleDragStart(field.id)}
                  onDragEnter={() => handleDragEnter(field.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => setActiveId(field.id === activeId ? null : field.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                    field.id === activeId
                      ? 'border-[#5a9e8a] bg-[#f0f8f5]'
                      : 'border-ink/[0.09] bg-[#fafafa] hover:border-ink/[0.18]'
                  }`}
                >
                  <span className="text-[#d1d5db] cursor-grab text-[14px]" title="Arrastrar">⠿</span>
                  <span className="flex-1 text-[13px] font-medium text-[#18181b] truncate">{field.label}</span>
                  <span className="text-[14px]">{TYPE_ICONS[field.type] ?? '📝'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                    className="text-[#d1d5db] hover:text-red-500 transition-colors text-[12px] ml-0.5 flex-shrink-0"
                    title="Eliminar sección"
                    aria-label="Eliminar sección"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Type editor for active field */}
          {activeField && (
            <TemplateFieldEditor
              field={activeField}
              onChange={(updated) => updateField(activeField.id, updated)}
              onDelete={() => removeField(activeField.id)}
            />
          )}

          {/* Suggestions + custom input */}
          <div className="bg-[#f9f9f8] rounded-xl p-3 border border-ink/[0.07]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ca3af] mb-2">
              Agregar sección
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SUGGESTED.map((s) => {
                const used = usedLabels.has(s.toLowerCase());
                return (
                  <button
                    key={s}
                    disabled={used}
                    onClick={() => addField(s)}
                    className={`px-2.5 py-1.5 rounded-full text-[11.5px] font-medium border transition-colors ${
                      used
                        ? 'border-ink/[0.05] text-[#d1d5db] cursor-not-allowed bg-white'
                        : 'border-ink/[0.10] text-[#374151] bg-white hover:border-[#5a9e8a] hover:text-[#5a9e8a] hover:bg-[#f0f8f5]'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
                placeholder="Nombre personalizado…"
                className="flex-1 bg-white border border-ink/[0.09] rounded-lg px-3 py-2 text-[13px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 transition-colors"
                maxLength={120}
              />
              <button
                onClick={addCustom}
                disabled={!customLabel.trim()}
                className="px-3 py-2 rounded-lg bg-[#5a9e8a] text-white text-[12px] font-semibold disabled:opacity-40 hover:bg-[#4a8a78] transition-colors"
              >
                + Agregar
              </button>
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className={`flex flex-col overflow-y-auto p-4 sm:p-5 bg-[#fafafa] w-full sm:w-1/2 ${
          mobileTab === 'design' ? 'hidden sm:flex' : 'flex'
        }`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ca3af] mb-3">
            Vista previa en vivo
          </p>
          <NotePreview fields={fields} activeFieldId={activeId} />
        </div>
      </div>

      {/* Bottombar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-ink/[0.07] flex-shrink-0">
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl border border-ink/[0.10] bg-white text-[13px] font-medium text-[#18181b] hover:bg-[#f4f4f2] transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={handleSave}
          disabled={fields.length === 0 || saving}
          className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-[#5a9e8a] text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-[#4a8a78] transition-colors"
        >
          {saving ? 'Guardando…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Escribir tests de NoteConfigurator**

```jsx
// frontend/src/components/NoteConfigurator.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NoteConfigurator from './NoteConfigurator';

describe('NoteConfigurator', () => {
  it('renders constructor and preview panels on desktop', () => {
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Diseña tu nota')).toBeInTheDocument();
    expect(screen.getByText('Vista previa en vivo')).toBeInTheDocument();
  });

  it('save button is disabled when no fields', () => {
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    const saveBtn = screen.getByText('Guardar y entrar a SyqueX →');
    expect(saveBtn).toBeDisabled();
  });

  it('adds field when suggestion chip is clicked', () => {
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Motivo de consulta'));
    // Field appears in the section list
    const items = screen.getAllByText('Motivo de consulta');
    expect(items.length).toBeGreaterThan(1); // one in chip area (now disabled), one in list
  });

  it('save button becomes enabled when a field is added', () => {
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Estado de ánimo'));
    const saveBtn = screen.getByText('Guardar y entrar a SyqueX →');
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls onSave with fields when save is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<NoteConfigurator onSave={onSave} onSkip={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Intervenciones'));
    fireEvent.click(screen.getByText('Guardar y entrar a SyqueX →'));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0][0].label).toBe('Intervenciones');
  });

  it('calls onSkip when "Saltar" is clicked', () => {
    const onSkip = vi.fn();
    render(<NoteConfigurator onSave={vi.fn()} onSkip={onSkip} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Saltar por ahora'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onBack when "Volver" is clicked', () => {
    const onBack = vi.fn();
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByText('← Volver'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows "Guardar cambios" label in edit mode', () => {
    render(<NoteConfigurator onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} mode="edit" />);
    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
  });

  it('initialFields are pre-loaded', () => {
    const fields = [{ id: 'f1', label: 'Mi campo', type: 'text', order: 1, options: [] }];
    render(<NoteConfigurator initialFields={fields} onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Mi campo')).toBeInTheDocument();
  });

  it('removes field when delete button is clicked', () => {
    const fields = [{ id: 'f1', label: 'Campo a borrar', type: 'text', order: 1, options: [] }];
    render(<NoteConfigurator initialFields={fields} onSave={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />);
    const delBtn = screen.getByTitle('Eliminar sección');
    fireEvent.click(delBtn);
    // label no longer in section list (might still exist in suggestions)
    const saveBtn = screen.getByText('Guardar y entrar a SyqueX →');
    expect(saveBtn).toBeDisabled();
  });
});
```

- [ ] **Step 3.3: Ejecutar tests y verificar que pasan**

```bash
cd frontend && npx vitest run src/components/NoteConfigurator.test.jsx
```

Esperado: 9 tests PASS.

- [ ] **Step 3.4: Commit**

```bash
git add frontend/src/components/NoteConfigurator.jsx frontend/src/components/NoteConfigurator.test.jsx
git commit -m "feat: add NoteConfigurator — split panel template builder with live preview"
```

---

## Task 4: Crear OnboardingScreen

**Files:**
- Create: `frontend/src/components/OnboardingScreen.jsx`
- Create: `frontend/src/components/OnboardingScreen.test.jsx`

---

- [ ] **Step 4.1: Crear OnboardingScreen.jsx**

```jsx
// frontend/src/components/OnboardingScreen.jsx

const SOAP_PILLS = [
  ['S', 'Subjetivo'],
  ['O', 'Objetivo'],
  ['A', 'Análisis'],
  ['P', 'Plan'],
];

const CUSTOM_CHIPS = ['Motivo de consulta', 'Estado de ánimo', 'Intervenciones'];

export default function OnboardingScreen({ onChooseSOAP, onChooseCustom, onSkip }) {
  return (
    <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl max-w-[560px] w-full p-8">

        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#5a9e8a] mb-8">
          SyqueX
        </p>

        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af] mb-2">
          Paso 1 de 1 · Solo te preguntamos esto una vez
        </p>
        <h1 className="text-[22px] font-bold text-[#18181b] leading-tight mb-2">
          ¿Cómo quieres documentar tus sesiones?
        </h1>
        <p className="text-[13px] text-[#6b7280] mb-7 leading-relaxed">
          Elige el formato de tus notas clínicas. Siempre podrás cambiarlo desde ajustes.
        </p>

        <div className="flex flex-col gap-3 mb-7">

          {/* SOAP card */}
          <div className="border border-ink/[0.09] rounded-xl p-5 bg-[#fafafa]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-[#d4ede7] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#5a9e8a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-[15px] font-bold text-[#18181b]">Nota SOAP</span>
              <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#f0f8f5] text-[#5a9e8a] border border-[#b3d9ce] whitespace-nowrap">
                Estándar clínico
              </span>
            </div>
            <p className="text-[12.5px] text-[#6b7280] leading-relaxed mb-2">
              Estructura clásica de documentación usada en psicología y medicina. El agente organiza tu dictado en cuatro secciones automáticamente.
            </p>
            <p className="text-[12px] text-[#6b7280] mb-3">
              SOAP son las iniciales de Subjetivo, Objetivo, Análisis y Plan.
            </p>
            <div className="flex flex-wrap gap-2">
              {SOAP_PILLS.map(([letter, label]) => (
                <span
                  key={letter}
                  className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-white border border-ink/[0.08] text-[#374151]"
                >
                  <span className="text-[#5a9e8a] font-bold">{letter}</span> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Personalizada card */}
          <div className="border-2 border-[#5a9e8a] rounded-xl p-5 bg-[#f0f8f5]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-[#f5e8d8] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#c4935a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <span className="text-[15px] font-bold text-[#18181b]">Nota personalizada</span>
              <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#5a9e8a] text-white whitespace-nowrap">
                Recomendado
              </span>
            </div>
            <p className="text-[12.5px] text-[#555] leading-relaxed mb-3">
              Diseña los campos que tú ya usas en tu práctica. El agente aprende tu formato y lo llena desde el dictado.
            </p>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_CHIPS.map((chip) => (
                <span key={chip} className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-white border border-[#c4935a]/30 text-[#c4935a]">
                  {chip}
                </span>
              ))}
              <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-white border border-dashed border-ink/20 text-[#9ca3af]">
                + tus campos…
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={onChooseSOAP}
            className="flex-1 py-3 rounded-xl border border-ink/[0.12] bg-white text-[14px] font-semibold text-[#18181b] hover:bg-[#f4f4f2] transition-colors"
          >
            Usar SOAP
          </button>
          <button
            onClick={onChooseCustom}
            className="flex-[2] py-3 rounded-xl bg-[#5a9e8a] text-white text-[14px] font-bold hover:bg-[#4a8a78] transition-colors"
          >
            Personalizar mi nota →
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={onSkip}
            className="text-[11.5px] text-[#9ca3af] underline underline-offset-2 hover:text-[#6b7280] transition-colors"
          >
            Decidir después — entrar a la app
          </button>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Escribir tests de OnboardingScreen**

```jsx
// frontend/src/components/OnboardingScreen.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OnboardingScreen from './OnboardingScreen';

describe('OnboardingScreen', () => {
  it('renders SOAP card title', () => {
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Nota SOAP')).toBeInTheDocument();
  });

  it('renders SOAP acronym explanation', () => {
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/SOAP son las iniciales de Subjetivo/)).toBeInTheDocument();
  });

  it('renders SOAP pills S O A P', () => {
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Subjetivo')).toBeInTheDocument();
    expect(screen.getByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText('Análisis')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });

  it('renders Personalizada card with Recomendado badge', () => {
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Nota personalizada')).toBeInTheDocument();
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
  });

  it('calls onChooseSOAP when "Usar SOAP" is clicked', () => {
    const fn = vi.fn();
    render(<OnboardingScreen onChooseSOAP={fn} onChooseCustom={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText('Usar SOAP'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('calls onChooseCustom when "Personalizar mi nota" is clicked', () => {
    const fn = vi.fn();
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={fn} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText('Personalizar mi nota →'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('calls onSkip when skip link is clicked', () => {
    const fn = vi.fn();
    render(<OnboardingScreen onChooseSOAP={vi.fn()} onChooseCustom={vi.fn()} onSkip={fn} />);
    fireEvent.click(screen.getByText(/Decidir después/));
    expect(fn).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4.3: Ejecutar tests y verificar que pasan**

```bash
cd frontend && npx vitest run src/components/OnboardingScreen.test.jsx
```

Esperado: 7 tests PASS.

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/components/OnboardingScreen.jsx frontend/src/components/OnboardingScreen.test.jsx
git commit -m "feat: add OnboardingScreen — post-login format selection with SOAP explanation"
```

---

## Task 5: Actualizar DictationPanel — pill toggle + "Editar plantilla"

**Files:**
- Modify: `frontend/src/components/DictationPanel.jsx`
- Modify: `frontend/src/components/DictationPanel.test.jsx`

---

- [ ] **Step 5.1: Actualizar DictationPanel.jsx**

Nuevas props: `noteFormat`, `onFormatChange`, `hasTemplate`, `onEditTemplate`.

Reemplaza el contenido completo del archivo:

```jsx
// frontend/src/components/DictationPanel.jsx

export default function DictationPanel({
  value,
  onChange,
  onGenerate,
  loading,
  orphanedSessions = [],
  onResumeOrphan,
  onDiscardOrphan,
  noteFormat = 'soap',
  onFormatChange,
  hasTemplate = false,
  onEditTemplate,
}) {
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

  const generateLabel = noteFormat === 'soap' ? 'Generar nota SOAP →' : 'Generar nota personalizada →';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        {/* Format toggle row */}
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex bg-[#f4f4f2] rounded-full p-0.5 gap-0.5">
            {(['soap', 'custom'] ).map((fmt) => (
              <button
                key={fmt}
                onClick={() => onFormatChange?.(fmt)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  noteFormat === fmt
                    ? 'bg-white text-[#18181b] shadow-sm'
                    : 'text-[#6b7280] hover:text-[#18181b]'
                }`}
              >
                {fmt === 'soap' ? 'SOAP' : 'Personalizada'}
              </button>
            ))}
          </div>
          {noteFormat === 'custom' && (
            <button
              onClick={onEditTemplate}
              className="flex items-center gap-1 text-[10.5px] text-[#9ca3af] underline underline-offset-2 hover:text-[#5a9e8a] transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar plantilla
            </button>
          )}
        </div>

        {orphanedSessions.length > 0 && !loading && (
          <div className="mb-4 space-y-2">
            <p className="text-[10px] font-bold text-[#c4935a] uppercase tracking-wide px-1">Sesiones sin confirmar</p>
            {orphanedSessions.map(orphan => (
              <div key={orphan.id} className="bg-[#fdf8f4] border border-[#f5e6d3] rounded-xl px-4 py-3 flex items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-ink line-clamp-1 italic">"{orphan.raw_dictation}"</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    {new Date(orphan.session_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onDiscardOrphan(orphan.id)}
                    className="p-1.5 text-ink-tertiary hover:text-red-500 transition-colors"
                    title="Descartar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onResumeOrphan(orphan)}
                    className="bg-[#c4935a] text-white px-3 py-1 rounded-lg text-[11px] font-medium hover:bg-[#b07d4b] transition-colors"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generando…
            </>
          ) : (
            generateLabel
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Actualizar DictationPanel.test.jsx — añadir tests del toggle**

Añade estos tests al final del bloque `describe` existente en `DictationPanel.test.jsx`:

```jsx
  it('renders SOAP pill as active by default', () => {
    render(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} />
    );
    const soapBtn = screen.getByText('SOAP');
    expect(soapBtn.className).toContain('bg-white');
  });

  it('renders Personalizada pill as active when noteFormat is custom', () => {
    render(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="custom" />
    );
    const customBtn = screen.getByText('Personalizada');
    expect(customBtn.className).toContain('bg-white');
  });

  it('calls onFormatChange when a format pill is clicked', () => {
    const onFormatChange = vi.fn();
    render(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} onFormatChange={onFormatChange} />
    );
    fireEvent.click(screen.getByText('Personalizada'));
    expect(onFormatChange).toHaveBeenCalledWith('custom');
  });

  it('shows "Editar plantilla" link only when noteFormat is custom', () => {
    const { rerender } = render(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="soap" />
    );
    expect(screen.queryByText('Editar plantilla')).not.toBeInTheDocument();

    rerender(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="custom" />
    );
    expect(screen.getByText('Editar plantilla')).toBeInTheDocument();
  });

  it('button label says "Generar nota SOAP →" when format is soap', () => {
    render(
      <DictationPanel value="algo" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="soap" />
    );
    expect(screen.getByText('Generar nota SOAP →')).toBeInTheDocument();
  });

  it('button label says "Generar nota personalizada →" when format is custom', () => {
    render(
      <DictationPanel value="algo" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="custom" />
    );
    expect(screen.getByText('Generar nota personalizada →')).toBeInTheDocument();
  });

  it('calls onEditTemplate when "Editar plantilla" is clicked', () => {
    const onEditTemplate = vi.fn();
    render(
      <DictationPanel value="" onChange={() => {}} onGenerate={() => {}} loading={false} noteFormat="custom" onEditTemplate={onEditTemplate} />
    );
    fireEvent.click(screen.getByText('Editar plantilla'));
    expect(onEditTemplate).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 5.3: Ejecutar tests del DictationPanel**

```bash
cd frontend && npx vitest run src/components/DictationPanel.test.jsx
```

Esperado: todos los tests (anteriores + nuevos) PASS.

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/components/DictationPanel.jsx frontend/src/components/DictationPanel.test.jsx
git commit -m "feat: add format toggle to DictationPanel — SOAP/Personalizada pill + edit link"
```

---

## Task 6: Actualizar App.jsx — onboarding, noteFormat state, overlay configurador

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js` (eliminar `analyzePdf`)

---

- [ ] **Step 6.1: Eliminar `analyzePdf` de api.js**

En `frontend/src/api.js`, elimina completamente la función `analyzePdf` (líneas 135–148 aprox):

```js
// ELIMINAR este bloque completo:
export async function analyzePdf(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch('/template/analyze-pdf', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al analizar el PDF');
  }
  return res.json();
}
```

- [ ] **Step 6.2: Actualizar imports en App.jsx**

Reemplaza la línea de imports del api en App.jsx:

```js
// Antes:
import { processSession, confirmNote, getTemplate, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout, logout, deleteSession } from './api'

// Después:
import { processSession, confirmNote, getTemplate, saveTemplate, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout, logout, deleteSession } from './api'
```

Reemplaza los imports de componentes de template en App.jsx:

```js
// Antes:
import TemplateSetupModal from './components/TemplateSetupModal.jsx';

// Después:
import OnboardingScreen from './components/OnboardingScreen.jsx';
import NoteConfigurator from './components/NoteConfigurator.jsx';
```

- [ ] **Step 6.3: Añadir estado de onboarding y noteFormat en App.jsx**

Inmediatamente después del bloque `// Template state` existente (línea ~158), reemplaza:

```js
// Template state
const [template, setTemplate] = useState(null);
const [showTemplateSetup, setShowTemplateSetup] = useState(false);
const [newlyConfirmedSessionId, setNewlyConfirmedSessionId] = useState(null);
const [toast, setToast] = useState(null);
```

por:

```js
// Template state
const [template, setTemplate] = useState(null);
const [newlyConfirmedSessionId, setNewlyConfirmedSessionId] = useState(null);
const [toast, setToast] = useState(null);

// Onboarding + format state
const [onboardingCompleted, setOnboardingCompleted] = useState(
  () => localStorage.getItem('syquex_onboarding_done') === 'true'
);
const [noteFormat, setNoteFormat] = useState(
  () => localStorage.getItem('syquex_note_format') || 'soap'
);
const [showConfigurator, setShowConfigurator] = useState(false);
const [configuratorMode, setConfiguratorMode] = useState('onboarding'); // 'onboarding' | 'edit'
```

- [ ] **Step 6.4: Añadir efecto para inicializar noteFormat desde template**

Después del `useEffect` que llama `fetchConversations` y `getTemplate` (línea ~422 aprox), añade:

```js
// Derive initial noteFormat from template once it loads (only if not stored)
useEffect(() => {
  if (template !== null && !localStorage.getItem('syquex_note_format')) {
    const fmt = (template?.fields?.length > 0) ? 'custom' : 'soap';
    setNoteFormat(fmt);
    localStorage.setItem('syquex_note_format', fmt);
  }
}, [template]);
```

- [ ] **Step 6.5: Eliminar el trigger reactivo post-dictado**

Elimina completamente este bloque (líneas ~460–470):

```js
// ELIMINAR:
// Trigger template setup when first note arrives and no template is configured
useEffect(() => {
  if (
    currentSessionNote?.type === 'bot' &&
    currentSessionNote?.noteData &&
    template !== null &&
    (!template.fields || template.fields.length === 0)
  ) {
    setShowTemplateSetup(true);
  }
}, [currentSessionNote, template]);
```

- [ ] **Step 6.6: Actualizar handleSendDictation para usar noteFormat**

Reemplaza la función `handleSendDictation` (línea ~475):

```js
// Antes:
const handleSendDictation = async (dictation, format) => {
  const activeFormat = (template?.fields?.length > 0) ? 'custom' : format;

// Después (mantener 'SOAP' en mayúsculas para no romper las comparaciones posteriores en la función):
const handleSendDictation = async (dictation) => {
  const activeFormat = noteFormat === 'custom' && template?.fields?.length > 0 ? 'custom' : 'SOAP';
```

Y elimina el parámetro `format` de todas las llamadas a `handleSendDictation` en el JSX (hay dos: desktop y mobile), cambiando:

```jsx
// Antes:
onGenerate={(d) => handleSendDictation(d, 'SOAP')}

// Después:
onGenerate={(d) => handleSendDictation(d)}
```

- [ ] **Step 6.7: Añadir handler para cambio de formato**

Después de `handleSendDictation`, añade:

```js
const handleFormatChange = (fmt) => {
  if (fmt === 'custom' && (!template?.fields?.length)) {
    // No template configured — open configurator first
    setConfiguratorMode('edit');
    setShowConfigurator(true);
    return;
  }
  setNoteFormat(fmt);
  localStorage.setItem('syquex_note_format', fmt);
};

const handleOpenConfigurator = () => {
  setConfiguratorMode('edit');
  setShowConfigurator(true);
};

const handleConfiguratorSave = async (fields) => {
  const saved = await saveTemplate(fields);
  setTemplate(saved);
  if (configuratorMode === 'onboarding') {
    setNoteFormat('custom');
    localStorage.setItem('syquex_note_format', 'custom');
    setOnboardingCompleted(true);
    localStorage.setItem('syquex_onboarding_done', 'true');
  }
  setShowConfigurator(false);
};
```

- [ ] **Step 6.8: Añadir renderizado de onboarding y configurador**

En la sección de render de `App.jsx`, inmediatamente antes del `return (` que abre la app principal (después de los returns de login/register/billing), añade:

```jsx
// Onboarding: shown once after first login while template loads
if (authScreen.screen === 'app' && !onboardingCompleted && template !== null) {
  if (showConfigurator) {
    return (
      <NoteConfigurator
        initialFields={[]}
        mode="onboarding"
        onSave={handleConfiguratorSave}
        onSkip={() => {
          setOnboardingCompleted(true);
          localStorage.setItem('syquex_onboarding_done', 'true');
          setShowConfigurator(false);
        }}
        onBack={() => setShowConfigurator(false)}
      />
    );
  }
  return (
    <OnboardingScreen
      onChooseSOAP={() => {
        setNoteFormat('soap');
        localStorage.setItem('syquex_note_format', 'soap');
        setOnboardingCompleted(true);
        localStorage.setItem('syquex_onboarding_done', 'true');
      }}
      onChooseCustom={() => {
        setConfiguratorMode('onboarding');
        setShowConfigurator(true);
      }}
      onSkip={() => {
        setOnboardingCompleted(true);
        localStorage.setItem('syquex_onboarding_done', 'true');
      }}
    />
  );
}
```

- [ ] **Step 6.9: Pasar nuevas props a DictationPanel (desktop y mobile)**

En ambas instancias de `<DictationPanel>` (desktop ~línea 653 y mobile ~línea 891), añade las nuevas props:

```jsx
<DictationPanel
  value={draft}
  onChange={setDraft}
  onGenerate={(d) => handleSendDictation(d)}
  loading={isLoading}
  orphanedSessions={orphanedSessions}
  onResumeOrphan={handleResumeOrphan}
  onDiscardOrphan={handleDiscardOrphan}
  noteFormat={noteFormat}
  onFormatChange={handleFormatChange}
  hasTemplate={!!(template?.fields?.length)}
  onEditTemplate={handleOpenConfigurator}
/>
```

- [ ] **Step 6.10: Eliminar TemplateSetupModal del JSX**

Elimina el bloque JSX del TemplateSetupModal (líneas ~1048–1056):

```jsx
// ELIMINAR:
{/* TemplateSetupModal */}
<TemplateSetupModal
  open={showTemplateSetup}
  onClose={() => setShowTemplateSetup(false)}
  onSaved={(saved) => {
    setTemplate(saved);
    setShowTemplateSetup(false);
  }}
/>
```

- [ ] **Step 6.11: Añadir overlay del configurador en modo edición**

Dentro del `return (` principal, justo antes del cierre `</div>` final del componente App (o antes del `{/* Toast notification */}`), añade:

```jsx
{/* NoteConfigurator overlay — edit mode */}
{showConfigurator && onboardingCompleted && (
  <NoteConfigurator
    initialFields={template?.fields || []}
    mode="edit"
    onSave={handleConfiguratorSave}
    onSkip={() => setShowConfigurator(false)}
    onBack={() => setShowConfigurator(false)}
  />
)}
```

- [ ] **Step 6.12: Actualizar texto de loading de nota según formato**

En ambas instancias del texto "Generando nota SOAP…" (desktop ~línea 672 y mobile ~línea 914), actualiza:

```jsx
// Antes:
<span className="text-ink-tertiary text-[14px]">Generando nota SOAP…</span>

// Después:
<span className="text-ink-tertiary text-[14px]">
  {noteFormat === 'custom' ? 'Generando nota personalizada…' : 'Generando nota SOAP…'}
</span>
```

- [ ] **Step 6.13: Ejecutar todos los tests**

```bash
cd frontend && npx vitest run
```

Esperado: todos los tests PASS.

- [ ] **Step 6.14: Commit**

```bash
git add frontend/src/App.jsx frontend/src/api.js
git commit -m "feat: wire onboarding flow, noteFormat toggle, and NoteConfigurator overlay in App"
```

---

## Task 7: Eliminar archivos obsoletos

**Files:**
- Delete: `frontend/src/components/TemplateSetupModal.jsx`
- Delete: `frontend/src/components/TemplatePdfUpload.jsx`
- Delete: `frontend/src/components/TemplateWizard.jsx`

---

- [ ] **Step 7.1: Verificar que ningún archivo importa los componentes a eliminar**

```bash
cd frontend && grep -r "TemplateSetupModal\|TemplatePdfUpload\|TemplateWizard\|analyzePdf" src/
```

Esperado: sin resultados (todos los imports ya fueron eliminados en Task 6).

- [ ] **Step 7.2: Eliminar los archivos**

```bash
git rm frontend/src/components/TemplateSetupModal.jsx \
       frontend/src/components/TemplatePdfUpload.jsx \
       frontend/src/components/TemplateWizard.jsx
```

- [ ] **Step 7.3: Ejecutar todos los tests para confirmar que nada se rompió**

```bash
cd frontend && npx vitest run
```

Esperado: todos los tests PASS.

- [ ] **Step 7.4: Commit**

```bash
git commit -m "chore: remove TemplateSetupModal, TemplatePdfUpload, TemplateWizard — replaced by NoteConfigurator"
```

---

## Task 8: Verificación final de la feature completa

---

- [ ] **Step 8.1: Arrancar el entorno completo**

Terminal 1:
```powershell
.\start-backend.ps1
```

Terminal 2:
```powershell
.\start-frontend.ps1
```

- [ ] **Step 8.2: Verificar flujo de onboarding (usuario nuevo)**

1. Abrir `http://localhost:5173` en modo incógnito (o limpiar localStorage)
2. Hacer login
3. Confirmar que aparece `OnboardingScreen` con las tarjetas SOAP y Personalizada
4. Confirmar que la tarjeta SOAP muestra la línea "SOAP son las iniciales de…" y las píldoras S/O/A/P
5. Hacer clic en "Personalizar mi nota →" → confirmar que aparece `NoteConfigurator`
6. Agregar 3 campos usando chips sugeridos → confirmar que el preview los muestra en vivo
7. Hacer clic en una sección → confirmar que el editor de tipo aparece y el preview la resalta en ámbar
8. Guardar → confirmar que entra a la app principal

- [ ] **Step 8.3: Verificar toggle en panel de dictado**

1. Confirmar que el toggle SOAP / Personalizada es visible sobre el textarea
2. Cambiar a SOAP → confirmar que el botón dice "Generar nota SOAP →"
3. Cambiar a Personalizada → confirmar que el botón dice "Generar nota personalizada →"
4. Con formato Personalizada, hacer clic en "Editar plantilla" → confirmar que abre el configurador en modo edit
5. Guardar cambios → confirmar que vuelve al panel de dictado

- [ ] **Step 8.4: Verificar que el tab Nota renderiza el formato correcto**

1. Con toggle en SOAP, generar nota → confirmar que el tab Nota muestra `SoapNoteDocument` (secciones S/O/A/P)
2. Con toggle en Personalizada, generar nota → confirmar que el tab Nota muestra `CustomNoteDocument` (campos del template)

- [ ] **Step 8.5: Verificar edge case — sin template + toggle a Personalizada**

1. En localStorage, eliminar `syquex_note_format` y poner `syquex_onboarding_done=true`
2. Recargar app → confirmar que entra directo (no muestra onboarding)
3. Hacer clic en "Personalizada" en el toggle → confirmar que abre el configurador automáticamente

- [ ] **Step 8.6: Ejecutar suite completa de tests**

```bash
cd frontend && npx vitest run
```

Esperado: todos los tests PASS.

- [ ] **Step 8.7: Commit final**

```bash
git add -A
git commit -m "chore: final verification — onboarding + note configurator feature complete"
```
