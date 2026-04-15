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
- Lista de sesiones `soapSessions` (filtrado `format !== 'chat'`), en el orden que devuelve la API (descendente por sesión — ya viene así del servidor; no se requiere `.sort()` adicional)
- Cada ítem: acordeón colapsable
  - Colapsado: dot de estado (sage=confirmada, amber=pendiente), número y fecha de sesión, preview de 2 líneas de `raw_dictation`, chevron derecho
  - Expandido: fondo `#fafaf9`, borde `1.5px solid rgba(90,158,138,0.25)`, chevron sage rotado 180°, `<SoapNoteDocument compact readOnly>` con los datos de la sesión
  - Solo un acordeón expandido a la vez — llamar `handleToggleSession(id)` existente, **no reimplementar la lógica de toggle**
  - El Modo Revisión usa su propio estado `reviewExpandedSessionId` (no comparte `expandedSessionId` del Modo Sesión para evitar que una sesión quede pre-expandida al volver a modo Sesión)
- Sin sesiones: texto "Sin sesiones confirmadas aún."

### Panel Evolución — flex, derecha

- Reutiliza `EvolucionPanel` existente sin modificaciones
- Carga lazy al activar modo Revisión:
  - Se dispara cuando `desktopMode === 'review'` y `!evolutionMessages.has(selectedPatientId)`
  - Llama `loadEvolutionChat(patientId)` + `loadPatientProfile(patientId)`
  - Si el paciente ya está en el Map, no refetchea (deduplicación por Map lookup)
- El `useEffect` existente para el tab mobile (`mobileTab === 'evolucion'`) se mantiene intacto — el nuevo efecto desktop es **aditivo**, ambos comparten el mismo Map
- `patientProfile` es `useState(null)` (plano, no un Map): se resetea a `null` en cada cambio de paciente vía `loadPatientChat`. El check de carga lazy es `if (!patientProfile)` — no asumir que funciona como `evolutionMessages`. No crear un Map para `patientProfile`.

---

## Segmented Control — PatientHeader

### Comportamiento

- Solo visible en **desktop** — insertar en el branch del JSX desktop (header sin `compact`), **no en el branch `compact={true}` del mobile strip**
- Renderizar solo si la prop `onModeChange` está presente (guard para compatibilidad con llamadas existentes)
- Dos opciones: `Sesión` | `Revisión`
- Opción activa: fondo blanco, sombra sutil, texto ink
- Opción inactiva: texto muted, sin fondo
- Al cambiar de paciente → `desktopMode` se resetea en `loadPatientChat` (no solo en `handleSelectConversation`, ya que `handleSavePatient` y `handleModalPatientCreated` también hacen switch de paciente a través de `loadPatientChat`)

### Visual

```
┌─────────────────────────────────────────────────┐
│ Ana García  · 3 sesiones   [Sesión] [Revisión] │
└─────────────────────────────────────────────────┘
```

- Pill container: `bg-[#f4f4f2]`, `rounded-lg`, `p-0.5`
- Opción activa: `bg-white`, `rounded-md`, `shadow-sm`, `font-medium text-ink text-[12px]`, `px-3 py-1`
- Opción inactiva: `text-ink-muted text-[12px]`, `px-3 py-1`

---

## Cambios en el código

### `App.jsx`

| Cambio | Detalle |
|--------|---------|
| `desktopMode` state | `useState('session')` — `'session' \| 'review'` |
| `reviewExpandedSessionId` state | `useState(null)` — separado de `expandedSessionId` del Modo Sesión |
| Reset en cambio de paciente | En `loadPatientChat` (no en `handleSelectConversation`): `setDesktopMode('session')` + `setReviewExpandedSessionId(null)` |
| Carga lazy modo revisión | `useEffect([desktopMode, selectedPatientId])`: si `desktopMode === 'review'` y `!evolutionMessages.has(selectedPatientId)` → `loadEvolutionChat` + `loadPatientProfile` (si `!patientProfile`) |
| Render área de trabajo desktop | Condicional sobre `desktopMode`: `'session'` → split actual sin cambios; `'review'` → Historial panel + EvolucionPanel |
| Props a PatientHeader | Agregar `mode={desktopMode}` y `onModeChange={setDesktopMode}` |
| Toggle acordeón en Revisión | Usar `reviewExpandedSessionId` + `setReviewExpandedSessionId` (inline en el render, mismo patrón que `expandedSessionId`) |

### `PatientHeader.jsx`

| Cambio | Detalle |
|--------|---------|
| Props nuevas | `mode` (`'session' \| 'review'`, default `'session'`), `onModeChange` (función, opcional) |
| Segmented control | Añadir dentro del branch desktop (sin `compact`), solo si `onModeChange` está definido |

### Sin cambios

- `EvolucionPanel.jsx` — se reutiliza sin modificaciones
- `SoapNoteDocument.jsx` — ya tiene prop `compact`
- `api.js` — no requiere nuevos endpoints
- Mobile layout — intacto (efectos y tabs existentes no se tocan)

---

## Layout desktop — Modo Revisión

```
┌──────────────────────────────────────────────────────────────────────┐
│  PatientSidebar (240px)  │  Work area (flex)                        │
│                          │  ┌─────────────────────────────────────┐ │
│  Ana García  ●           │  │ Header: Ana García  [Sesión][Revisión]│ │
│  Carlos M.               │  ├──────────────────┬──────────────────┤ │
│  Laura P.                │  │ Historial (380px) │ Evolución (flex) │ │
│                          │  │  overflow-y:auto  │                  │ │
│                          │  │ ▼ Sesión #4      │ [chat messages]  │ │
│                          │  │   [SOAP compact] │                  │ │
│                          │  │                  │ [chips]          │ │
│                          │  │ ▶ Sesión #3      │ [input →]        │ │
│                          │  │ ▶ Sesión #2      │                  │ │
│                          │  └──────────────────┴──────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Tablet (768–1024px):** El panel Historial (380px) y EvolucionPanel (flex) se comportan igual que en desktop — ambos hacen `overflow-y: auto` internamente. No se colapsan ni se apilan; el espacio simplemente es más estrecho. La nota SOAP expandida en Historial scrollea verticalmente dentro del panel.

---

## Estados de carga

| Estado | UI |
|--------|----|
| `evolutionLoading = true` | Spinner centrado en panel Evolución |
| Sin mensajes previos | "Inicia una conversación sobre {patient.name}" |
| `evolutionSending = true` | Input deshabilitado, burbuja de typing del agente |
| Error de red | Mensaje inline bajo el input |

---

## Testing

### Unit tests (Vitest + Testing Library)

| Componente | Casos a cubrir |
|------------|---------------|
| `PatientHeader` | Segmented control renderiza en desktop (sin `compact`); no renderiza en mobile (`compact=true`); click en "Revisión" llama `onModeChange('review')`; click en "Sesión" llama `onModeChange('session')`; no renderiza control si `onModeChange` es undefined |
| `App.jsx` — modo Revisión | Al activar modo Revisión con paciente sin historial en Map: se llaman `loadEvolutionChat` y `loadPatientProfile`; al activar con paciente ya cargado: no se vuelven a llamar |
| `App.jsx` — reset de modo | Cambiar de paciente (simular `loadPatientChat`) resetea `desktopMode` a `'session'` |
| `App.jsx` — render condicional | Modo `'session'` renderiza `DictationPanel`; modo `'review'` renderiza `EvolucionPanel` y el panel de historial |

### Tests de integración existentes

- Verificar que `App.integration.test.jsx` pasa sin regresiones tras los cambios en App.jsx
- Verificar que `PatientHeader.test.jsx` pasa y extender con los casos del segmented control

### Testing manual (smoke test)

1. Seleccionar paciente → modo Sesión activo por defecto
2. Dictar sesión → generar nota → confirmar → modo Sesión sin cambios
3. Cambiar a modo Revisión → historial visible, acordeón expandible con SOAP
4. Chat de Evolución funciona (enviar mensaje, recibir respuesta)
5. Cambiar de paciente → resetea a modo Sesión
6. Volver a Revisión → no refetchea si ya estaba cargado
7. Tablet (1024px): ambos paneles usables con scroll vertical
8. Mobile: 4 tabs intactos, sin regresiones

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
- [ ] Cambiar de paciente (vía lista, nuevo paciente, o modal) resetea a modo Sesión
- [ ] Evolución se carga lazy la primera vez que se activa el modo Revisión por paciente
- [ ] Expandir sesión en Revisión no deja sesiones pre-expandidas al volver a Sesión
- [ ] Mobile intacto — cero regresiones en tabs y lógica de evolución
- [ ] Tablet (768–1024px): los paneles de Revisión son usables con scroll vertical
