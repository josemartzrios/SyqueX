# MVP Frontend Redesign — Documentation-First UI

**Date:** 2026-03-28
**Branch:** `feature/documentation-first-ui` desde `dev`
**Scope:** Frontend only — backend sin cambios

---

## Objetivo

Reemplazar la UI actual (chat-first) por el diseño documentation-first aprobado en los mockups, siguiendo el happy path clínico: **seleccionar paciente → dictar → generar nota → confirmar**.

---

## Contexto

- Demo interno, una cuenta fija (`ana@syquex.demo / demo1234`)
- No se necesita pantalla de login en este sprint
- Backend completamente funcional — todos los endpoints existen
- Reemplazo incremental sobre App.jsx existente (no reescritura desde cero)

---

## Alcance

### Dentro del scope

| Feature | Descripción |
|---------|-------------|
| Design tokens | CSS variables en `index.html`: paleta sage/amber/ink, tipografía Georgia/sans |
| Layout shell | Desktop split-view (sidebar + work area) + Mobile 3 tabs (Dictar/Nota/Historial) |
| PatientSidebar | Rediseño visual con nueva paleta, botón "+ Nuevo paciente" |
| DictationPanel | Textarea + botón "Generar nota" (componente nuevo) |
| SoapNoteDocument | S/O/A/P en serif, labels small-caps con color por estado (sage/amber/muted) |
| PatientHeader | Nombre, edad, motivo, count de sesiones confirmadas |
| NewPatientModal | Modal: nombre, edad, motivo, antecedentes (opcional) → `POST /patients`. En error: mensaje inline. En éxito: modal cierra + sidebar refresca. |
| Tab Historial | Integra SessionHistory existente sin reescritura |

### Fuera del scope

- Login / auth frontend
- Panel Evolución (segunda iteración)
- Dictado por voz (Fase 2)
- PDF, Google Drive, Google Calendar

---

## Design System

### Paleta
```css
--color-base: #ffffff;
--color-sidebar: #f4f4f2;
--color-sage: #5a9e8a;
--color-amber: #c4935a;
--color-ink: #18181b;
--color-muted: #9ca3af;
```

### Tipografía
- **Nota SOAP:** Georgia, serif — como un expediente clínico real
- **Dictado / UI:** system sans-serif

### Principios visuales
- Profundidad solo con surface color shifts — sin sombras
- SOAP: separación por espacio y peso tipográfico — sin cards ni bordes
- Labels SOAP en small-caps, color según estado: sage (done), amber (streaming), muted (pending)

### Estados del componente SoapNoteDocument

| Estado de la sección | Label color | Contenido |
|---------------------|-------------|-----------|
| Pendiente (aún no generada) | `--color-muted` | Vacío / placeholder punteado |
| Streaming (generándose) | `--color-amber` | Texto apareciendo con animación de cursor |
| Confirmada (completa) | `--color-sage` | Texto completo en Georgia serif |

El label cambia de color dinámicamente a medida que la respuesta del backend llega. El estado actual viene del parsing del texto de respuesta en App.jsx (lógica existente).

### Estados del DictationPanel

| Acción | Estado del botón "Generar nota" | Estado del textarea |
|--------|---------------------------------|---------------------|
| Idle | Habilitado | Editable |
| Procesando | Deshabilitado + spinner | `readOnly` |
| Error | Habilitado (retry) | Editable |

El DictationPanel es idéntico en mobile y desktop — mismo componente, mismas props. No hay UX específica de mobile más allá del layout del tab que lo contiene.

---

## Estructura de componentes

```
App
├── PatientSidebar
│   ├── PatientCard (×n)          ← reutilizado
│   └── NewPatientModal           ← nuevo
├── PatientHeader                 ← nuevo
└── WorkArea
    ├── [Desktop] split-view: DictationPanel | SoapNoteDocument
    └── [Mobile] tabs:
        ├── Dictar    → DictationPanel
        ├── Nota      → SoapNoteDocument
        └── Historial → SessionHistory (existente)
```

### Qué cambia vs qué se queda

| Archivo | Acción |
|---------|--------|
| `index.html` | Agregar CSS variables (design tokens) |
| `App.jsx` — render layer | Reemplazar JSX del `return()` con nueva estructura |
| `App.jsx` — estado y callbacks | Sin cambios (`useState`, `fetchPatients`, `processSession`, `confirmNote`) |
| `components/DictationPanel.jsx` | **Nuevo** — extrae textarea + "Generar nota" de App.jsx |
| `components/SoapNoteDocument.jsx` | **Nuevo** — reemplaza `NoteReview` con tipografía documentation-first |
| `components/PatientHeader.jsx` | **Nuevo** |
| `components/NewPatientModal.jsx` | **Nuevo** |
| `components/PatientSidebar` | **Rediseño visual** — misma lógica, nuevo skin |
| `components/SessionHistory` | Sin cambios — integrado en tab Historial |
| `components/PatientCard` | Sin cambios — reutilizado en PatientSidebar |
| `api.js` | Sin cambios |
| `backend/` | Sin cambios |

---

## Secuencia de construcción

1. **Design tokens** — CSS variables en `index.html`
2. **Layout shell** — reemplazar `return()` de App.jsx: desktop split-view + mobile tabs
3. **PatientSidebar** — rediseño visual + botón "+ Nuevo paciente"
4. **DictationPanel** — nuevo componente
5. **SoapNoteDocument** — nuevo componente (reemplaza NoteReview)
6. **PatientHeader** — nuevo componente
7. **NewPatientModal** — modal + conexión a `POST /patients`

---

## Contrato de datos

### NewPatientModal → `createPatient(name)`

El endpoint actual (`api.js`) solo acepta `name`. Para el MVP, el modal captura **solo el nombre** — age/reason/background son UI aspiracional diferida a cuando el backend soporte esos campos.

```js
// api.js — createPatient (sin cambios)
POST /api/v1/patients
Body: { name: string, risk_level: "low" }
```

Modal en éxito: cierra + `fetchPatients()` refresca el sidebar.
Modal en error: mensaje inline debajo del input ("No se pudo crear el paciente").

### SoapNoteDocument → `confirmNote(sessionId, noteData)`

```js
// api.js — confirmNote (sin cambios)
POST /api/v1/sessions/{sessionId}/confirm
Body: { edited_note: string }
```

El botón "Confirmar y guardar" vive al final de `SoapNoteDocument`. Solo visible cuando hay nota generada (`noteData` no vacío). Después de confirmar: botón muestra "Guardada ✓" por 2 segundos, luego resetea el estado de la sesión activa.

---

## Comportamiento mobile — tabs

| Tab | Estado inicial | Comportamiento |
|-----|---------------|----------------|
| Dictar | Textarea vacío, botón habilitado | Default al seleccionar paciente |
| Nota | Placeholder: "Genera una nota para verla aquí" | Se activa automáticamente al terminar de generar |
| Historial | Lista de sesiones confirmadas | Recibe `sessions` prop de App.jsx; se refresca automáticamente al confirmar |

Los tabs no bloquean entre sí — el usuario puede navegar libremente. Cambiar de tab no cancela una generación en curso.

---

## Mockups de referencia

- `docs/mockups/syquex-v2-desktop.html` — layout split-document, modal nuevo paciente
- `docs/mockups/syquex-v2-mobile.html` — 3 frames: lista pacientes, dictar, nota generándose

---

## Criterios de éxito

- [ ] Un psicólogo puede seleccionar un paciente existente, dictar, ver la nota SOAP generada en el panel derecho (desktop) o tab Nota (mobile), y confirmar
- [ ] La nota se renderiza con tipografía serif, secciones S/O/A/P visibles sin cards ni bordes
- [ ] "+ Nuevo paciente" abre modal y crea el paciente correctamente
- [ ] Layout funciona en desktop (≥1024px) y mobile (375px)
- [ ] No hay regresiones en la lógica de estado de App.jsx
