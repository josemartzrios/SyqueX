# Draft Flow Design — Borrador → Guardado

**Date:** 2026-04-19  
**Feature:** Pre-deploy backlog #3 — Borrador / guardado automático  
**Branch base:** `feature/agent-patient-name`

---

## Objetivo

Evitar pérdida de dictado cuando el psicólogo recarga la página, cambia de paciente, o cierra el navegador antes de generar la nota. El texto del textarea se considera **borrador** desde que el usuario empieza a escribir, y se convierte en **guardado** (nota confirmada) al presionar "Generar nota" con éxito.

---

## Estados del flujo

| Estado | Condición | Indicadores visibles |
|--------|-----------|----------------------|
| Sin borrador | Textarea vacío | Ninguno |
| Borrador activo | Textarea tiene texto | Label ámbar "Borrador guardado" bajo el textarea + dot ámbar a la derecha del nombre del paciente en sidebar |
| Guardado | `processSession` retorna exitosamente | Draft limpiado, indicadores desaparecen |
| Error de API | `processSession` lanza excepción | Draft se conserva, usuario puede reintentar |

---

## Decisiones de diseño

- **Persistencia:** `localStorage` keyed por `patientId` (`syquex_draft_<patientId>`)
- **Scope:** por paciente — cambiar de paciente y volver restaura el borrador del paciente anterior
- **Sobrevive refresh:** sí — `localStorage` persiste entre sesiones del navegador
- **Cuándo limpiar:** solo al éxito del API call, nunca en error
- **Indicador sidebar:** dot ámbar `#c4935a` alineado a la derecha del item (sin desplazar el texto del nombre)
- **Indicador panel:** label ámbar "Borrador guardado" con dot, aparece bajo el textarea mientras `value.trim()` sea truthy
- **Borrador al eliminar paciente:** `onDeleteConversation` debe llamar `clearDraft(patientId)` para no dejar keys huérfanas en localStorage

---

## Arquitectura

### Nuevo archivo: `frontend/src/hooks/useDraft.js`

El hook usa **React state** internamente (no solo localStorage) para que `App` re-renderice reactivamente cuando el draft cambia — esto hace que el dot en el sidebar aparezca/desaparezca sin delay.

```js
import { useState, useEffect } from 'react';

const STORAGE_KEY = (patientId) => `syquex_draft_${patientId}`;

export default function useDraft(patientId) {
  const [draft, setDraftState] = useState(
    // Lazy initializer — lee localStorage una sola vez al montar,
    // evita el flash de textarea vacío al cambiar de paciente
    () => (patientId ? localStorage.getItem(STORAGE_KEY(patientId)) ?? '' : '')
  );

  // Re-sincronizar cuando cambia el paciente seleccionado
  useEffect(() => {
    setDraftState(patientId ? localStorage.getItem(STORAGE_KEY(patientId)) ?? '' : '');
  }, [patientId]);

  const setDraft = (text) => {
    setDraftState(text);
    if (!patientId) return;
    try {
      if (text) {
        localStorage.setItem(STORAGE_KEY(patientId), text);
      } else {
        localStorage.removeItem(STORAGE_KEY(patientId));
      }
    } catch {
      // localStorage lleno — no rompe el flujo, solo no persiste
    }
  };

  const clearDraft = () => {
    setDraftState('');
    if (patientId) localStorage.removeItem(STORAGE_KEY(patientId));
  };

  return { draft, setDraft, clearDraft };
}

// Función estática — lee localStorage directamente sin necesidad de montar el hook.
// Uso: useDraft.hasDraft(patientId) → boolean
// Útil para computar draftPatientIds en App sin efectos secundarios.
useDraft.hasDraft = (patientId) =>
  !!patientId && !!localStorage.getItem(STORAGE_KEY(patientId));
```

Dado que `setDraft` actualiza React state, cada llamada desde `onChange` del textarea causa un re-render de `App`, lo que recomputa `draftPatientIds` y mantiene el dot del sidebar sincronizado en tiempo real.

---

### `DictationPanel.jsx` — controlled component

**Props actuales:**
```jsx
function DictationPanel({ onGenerate, loading })
```

**Props nuevas:**
```jsx
function DictationPanel({ value, onChange, onGenerate, loading })
```

Cambios internos:
- Eliminar `const [value, setValue] = useState('')`
- Textarea: `value={value}`, `onChange={(e) => onChange(e.target.value)}`
- `handleGenerate` mantiene `onGenerate(value.trim())` — el trim sigue viviendo aquí. Solo se elimina `setValue('')` (App limpia el draft al éxito via `clearDraft`)
- Agregar label condicional bajo el textarea (entre el textarea y el toolbar):

```jsx
{value.trim() && (
  <div className="flex items-center gap-1.5 px-5 pb-1">
    <div className="w-1.5 h-1.5 rounded-full bg-[#c4935a]" />
    <span className="text-[10px] text-[#c4935a] font-medium">Borrador guardado</span>
  </div>
)}
```

---

### `PatientSidebar.jsx` — prop `hasDraft` en `PatientConversationItem`

**Props actuales de `PatientConversationItem`:**
```jsx
function PatientConversationItem({ conv, active, onClick, onDelete })
```

**Props nuevas:**
```jsx
function PatientConversationItem({ conv, active, onClick, onDelete, hasDraft })
```

Cambio en el JSX del item — dot ámbar a la derecha del contenido, dentro del `div` que ya tiene `pr-6` (donde vive el botón de eliminar):

```jsx
{hasDraft && (
  <div className="absolute right-8 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#c4935a]" />
)}
```

El componente padre (`PatientSidebar`) recibe una prop `draftPatientIds: Set<string>` y la pasa hacia abajo:
```jsx
hasDraft={draftPatientIds.has(String(conv.patient_id))}
```

---

### `App.jsx` — orquestación

**1. Importar y usar el hook:**
```js
import useDraft from './hooks/useDraft';
const { draft, setDraft, clearDraft } = useDraft(selectedPatientId);
```

**2. Pasar props a `DictationPanel`** — actualizar **ambos** lugares (desktop ~línea 610 y mobile ~línea 797):
```jsx
<DictationPanel
  value={draft}
  onChange={setDraft}
  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
  loading={loading}
/>
```

**3. Limpiar draft al éxito** en `handleSendDictation`:
```js
const noteData = await processSession(selectedPatientId, dictation, format);
clearDraft(); // después del await exitoso, antes del setMessages
```

**4. Limpiar draft al eliminar paciente** en el handler de `onDelete`:
```js
// Dentro del handler que llama archivePatientSessions o equivalente:
useDraft.hasDraft(patientId) && localStorage.removeItem(`syquex_draft_${patientId}`);
// O mejor: exponer clearDraft como helper estático también:
useDraft.clearDraftFor = (patientId) =>
  localStorage.removeItem(`syquex_draft_${patientId}`);
```

**5. Computar `draftPatientIds` para el sidebar** — se recalcula en cada render de App (barato, `localStorage` es síncrono):
```js
const draftPatientIds = new Set(
  conversations.map(c => String(c.patient_id)).filter(useDraft.hasDraft)
);
```

**6. Pasar al sidebar:**
```jsx
<PatientSidebar
  ...
  draftPatientIds={draftPatientIds}
/>
```

---

## Archivos modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `frontend/src/hooks/useDraft.js` | **Nuevo** |
| `frontend/src/components/DictationPanel.jsx` | Modificado — controlled component + label ámbar |
| `frontend/src/components/PatientSidebar.jsx` | Modificado — prop `hasDraft` + dot a la derecha |
| `frontend/src/App.jsx` | Modificado — usar hook, pasar props (×2 lugares), limpiar draft al éxito y al eliminar |

---

## Casos borde

- **Cambio de paciente con borrador:** `useEffect` en el hook carga el draft del nuevo paciente desde localStorage; el borrador del anterior queda intacto
- **Refresh de página:** lazy `useState` initializer carga el draft del paciente activo desde localStorage sin flash
- **localStorage lleno:** `setDraft` envuelve `setItem` en try/catch — si falla, el draft no persiste pero el textarea sigue funcionando
- **Draft vacío tras trim:** `setDraft('')` llama `removeItem` — no queda key vacía en localStorage
- **Error de API:** draft se conserva; el usuario está en tab "nota" (mobile) viendo el error, pero al volver a "Dictar" el textarea restaura el texto correctamente
- **Paciente eliminado:** `onDeleteConversation` llama `useDraft.clearDraftFor(patientId)` para evitar keys huérfanas
- **`patientId` como string vs number:** todos los usos hacen `String(patientId)` para consistencia en las keys de localStorage

---

## Lo que NO hace esta feature

- No sincroniza entre dispositivos (requeriría backend)
- No guarda la nota SOAP generada como borrador (fuera de scope)
- No agrega endpoint nuevo al backend
