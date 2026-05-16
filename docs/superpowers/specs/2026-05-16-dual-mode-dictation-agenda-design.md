# Spec: Dual-Mode DictationPanel + Agenda Navigation

**Fecha:** 2026-05-16  
**Feature:** Panel de dictado dual (nota clínica / disponibilidad) + Agenda como sección top-level  
**Branch target:** `dev`

---

## Contexto

SyqueX tenía el `DictationPanel` exclusivamente ligado al contexto de paciente (generar nota SOAP/personalizada). El `CalendarScreen` existía como modal overlay para gestión manual de slots.

Este feature convierte la Agenda en una sección top-level de la app, agrega un modo de disponibilidad AI-asistido al `DictationPanel`, y refactoriza `CalendarScreen` para soportar uso inline además de modal.

---

## Objetivo

Reducir fricción al psicólogo para establecer disponibilidad: en lugar de crear slots uno a uno manualmente, describe en texto libre cuándo está disponible y el AI genera los horarios para confirmar.

---

## Arquitectura de Navegación

### Mobile (375px) — bottom nav + inner tabs

```
Bottom nav permanente (2 ítems):
  👤 Pacientes  |  📅 Agenda

Pacientes → sin paciente seleccionado:
  Lista de pacientes + empty state con botones "Mi Agenda" y "Nuevo Expediente"

Pacientes → paciente seleccionado:
  Inner tabs (sin cambio): Escribir | Nota | Historial | Evolución

Agenda →
  Inner tabs: Disponibilidad | Calendario
```

### Desktop — sidebar + split view

```
Sidebar:
  - Lista de pacientes (igual que hoy)
  - Sección "📅 AGENDA" (botón/link)

Split view contextual (320px + flex):
  Paciente seleccionado:   DictationPanel(nota)      + NotePreview
  Agenda activa:           DictationPanel(disponib.) + CalendarScreen(inline)
```

### Cambios de navegación puntuales

| Elemento | Antes | Después |
|---|---|---|
| Bottom nav mobile | No existe | `Pacientes \| Agenda` permanente |
| Inner tabs Pacientes | `Escribir\|Nota\|Historial\|Evolución` | Sin cambio |
| Inner tabs Agenda | No existe | `Disponibilidad \| Calendario` |
| Botón "Mi Agenda" (empty state) | Abre modal `CalendarScreen` | Navega a tab Agenda |
| Botón "Nuevo Expediente" | Sin cambio | Sin cambio |
| Sidebar desktop | Solo lista pacientes | + sección `📅 Agenda` |
| `CalendarScreen` | Modal `fixed inset-0` | Modal (default) + inline (nuevo prop) |

---

## DictationPanel — Modo Disponibilidad

El panel mantiene el mismo lenguaje visual que el modo nota. Se activa cuando el contexto es Agenda (no requiere paciente seleccionado).

### Estados del panel

**Estado 1 — Input:**
- Label: `DISPONIBILIDAD · [fecha actual]`
- Textarea libre: `"Describe cuándo estás disponible — un día, varios o una semana…"`
- Hint sutil (text-xs, ink-tertiary): `"Ej: Lunes de 9 a 2, miércoles solo de 10 a 12"`
- CTA primario: `"Interpretar disponibilidad →"` (sage, mismo estilo que "Generar nota →")

**Estado 2 — Loading:**
- Textarea disabled (opacidad 50%)
- Botón: spinner + `"Interpretando…"` (disabled)

**Estado 3 — Preview:**
- Link `"← Editar texto"` para volver al input
- Label: `INTERPRETADO` (xs uppercase, ink-tertiary)
- Slots agrupados por fecha: cada slot muestra hora + `✕` para eliminarlo del preview antes de confirmar
- Resumen: `"7 horarios en 2 días"` (text-sm, ink-secondary)
- Botones: `[Descartar]` (secundario) + `[Confirmar 7 →]` (sage primario)

**Estado 4 — Error:**
- Mensaje red-50 (mismo estilo que `CalendarScreen`): `"No pude identificar fechas u horas. Intenta: 'Lunes de 9 a 2, sesiones 50 min'"`
- Botón reactivo de nuevo

**Estado 5 — Confirmado:**
- Toast existente: `"7 horarios creados"` (3.5s)
- Panel regresa a Estado 1 limpio
- `CalendarScreen` inline se refresca automáticamente

### Props nuevos en DictationPanel

```jsx
panelMode: 'nota' | 'disponibilidad'   // default: 'nota'
onParseAvailability: (text) => Promise<slots[]>
onConfirmSlots: (slots[]) => Promise<void>
```

`App.jsx` pasa `panelMode='disponibilidad'` cuando `activeSection === 'agenda'`, y `panelMode='nota'` cuando hay un paciente seleccionado. Son mutuamente excluyentes — la sección Agenda no requiere paciente activo.

---

## CalendarScreen — Refactor modal → inline

Cambio mínimo: un prop `mode` que ajusta solo el className raíz y la visibilidad del botón de cierre.

```jsx
// Antes
<div className="fixed inset-0 z-50 bg-[#f4f4f2] flex flex-col md:flex-row …">

// Después
<div className={mode === 'modal'
  ? "fixed inset-0 z-50 bg-[#f4f4f2] flex flex-col md:flex-row …"
  : "flex flex-col md:flex-row h-full …"
}>

// Botón ✕ solo visible en modal
{mode === 'modal' && <button onClick={onClose}>…</button>}
```

**`mode="modal"` (default):** comportamiento actual intacto, backward-compatible.  
**`mode="inline"`:** fills su contenedor, sin botón ✕, sin z-index.

---

## Data Flow

### Endpoint: parse de disponibilidad

```
POST /api/v1/calendar/parse-availability
Authorization: Bearer <token>

Body:
{
  "text": "Lunes de 9 a 2, miércoles solo de 10 a 12",
  "reference_date": "2026-05-15"
}

Response 200:
{
  "slots": [
    { "slot_date": "2026-05-18", "start_time": "09:00", "duration_minutes": 50 },
    { "slot_date": "2026-05-18", "start_time": "09:50", "duration_minutes": 50 },
    ...
  ]
}

Response 422:
{
  "detail": "No se pudieron identificar fechas u horas en el texto proporcionado."
}
```

Claude recibe: texto + `reference_date` + instrucción de producir slots de 50 min consecutivos dentro de cada rango horario indicado. Devuelve JSON estructurado.

### Endpoint: creación batch de slots

```
POST /api/v1/calendar/slots/batch
Authorization: Bearer <token>

Body:
{
  "slots": [
    { "slot_date": "2026-05-18", "start_time": "09:00", "duration_minutes": 50 },
    ...
  ]
}

Response 200:
{
  "created": 7,
  "skipped": 2   // duplicados ignorados (lógica de unicidad ya existe en DB)
}
```

### Flujo completo

```
1. Psicólogo escribe texto en DictationPanel (disponibilidad)
2. Toca "Interpretar disponibilidad →"
3. POST /calendar/parse-availability  →  array de slots propuestos
4. Frontend muestra preview agrupado por fecha
   └─ Error 422: muestra estado 4 (error con sugerencia)
5. Psicólogo revisa, elimina slots no deseados (✕), confirma
6. POST /calendar/slots/batch  →  { created, skipped }
7. Toast "X horarios creados" + CalendarScreen inline se refresca (loadSlots())
```

---

## Componentes Afectados

| Componente | Cambio |
|---|---|
| `CalendarScreen.jsx` | +prop `mode: 'modal'\|'inline'`, condicional en className y botón ✕ |
| `DictationPanel.jsx` | +prop `panelMode`, renderiza UI de disponibilidad cuando `panelMode='disponibilidad'` |
| `App.jsx` | Lógica sección Agenda, bottom nav mobile, routing de modos del panel |
| `api.js` | +`parseAvailability(text, referenceDate)`, +`createCalendarSlotsBatch(slots[])` |
| `BottomNav.jsx` | Nuevo componente para el bottom nav top-level `Pacientes\|Agenda`. El `MobileTabNav.jsx` existente se conserva para los inner tabs de Pacientes sin cambio. |

---

## Backend

### Nuevo archivo: `api/calendar_ai.py`

Lógica de parsing de disponibilidad con Claude. Separado de `routes.py` por responsabilidad única (SOLID).

### Cambios en `api/routes.py`

- `POST /calendar/parse-availability` — llama `calendar_ai.parse_availability(text, reference_date)`
- `POST /calendar/slots/batch` — itera slots, llama `createCalendarSlot` por cada uno, maneja duplicados silenciosamente

### Cambios en `api.js` (frontend)

```js
export async function parseAvailability(text, referenceDate) { … }
export async function createCalendarSlotsBatch(slots) { … }
```

---

## UX Guidelines Aplicadas (ui-ux-pro-max)

| Regla | Aplicación |
|---|---|
| `primary-action` | Un solo CTA por estado del panel |
| `loading-buttons` | Disabled + spinner durante parsing AI |
| `progressive-disclosure` | Textarea → preview solo tras parsear |
| `error-feedback` | Error con ejemplo concreto de corrección |
| `touch-target-size` | Todos los elementos interactivos ≥ 44px |
| `nav-hierarchy` | Separación clara top-level (Pacientes/Agenda) vs inner tabs |
| `bottom-nav-limit` | 2 ítems top-level, 4 inner tabs Pacientes, 2 inner tabs Agenda |
| `adaptive-navigation` | Desktop: sidebar; mobile: bottom nav |
| `state-transition` | Fade suave input ↔ preview en DictationPanel |
| `mobile-first` | Diseñado desde 375px, escalado a desktop |

---

## Testing

### Backend
- `test_parse_availability`: texto válido → slots correctos con fechas absolutas
- `test_parse_availability_invalid`: texto sin fechas → 422
- `test_create_slots_batch`: creación masiva, duplicados ignorados
- `test_create_slots_batch_empty`: array vacío → 400

### Frontend
- `DictationPanel.test.jsx`: estados input → loading → preview → confirmado
- `DictationPanel.test.jsx`: estado error (AI no parsea)
- `CalendarScreen.test.jsx`: renderiza sin botón ✕ en `mode="inline"`
- `App.test.jsx`: bottom nav mobile navega entre Pacientes y Agenda
