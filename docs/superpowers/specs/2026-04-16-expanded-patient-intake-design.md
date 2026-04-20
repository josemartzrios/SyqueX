# Expanded Patient Intake — Design Spec

**Date:** 2026-04-16
**Branch:** `feature/expanded-patient-intake`
**Roadmap item:** Pre-deploy backlog #1 — "Más preguntas clínicas en intake"

## Context

El alta de paciente actual solo captura `nombre`. El expediente clínico real requiere más datos para ser útil desde sesión 1. Este spec define la ampliación del intake a 10 campos clínicos, el modelo de persistencia, el flujo de UI (crear + editar) y las consideraciones LFPDPPP.

### Campos solicitados

1. Nombre completo
2. Edad *(derivado — no se persiste)*
3. Fecha de nacimiento
4. Estado civil
5. Ocupación
6. Domicilio
7. Contacto de emergencia
8. Motivo de consulta
9. Historial médico relevante
10. Historial psicológico

## Decisiones aprobadas

### Flujo híbrido (C)

Obligatorios en el `POST` de alta: **Nombre**, **Fecha de nacimiento**, **Motivo de consulta**. Los 7 campos restantes son opcionales y se pueden completar después desde la UI de edición.

**Razón:** balance entre datos clínicos útiles desde día uno y velocidad cuando el paciente ya está en sesión. Forzar todos los campos upfront bloquea el flujo real ("paciente ya está en el diván, no he llenado domicilio").

### Persistencia: columnas tipadas en `patients` (A)

Se agregan 7 columnas a la tabla existente `patients`. No se crea tabla separada ni columna JSONB catch-all.

**Razón:**
- Los campos son estables (son el expediente clínico estándar — no cambian cada sprint).
- Consultas por ocupación/estado civil pueden volverse útiles a futuro.
- Patrón actual (`ALTER TABLE ADD COLUMN IF NOT EXISTS` en `init_db()`) soporta esto sin Alembic.
- `emergency_contact` sí usa JSONB **tipado** porque es un sub-objeto coherente (nombre + parentesco + teléfono), no 3 columnas sueltas.

### UI: modal grande reutilizable + aviso LFPDPPP

Un solo componente `PatientIntakeModal` sirve para crear y editar. Se agrega punto de entrada "Editar expediente" en el header del paciente activo. Modal más ancho (`max-w-2xl`), scrolleable, con 3 secciones visuales (Identidad / Contacto / Clínico) y aviso LFPDPPP breve arriba.

**Razón:**
- El patrón actual de la app es modales sobre el layout principal (no hay router de páginas). Mantenerlo coherente.
- Un solo componente para crear/editar evita duplicar UI y lógica.
- Aviso LFPDPPP refuerza confianza al capturar datos sensibles (domicilio, contacto, historial médico).

---

## Sección 1 — Base de datos

### Cambios en `backend/database.py` (modelo `Patient`)

Agregar 7 columnas, todas `nullable=True`:

```python
marital_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
occupation: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
emergency_contact: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
reason_for_consultation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
medical_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
psychological_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

### Migración idempotente en `init_db()`

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(120);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact JSONB;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reason_for_consultation TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_history TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS psychological_history TEXT;
```

### Invariantes

- **Nullable en BD, requerido en API.** La obligatoriedad de los 3 campos mínimos vive en Pydantic (`POST /patients`), no en la BD. Esto permite:
  - Pacientes legacy sin estos datos siguen funcionando.
  - `PATCH` parcial sin forzar al psicólogo a reenviar los campos ya guardados.
- **No se guarda `age`.** Se calcula del `date_of_birth` en el frontend (helper puro). Duplicar la verdad se desincroniza.
- **`marital_status` no es enum SQL.** Valores cerrados viven en el frontend como `Literal` de Pydantic; `VARCHAR(30)` en BD es pragmático para cambios futuros.
- **No se agregan índices nuevos.** Ninguna de estas columnas se filtra en queries hoy — sería premature optimization.

---

## Sección 2 — API backend (`api/routes.py`)

### Pydantic schemas

```python
class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    relationship: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=7, max_length=20)

MaritalStatus = Literal[
    "soltero", "casado", "divorciado", "viudo", "union_libre", "otro"
]

class PatientCreate(BaseModel):
    # Obligatorios (flujo híbrido)
    name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    reason_for_consultation: str = Field(..., min_length=1, max_length=2000)

    # Opcionales
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)

    # Pre-existentes
    diagnosis_tags: Optional[List[str]] = []
    risk_level: str = "low"

    @field_validator("date_of_birth")
    @classmethod
    def dob_must_be_past_and_reasonable(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Fecha de nacimiento debe ser pasada")
        if v < today.replace(year=today.year - 120):
            raise ValueError("Fecha de nacimiento no razonable")
        return v

class PatientUpdate(BaseModel):
    # Todos opcionales — PATCH parcial
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    date_of_birth: Optional[date] = None
    reason_for_consultation: Optional[str] = Field(None, min_length=1, max_length=2000)
    marital_status: Optional[MaritalStatus] = None
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    medical_history: Optional[str] = Field(None, max_length=5000)
    psychological_history: Optional[str] = Field(None, max_length=5000)
    diagnosis_tags: Optional[List[str]] = None
    risk_level: Optional[str] = None
```

### `PatientOut` — ampliado

Devuelve todos los campos nuevos (no solo `id/name/risk_level`) para que el frontend pre-llene el modal de edición con una sola llamada.

### Endpoints

| Método | Ruta | Estado | Propósito |
|--------|------|--------|-----------|
| `POST` | `/patients` | Existente — ampliar | Crear con todos los campos nuevos |
| `GET` | `/patients/{id}` | **Nuevo** | Leer expediente completo para pre-llenar modal |
| `PATCH` | `/patients/{id}` | **Nuevo** | Edición parcial |

### Seguridad (ownership)

`GET /{id}` y `PATCH /{id}` deben validar `patient.psychologist_id == current_user.id`. Si no coincide → **404** (no 403), para no revelar existencia del recurso. Patrón consistente con el resto de endpoints.

### Auditoría (LFPDPPP)

En `create_patient` y `update_patient`, escribir a `audit_logs`:

- `action="CREATE"` (alta) o `action="UPDATE"` (edición)
- `entity="patient"`, `entity_id=str(patient.id)`
- `extra`: **solo nombres de campos modificados**, nunca valores.
  - Ejemplo: `{"fields_changed": ["address", "emergency_contact"]}`
- Razón: `database.py:73` regla inmutable — "nunca guardar datos clínicos aquí, solo IDs y contadores".

### Validación especial

- `date_of_birth`: debe ser pasada y edad ≤ 120 años (validator arriba).
- `emergency_contact.phone`: solo validación de longitud (7-20 chars). No se valida formato — el paciente puede dar número extranjero, con extensión, etc.

### Semántica de `PATCH`

- **Campos opcionales pueden limpiarse enviando `null` explícito.** Ejemplo: `PATCH {"emergency_contact": null}` borra el contacto de emergencia; `PATCH {"occupation": null}` limpia la ocupación.
- **Los 3 campos mínimos (`name`, `date_of_birth`, `reason_for_consultation`) no se pueden limpiar.** Se pueden editar a un valor nuevo no vacío, pero enviar `null` o string vacío → 422. Validación en Pydantic con `min_length=1` y chequeo explícito de `null` si el campo aparece en el payload.
- Para distinguir "no se envió" vs. "se envió como null" en Pydantic v2: usar `model_fields_set` o un sentinel. Decidir en implementación cuál patrón encaja mejor con el resto del código.

### Auditoría de lectura

No se escribe `audit_logs` en `GET /patients/{id}` en el MVP. LFPDPPP no exige log por cada lectura para un practitioner accediendo a sus propios pacientes. Revisitar si se añade acceso multi-usuario o roles (ej. asistente que lee expedientes del psicólogo).

---

## Sección 3 — Frontend

### Componente único: `PatientIntakeModal`

Renombrar `frontend/src/components/NewPatientModal.jsx` → `PatientIntakeModal.jsx`. Mismo componente para crear y editar.

```jsx
<PatientIntakeModal
  open={boolean}
  mode="create" | "edit"
  initialPatient={null | Patient}
  onClose={() => void}
  onSaved={(patient) => void}
/>
```

Comportamiento:
- `mode="create"` → `POST /patients`, título "Registrar paciente", submit "Crear paciente".
- `mode="edit"` → `GET /patients/{id}` al abrir para hidratar el form + `PATCH /patients/{id}` al guardar. Título "Editar expediente", submit "Guardar cambios".

### Layout

```
┌─────────────────────────────────────────────┐
│  NUEVO EXPEDIENTE                        ✕  │
│  Registrar paciente                         │
├─────────────────────────────────────────────┤
│  🔒 Estos datos se guardan cifrados y solo  │
│     tú los ves. Art. 8 LFPDPPP.             │
├─────────────────────────────────────────────┤
│  IDENTIDAD                                  │
│  • Nombre completo *                        │
│  • Fecha de nacimiento *     (Edad: 34)    │
│  • Estado civil ▾    • Ocupación            │
├─────────────────────────────────────────────┤
│  CONTACTO                                   │
│  • Domicilio                                │
│  • Contacto de emergencia                   │
│    Nombre · Parentesco · Teléfono           │
├─────────────────────────────────────────────┤
│  CLÍNICO                                    │
│  • Motivo de consulta *    (textarea)      │
│  • Historial médico         (textarea)     │
│  • Historial psicológico    (textarea)     │
├─────────────────────────────────────────────┤
│           [Cancelar]    [Crear paciente]    │
└─────────────────────────────────────────────┘
```

### Detalles visuales

Siguen la paleta aprobada (CLAUDE.md):

- Ancho: `max-w-2xl`, `max-h-[90vh] overflow-y-auto`.
- Headers de sección: small caps con `text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold` (mismo patrón del SOAP).
- Separación entre secciones: espacio + línea `border-ink/[0.06]`. Sin cards, sin sombras — solo surface color shifts.
- Aviso LFPDPPP: fondo `bg-[#f4f4f2]`, ícono candado, texto `text-[12px]`, 1-2 líneas.
- Asterisco `*` rojo suave en los 3 obligatorios.
- Edad calculada: gris, read-only, al lado de la fecha de nacimiento.
- Botones: mismos estilos del modal actual (`bg-[#5a9e8a]` submit, `bg-[#f4f4f2]` cancel).

### Validación cliente

- Submit deshabilitado hasta que los 3 obligatorios tengan valor válido.
- `date_of_birth`: `<input type="date" max={today}>`.
- Contacto de emergencia: si el psicólogo escribe uno de los 3 sub-campos (nombre/parentesco/teléfono), los otros 2 pasan a ser obligatorios. "Todo o nada" — un nombre sin teléfono no sirve.
- Errores de API (422) se muestran mapeados al campo correspondiente cuando sea posible.

### Punto de entrada para editar

En el header del paciente activo, al lado del nombre, agregar botón **"Editar expediente"** (ícono lápiz, estilo consistente con el resto). Abre `PatientIntakeModal` con `mode="edit"` + `initialPatient`.

### Cambios en `frontend/src/api.js`

```js
export async function getPatient(patientId) { /* GET /patients/{id} */ }
export async function updatePatient(patientId, patch) { /* PATCH /patients/{id} */ }
export async function createPatient(payload) {
  // Firma nueva: recibe objeto completo, no solo name
  // payload: { name, date_of_birth, reason_for_consultation, ... }
}
```

El backend (`PatientCreate` en `routes.py:41-46`) ya acepta `name`, `date_of_birth`, `diagnosis_tags` y `risk_level`; solo el wrapper frontend `api.js#createPatient` está limitado a `name`. Al ampliar la firma del wrapper, verificar todos los call sites con grep y actualizarlos en el mismo commit. No es un breaking change del contrato HTTP, solo de la función JS.

### Helper puro

`frontend/src/utils/age.js` con `calculateAge(dateOfBirth: string | Date): number`. Testeable en aislamiento.

---

## Sección 4 — Testing, rollout, riesgos

### Testing backend (`backend/tests/`)

**`test_patient_create.py`**
- Payload completo → 201, todos los campos persisten.
- Payload mínimo (`name + date_of_birth + reason_for_consultation`) → 201.
- Falta `date_of_birth` → 422.
- Falta `reason_for_consultation` → 422.
- `date_of_birth` futura → 422.
- `date_of_birth` hace > 120 años → 422.
- `marital_status` fuera del enum → 422.
- `emergency_contact` incompleto (solo `name`) → 422.
- Verifica INSERT en `audit_logs` con `action=CREATE`, `entity=patient`, `extra` sin valores clínicos.

**`test_patient_update.py`**
- `PATCH` con un solo campo → solo ese cambia, resto intacto.
- `PATCH` de paciente de otro psicólogo → 404.
- Verifica INSERT en `audit_logs` con `action=UPDATE` y `extra.fields_changed` listando solo nombres.

**`test_patient_get.py`**
- `GET /patients/{id}` devuelve todos los campos ampliados.
- `GET` de paciente de otro psicólogo → 404.

### Testing frontend (`frontend/src/`)

**`PatientIntakeModal.test.jsx`** — reescribir el actual `NewPatientModal.test.jsx`
- Submit deshabilitado hasta que los 3 obligatorios tengan valor.
- Seleccionar fecha de nacimiento calcula y muestra edad.
- `mode="edit"` con `initialPatient` → form pre-llenado.
- Contacto de emergencia: escribir `name` fuerza `relationship` y `phone` a obligatorios.
- `mode="create"` llama `createPatient`; `mode="edit"` llama `updatePatient`.

**`utils/age.test.js`**
- Edad para fechas normales.
- Edad considerando si aún no llega el cumpleaños este año.
- Fecha inválida → `null` o throw (decidir en implementación).

### Migración de datos existentes

- Pacientes legacy quedan con los 7 campos nuevos en `NULL`. OK — son `nullable=True`.
- `seed.py` y `seed_demo.py` deben poblar los campos nuevos en sus pacientes demo para que la UI se pruebe con datos reales. Ampliar ambos.

### Rollout

1. Rama: `feature/expanded-patient-intake` desde `dev` (ya creada).
2. Commits en orden:
   - `feat(db): add 7 intake columns to patients table`
   - `feat(api): patient create/update/get with intake fields + audit`
   - `feat(ui): PatientIntakeModal reusable para crear y editar`
   - `feat(seed): datos de intake en pacientes demo`
   - `test: backend + frontend coverage for intake`
3. PR a `dev` → Vercel preview URL.
4. QA manual antes de mergear:
   - Crear paciente con todos los campos.
   - Crear paciente con mínimo (3 campos).
   - Editar paciente existente desde header.
   - Intentar acceder a paciente de otro psicólogo → debe dar 404.
   - Verificar `audit_logs` en BD tras CREATE/UPDATE — no debe haber valores clínicos.

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Pacientes legacy sin `date_of_birth`/`reason_for_consultation` pero estos ahora son obligatorios en `POST` | Solo exigidos en `POST`, no en BD ni `PATCH`. Legacy siguen funcionando. Al editarlos, la UI muestra vacíos pero no los fuerza al abrir. |
| Filtración de datos sensibles en `audit_logs` | Regla inmutable: `extra` solo contiene nombres de campos. Unit test verifica. |
| Cambiar firma de `createPatient(name)` rompe callers existentes | Buscar todos los call sites con grep antes del cambio; actualizarlos en el mismo commit. |
| Validaciones Pydantic duras rompen el seed demo | Smoke test: `python seed_demo.py` debe correr sin fallar en CI o como parte del rollout check. |

### Fuera de alcance

- No se usa el intake como contexto para el agente Claude (otro item del roadmap: "Agente conoce nombre del paciente").
- No se añade export/PDF del expediente (post-MVP).
- No se añade consentimiento informado firmable por el paciente. El aviso LFPDPPP del modal es informativo para el psicólogo, no documento legal.
- No se migra ni se re-muestra estos campos en la vista de sesión/SOAP.
- No se implementa soft-delete ni anonimización de estos nuevos campos (ya existe `deleted_at` en `patients`, heredan comportamiento).

---

## Archivos afectados

**Backend:**
- `backend/database.py` — modelo `Patient` + `init_db()` migrations
- `backend/api/routes.py` — schemas + endpoints
- `backend/seed.py`, `backend/seed_demo.py` — poblar campos en demos
- `backend/tests/test_patient_create.py` (nuevo o ampliado)
- `backend/tests/test_patient_update.py` (nuevo)
- `backend/tests/test_patient_get.py` (nuevo)

**Frontend:**
- `frontend/src/components/PatientIntakeModal.jsx` (renombrar desde `NewPatientModal.jsx`)
- `frontend/src/components/PatientIntakeModal.test.jsx` (renombrar)
- `frontend/src/api.js` — `getPatient`, `updatePatient`, `createPatient` ampliado
- `frontend/src/utils/age.js` (nuevo)
- `frontend/src/utils/age.test.js` (nuevo)
- `frontend/src/App.jsx` — call sites de `createPatient`, botón "Editar expediente"
- `frontend/src/components/PatientSidebar.jsx` — posible punto de entrada al modal de edición (verificar en implementación)

## Referencias

- CLAUDE.md — paleta de colores, patrones de UI, branching strategy
- `backend/database.py:162-188` — modelo `Patient` actual
- `backend/api/routes.py:41-66, 162-193` — `PatientCreate`, `PatientOut`, endpoint actual
- `frontend/src/components/NewPatientModal.jsx` — modal actual con campos "próximamente"
- LFPDPPP Art. 8 — consentimiento informado para tratamiento de datos personales sensibles
