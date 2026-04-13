# Desktop Two-Mode Layout — Design Spec

**Date:** 2026-04-13
**Branch:** `feature/desktop-two-mode-layout` (from `dev`)
**Scope:** Desktop only — mobile intacto (4 tabs ya funcionan)

---

## Problema

El historial de sesiones en desktop está aplastado en una columna de 320px junto al panel de dictado, lo que hace ilegible la nota SOAP expandida. Además, la función Evolución (chat con el agente) no existe en desktop — solo existe en mobile como tab 4.

---

## Decisión de diseño

El área de trabajo desktop alterna entre **dos modos** controlados por un segmented control en el header del paciente:

| Modo | Contenido |
|------|-----------|
| **Sesión** | Layout split actual — DictationPanel (320px) + nota SOAP (flex) |
| **Revisión** | Historial (380px) + EvolucionPanel (flex) |

---

## Modo Sesión (sin cambios funcionales)

- `DictationPanel` (320px, izquierda) con mini historial compacto debajo
- Panel nota SOAP (flex, derecha)
- Es el modo por defecto al seleccionar un paciente

---

## Modo Revisión (nuevo)

### Panel Historial — 380px, izquierda

- Header fijo: label "Historial de sesiones" en small caps
- Lista de sesiones `soapSessions` (filtrado `format !== 'chat'`), orden descendente
- Cada ítem: acordeón colapsable
  - Colapsado: dot de estado (sage=confirmada, amber=pendiente), número y fecha de sesión, preview de 2 líneas de `raw_dictation`, chevron derecho
  - Expandido: fondo `#fafaf9`, borde `1.5px solid rgba(90,158,138,0.25)`, chevron sage rotado 180°, `<SoapNoteDocument compact readOnly>` con los datos de la sesión
  - Solo un acordeón expandido a la vez (`expandedSessionId` ya existe en App.jsx)
- Sin sesiones: texto "Sin sesiones confirmadas aún."

### Panel Evolución — flex, derecha

- Reutiliza `EvolucionPanel` existente sin modificaciones
- Misma lógica de carga lazy que el tab mobile:
  - Se dispara cuando `desktopMode === 'review'` y el paciente no está en `evolutionMessages`
  - Carga `loadEvolutionChat(patientId)` + `loadPatientProfile(patientId)`
- Si el paciente ya fue cargado en la misma sesión (Map ya tiene su entrada), no refetchea

---

## Segmented Control — PatientHeader

### Comportamiento

- Solo visible en **desktop** (`hidden md:flex` wrapper) cuando hay paciente activo
- Dos opciones: `Sesión` | `Revisión`
- Opción activa: fondo blanco, sombra sutil, texto ink
- Opción inactiva: texto muted, sin fondo
- Al cambiar de paciente → `desktopMode` resetea a `'session'`

### Visual

```
┌─────────────────────────────────────────────────┐
│ Ana García  · 3 sesiones   [Sesión] [Revisión] │
└─────────────────────────────────────────────────┘
```

- Pill container: `bg-[#f4f4f2]`, `rounded-lg`, `p-0.5`
- Opción activa: `bg-white`, `rounded-md`, `shadow-sm`, `font-medium text-ink text-[12px]`
- Opción inactiva: `text-ink-muted text-[12px]`
- Padding por opción: `px-3 py-1`

---

## Cambios en el código

### `App.jsx`

| Cambio | Detalle |
|--------|---------|
| `desktopMode` state | `useState('session')` — `'session' \| 'review'` |
| Reset en cambio de paciente | En `handleSelectConversation`: `setDesktopMode('session')` |
| Carga lazy en modo revisión | `useEffect` o bloque condicional: si `desktopMode === 'review'` y `!evolutionMessages.has(selectedPatientId)` → `loadEvolutionChat` + `loadPatientProfile` |
| Render área de trabajo desktop | Condicional sobre `desktopMode`: `'session'` → split actual; `'review'` → HistorialPanel + EvolucionPanel |
| Props a PatientHeader | Agregar `mode={desktopMode}` y `onModeChange={setDesktopMode}` |

### `PatientHeader.jsx`

| Cambio | Detalle |
|--------|---------|
| Props nuevas | `mode` (`'session' \| 'review'`, default `'session'`), `onModeChange` (función) |
| Segmented control | Render solo en desktop (`hidden md:flex`), solo si `onModeChange` está presente |

### Sin cambios

- `EvolucionPanel.jsx` — se reutiliza sin modificaciones
- `SoapNoteDocument.jsx` — ya tiene prop `compact`
- `api.js` — no requiere nuevos endpoints
- Mobile layout — intacto

---

## Layout desktop — Modo Revisión

```
┌──────────────────────────────────────────────────────────────────────┐
│  PatientSidebar (240px)  │  Work area (flex)                        │
│                          │  ┌─────────────────────────────────────┐ │
│  Ana García  ●           │  │ Header: Ana García  [Sesión][Revisión]│ │
│  Carlos M.               │  ├──────────────────┬──────────────────┤ │
│  Laura P.                │  │ Historial (380px) │ Evolución (flex) │ │
│                          │  │                  │                  │ │
│                          │  │ ▼ Sesión #4      │ [chat messages]  │ │
│                          │  │   [SOAP compact] │                  │ │
│                          │  │                  │ [chips]          │ │
│                          │  │ ▶ Sesión #3      │ [input →]        │ │
│                          │  │ ▶ Sesión #2      │                  │ │
│                          │  └──────────────────┴──────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Estados de carga

| Estado | UI |
|--------|----|
| `evolutionLoading = true` | Spinner centrado en panel Evolución |
| Sin mensajes previos | "Inicia una conversación sobre {patient.name}" |
| `evolutionSending = true` | Input deshabilitado, burbuja de typing del agente |
| Error de red | Mensaje inline bajo el input |

---

## Fuera del scope

- Evolución en mobile — ya funciona con 4 tabs
- Resizable panels (arrastrar divisor entre historial y evolución)
- Persistencia del modo entre sesiones del navegador
- Cambios en el backend

---

## Criterios de éxito

- [ ] Segmented control "Sesión | Revisión" visible en desktop cuando hay paciente activo
- [ ] Modo Sesión: layout split actual sin regresiones
- [ ] Modo Revisión: historial legible en 380px con acordeón y SOAP expandible
- [ ] Modo Revisión: EvolucionPanel funciona igual que en mobile
- [ ] Cambiar de paciente resetea a modo Sesión
- [ ] Evolución se carga lazy la primera vez que se activa el modo Revisión por paciente
- [ ] Mobile intacto — cero regresiones
- [ ] Tablet (768–1024px): segmented control funciona, los paneles en modo Revisión son usables
