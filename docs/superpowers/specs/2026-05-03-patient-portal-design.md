# Patient Portal — Diseño Aprobado

**Fecha:** 2026-05-03  
**Feature:** Portal del Paciente — seguimiento post-sesión  
**Estado:** Spec aprobado, listo para plan de implementación

---

## 1. Resumen del Feature

Los pacientes acceden a SyqueX con su propia cuenta y ven un historial de resúmenes post-sesión generados por su psicólogo. Los resúmenes son generados por Claude a partir de la nota clínica (SOAP o custom), revisados y aprobados por el psicólogo antes de enviarse. No contienen datos clínicos sensibles — solo temas trabajados, tarea semanal y próxima cita.

---

## 2. Decisiones de Diseño

| Pregunta | Decisión |
|----------|----------|
| ¿Cómo accede el paciente? | Cuenta propia (email + contraseña), invitación del psicólogo |
| ¿Quién genera el resumen? | Claude desde nota SOAP o custom; psicólogo revisa y aprueba |
| ¿Mensajería in-app? | No — fuera de alcance del MVP |
| ¿Dominio separado? | No — misma app, routing por rol en JWT |
| ¿Qué ve el paciente? | Historial completo de resúmenes, más reciente primero |
| ¿Layout paciente? | Mobile-first: tarjetas verticales → detalle. Desktop: sidebar + panel |
| ¿UX en tab "Nota"? | Sección colapsable (progressive disclosure) al final de la nota confirmada |

---

## 3. Modelo de Datos

### Tabla nueva: `patient_users`

```sql
CREATE TABLE patient_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  psychologist_id UUID NOT NULL REFERENCES psychologists(id),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                    -- NULL hasta que acepta la invitación
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,            -- NULL = pendiente
  is_active     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_patient_users_patient ON patient_users(patient_id);
CREATE INDEX idx_patient_users_psychologist ON patient_users(psychologist_id);
```

### Tabla nueva: `patient_summaries`

```sql
CREATE TABLE patient_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id),
  ai_draft          TEXT,                -- Borrador generado por Claude
  topics_worked     TEXT,                -- Campo editable: "Trabajamos"
  homework          TEXT,                -- Campo editable: "Tarea"
  next_session_date DATE,                -- Campo editable: próxima cita
  sent_at           TIMESTAMPTZ,        -- NULL = no enviado aún
  viewed_at         TIMESTAMPTZ,        -- NULL = no visto por paciente
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_summaries_patient ON patient_summaries(patient_id);
CREATE INDEX idx_summaries_session ON patient_summaries(session_id);
```

### Cambio al modelo `patients` existente

```sql
ALTER TABLE patients ADD COLUMN email TEXT;  -- nullable
```

---

## 4. Autenticación del Paciente

### JWT payload del paciente

```json
{
  "sub": "<patient_user_id>",
  "role": "patient",
  "patient_id": "<patient_id>",
  "psychologist_id": "<psychologist_id>"
}
```

El frontend lee `role` al hacer login:
- `"psychologist"` → dashboard existente
- `"patient"` → portal nuevo

### Flujo de invitación

1. Psicólogo agrega `email` al registro del paciente (campo nuevo en `PatientIntakeModal`)
2. Al presionar "Enviar a [Nombre]" por primera vez: el backend crea `PatientUser` con `is_active=false` y envía email de invitación (Resend)
3. El email contiene un link con token de un solo uso (TTL 7 días)
4. Paciente abre el link → pantalla "Crea tu contraseña" → `accepted_at` se registra, `is_active=true`
5. En envíos posteriores (sesiones futuras), el paciente ya tiene cuenta activa — solo recibe notificación por email de nuevo resumen disponible

---

## 5. API Endpoints

### Auth del paciente — `/auth/patient/`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/patient/accept-invite` | Acepta invitación con token, crea contraseña |
| `POST` | `/auth/patient/login` | Login → JWT `role: "patient"` |
| `POST` | `/auth/patient/refresh` | Rotación de refresh token |
| `POST` | `/auth/patient/logout` | Revoca token |

> La invitación se lanza desde el endpoint de envío de resumen (`/send`), no desde un endpoint propio.

### Portal del paciente — `/patient/`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/patient/me` | Nombre del paciente y psicólogo asignado |
| `GET` | `/patient/me/summaries` | Lista paginada de resúmenes, más reciente primero |
| `GET` | `/patient/me/summaries/{id}` | Detalle de un resumen; registra `viewed_at` si es primera visita |

**Reglas de acceso:** Solo aceptan JWT con `role: "patient"`. El middleware verifica que el `patient_id` del token coincida con el recurso solicitado.

### Resúmenes — lado psicólogo

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/sessions/{session_id}/summary/generate` | Claude genera borrador desde nota SOAP o custom |
| `PUT` | `/sessions/{session_id}/summary` | Guarda ediciones del psicólogo |
| `POST` | `/sessions/{session_id}/summary/send` | Aprueba y envía; crea/activa `PatientUser` si primera vez |
| `GET` | `/sessions/{session_id}/summary` | Devuelve resumen existente (para re-abrir sección) |

---

## 6. Generación del Resumen con Claude

### Prompt de extracción

Claude recibe la nota clínica completa (SOAP estructurado o custom) y extrae solo lo que puede compartirse con el paciente:

```
Eres un asistente clínico. A partir de la siguiente nota clínica, genera un resumen 
para el paciente en lenguaje simple y empático. NO incluyas diagnósticos, 
formulaciones clínicas, ni información sensible.

Extrae exactamente tres campos:
1. topics_worked: ¿Qué trabajamos hoy? (1-2 oraciones, lenguaje del paciente)
2. homework: ¿Cuál es la tarea para esta semana? (clara y accionable)
3. next_session_date: Si se menciona, fecha de próxima sesión (solo fecha, sin hora)

Responde en JSON: { "topics_worked": "...", "homework": "...", "next_session_date": "YYYY-MM-DD | null" }

Nota clínica:
{note_content}
```

Para notas SOAP: `note_content` = concatenación de S + O + A + P.  
Para notas custom: `note_content` = todos los campos del template en orden.

---

## 7. Frontend — Tab "Nota" (Psicólogo)

### UX: Sección colapsable (Progressive Disclosure)

Aplica tanto para notas SOAP como custom. El tab "Nota" tiene un flujo lineal de 3 estados:

**Estado 1 — Nota confirmada, sección colapsada**
- Nota clínica visible normalmente en scroll
- Al fondo: botón con borde punteado sage: `✨ Generar resumen para [Nombre]`
- Solo aparece si la sesión tiene estado `confirmed`

**Estado 2 — Sección expandida**
- La nota SOAP/custom se colapsa a una fila: `"Nota SOAP completa ↑"` (tap para expandir)
- Debajo: sección con fondo `#f9fdf9` y 3 campos editables pre-poblados por Claude:
  - `📌 Trabajamos` — borde sage, fondo `#f9fdf9`
  - `📝 Tarea` — borde amber, fondo `#fff9f5`
  - `📅 Próxima sesión` — input de fecha
- Botón primario: `Enviar a [Nombre] →`

**Estado 3 — Enviado**
- La nota vuelve a ser visible
- Al fondo: chip de confirmación: `✓ Resumen enviado a [Nombre] · [hora]`
- Tap en el chip puede re-abrir la sección en modo read-only

### Mobile
- Todo en columna vertical, sección colapsable ocupa ancho completo
- Cuando expandida, scroll natural del tab incluye nota colapsada + campos

### Desktop
- Mismo patrón en el panel derecho del split-view (nota panel, flex)
- La nota SOAP/custom colapsa a una fila al expandir el resumen
- No se muestra el panel de nota y el resumen side-by-side (mantiene foco en una cosa a la vez)

---

## 8. Frontend — Portal del Paciente

### Routing

```
/portal              → PatientPortal (requiere JWT role: "patient")
/portal/sesion/:id   → SummaryDetail
/invite/:token       → AcceptInvite (pública, sin auth)
```

El login existente (`/login`) detecta el rol en la respuesta y redirige:
- `role: "psychologist"` → `/` (app actual)
- `role: "patient"` → `/portal`

### Mobile — Lista de sesiones

- Header oscuro: `"Mi seguimiento" | "Hola, [Nombre]"`
- Tarjetas verticales ordenadas por fecha descendente
- Tarjeta más reciente: borde sage + badge `"Nueva"` si `viewed_at === null`
- Tap → navega a `/portal/sesion/:id`

### Mobile — Detalle de sesión

- Back arrow → regresa a lista
- Header: fecha + número de sesión
- Título serif: `"Hola, [Nombre]"`
- Secciones apiladas: Trabajamos (sage) → Tarea (amber) → Próxima sesión (sage)
- Registra `viewed_at` en el primer acceso (llamada al backend al montar)

### Desktop

- Sidebar izquierdo: lista de sesiones (mismo diseño que tarjetas móvil pero compacto)
- Panel derecho: detalle en grid — `Trabajamos` ancho completo, `Tarea` y `Próxima sesión` en dos columnas

---

## 9. Componentes Nuevos

### Backend
- `patient_auth.py` — router auth del paciente (acepta invite, login, refresh, logout)
- `patient_routes.py` — router portal (/me, /me/summaries, /me/summaries/:id)
- `summary_routes.py` — endpoints de generación, edición y envío de resúmenes
- Extensión en `agent/agent.py` — función `generate_patient_summary(note_content: str)`
- Modelos SQLAlchemy: `PatientUser`, `PatientSummary` en `database.py`

### Frontend
- `PatientPortal.jsx` — contenedor del portal (routing interno)
- `SummaryList.jsx` — lista de tarjetas de sesiones
- `SummaryDetail.jsx` — vista de detalle de un resumen
- `AcceptInvite.jsx` — pantalla de activación de cuenta con token
- `PatientSummarySection.jsx` — sección colapsable dentro del tab "Nota" (SOAP y custom)
- Modificación `App.jsx` — routing por rol al login
- Modificación `PatientIntakeModal.jsx` — campo `email` del paciente

---

## 10. Paleta y Estilos (Consistente con SyqueX)

- Base: `#ffffff`
- Superficie alternativa: `#f4f4f2`
- Superficie resumen paciente: `#f9fdf9` (sage muy suave)
- Sage: `#5a9e8a`
- Amber: `#c4935a`
- Ink: `#18181b`
- Tipografía nota: Georgia (serif)
- Tipografía UI: sistema sans-serif
- Sin sombras — profundidad por cambio de color de superficie

---

## 11. Rama de Desarrollo

```bash
git checkout dev
git pull origin dev
git checkout -b feature/patient-portal
```

El PR de esta rama va hacia `dev`. Seguir el flujo estándar: `feature/patient-portal → dev → main`.

---

## 12. Actualización de Diagramas y Documentación

Al hacer merge de este feature a `dev`, actualizar los siguientes archivos en `docs/architecture/`:

| Archivo | Qué actualizar |
|---------|---------------|
| `DATABASE_SCHEMA.md` | Agregar tablas `patient_users` y `patient_summaries` al diagrama ER; documentar columna `email` en `patients` |
| `ARCHITECTURE.md` | Agregar rol `PatientUser` al diagrama de actores; agregar módulos `patient_auth.py`, `patient_routes.py`, `summary_routes.py`; agregar componentes frontend del portal |
| `API_REFERENCE.md` | Documentar todos los endpoints nuevos: `/auth/patient/*`, `/patient/*`, `/sessions/{id}/summary/*` |
| `FRONTEND_GUIDE.md` | Documentar routing por rol, componentes nuevos del portal y `PatientSummarySection` |
| `SECURITY_COMPLIANCE.md` | Documentar modelo de aislamiento de datos del paciente (solo ve sus propios resúmenes), política de tokens de invitación y ausencia de datos clínicos en resúmenes |

---

## 12. Fuera de Alcance (MVP)

- Mensajería in-app psicólogo ↔ paciente
- Notificaciones push
- Cuestionarios de autocuidado del paciente
- Múltiples psicólogos por paciente
- El paciente no puede editar nada — portal de solo lectura
