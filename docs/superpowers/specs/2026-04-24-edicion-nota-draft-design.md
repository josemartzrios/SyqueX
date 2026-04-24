# Spec: Edición inline de nota clínica en estado draft

**Fecha:** 2026-04-24
**Branch:** feature/note-personalized (o feature nuevo desde dev)
**Estado:** Aprobado — listo para implementación

---

## Resumen

El psicólogo puede editar la nota clínica generada por el agente directamente en la interfaz antes de confirmarla. La edición aplica únicamente a notas en estado **draft**. Una vez confirmada, la nota es inmutable.

---

## Alcance

### Incluye
- Edición inline de los 4 campos SOAP: Subjetivo, Objetivo, Evaluación, Plan
- Edición de alertas clínicas: eliminar existentes, agregar nuevas
- Edición de patrones detectados: eliminar existentes, agregar nuevos
- Edición de campos personalizados en notas con formato custom
- Funciona igual en desktop (panel derecho) y mobile (tab Nota)

### Excluye
- Edición de notas ya confirmadas
- Botón "Restaurar original de IA" (se confía en el criterio del psicólogo)
- Trazabilidad de qué cambió el clínico vs qué generó la IA
- Cambios en backend o base de datos

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/SoapNoteDocument.jsx` | Cambios principales: estado local, edición inline, alertas, patrones |
| `frontend/src/components/CustomNoteDocument.jsx` | Mismo patrón para campos custom |
| `frontend/src/App.jsx` | Mínimo: verificar que `onConfirm` recibe el contenido editado |

No cambia: `api.js`, backend, base de datos.

---

## Interacción de edición

### Campos SOAP

- **En reposo:** `<div>` con `cursor: text` y `border: 1.5px dashed #d1d5db` como hint visual de editabilidad
- **Al hacer click:** se activa `activeField` → el campo se reemplaza por `<textarea>` auto-enfocada, pre-llenada con valor actual, auto-resize por `scrollHeight`
- **Al hacer blur:** valor guardado en `editedFields` state, `activeField` limpiado → vuelve a `<div>` con el nuevo valor
- **Campo activo:** `border: 1.5px solid #5a9e8a` (sage) con fondo `#fffef9`

### Alertas

- Cada alerta se muestra como chip con botón **×**
- Click en **×** filtra la alerta del array `editedFields.alerts`
- Botón **"+ Agregar"** muestra un `<input>` inline
- Enter o blur con contenido no vacío agrega la alerta al array y cierra el input

### Patrones detectados

- Idéntico al flujo de alertas
- Array `editedFields.detected_patterns`, chips con **×**, botón **"+ Agregar"** inline

### Nota personalizada (CustomNoteDocument)

- Campos de texto: mismo patrón click-to-textarea
- Campos de tipo checkbox/select: ya son interactivos por naturaleza, sin cambio de patrón

---

## Estado local (SoapNoteDocument)

```javascript
const [editedFields, setEditedFields] = useState({
  subjective: structured_note?.subjective ?? '',
  objective: structured_note?.objective ?? '',
  assessment: structured_note?.assessment ?? '',
  plan: structured_note?.plan ?? '',
  alerts: alerts ?? [],
  detected_patterns: detected_patterns ?? [],
})
const [activeField, setActiveField] = useState(null) // 'subjective' | 'objective' | etc.
const [newAlertInput, setNewAlertInput] = useState(false)
const [newPatternInput, setNewPatternInput] = useState(false)
```

---

## Flujo de datos

```
[Claude genera nota]
       ↓
SoapNoteDocument recibe props { structured_note, alerts, detected_patterns }
       ↓
useState editedFields = { ...props }  ← inicializado con valores del agente
       ↓
[Clínico edita campos — local state se actualiza en cada blur]
       ↓
[Click "Confirmar nota"]
       ↓
onConfirm(editedFields) → App.jsx → confirmNote(sessionId, { structured_note: editedFields })
       ↓
POST /sessions/{id}/confirm { edited_note: editedFields }  ← backend ya lo maneja
       ↓
ClinicalNote guardada en DB con contenido final
```

---

## UX visual

- Hint superior en draft: `✏️ Toca cualquier campo para editar` (texto pequeño, color muted)
- Campo en reposo: borde gris punteado — indica que es editable sin ser intrusivo
- Campo activo: borde sage sólido + fondo crema — claramente en modo edición
- Alertas/patrones: chips con **×** + botón **"+ Agregar"** dashed
- Sin indicador de "nota modificada" — se confía en que el clínico sabe lo que hace
- Mobile: mismo patrón, textarea a ancho completo, botón confirmar full-width al fondo

---

## Criterios de aceptación

1. Click en cualquier campo SOAP lo convierte en textarea editable
2. Blur guarda el valor y restaura la vista de texto con el contenido nuevo
3. El botón × en una alerta la elimina inmediatamente
4. "+ Agregar" en alertas muestra un input; Enter/blur con texto agrega la alerta
5. Lo mismo para patrones detectados
6. Al confirmar, el backend recibe el contenido editado (no el original)
7. En mobile (tab Nota), todo el comportamiento anterior funciona igual con tap
8. En CustomNoteDocument, campos de texto son igualmente editables con el mismo patrón
