# Upcoming Booking Card — Portal del Paciente

**Fecha:** 2026-05-17
**Estado:** Aprobado
**Branch:** feature/calendar

---

## Problema

El paciente puede agendar una cita desde su portal, pero no tiene forma de ver la cita que ya agendó. El backend ya retorna `upcoming_booking` en `/portal/availability`, pero el frontend lo ignora completamente.

---

## Solución

Agregar una tarjeta `UpcomingBookingCard` encima del botón "Agendar cita" en la columna izquierda del `PatientPortal`. La tarjeta muestra la próxima cita confirmada y permite cancelarla con confirmación inline.

---

## Arquitectura y flujo de datos

### Nuevos estados en `PatientPortal.jsx`

```js
const [upcomingBooking, setUpcomingBooking] = useState(null)
// shape: { id, slot_date, start_time, duration_minutes } | null

const [cancelingBooking, setCancelingBooking] = useState(false)
const [cancelError, setCancelError]           = useState(null)
```

### Carga inicial

`useEffect` al montar llama `getPatientAvailability(mesActual)` **solo para leer `upcoming_booking`**. Los slots del calendario quedan para uso interno del `PatientBookingModal` (que ya los carga por su cuenta).

```js
useEffect(() => {
  const today = new Date()
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  getPatientAvailability(month)
    .then(data => setUpcomingBooking(data.upcoming_booking ?? null))
    .catch(() => {}) // fallo silencioso — no bloquea el portal
}, [])
```

### Handler de cancelación

```js
const handleCancelBooking = async (slotId) => {
  setCancelingBooking(true)
  setCancelError(null)
  try {
    await cancelPatientBooking(slotId)
    setUpcomingBooking(null)
  } catch (err) {
    setCancelError(err.message || 'No se pudo cancelar. Intenta de nuevo.')
  } finally {
    setCancelingBooking(false)
  }
}
```

### Nuevo componente

`frontend/src/components/UpcomingBookingCard.jsx` — puramente presentacional.

**Props:**
| Prop | Tipo | Descripción |
|------|------|-------------|
| `booking` | `object \| null` | `{ id, slot_date, start_time, duration_minutes }` |
| `onCancel` | `fn(slotId)` | Handler de cancelación |
| `canceling` | `boolean` | Estado de carga |
| `error` | `string \| null` | Error a mostrar inline |

Retorna `null` si `booking` es `null` (no renderiza nada).

---

## Estados e interacciones

### Estado 1 — Sin cita (default)
La tarjeta no se renderiza. El CTA muestra "Agendar cita".

### Estado 2 — Cita confirmada (happy path)
```
┌──────────────────────────────────────┐
│ ┌──┐  CITA CONFIRMADA               │
│ │📅 │  Jueves, 22 de mayo           │
│ └──┘  10:00 am  ·  60 min           │
│                                      │
│  [ Cancelar cita                ]    │
└──────────────────────────────────────┘
↕ mb-3
┌──────────────────────────────────────┐
│ [■]  Agendar otra cita          →   │
│      Ver disponibilidad              │
└──────────────────────────────────────┘
```

### Estado 3 — Cancelando (loading)
Toda la tarjeta en `opacity-50`. Botón disabled con spinner y texto "Cancelando…".

### Estado 4 — Confirmación inline
Al presionar "Cancelar cita", el botón se reemplaza por:
```
¿Confirmar cancelación?
[ Sí, cancelar ]  [ No, regresar ]
```
- `autoFocus` en "No, regresar" (safe default anti-destructivo)
- No usa modal — evita el anti-pattern `modal-vs-navigation`

### Estado 5 — Error
Debajo del botón de cancelar:
```
⚠ No se pudo cancelar. Intenta de nuevo.
```
`aria-live="polite"` para lectores de pantalla.

---

## Diseño visual

### Clases Tailwind

**Wrapper de la tarjeta:**
```
bg-white rounded-2xl border border-[#18181b]/[0.08] p-4 mb-3
```

**Ícono amber:**
```
w-9 h-9 rounded-xl bg-[#c4935a]/10 flex items-center justify-center flex-shrink-0
SVG calendar: stroke #c4935a, w-4 h-4
```

**Label "CITA CONFIRMADA":**
```
text-[10px] font-bold tracking-widest text-[#c4935a] uppercase
```

**Fecha:**
```
text-sm font-semibold font-serif text-[#18181b] mt-0.5
```

**Hora y duración:**
```
text-xs text-[#9ca3af] mt-0.5
```

**Botón cancelar (normal):**
```
w-full rounded-xl py-2.5 border border-red-200 text-red-400
hover:bg-red-50 transition-colors text-sm
```

**Botones de confirmación:**
```
"Sí, cancelar":  flex-1 rounded-xl py-2 border border-red-200 text-red-400 text-sm
"No, regresar":  flex-1 rounded-xl py-2 border border-[#18181b]/10 text-[#9ca3af] text-sm
```

**CTA "Agendar otra cita" (cuando hay booking activo):**
El texto cambia de "Agendar cita" / "Ver disponibilidad del psicólogo" a:
- "Agendar otra cita"
- "Ver disponibilidad"

### Formato de fecha y hora

```js
// slot_date "2026-05-22" → "Jueves, 22 de mayo"
new Date(slotDate + 'T12:00:00')
  .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

// start_time "10:00:00" → "10:00 am"
const [h, m] = startTime.split(':')
`${h}:${m} ${parseInt(h) < 12 ? 'am' : 'pm'}`
```

---

## Accesibilidad

- `aria-label="Cancelar cita del jueves 22 de mayo"` en el botón de cancelar
- `aria-live="polite"` en el contenedor del error
- `autoFocus` en "No, regresar" al entrar en modo confirmación
- Touch target del botón cancelar: `py-2.5` + `w-full` → siempre ≥44px de alto

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/UpcomingBookingCard.jsx` | **Nuevo** — componente presentacional |
| `frontend/src/pages/PatientPortal.jsx` | Añadir estados, `useEffect`, handler, renderizado condicional |
| `frontend/src/components/UpcomingBookingCard.test.jsx` | **Nuevo** — tests unitarios |

---

## Tests requeridos

1. No renderiza cuando `booking` es `null`
2. Muestra fecha, hora y duración correctamente formateadas
3. Muestra confirmación inline al presionar "Cancelar cita"
4. Llama `onCancel` con el `id` correcto al confirmar
5. Muestra spinner y deshabilita botón mientras `canceling === true`
6. Muestra `error` inline cuando se recibe
7. "No, regresar" cancela la confirmación sin llamar `onCancel`
