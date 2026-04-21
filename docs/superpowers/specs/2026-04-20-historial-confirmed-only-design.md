# Historial — Solo Notas Confirmadas

**Fecha:** 2026-04-20  
**Rama base:** `dev`  
**Feature branch:** `feature/historial-confirmed-only`

## Problema

El tab Historial muestra sesiones con status `draft` junto a las confirmadas. El modelo mental correcto: **en Historial solo existen notas confirmadas**. El borrador existe únicamente durante el flujo de dictado activo. Las sesiones huérfanas (dictadas pero nunca confirmadas) pueden recuperarse o descartarse desde el panel de dictado.

## Valores de status en backend

- `"draft"` — sesión SOAP procesada, pendiente de confirmar
- `"confirmed"` — nota guardada en `clinical_notes` con embedding
- Las sesiones de chat se crean directamente como `"confirmed"`

---

## Sección 1 — Filtro en Historial

### Cambio en `App.jsx`

Derivar dos variables después de `soapSessions`:

```js
const confirmedSessions = soapSessions.filter(s => s.status === 'confirmed');
const orphanedSessions  = soapSessions.filter(s => s.status === 'draft');
```

### Render desktop (Review mode — panel izquierdo)

- Reemplazar `soapSessions.map(...)` por `confirmedSessions.map(...)` en "Historial de Notas"
- Eliminar lógica condicional de color/badge por estado (ya no hay drafts ahí)
- Numeración: usar `s.session_number` como valor autoritativo; el fallback `confirmedSessions.length - i` solo aplica cuando `session_number` es null. Las brechas en `session_number` por sesiones descartadas son aceptables y honestas para el historial clínico.
- Estados vacíos:
  - `confirmedSessions.length === 0 && soapSessions.length > 0` → *"No hay notas confirmadas aún."*
  - `soapSessions.length === 0 && !sessionsLoading` → *"Sin notas SOAP registradas."*
  - `sessionsLoading` → no mostrar estado vacío (evitar flash incorrecto)

### Render mobile (tab Historial)

- Mismos cambios: `confirmedSessions`, sin badges de estado, numeración y estados vacíos iguales

### Contador `sessionCount` en `PatientHeader`

Ya filtra `s.status === 'confirmed'` — no requiere cambio.

---

## Sección 2 — Detección de sesión huérfana

### En `App.jsx`

`orphanedSessions` (definido en Sección 1) contiene todos los drafts. Para la UI se muestra el más reciente primero (las sesiones ya vienen ordenadas por `session_date` descendente desde el backend):

```js
const orphanedPending = orphanedSessions[0] ?? null;
```

Si hay más de una sesión huérfana, se muestran una a la vez — el psicólogo actúa sobre la más reciente; al confirmar o descartar, la siguiente se hace visible automáticamente.

Pasar a `DictationPanel`:

```jsx
<DictationPanel
  ...
  orphanedPending={orphanedPending}
  orphanedCount={orphanedSessions.length}
  onResumeOrphan={handleResumeOrphan}
  onDiscardOrphan={handleDiscardOrphan}
/>
```

### Banner en `DictationPanel.jsx`

Cuando `orphanedPending` no es null, mostrar encima del textarea:

```
┌─ [borde amber] ─────────────────────────────────────────┐
│  Sesión sin guardar del [fecha]                          │
│  (+ N más sin guardar)  ←  solo si orphanedCount > 1    │
│                             [Reanudar]  [Descartar]      │
└──────────────────────────────────────────────────────────┘
```

- Fondo: `bg-[#c4935a]/10`, borde izquierdo `3px solid #c4935a`
- El banner persiste aunque el usuario empiece a escribir en el textarea
- Se elimina solo cuando el usuario toma acción (Reanudar o Descartar)
- Si el usuario reanuda y luego sale del modo revisión sin confirmar, vuelve al panel de dictado y el banner reaparece (el draft sigue en DB)

---

## Sección 3 — Acción "Reanudar"

### Handler `handleResumeOrphan` en `App.jsx`

La sesión huérfana tiene `ai_response` pero no tiene `structured_note` persistido en DB. La forma correcta es pasar `clinical_note: null` para que `NoteReview` active el path `parseSoapText(text_fallback)`, que intenta reconstruir las secciones SOAP del texto generado por Claude:

```js
const handleResumeOrphan = () => {
  setCurrentSessionNote({
    type: 'bot',
    sessionId: orphanedPending.id,
    noteData: {
      session_id: String(orphanedPending.id),
      clinical_note: null,           // activa parseSoapText en NoteReview
      text_fallback: orphanedPending.ai_response,
    },
    readOnly: false,
  });
};
```

**Comportamiento de NoteReview con esta forma:**
- Si `parseSoapText(ai_response)` logra extraer estructura SOAP → se muestran las secciones editables normalmente. El psicólogo puede editar y confirmar con `structured_note` completo.
- Si el parseo falla → se muestra el texto crudo (`text_fallback`). El confirm guarda `structured_note: {}`.

`NoteReview` recupera el `session_id` mediante `noteData.clinical_note?.session_id || noteData.session_id`, por lo que `session_id` al nivel raíz es suficiente.

**Transiciones de estado del banner:**
- Reanudar → currentSessionNote se setea → UI cambia a modo revisión → banner se oculta visualmente
- Si el psicólogo confirma → `fetchConversations()` → sesión pasa a `confirmed` → `orphanedSessions` se vacía → banner no reaparece
- Si el psicólogo cierra la revisión sin confirmar → vuelve al panel de dictado → banner reaparece (draft sigue en DB)

No hay nueva lógica de backend para Reanudar.

---

## Sección 4 — Acción "Descartar"

### Confirmación de dos pasos (inline)

Por tratarse de datos clínicos irreversibles, Descartar requiere una confirmación mínima dentro del banner, sin abrir un modal:

1. Primer clic en "Descartar" → el banner cambia a: *"¿Descartar esta sesión? No se puede deshacer."* + botones **[Sí, descartar]** y **[Cancelar]**
2. Clic en "Sí, descartar" → llama al endpoint. Clic en "Cancelar" → vuelve al estado original del banner

### Endpoint nuevo: `DELETE /sessions/{session_id}`

En `api/routes.py`:

```python
@router.delete("/sessions/{session_id}", status_code=204, tags=["sessions"])
async def delete_draft_session(
    session_id: str,
    psychologist: Psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db_with_user),
):
```

- **Ownership check:** mismo patrón que `/confirm` — `select(Session).join(Patient).where(Session.id == session_uuid, Patient.psychologist_id == psychologist.id)`
- **Validación:** `sess.status != 'confirmed'` — notas confirmadas son intocables
- **Cascade:** los drafts nunca tienen una fila en `clinical_notes` (esa fila se crea exclusivamente en `confirm_session`). No se requiere cascade delete.
- **Acción:** `await db.delete(sess); await db.commit()`
- **Respuesta:** `204 No Content`
- **Errores:**
  - `404` si la sesión no existe o no pertenece al psicólogo
  - `409` si `status == 'confirmed'`

### En `api.js`

```js
export const deleteSession = (sessionId) =>
  api.delete(`/sessions/${sessionId}`);
```

### Handler `handleDiscardOrphan` en `App.jsx`

```js
const handleDiscardOrphan = async () => {
  try {
    await deleteSession(orphanedPending.id);
    await fetchConversations();
  } catch {
    // mostrar error inline en el banner: "No se pudo descartar. Intenta de nuevo."
  }
};
```

Si el DELETE falla, el banner muestra el error inline y vuelve al estado de confirmación de dos pasos.

---

## Archivos afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `frontend/src/App.jsx` | Derivar `confirmedSessions` y `orphanedSessions`; actualizar renders desktop y mobile; añadir `sessionsLoading`; handlers Reanudar/Descartar |
| `frontend/src/components/DictationPanel.jsx` | Banner de sesión huérfana con props, confirmación de dos pasos, manejo de error inline |
| `frontend/src/api.js` | Agregar `deleteSession(sessionId)` |
| `backend/api/routes.py` | Endpoint `DELETE /sessions/{session_id}` |

## Archivos NO afectados

- `NoteReview.jsx` — reutiliza flujo existente sin cambios
- `database.py` — sin cambios de schema
- `agent/` — sin cambios
- `MobileHistoryChips.jsx` — ya filtra solo confirmed

---

## Criterios de éxito

1. Historial desktop y mobile muestran únicamente sesiones `confirmed`
2. El contador `Sesión #N` usa `s.session_number` autoritativo; fallback solo cuando es null
3. Al abrir un paciente con drafts huérfanos, el banner aparece en el panel de dictado
4. Si hay múltiples huérfanos, se muestra el más reciente con conteo del resto
5. "Reanudar" carga la nota en modo text-fallback y permite confirmar
6. "Descartar" requiere confirmación de dos pasos, elimina el draft del backend, y muestra error inline si falla
7. Una sesión `confirmed` no puede ser eliminada (409)
8. El banner reaparece si el psicólogo retorna al panel sin haber confirmado o descartado
