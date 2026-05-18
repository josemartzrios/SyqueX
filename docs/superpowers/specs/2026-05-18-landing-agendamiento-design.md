# Landing — Agendamiento con notificación por correo

**Fecha:** 2026-05-18
**Scope:** `landing/` (Next.js) — sin cambios en backend ni en la app principal

---

## Contexto

El producto SyqueX incorporó un nuevo feature: el psicólogo dicta sus horas libres por voz, la IA extrae los slots disponibles y los publica en el portal del paciente. El paciente agenda directamente desde su portal. Ambos reciben notificación por correo al confirmar la cita.

La landing debe reflejar este feature de forma fiel al diseño actual (paleta sage/ink/amber, tipografía serif Lora para headings, cards blancas con `rounded-2xl border border-ink-muted`, FadeIn animations).

---

## Cambios

### 1. `landing/components/HowItWorks.tsx`

**Nuevo paso 01** (los actuales 01–04 pasan a ser 02–05):

```
01 — Dicta tu disponibilidad
Desc: Antes de tu primera sesión, dicta tus horas libres. La IA extrae los horarios y los publica automáticamente en el portal del paciente. Ambos reciben notificación por correo al confirmar la cita.
Badge: "Dictado de voz"
```

**Renumeración:**
- 01 → 02: "Dicta lo que pasó" (sin cambios de contenido)
- 02 → 03: "SyqueX genera la nota" (sin cambios de contenido)
- 03 → 04: "Pregúntale al agente" (sin cambios de contenido)
- 04 → 05: "El paciente lleva su seguimiento" (sin cambios de contenido)

**Tagline:** cambia de `"Cuatro pasos. Menos de 2 minutos. Todos los días."` a `"Cinco pasos. El ciclo completo."`

---

### 2. `landing/components/FeatureHighlight.tsx`

**Nuevo bloque** insertado como primer `<section>` (antes del bloque "Agente de evolución"). Fondo **blanco** (sin `bg-surface`) para mantener la alternancia visual: nuevo=blanco, agente=`bg-surface`, seguimiento=blanco.

**Estructura del bloque:**
- Layout: `MockAgendamiento` a la izquierda, copy a la derecha (espejo del bloque "Seguimiento del paciente" que tiene texto izquierda / mock derecha)
- Label: `AGENDAMIENTO INTELIGENTE`
- Título serif: `"Dicta tus horas libres. El paciente agenda solo."`
- 3 bullets con `CheckIcon`:
  1. "Dicta tu disponibilidad — la IA extrae y publica los horarios automáticamente"
  2. "El paciente elige su cita desde su portal, sin idas y vueltas por WhatsApp"
  3. "Ambos reciben notificación por correo al instante"

**Nuevo componente `MockAgendamiento`** (dentro del mismo archivo, estilo idéntico a `MockPortalPaciente`):
- Card `bg-white rounded-2xl p-5 shadow-lg border border-ink-muted max-w-[320px]`
- Header: label `DICTADO DE DISPONIBILIDAD` en `text-[10px] text-sage font-bold tracking-widest`
- Burbuja de dictado: texto en itálica simulando voz transcrita ("Tengo libre martes y jueves de 4 a 6, y sábados de 9 a 12...")
- Sección "Horarios detectados:" con 3 pills `bg-sage-light text-sage text-xs font-semibold px-3 py-1 rounded-full`: `MAR 4–6pm`, `JUE 4–6pm`, `SÁB 9–12pm`
- Botón "Publicar horarios" en `bg-sage text-white text-xs font-semibold rounded-xl py-2.5 w-full`
- Pill de confirmación al fondo: `✓ Notificación enviada al paciente` en `bg-sage-light text-sage text-xs rounded-full px-3 py-1`

---

### 3. `landing/components/Pricing.tsx`

Agregar al array `features`:
```
'Agendamiento con notificación por correo'
```
Posición sugerida: después de `'Seguimiento del paciente con acuerdos'`.

---

## Lo que NO cambia

- Hero, Nav, SocialProofBar, BeforeAfter, ChatGPTComparison, FAQ, FinalCTA, Footer — sin modificaciones
- Paleta de colores, tokens, tipografía — sin cambios
- Comportamiento de FadeIn — se reutiliza el mismo componente con los mismos `delay` patterns

---

## Archivos a modificar

| Archivo | Tipo de cambio |
|---|---|
| `landing/components/HowItWorks.tsx` | Nuevo paso 01, renumeración, tagline |
| `landing/components/FeatureHighlight.tsx` | Nuevo primer bloque + MockAgendamiento |
| `landing/components/Pricing.tsx` | Añadir feature a lista |
