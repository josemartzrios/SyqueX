# Calendario y Agenda Nativa — SyqueX

**Fecha:** 2026-05-15
**Estado:** Borrador
**Branch:** feature/calendar

## Contexto y problema

La pantalla principal del psicólogo muestra un "empty state" estático sin funcionalidad cuando no hay paciente seleccionado. Los psicólogos necesitan:
1. Ver su agenda del día (con quién tienen sesiones)
2. Gestionar su disponibilidad para que pacientes agenden citas
3. Acceso rápido a crear nuevos expedientes

Actualmente las sesiones solo registran `session_date` (fecha sin hora). No existe un sistema de citas ni disponibilidad.

**Decisión clave:** Se construye un calendario nativo dentro de SyqueX (sin Cal.com ni Google Calendar) para evitar dependencias externas y mantener los datos centralizados. Se enviará un archivo `.ics` por email para que el psicólogo sincronice con su calendario externo si lo desea.

---

## Diseño UI/UX

### 1. Nuevo Empty State (Psicólogo)

**Reemplaza** el actual empty state (`EMPTY_STATE` en `App.jsx`, líneas 39-51) que muestra "Sin expediente activo" + ícono.

**Nuevo diseño:** Dos botones de acción centrados, sin ícono ni texto de empty state.

| Botón | Acción |
|-------|--------|
| **Mi Agenda** (ícono calendario) | Navega a pantalla completa de calendario |
| **Nuevo Expediente** (ícono persona+) | Abre `PatientIntakeModal` (misma función que el viejo `+ Nuevo`) |

**Cambios asociados:**
- **Se elimina** el botón `+ Nuevo` del header mobile (líneas 1147-1155 en `App.jsx`)
- Touch targets: mínimo 48×48px (Material Design)
- Hover: `border-color` sage + sombra sutil + `translateY(-1px)`

### 2. Pantalla de Calendario (Psicólogo)

Pantalla completa dedicada (como `BillingScreen` o `OnboardingScreen`). Se controla con un nuevo state `showCalendar` en `App.jsx`.

**Layout (mobile-first):**

```
┌────────────────────────────┐
│ ← Volver   Mi Agenda  + Disponibilidad │
├────────────────────────────┤
│         Mayo 2026      ‹ ›  │
│  L   M   Mi  J   V   S   D │
│                1   2   3   4 │
│  5   6   7   8   9● 10  11 │
│ 12  13  14  15● 16● 17  18 │ ← ● = tiene slots
│ 19● 20  21● 22  23● 24  25 │
│ 26  27  28  29  30  31     │
├────────────────────────────┤
│ Jueves 15 de Mayo    3 citas│
│ ┌─ ● 10:00am  Juan Pérez  ×│ ← reservado
│ ├─ ● 2:00pm   María López ×│ ← reservado
│ └─ ○ 4:00pm   Disponible  ×│ ← libre
│ ┌─ ─ ─ + Agregar disponibilidad ─ ─ ┐│
└────────────────────────────┘
```

**Desktop (md+):** Mismo layout, max-width ~640px centrado, o split layout con calendario a la izquierda y detalle del día a la derecha.

**Interacciones:**
- Click en un día → actualiza panel de detalle inferior
- `+ Disponibilidad` → abre modal/dropdown para seleccionar fecha, hora, duración (default 50 min)
- `×` en un slot → confirmación destructiva, luego DELETE
- `← Volver` → regresa al empty state con los botones

### 3. Portal del Paciente — Agendar Cita

Se agrega una sección de booking al `PatientPortal.jsx` existente.

**Layout:**

```
┌────────────────────────────┐
│ ✓ Próxima sesión agendada  │ ← banner verde (si tiene cita)
│   Jue 15 Mayo · 10:00am   │
├────────────────────────────┤
│ Agendar sesión             │
│ Selecciona un día...       │
│         Mayo 2026      ‹ ›  │
│  L   M   Mi  J   V   S   D │
│ (solo días con slots       │
│  disponibles clickeables)  │
├────────────────────────────┤
│ Viernes 16 de Mayo         │
│ ┌──────┐ ┌──────┐ ┌──────┐│ ← time slots como botones
│ │10:00am│ │●2:00pm│ │4:00pm││ ← ● = seleccionado
│ └──────┘ └──────┘ └──────┘│
│ [Confirmar cita — Vie 16, 2:00pm]│ ← CTA verde
├────────────────────────────┤
│ MIS SESIONES               │ ← lista existente
│ 15 MAY — Manejo de ansiedad│
│ 8 MAY  — Revisión de obj...│
└────────────────────────────┘
```

**Flujo:** Día → Hora → Confirmar → email con .ics a ambos

---

## Modelo de datos

### Nueva tabla: `availability_slots`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PK | No secuencial |
| `psychologist_id` | UUID FK → `psychologists.id` | CASCADE on delete |
| `slot_date` | DATE | Fecha del slot |
| `start_time` | TIME | Hora de inicio (ej: 14:00) |
| `duration_minutes` | INTEGER | Default 50 |
| `status` | VARCHAR(20) | `available` \| `booked` \| `cancelled` |
| `booked_by_patient_id` | UUID FK → `patients.id` | Nullable, SET NULL on delete |
| `booked_at` | TIMESTAMPTZ | Nullable — timestamp de la reserva |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraints:**
- `CHECK (status IN ('available', 'booked', 'cancelled'))`
- `UNIQUE (psychologist_id, slot_date, start_time)` — evita slots duplicados
- `CHECK (duration_minutes >= 15 AND duration_minutes <= 180)`

**Indexes:**
- `idx_slots_psychologist_date` → `(psychologist_id, slot_date)` — query principal
- `idx_slots_psychologist_status` → `(psychologist_id, status)` — filtrar disponibles
- `idx_slots_booked_patient` → `(booked_by_patient_id)` — citas del paciente

**RLS:**
- Política `slots_isolation`: `psychologist_id = current_setting('app.psychologist_id', true)::uuid`

**Relaciones SQLAlchemy:**
- `Psychologist.availability_slots` → `relationship("AvailabilitySlot")`
- `AvailabilitySlot.psychologist` → `relationship("Psychologist")`
- `AvailabilitySlot.booked_patient` → `relationship("Patient")`

---

## API

### Endpoints del Psicólogo (autenticados con JWT)

#### `GET /api/v1/calendar/slots`

Query params: `month=2026-05` (formato YYYY-MM)

Response:
```json
{
  "month": "2026-05",
  "slots": [
    {
      "id": "uuid",
      "slot_date": "2026-05-15",
      "start_time": "10:00",
      "duration_minutes": 50,
      "status": "booked",
      "patient_name": "Juan Pérez",
      "patient_id": "uuid"
    },
    {
      "id": "uuid",
      "slot_date": "2026-05-15",
      "start_time": "16:00",
      "duration_minutes": 50,
      "status": "available",
      "patient_name": null,
      "patient_id": null
    }
  ]
}
```

#### `POST /api/v1/calendar/slots`

Body:
```json
{
  "slot_date": "2026-05-16",
  "start_time": "14:00",
  "duration_minutes": 50
}
```

Response: `201 Created` con el slot creado.

Validaciones:
- `slot_date` debe ser hoy o futuro
- No puede haber overlap con slots existentes del mismo psicólogo
- Rate limit: `60/hour`

#### `DELETE /api/v1/calendar/slots/{slot_id}`

- Si el slot está `booked`: envía email de cancelación al paciente con motivo
- Response: `204 No Content`
- Ownership check: `slot.psychologist_id == token.sub`

### Endpoints del Portal del Paciente (autenticados con JWT de paciente)

#### `GET /api/v1/portal/availability`

Query params: `month=2026-05`

Response: solo slots con `status=available` del psicólogo asociado al paciente.
```json
{
  "month": "2026-05",
  "slots": [
    {
      "id": "uuid",
      "slot_date": "2026-05-16",
      "start_time": "14:00",
      "duration_minutes": 50
    }
  ],
  "upcoming_booking": {
    "slot_date": "2026-05-15",
    "start_time": "10:00",
    "duration_minutes": 50
  }
}
```

#### `POST /api/v1/portal/book`

Body:
```json
{
  "slot_id": "uuid"
}
```

Lógica:
1. Verifica que el slot exista y `status=available`
2. Verifica que el slot pertenezca al psicólogo del paciente
3. Usa `SELECT ... FOR UPDATE` para evitar race conditions (dos pacientes agendando el mismo slot)
4. Actualiza: `status=booked`, `booked_by_patient_id`, `booked_at=now()`
5. Envía emails con .ics a ambos (psicólogo y paciente)
6. Response: `200 OK` con detalles de la cita confirmada

#### `DELETE /api/v1/portal/booking/{slot_id}`

- Paciente cancela su propia cita
- Revierte slot a `status=available`, limpia `booked_by_patient_id`
- Email de notificación al psicólogo

---

## Notificaciones por Email

### Templates (reutilizan infraestructura existente de emails)

| Evento | Destinatario | Contenido |
|--------|-------------|-----------|
| Paciente agenda | Psicólogo | "Juan Pérez agendó sesión: Vie 16 Mayo, 2:00pm" + .ics |
| Paciente agenda | Paciente | "Tu sesión está confirmada: Vie 16 Mayo, 2:00pm" + .ics |
| Psicólogo cancela slot reservado | Paciente | "Tu sesión del Vie 16 Mayo fue cancelada por tu psicólogo" |
| Paciente cancela | Psicólogo | "Juan Pérez canceló su sesión del Vie 16 Mayo, 2:00pm" |

### Archivo .ics

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SyqueX//Sesión//ES
BEGIN:VEVENT
DTSTART:20260516T140000
DTEND:20260516T145000
SUMMARY:Sesión — Juan Pérez
DESCRIPTION:Sesión de psicoterapia agendada vía SyqueX
END:VEVENT
END:VCALENDAR
```

Se genera en memoria y se adjunta al email como `sesion.ics`.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `backend/database.py` | Agregar modelo `AvailabilitySlot` + migración en `init_db()` |
| `backend/api/routes.py` | Agregar endpoints de calendario (`GET/POST/DELETE /calendar/slots`) |
| `backend/api/portal_routes.py` | Agregar endpoints de booking (`GET /portal/availability`, `POST /portal/book`, `DELETE /portal/booking`) |
| `backend/api/email_service.py` | Agregar templates de email para booking + generador de .ics |
| `frontend/src/api.js` | Agregar funciones: `getCalendarSlots()`, `createSlot()`, `deleteSlot()` |
| `frontend/src/patientApi.js` | Agregar: `getAvailability()`, `bookSlot()`, `cancelBooking()` |
| `frontend/src/App.jsx` | Reemplazar `EMPTY_STATE`, eliminar `+ Nuevo`, agregar `showCalendar` state + renderizado de `CalendarScreen` |
| `frontend/src/components/CalendarScreen.jsx` | **Nuevo** — pantalla completa de calendario del psicólogo |
| `frontend/src/components/AddSlotModal.jsx` | **Nuevo** — formulario para agregar disponibilidad |
| `frontend/src/pages/PatientPortal.jsx` | Agregar sección de booking con calendario + time slots |
| `docs/architecture/DATABASE_SCHEMA.md` | Agregar tabla `availability_slots`, constraints, indexes y RLS |
| `docs/architecture/API_REFERENCE.md` | Agregar endpoints de calendario (`/calendar/slots`) y portal (`/portal/availability`, `/portal/book`) |
| `docs/architecture/ARCHITECTURE.md` | Actualizar diagrama de componentes con `CalendarScreen`, flujo de booking, y sistema de notificaciones .ics |
| `docs/architecture/FRONTEND_GUIDE.md` | Agregar sección de `CalendarScreen`, `AddSlotModal`, y flujo de booking en `PatientPortal` |
| `docs/architecture/SECURITY_COMPLIANCE.md` | Documentar RLS de `availability_slots`, race condition mitigation con `FOR UPDATE`, y rate limits de calendario |

---

## Seguridad

| Riesgo | Mitigación |
|--------|------------|
| Acceso a slots de otro psicólogo | RLS + ownership check en cada endpoint |
| Race condition en booking | `SELECT ... FOR UPDATE` en la transacción de reserva |
| Paciente agendando en psicólogo ajeno | Validar `slot.psychologist_id == patient_user.psychologist_id` |
| Enumeración de slot IDs | UUIDs v4, no secuenciales |
| Spam de slots | Rate limit `60/hour` en creación |
| Email spoofing | Emails enviados desde dominio verificado existente |

---

## Lo que NO cambia

- El flujo de sesiones existente (`/sessions/{patient_id}/process`) — sigue igual
- La generación de notas clínicas — es independiente del calendario
- La tabla `sessions` — no se modifica; el calendario es un sistema paralelo
- `PatientIntakeModal` — sigue funcionando igual, solo cambia quién lo invoca
- El `PatientSidebar` desktop — mantiene la lista de pacientes sin cambios

---

## Consideraciones Mobile-First (UI/UX Pro Max)

- **Touch targets:** todos los botones y días del calendario ≥ 44×44px
- **Breakpoints:** Mobile (< 768px) → layout vertical; Desktop (≥ 768px) → split horizontal
- **Back behavior:** `← Volver` predecible, restaura estado anterior
- **Empty states:** "No tienes citas para este día" con CTA de agregar
- **Loading states:** skeleton loader mientras cargan slots del mes
- **Animaciones:** transición `ease-out 200ms` al navegar al calendario; `spring` en botones
- **Accessibility:** `aria-label` en días del calendario, contraste 4.5:1, focus rings
