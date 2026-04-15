# Desktop UI Cleanup — Design Spec

**Date:** 2026-04-13  
**Branch:** feature/desktop-ui-cleanup  
**Scope:** Frontend only — no backend changes

---

## Resumen

Cinco ajustes de UI derivados de revisión del flujo desktop/mobile. Todos son cambios visuales o de layout; ninguno toca lógica de estado ni API.

---

## Cambios

### 1. Botón "+ Nuevo paciente" → icono junto al label (desktop)

**Archivo:** `frontend/src/components/PatientSidebar.jsx`

- **Antes:** Botón verde ancho "Nuevo paciente" pinned al fondo del sidebar, sobre "Cerrar sesión".
- **Después:** Botón icono `+` (SVG, 14px) a la derecha del label "PACIENTES", `text-gray-400` en reposo, `text-[#5a9e8a]` en hover. Tooltip `title="Nuevo paciente"`. Sin texto visible.
- El formulario inline de creación (input + Guardar/Cancelar) permanece igual y se sigue mostrando debajo del label.
- El bloque pinned-bottom del botón ancho se elimina por completo.
- **Solo desktop:** el mobile ya tiene su propio botón "Nuevo" en el top bar — no se toca.

### 2. Eliminar botón "Voz — próximamente" (desktop y mobile)

**Archivo:** `frontend/src/components/DictationPanel.jsx`

- Se elimina el `<button disabled>` con texto "⏺ Voz — próximamente" (líneas 41-47).
- El botón "Generar nota →" pasa a ocupar el ancho completo del toolbar (`flex-1` solo, sin `gap-3` ni hermano).
- Aplica automáticamente a desktop y mobile — `DictationPanel` es un componente compartido.

### 3. Eliminar historial de sesiones debajo del dictado (desktop)

**Archivo:** `frontend/src/App.jsx`

- En modo Sesión desktop, el panel izquierdo mostraba el historial de notas debajo de `DictationPanel` cuando `soapSessions.length > 0`.
- Se elimina ese bloque condicional completo.
- El panel izquierdo queda con solo `DictationPanel` — limpio y sin ruido visual.
- El historial completo sigue disponible en el modo Revisión.

### 4. Cards del modo Revisión desktop → estilo mobile

**Archivo:** `frontend/src/App.jsx`

Las cards del modo Revisión (panel izquierdo) adoptan el estilo del historial mobile:

| Propiedad | Antes (desktop) | Después (= mobile) |
|-----------|-----------------|---------------------|
| Fondo reposo | `bg-transparent` | `bg-[#f4f4f2]` |
| Fondo expandido | `bg-white shadow-sm ring-1 ring-[#5a9e8a]/20` | `bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25` |
| Preview dictado | `line-clamp-1` | `line-clamp-2` |
| Badge estado | Ausente | `"Confirmada"` / `"Pendiente"` en small-caps con color (sage / amber) |

### 5. Panel SOAP vacío → indicio visual sutil (desktop)

**Archivo:** `frontend/src/App.jsx`

- **Antes:** Dos líneas de texto placeholder centradas ("La nota SOAP aparecerá aquí." / "Escribe un dictado…").
- **Después:** Ícono SVG de documento outline (32px, `text-gray-200`) centrado verticalmente, con tres barras cortas debajo simulando renglones (`bg-gray-100`, alturas y anchos escalonados, bordes redondeados). Sin texto.
- El estado mobile de la tab Nota mantiene su texto placeholder actual (fuera de scope).

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `frontend/src/components/PatientSidebar.jsx` | Cambio 1 |
| `frontend/src/components/DictationPanel.jsx` | Cambio 2 |
| `frontend/src/App.jsx` | Cambios 3, 4, 5 |

## Fuera de scope

- Lógica de estado, llamadas a API, props — sin cambios.
- Mobile top bar "Nuevo" button — sin cambios.
- Tab Nota mobile empty state — sin cambios.
- Tests — no se añaden tests nuevos para cambios puramente visuales.
