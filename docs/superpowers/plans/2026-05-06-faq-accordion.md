# FAQ Accordion — Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una sección de Preguntas Frecuentes en formato acordeón exclusivo (una abierta a la vez) entre Benefits y Pricing en la landing page de SyqueX.

**Architecture:** Un componente cliente nuevo `FAQ.tsx` con `useState` para rastrear el índice del ítem abierto. La animación de apertura/cierre usa la técnica CSS grid `grid-rows-[0fr/1fr]` sin medir alturas con JS. `page.tsx` importa el componente y lo posiciona entre `<Benefits />` y `<Pricing />`.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS 3

---

## Archivos afectados

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear  | `landing/components/FAQ.tsx` | Componente acordeón completo con estado y animación |
| Editar | `landing/app/page.tsx` | Importar y posicionar `<FAQ />` entre Benefits y Pricing |

---

## Task 1: Crear `FAQ.tsx`

**Files:**
- Create: `landing/components/FAQ.tsx`

- [ ] **Step 1: Crear el archivo con el componente completo**

Crea `landing/components/FAQ.tsx` con este contenido exacto:

```tsx
'use client'

import { useState } from 'react'

const faqs = [
  {
    question: '¿Es seguro subir datos de pacientes?',
    answer:
      'Sí. SyqueX fue diseñado desde cero para cumplir con la Ley Federal de Protección de Datos Personales en Posesión de Particulares (LFPDPPP). Todos los datos clínicos se guardan cifrados con estándares bancarios — solo tú tienes acceso a tu expediente. Para la generación de notas utilizamos la API de Anthropic bajo un contrato de procesamiento de datos (DPA) que prohíbe explícitamente usar tu información para entrenar modelos de inteligencia artificial. Los datos se procesan únicamente para generar la nota y se olvidan inmediatamente. SyqueX es la única herramienta de documentación clínica en México diseñada específicamente para cumplir con la ley mexicana de privacidad.',
  },
  {
    question: '¿No puede hacer lo mismo ChatGPT?',
    answer:
      'ChatGPT puede generar texto clínico, pero no recuerda nada. Cada vez que abres una conversación nueva, empieza desde cero — no sabe quién es tu paciente, qué trabajaron la sesión pasada ni qué patrones ha mostrado en los últimos meses. SyqueX construye memoria clínica acumulativa: cada sesión que documentas enriquece el historial del paciente. Con el tiempo el agente detecta patrones entre sesiones, identifica señales de alerta y sugiere focos para la próxima sesión basándose en todo el historial, no solo en lo que escribiste hoy. Además, usar ChatGPT con datos reales de pacientes tiene implicaciones legales bajo la LFPDPPP que SyqueX resuelve desde el primer día.',
  },
  {
    question: '¿El psicólogo sigue siendo responsable del contenido clínico?',
    answer:
      'Siempre. SyqueX es una herramienta de apoyo, no un sustituto del criterio profesional. El agente genera una propuesta de nota basada en tu dictado — tú la revisas, la editas y la confirmas antes de que quede guardada en el expediente. Ninguna nota se guarda sin tu aprobación explícita. La inteligencia clínica, el diagnóstico y las decisiones terapéuticas son y seguirán siendo tuyas. SyqueX existe para que dediques menos tiempo al papeleo y más tiempo a lo que solo tú puedes hacer.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="bg-white max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="font-serif text-2xl font-semibold text-ink mb-10">
        Preguntas frecuentes
      </h2>
      <div className="divide-y divide-ink-muted">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index
          return (
            <div key={index}>
              <button
                onClick={() => toggle(index)}
                className="w-full flex items-center justify-between py-5 text-left gap-4"
                aria-expanded={isOpen}
              >
                <span className="font-semibold text-ink">{faq.question}</span>
                <svg
                  className={`shrink-0 w-5 h-5 text-ink-secondary transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <p className="text-sm text-ink-secondary leading-relaxed pb-5">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verificar que TypeScript no reporta errores**

Ejecuta desde `landing/`:
```bash
npx tsc --noEmit
```
Esperado: sin errores. Si aparece alguno, revisa que el archivo tenga exactamente la directiva `'use client'` en la primera línea.

- [ ] **Step 3: Commit**

```bash
git add landing/components/FAQ.tsx
git commit -m "feat(landing): add FAQ accordion component"
```

---

## Task 2: Integrar FAQ en `page.tsx`

**Files:**
- Modify: `landing/app/page.tsx`

- [ ] **Step 1: Añadir el import y el componente en `page.tsx`**

El archivo actual es:
```tsx
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <Pricing />
      </main>
      <Footer />
    </>
  )
}
```

Reemplázalo con:
```tsx
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import FAQ from '../components/FAQ'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <FAQ />
        <Pricing />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Levantar el servidor de desarrollo y verificar visualmente**

Desde `landing/`:
```bash
npm run dev
```

Abre `http://localhost:3000` y verifica:

1. La sección "Preguntas frecuentes" aparece entre Benefits y Pricing
2. Las tres preguntas se muestran cerradas al cargar
3. Hacer clic en la primera pregunta la abre con animación suave
4. Hacer clic en la segunda pregunta abre la segunda y cierra la primera automáticamente
5. Hacer clic en una pregunta abierta la cierra
6. El chevron rota 180° al abrir y vuelve a su posición al cerrar
7. En móvil (DevTools → responsive) el layout se ve correcto

- [ ] **Step 3: Commit**

```bash
git add landing/app/page.tsx
git commit -m "feat(landing): integrate FAQ section between Benefits and Pricing"
```
