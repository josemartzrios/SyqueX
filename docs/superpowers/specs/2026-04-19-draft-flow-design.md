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

---

## Arquitectura

### Nuevo archivo: `frontend/src/hooks/useDraft.js`

Hook que encapsula toda la lógica de localStorage:

```js
// useDraft(patientId)
// retorna: { draft, setDraft, clearDraft }

// helpers estáticos:
// useDraft.hasDraft(patientId) → boolean — para que App pueda consultar
//   cualquier paciente sin montar el hook
```

- `draft` — string con el texto actual (vacío si no existe la key)
- `setDraft(text)` — escribe en localStorage inmediatamente
- `clearDraft()` — elimina la key del localStorage
- `useDraft.hasDraft(patientId)` — función estática que lee localStorage directamente

El hook hace `useEffect` sobre `patientId` para re-sincronizar cuando cambia el paciente seleccionado.

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
- Eliminar `setValue('')` de `handleGenerate` — App limpia el draft al éxito
- Agregar label condicional bajo el textarea:

```jsx
{value.trim() && (
  <div className="flex items-center gap-1.5 mt-1.5">
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

Cambio en el JSX del item — dot ámbar a la derecha del contenido, encima del botón de eliminar:

```jsx
{hasDraft && (
  <div className="w-1.5 h-1.5 rounded-full bg-[#c4935a] flex-shrink-0" />
)}
```

El componente padre (`PatientSidebar`) recibe una prop `draftPatientIds: Set<string>` y la pasa hacia abajo como `hasDraft={draftPatientIds.has(conv.patient_id)}`.

---

### `App.jsx` — orquestación

1. **Importar y usar el hook:**
```js
import useDraft from './hooks/useDraft';
const { draft, setDraft, clearDraft } = useDraft(selectedPatientId);
```

2. **Pasar props a DictationPanel** (dos lugares: desktop y mobile):
```jsx
<DictationPanel
  value={draft}
  onChange={setDraft}
  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
  loading={loading}
/>
```

3. **Limpiar draft al éxito** en `handleSendDictation`:
```js
const noteData = await processSession(selectedPatientId, dictation, format);
clearDraft(); // después del await exitoso
```

4. **Pasar `draftPatientIds` al sidebar:**
```js
// Computar el set de pacientes con borrador para el sidebar
const draftPatientIds = new Set(
  conversations
    .map(c => c.patient_id)
    .filter(id => useDraft.hasDraft(id))
);
```

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
| `frontend/src/components/DictationPanel.jsx` | Modificado — controlled component + label |
| `frontend/src/components/PatientSidebar.jsx` | Modificado — prop `hasDraft` + dot |
| `frontend/src/App.jsx` | Modificado — usar hook, pasar props, limpiar draft |

---

## Casos borde

- **Cambio de paciente con borrador:** el textarea se limpia visualmente (nuevo paciente no tiene draft), el borrador del paciente anterior persiste en localStorage
- **Borrador de paciente sin sesiones:** funciona igual, el patientId existe desde que se crea el paciente
- **localStorage lleno:** `setDraft` debe envolver el `localStorage.setItem` en try/catch — si falla, simplemente no persiste (no rompe el flujo)
- **Draft vacío tras trim:** no se guarda ni se muestra indicador (evita guardar solo espacios)

---

## Lo que NO hace esta feature

- No sincroniza entre dispositivos (eso requeriría backend)
- No guarda la nota generada como borrador (eso es feature #3b — "Borrador de nota SOAP", fuera de scope)
- No agrega endpoint nuevo al backend
