# Diseño: Borradores de Nota SOAP Persistentes

**Fecha:** 2026-03-22
**Rama:** feature/soap-visual-hierarchy
**Estado:** Aprobado

---

## Problema

Cuando el psicólogo genera una nota SOAP y no la confirma en ese momento, los cards SOAP estructurados desaparecen al recargar. El texto crudo (`ai_response`) sí persiste en BD como `Session(status='draft')`, pero el historial lo reconstruía como texto plano sin botón de confirmar — haciendo imposible confirmar la nota más tarde.

## Objetivo

El psicólogo debe poder confirmar una nota SOAP días después de generarla. Los borradores deben sobrevivir entre sesiones de la app y mostrar los cards SOAP con el botón "Confirmar en Expediente".

---

## Decisión: Opción A — Re-parseo en cliente

Sin cambios en backend ni BD. Se reutiliza `parseSoapText()` (ya existente en `NoteReview.jsx`) para reconstruir los cards SOAP desde el `ai_response` de la `Session`.

**Trade-off aceptado:** La calidad de reconstrucción depende de que el formato del `ai_response` sea consistente. El riesgo es bajo porque el prompt de Claude está controlado. Si `parseSoapText()` no encuentra secciones SOAP válidas, `clinicalNote` es `null` y NoteReview cae graciosamente a mostrar el `text_fallback` como texto plano — el psicólogo al menos ve el contenido.

**Limitación conocida:** Alertas clínicas (`alerts`) y patrones detectados (`detected_patterns`) no se almacenan en la tabla `sessions`, solo en `clinical_notes`. Los borradores recargados desde historial no mostrarán estos datos. Esto es aceptable para MVP.

---

## Datos relevantes por tipo de sesión

| Campo | Sesión draft (historial) | Sesión recién procesada |
|-------|--------------------------|------------------------|
| `text_fallback` | `session.ai_response` | `ProcessSessionOut.text_fallback` |
| `session_id` | `session.id` | `ProcessSessionOut.session_id` |
| `clinical_note` | `undefined` | objeto completo (si Claude lo generó) |
| `evolution_report` | `undefined` | objeto o `undefined` |
| `alerts` / `patterns` | no disponibles | disponibles si Claude los generó |

`getPatientSessions()` retorna `SessionOut[]`, cada uno con: `id`, `status`, `raw_dictation`, `ai_response`, `session_number`, `session_date`.

---

## Flujo completo

```
POST /sessions/{patient_id}/process
  → Session(status='draft', ai_response=texto SOAP) guardada en BD
  → Frontend muestra NoteReview con BORRADOR + Confirmar

[Usuario cierra app sin confirmar]

GET /patients/{patient_id}/sessions  ← getPatientSessions()
  Reconstrucción en loadPatientChat():
  → session.status === 'draft'
      → { type: 'bot', noteData: { text_fallback: session.ai_response, session_id: session.id } }
      → Renderiza: <NoteReview noteData={...} onConfirm={fetchConversations} />
      → parseSoapText() reconstruye cards SOAP desde text_fallback
  → session.status === 'confirmed'
      → { type: 'confirmed_note', text: session.ai_response }
      → Renderiza: <ClinicalNote text={msg.text} />  ← solo lectura, sin botones

[Usuario confirma borrador desde historial]

POST /sessions/{session_id}/confirm
  → session_id viene de noteData.session_id (tercer fallback en handleSave)
  → ClinicalNote creada con SOAP estructurado + embedding pgvector
  → PatientProfile actualizado
  → Session.status → 'confirmed'
  → onConfirm() → fetchConversations() refresca sidebar
```

---

## Cambios de Implementación

### 1. `frontend/src/App.jsx` — `loadPatientChat` (línea ~166)

```js
// Reemplazar el bloque actual:
history.forEach(session => {
  if (session.raw_dictation)
    historyMessages.push({ role: 'user', text: session.raw_dictation });

  if (session.ai_response) {
    if (session.status === 'draft') {
      historyMessages.push({
        role: 'assistant',
        type: 'bot',
        noteData: { text_fallback: session.ai_response, session_id: session.id }
      });
    } else {
      historyMessages.push({
        role: 'assistant',
        type: 'confirmed_note',
        text: session.ai_response
      });
    }
  }
});
```

### 2. `frontend/src/App.jsx` — render de mensajes (dentro del bloque `msg.role === 'assistant'`, ~línea 404)

Agregar rama para `confirmed_note` junto a las existentes (`welcome`, `loading`, `error`, `bot`):

```jsx
{msg.type === 'confirmed_note' && (
  <ClinicalNote text={msg.text} />
)}
```

`ClinicalNote` ya existe como componente en `App.jsx` (línea ~37) y renderiza el SOAP con jerarquía visual sin botones de acción.

### 3. `frontend/src/components/NoteReview.jsx` — `handleSave` (línea ~75)

Agregar `noteData.session_id` como tercer fallback:

```js
// Antes:
const sid = noteData.clinical_note?.session_id || noteData.note_id

// Después:
const sid = noteData.clinical_note?.session_id || noteData.note_id || noteData.session_id

if (!sid) {
  alert('ID de sesión extraviado. No se guardará.')
  return
}
```

La guarda de sesión ya existe — solo se amplía el fallback.

---

## Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| `frontend/src/App.jsx` | `loadPatientChat` bifurcado por status + render `confirmed_note` |
| `frontend/src/components/NoteReview.jsx` | Fallback `session_id` en `handleSave` |

Sin cambios en backend, BD, ni migraciones.

---

## Comportamiento Esperado

| Escenario | Resultado |
|-----------|-----------|
| Sesión draft recién generada | NoteReview con BORRADOR + Confirmar |
| Sesión draft al recargar historial | NoteReview con BORRADOR + Confirmar (cards reconstruidos vía parseSoapText) |
| parseSoapText falla en borrador histórico | NoteReview muestra texto plano (text_fallback), sin cards, sin Confirmar visible |
| Sesión confirmed en historial | ClinicalNote de solo lectura, sin botones |
| Confirmar desde historial | session_id resuelto por tercer fallback, endpoint `/confirm` funciona igual |
| Confirmar exitoso | onConfirm() → fetchConversations() refresca sidebar |
