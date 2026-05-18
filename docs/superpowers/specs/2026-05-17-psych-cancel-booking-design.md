# Psicólogo cancela cita del paciente — Design Spec

**Date:** 2026-05-17  
**Branch:** feature/calendar  
**Status:** Approved

---

## Problema

El psicólogo ya puede eliminar slots de su calendario, incluyendo slots reservados por pacientes. Sin embargo, cuando cancela una cita:
- El slot se borra (hard delete) y el psicólogo recibe un email
- El paciente recibe un email, pero su portal no muestra ninguna notificación visual
- El portal del paciente simplemente deja de mostrar la cita sin explicación

---

## Solución

Cambiar el hard-delete a soft-cancel y mostrar una card de notificación en el portal del paciente hasta que el paciente la descarte explícitamente.

---

## Modelo de datos

Dos columnas nuevas en `AvailabilitySlot`:

| Columna | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `cancelled_by` | VARCHAR(20) NULLABLE | NULL | `'psychologist'` o `'patient'` |
| `acknowledged` | BOOLEAN | FALSE | El paciente vio y descartó la notificación |

El enum `'cancelled'` ya existe en el campo `status` — no requiere migración del tipo.

**Transiciones de estado:**

```
available ──(psych crea)──────────────▶ available
available ──(paciente reserva)────────▶ booked
booked    ──(paciente cancela)────────▶ available     (cancelled_by=null)
booked    ──(psych cancela)───────────▶ cancelled     (cancelled_by='psychologist', acknowledged=false)
cancelled ──(paciente da Enterado)────▶ cancelled     (acknowledged=true)
```

Los slots con `acknowledged=true` nunca se muestran al paciente. Son auditoría histórica.

---

## Backend

### `DELETE /slots/{slot_id}` — `calendar_routes.py`

**Antes:** Hard delete del registro.  
**Después:** Soft-cancel:
- `status = 'cancelled'`
- `cancelled_by = 'psychologist'`
- Email de notificación al paciente (ya existe, sin cambios)
- El `GET /slots` filtra `status != 'cancelled'` → el slot desaparece del calendario del psicólogo

### `GET /portal/availability` — `patient_portal.py`

Agrega `cancelled_booking` al response:

```json
{
  "slots": [...],
  "upcoming_booking": { ... } | null,
  "cancelled_booking": {
    "id": "uuid",
    "slot_date": "2026-05-22",
    "start_time": "10:00",
    "duration_minutes": 60
  } | null
}
```

Query para `cancelled_booking`:
```sql
WHERE booked_by_patient_id = :patient_uuid
  AND status = 'cancelled'
  AND cancelled_by = 'psychologist'
  AND acknowledged = false
ORDER BY slot_date DESC
LIMIT 1
```

### `POST /portal/booking/{slot_id}/acknowledge` — `patient_portal.py` (nuevo)

- Valida: `slot.booked_by_patient_id == patient_uuid`
- Acción: `SET acknowledged = true`
- Retorna: `200 OK`

---

## Frontend

### Nuevo componente: `CancelledBookingCard.jsx`

Reemplaza visualmente al `UpcomingBookingCard` cuando el psicólogo canceló. Mismo ancho y posición en el layout.

**Mockup:**
```
┌─────────────────────────────────────────┐
│  Cita cancelada                         │  ← label amber (#c4935a)
│                                         │
│  Jueves, 22 de mayo · 10:00 am · 60 min │  ← mismo formato que UpcomingBookingCard
│                                         │
│  Tu psicólogo canceló esta cita.        │  ← texto muted, sans-serif
│                                         │
│  [          Enterado          ]         │  ← botón sage (#5a9e8a), 44px, full-width
└─────────────────────────────────────────┘
```

Props: `{ booking, onAcknowledge, acknowledging }`  
Estado interno: spinner en botón mientras `acknowledging = true`.

### Cambios en `PatientPortal.jsx`

- Nuevo estado: `cancelledBooking` (null | objeto)
- `getPatientAvailability()` lee `cancelled_booking` del response y llama `setCancelledBooking`
- Prioridad de render en la zona del card:
  1. `cancelledBooking` existe → `<CancelledBookingCard>`
  2. `upcomingBooking` existe → `<UpcomingBookingCard>`
  3. Ninguno → botón "Agendar cita"
- `onAcknowledge(slotId)`: POST acknowledge → `setCancelledBooking(null)`

### Cambios en `patientApi.js`

```js
export const acknowledgeBookingCancellation = (slotId) =>
  apiClient.post(`/portal/booking/${slotId}/acknowledge`);
```

### `CalendarScreen.jsx` — refetch on focus

El botón "Cancelar cita" naranja con confirmación de dos pasos ya existe. Solo cambia el comportamiento del `DELETE /slots/{id}` en backend (soft-cancel en lugar de hard delete).

Para que el calendario del psicólogo refleje cancelaciones del paciente sin recargar manualmente, `CalendarScreen` suscribe un listener al evento `focus` de la ventana que dispara `loadSlots()`:

```js
useEffect(() => {
  const onFocus = () => loadSlots(currentMonth);
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
}, [currentMonth]);
```

Cuando el psicólogo regresa al tab después de que el paciente canceló, el calendario se actualiza automáticamente mostrando el slot como disponible.

---

## Flujo end-to-end

```
PSICÓLOGO
─────────
1. Ve slot naranja "Paciente: Ana García" en su calendario
2. Click X → confirmación 2 pasos (existente, sin cambios)
3. Confirma → DELETE /slots/{id}
4. Backend: status='cancelled', cancelled_by='psychologist', email enviado
5. Slot desaparece del calendario del psicólogo ✓

PACIENTE — carga el portal
──────────────────────────
6. GET /portal/availability → cancelled_booking presente, upcoming_booking=null
7. Portal muestra CancelledBookingCard
8. Botón "Agendar cita" no aparece (cancelledBooking tiene prioridad)

PACIENTE — da Enterado
──────────────────────
9.  Click "Enterado" → spinner
10. POST /portal/booking/{id}/acknowledge → acknowledged=true
11. setCancelledBooking(null)
12. Si no hay upcoming_booking → aparece botón "Agendar cita"
13. Paciente puede reagendar ✓
```

**Edge case — paciente reservó nueva cita antes de dar Enterado:**
- `cancelled_booking` y `upcoming_booking` coexisten en BD (son slots distintos)
- Portal muestra `CancelledBookingCard` (prioridad 1)
- Tras Enterado → muestra `UpcomingBookingCard` con la nueva cita ✓

---

## Tests

**Backend:**
- `DELETE /slots/{id}` con slot booked → verifica `status='cancelled'`, `cancelled_by='psychologist'`
- `DELETE /slots/{id}` con slot booked → verifica que el slot NO aparece en `GET /slots`
- `GET /portal/availability` → retorna `cancelled_booking` cuando existe uno no-acknowledged
- `GET /portal/availability` → `cancelled_booking=null` cuando `acknowledged=true`
- `POST /portal/booking/{id}/acknowledge` → `acknowledged=true` en BD
- `POST /portal/booking/{id}/acknowledge` con patient_id incorrecto → 403

**Frontend:**
- `CancelledBookingCard` renderiza fecha/hora correctamente
- `CancelledBookingCard` llama `onAcknowledge` al click de "Enterado"
- `PatientPortal` muestra `CancelledBookingCard` cuando `cancelledBooking` existe
- `PatientPortal` muestra `UpcomingBookingCard` tras acknowledge si hay upcoming_booking
- `PatientPortal` muestra botón "Agendar cita" tras acknowledge si no hay upcoming_booking
- `CalendarScreen` refetch on window focus actualiza slots sin reload manual
