# Plan de Implementación: Jerarquía Visual SOAP

**Spec:** `docs/superpowers/specs/2026-03-22-soap-visual-hierarchy-design.md`
**Archivo a modificar:** `frontend/src/components/NoteReview.jsx` (único archivo)
**Branch:** `feature/soap-visual-hierarchy` desde `dev`

---

## Paso 1 — Crear branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/soap-visual-hierarchy
```

**Criterio:** Estás en `feature/soap-visual-hierarchy` con `git branch` mostrando el branch activo.

---

## Paso 2 — Reescribir `NoteReview.jsx`

Reemplazar el contenido completo del archivo. Estructura JSX a implementar:

### 2.1 Wrapper raíz

```jsx
<div className="font-sans">
```
Eliminar `text-slate-200 text-[15px] leading-relaxed` del wrapper raíz.

### 2.2 Texto conversacional (fallback)

```jsx
{noteData.text_fallback && (
  <p className="text-[14px] leading-relaxed text-ink-secondary whitespace-pre-wrap mb-4">
    {noteData.text_fallback}
  </p>
)}
```

### 2.3 Documento clínico (condicionado a `noteData.clinical_note`)

```jsx
{noteData.clinical_note && (
  <div className="bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6">

    {/* Header */}
    <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink/[0.06]">
      <span className="text-[10px] uppercase tracking-[0.14em] text-sage font-bold">
        Nota Clínica · SOAP
      </span>
    </div>

    {/* Cards SOAP */}
    <div className="space-y-2 mb-4">
      {SOAP_SECTIONS.map(section => section.content && <SoapCard ... />)}
    </div>

    {/* Alertas */}
    {/* Patrones */}

    {/* CTA bar */}
  </div>
)}
```

### 2.4 Componente helper `SoapCard` (inline, no archivo separado)

Definir dentro del mismo archivo antes del `export default`:

```jsx
const SOAP_SECTIONS = [
  {
    key: 'subjective',
    letter: 'S',
    label: 'Subjetivo',
    border: 'border-sage/20',
    headerBg: 'bg-sage-light',
    labelColor: 'text-sage-dark',
  },
  {
    key: 'objective',
    letter: 'O',
    label: 'Objetivo',
    border: 'border-sky-200/60',
    headerBg: 'bg-sky-50',
    labelColor: 'text-sky-700',
  },
  {
    key: 'assessment',
    letter: 'A',
    label: 'Análisis',
    border: 'border-amber-200/60',
    headerBg: 'bg-amber-50',
    labelColor: 'text-amber-800',
  },
  {
    key: 'plan',
    letter: 'P',
    label: 'Plan',
    border: 'border-emerald-200/60',
    headerBg: 'bg-emerald-50',
    labelColor: 'text-emerald-800',
  },
]
```

Renderizado de cada card:

```jsx
<div key={section.key} className={`rounded-xl overflow-hidden border ${section.border}`}>
  <div className={`${section.headerBg} px-3.5 py-1.5 flex items-center gap-2`}>
    <span className={`text-[13px] font-black font-mono ${section.labelColor}`}>
      {section.letter}
    </span>
    <span className={`text-[10px] uppercase tracking-[0.14em] font-bold ${section.labelColor}`}>
      {section.label}
    </span>
  </div>
  <div className="bg-white px-3.5 py-2.5">
    <p className="text-[14px] leading-relaxed text-ink-secondary">{content}</p>
  </div>
</div>
```

### 2.5 Alertas detectadas

```jsx
{alerts.length > 0 && (
  <div className="mt-3 bg-red-50 border border-red-200/60 rounded-xl p-3">
    <strong className="text-[10px] uppercase tracking-[0.12em] font-bold text-red-700 block mb-1">
      ⚠ Alertas Detectadas
    </strong>
    <ul className="list-disc pl-5 text-red-800 text-[13px] space-y-1">
      {alerts.map((a, i) => <li key={i}>{a}</li>)}
    </ul>
  </div>
)}
```

### 2.6 Patrones evolutivos

```jsx
{patterns.length > 0 && (
  <div className="mt-3 bg-amber-50 border border-amber-200/60 rounded-xl p-3">
    <strong className="text-[10px] uppercase tracking-[0.12em] font-bold text-amber-700 block mb-1">
      🔄 Patrones Evolutivos
    </strong>
    <ul className="list-disc pl-5 text-amber-800 text-[13px] space-y-1">
      {patterns.map((p, i) => <li key={i}>{p}</li>)}
    </ul>
  </div>
)}
```

### 2.7 CTA bar (último hijo dentro del contenedor blanco)

```jsx
<div className="flex items-center justify-between gap-3 border-t border-ink/[0.06] pt-4 mt-4">

  {/* Izquierda: Descargar */}
  <button
    onClick={handleDownload}
    disabled={!evolutionReport}
    className={`border border-ink/[0.10] text-ink-secondary text-[13px] font-medium rounded-xl px-4 py-2 flex items-center gap-2 hover:bg-parchment-dark transition-colors ${
      !evolutionReport ? 'opacity-40 cursor-not-allowed' : ''
    }`}
  >
    <svg .../>  {/* mismo SVG de descarga actual */}
    {evolutionReport ? "Descargar Historial TXT" : "Historial no solicitado"}
  </button>

  {/* Derecha: BORRADOR + Confirmar */}
  <div className="flex items-center gap-2">
    {!confirmed && (
      <span className="bg-parchment-dark text-ink-tertiary text-[11px] font-semibold tracking-[0.06em] rounded-full px-3 py-1">
        BORRADOR
      </span>
    )}

    {!confirmed ? (
      <button
        onClick={handleSave}
        disabled={saving}
        className={`bg-sage hover:bg-sage-dark text-white text-[13px] font-medium rounded-xl px-4 py-2 transition-colors ${
          saving ? 'opacity-70 cursor-not-allowed' : ''
        }`}
      >
        {saving ? "Registrando..." : (
          <>
            <span className="sm:hidden">✓ Confirmar</span>
            <span className="hidden sm:inline">✓ Confirmar en Expediente</span>
          </>
        )}
      </button>
    ) : (
      <span className="text-emerald-600 text-[13px] font-medium flex items-center gap-1 px-4 py-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
        </svg>
        Guardado
      </span>
    )}
  </div>
</div>
```

### 2.8 Caso solo `evolutionReport` (sin `clinical_note`)

Si `!noteData.clinical_note && evolutionReport`, renderizar la CTA bar fuera del contenedor blanco (sin tarjeta):

```jsx
{!noteData.clinical_note && evolutionReport && (
  <div className="flex items-center justify-between gap-3 pt-2">
    {/* mismo botón Descargar habilitado */}
  </div>
)}
```

---

## Paso 3 — Verificación manual

Abrir `http://localhost:5173` con el servidor Vite corriendo (`npm run dev` en `/frontend`).

| Check | Viewport | Esperado |
|-------|----------|---------|
| Cards SOAP con 4 colores distintos | 1280px | S=sage, O=sky, A=amber, P=emerald |
| Pill "BORRADOR" visible | 1280px | Aparece antes de confirmar |
| Botón "✓ Confirmar en Expediente" | 1280px | Texto largo |
| Botón "✓ Confirmar" | 375px | Texto corto |
| CTA bar en una sola fila | 375px | Download izq, BORRADOR+Confirm der |
| Sin clases slate-* o cyan-* | — | `grep -r "slate-\|cyan-" src/components/NoteReview.jsx` → 0 resultados |
| Estado guardando | cualquiera | Click Confirmar → "Registrando..." + deshabilitado |
| Estado guardado | cualquiera | "✓ Guardado" en verde, BORRADOR desaparece |
| Fallback texto libre | cualquiera | Texto en `text-ink-secondary`, sin fondo de card |

---

## Paso 4 — Commit

```bash
git add frontend/src/components/NoteReview.jsx
git commit -m "feat: SOAP visual hierarchy and light theme migration in NoteReview

- Color-coded cards per SOAP section (S/O/A/P)
- Full migration from dark slate to Clinical Notebook light theme
- Explicit BORRADOR draft state in CTA bar
- Responsive confirm button (short label on mobile)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Paso 5 — PR a `dev`

```bash
git push -u origin feature/soap-visual-hierarchy
gh pr create \
  --base dev \
  --title "feat: SOAP visual hierarchy + light theme (MVP #1)" \
  --body "$(cat <<'EOF'
## Summary
- Color-coded card per SOAP section (S=sage, O=sky, A=amber, P=emerald)
- Full NoteReview migration from dark slate to Clinical Notebook light theme
- Explicit BORRADOR pill before confirming, BORRADOR desaparece al guardar
- Responsive CTA: botón muestra texto corto en mobile (< 640px)

## Test plan
- [ ] Cards SOAP con 4 colores distintos en 1280px
- [ ] CTA en una sola fila en 375px
- [ ] Sin clases slate-* / cyan-* (`grep` en NoteReview.jsx)
- [ ] Estado guardando → "Registrando..." deshabilitado
- [ ] Estado guardado → check verde, BORRADOR desaparece
EOF
)"
```
