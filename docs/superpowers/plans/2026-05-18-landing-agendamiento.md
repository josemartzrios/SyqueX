# Landing — Agendamiento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the landing page to showcase the new scheduling feature — psychologist dictates free hours by voice, patient books from their portal, both receive email notifications.

**Architecture:** Pure presentational changes across three existing components. No new files, no logic, no API calls. Each task is a self-contained component edit followed by visual verification via the dev server.

**Tech Stack:** Next.js 14, Tailwind CSS, TypeScript. Design tokens: `sage`, `ink`, `amber`, `surface` (defined in `tailwind.config.ts`). FadeIn animation wrapper from `components/FadeIn.tsx`.

---

## File Map

| File | Change |
|---|---|
| `landing/components/HowItWorks.tsx` | Add step 01, renumber 01–04 → 02–05, update tagline |
| `landing/components/FeatureHighlight.tsx` | Add `MockAgendamiento` component + new first section |
| `landing/components/Pricing.tsx` | Add one item to `features` array |

---

## Task 1: Update HowItWorks — new step 01 + renumber

**Files:**
- Modify: `landing/components/HowItWorks.tsx`

### Context

Current file has 4 steps (01–04) and tagline `"Cuatro pasos. Menos de 2 minutos. Todos los días."`. We add a new step 01 (scheduling), shift the existing steps to 02–05, and update the tagline.

- [ ] **Step 1: Start the dev server and verify current state**

```bash
cd landing && npm run dev
```

Open `http://localhost:3000` and scroll to "Cómo funciona". Confirm you see 4 steps: "Dicta lo que pasó" as step 01.

- [ ] **Step 2: Replace the full `steps` array in `HowItWorks.tsx`**

Replace the entire `steps` array (lines 3–28) with:

```tsx
const steps = [
  {
    step: '01',
    title: 'Dicta tu disponibilidad',
    desc: 'Antes de tu primera sesión, dicta tus horas libres. La IA extrae los horarios y los publica automáticamente en el portal del paciente. Ambos reciben notificación por correo al confirmar la cita.',
    badge: 'Dictado de voz',
  },
  {
    step: '02',
    title: 'Dicta lo que pasó',
    desc: 'Al terminar tu sesión, escribe o dicta un resumen libre. No necesitas estructura ni formato — escríbelo como lo piensas.',
    badge: 'SOAP o personalizada',
  },
  {
    step: '03',
    title: 'SyqueX genera la nota',
    desc: 'La IA estructura tu dictado en una nota clínica profesional con observaciones, estado de ánimo y plan terapéutico. Edita lo que quieras antes de confirmar.',
    badge: 'Editable y descargable',
  },
  {
    step: '04',
    title: 'Pregúntale al agente',
    desc: 'Antes de tu próxima sesión, pregunta: "¿Qué patrones hay?", "¿Hay señales de alerta?", "¿Cuáles son los acuerdos pendientes?". El agente analiza todas las sesiones.',
    badge: 'Tu copiloto clínico',
  },
  {
    step: '05',
    title: 'El paciente lleva su seguimiento',
    desc: 'Al confirmar la nota, SyqueX genera un resumen con los temas trabajados y las tareas al portal del paciente. Tú los revisas y envías. El paciente los consulta cuando quiera, dándole seguimiento a sus tareas.',
    badge: 'Seguimiento entre sesiones',
  },
]
```

- [ ] **Step 3: Update the tagline**

In the JSX, change:

```tsx
<p className="text-center text-ink-tertiary text-sm mb-12">
  Cuatro pasos. Menos de 2 minutos. Todos los días.
</p>
```

to:

```tsx
<p className="text-center text-ink-tertiary text-sm mb-12">
  Cinco pasos. El ciclo completo.
</p>
```

- [ ] **Step 4: Verify visually**

Confirm in browser:
- 5 cards visible, numbered 01–05
- Card 01 shows "Dicta tu disponibilidad" with badge "Dictado de voz"
- Card 02 shows "Dicta lo que pasó"
- Tagline reads "Cinco pasos. El ciclo completo."
- Hover animations still work on all 5 cards

- [ ] **Step 5: Commit**

```bash
git add landing/components/HowItWorks.tsx
git commit -m "feat(landing): add scheduling as step 01 in HowItWorks, renumber to 5 steps"
```

---

## Task 2: Add MockAgendamiento + new section in FeatureHighlight

**Files:**
- Modify: `landing/components/FeatureHighlight.tsx`

### Context

`FeatureHighlight.tsx` exports a single component that renders two `<section>` blocks — "Agente de evolución" (bg-surface) and "Seguimiento del paciente" (white). We insert a NEW first section (white background) before both, keeping the white → surface → white alternation intact.

The `CheckIcon` component already exists in this file — reuse it, don't duplicate.

- [ ] **Step 1: Add the `MockAgendamiento` component**

Insert this new function after the closing brace of `MockPortalPaciente` (before `export default function FeatureHighlight`):

```tsx
function MockAgendamiento() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-ink-muted w-full max-w-[320px]">
      <div className="text-[10px] text-sage font-bold tracking-widest mb-3">
        DICTADO DE DISPONIBILIDAD
      </div>

      <div className="bg-surface border border-ink-muted text-xs px-3.5 py-3 rounded-xl mb-4 leading-relaxed text-ink-secondary italic">
        "Tengo libre martes y jueves de 4 a 6, y sábados de 9 a 12..."
      </div>

      <div className="text-[10px] text-ink-tertiary font-semibold tracking-wide mb-2">
        Horarios detectados:
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {['MAR 4–6pm', 'JUE 4–6pm', 'SÁB 9–12pm'].map((slot) => (
          <span
            key={slot}
            className="bg-sage-light text-sage text-xs font-semibold px-3 py-1 rounded-full"
          >
            {slot}
          </span>
        ))}
      </div>

      <button className="bg-sage text-white text-xs font-semibold rounded-xl py-2.5 w-full mb-3 cursor-default">
        Publicar horarios
      </button>

      <div className="flex justify-center">
        <span className="bg-sage-light text-sage text-xs rounded-full px-3 py-1">
          ✓ Notificación enviada al paciente
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Insert the new first section in `FeatureHighlight`**

The existing `export default function FeatureHighlight()` already returns a `<>` fragment with two sections. Add the new section as the FIRST child, before the existing `{/* Agente de evolución clínica */}` section. Do NOT touch the two existing sections at all — only prepend.

Concretely, locate line 119 in the current file:

```tsx
export default function FeatureHighlight() {
  return (
    <>
      {/* Agente de evolución clínica */}
```

And change it to:

```tsx
export default function FeatureHighlight() {
  return (
    <>
      {/* Agendamiento inteligente */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-8 sm:gap-14 flex-wrap justify-center">
          <FadeIn className="flex-none w-full sm:w-auto flex justify-center sm:block">
            <MockAgendamiento />
          </FadeIn>
          <FadeIn delay={0.2} className="w-full sm:flex-1 sm:min-w-[280px] max-w-lg">
            <div className="text-xs font-bold text-sage tracking-widest mb-3">
              AGENDAMIENTO INTELIGENTE
            </div>
            <h2 className="font-serif text-3xl font-normal mb-4 text-ink leading-snug">
              Dicta tus horas libres.{' '}
              <em>El paciente agenda solo.</em>
            </h2>
            <p className="text-sm leading-relaxed text-ink-secondary mb-6">
              Sin formularios ni apps externas. Dicta cuándo estás disponible y SyqueX
              publica tus horarios en el portal del paciente automáticamente.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Dicta tu disponibilidad — la IA interpreta los horarios y tú confirmas',
                'El paciente elige su cita desde su portal, sin idas y vueltas por WhatsApp',
                'Ambos reciben notificación por correo al instante',
              ].map((t) => (
                <div key={t} className="flex gap-2.5 items-start">
                  <CheckIcon />
                  <span className="text-sm leading-relaxed text-ink">{t}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Agente de evolución clínica */}
```

Everything after `{/* Agente de evolución clínica */}` remains exactly as it is in the original file.

- [ ] **Step 3: Verify visually**

In browser, scroll past HowItWorks to the feature sections. Confirm:
- New section appears first (white background) with mock card on left, copy on right
- `MockAgendamiento` shows: dictation bubble (italic), 3 sage pills (MAR/JUE/SÁB), green "Publicar horarios" button, "✓ Notificación enviada" pill
- "Agente de evolución" section follows with `bg-surface` (alternation correct)
- "Seguimiento del paciente" section follows with white background
- FadeIn animations trigger on scroll for the new section

- [ ] **Step 4: Commit**

```bash
git add landing/components/FeatureHighlight.tsx
git commit -m "feat(landing): add MockAgendamiento component and scheduling feature section"
```

---

## Task 3: Add scheduling feature to Pricing list

**Files:**
- Modify: `landing/components/Pricing.tsx`

### Context

The `features` array in `Pricing.tsx` lists what's included in the Pro plan. Add the scheduling feature after `'Seguimiento del paciente con acuerdos'`.

- [ ] **Step 1: Update the `features` array**

Current array (lines 12–20):

```tsx
const features = [
  'Pacientes ilimitados',
  'Notas SOAP o personalizadas con IA',
  'Agente de evolución clínica',
  'Búsqueda semántica en historial',
  'Seguimiento del paciente con acuerdos',
  'Expediente conforme a NOM-004',
  'Soporte prioritario por WhatsApp',
]
```

Replace with:

```tsx
const features = [
  'Pacientes ilimitados',
  'Notas SOAP o personalizadas con IA',
  'Agente de evolución clínica',
  'Búsqueda semántica en historial',
  'Seguimiento del paciente con acuerdos',
  'Agendamiento con notificación por correo',
  'Expediente conforme a NOM-004',
  'Soporte prioritario por WhatsApp',
]
```

- [ ] **Step 2: Verify visually**

Scroll to the Pricing section. Confirm:
- 8 checkmark items visible (was 7)
- "Agendamiento con notificación por correo" appears between "Seguimiento del paciente con acuerdos" and "Expediente conforme a NOM-004"
- Card layout not broken (height adjusts correctly)

- [ ] **Step 3: Commit**

```bash
git add landing/components/Pricing.tsx
git commit -m "feat(landing): add scheduling to Pricing features list"
```

---

## Final Verification

- [ ] Full scroll-through of the landing at `http://localhost:3000` — confirm no layout breaks
- [ ] Test on mobile viewport (375px) — 5 step cards stack correctly, mock card scales to full width
- [ ] Confirm section background alternation: HowItWorks(white) → Agendamiento(white) → Agente(surface) → Seguimiento(white) → ChatGPTComparison → Pricing
