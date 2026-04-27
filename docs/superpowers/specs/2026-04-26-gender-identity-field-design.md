# Gender Identity Field — Design Spec

**Date:** 2026-04-26
**Status:** Approved
**Scope:** Add optional `gender_identity` field to the patient profile (intake form + DB + API).

---

## Overview

Añadir identidad de género como campo opcional al expediente del paciente. El campo aparece en el formulario de registro y edición de pacientes (PatientIntakeModal), entre Estado civil y Ocupación dentro de la sección Identidad.

---

## Data Layer

### New column — `patients` table

```sql
gender_identity VARCHAR(30) NULLABLE
CHECK (gender_identity IN ('hombre', 'mujer', 'no_binario', 'otro'))
```

Migration in `init_db()` (idempotente):

```python
await conn.execute(text(
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender_identity VARCHAR(30);"
))
# CHECK constraint via DO $$ block, same pattern as chk_patients_risk_level
```

### SQLAlchemy model (`Patient`)

```python
gender_identity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
```

### Privacy — LFPDPPP

`gender_identity` se trata como dato sensible (Art. 3-VI LFPDPPP: preferencia sexual / identidad de género). Se agrega a `_PATIENT_SENSITIVE` para que sea cifrado en reposo, igual que `reason_for_consultation`, `address` y `emergency_contact`.

---

## Backend — API layer (`api/routes.py`)

### New enum

```python
class GenderIdentity(str, Enum):
    hombre = "hombre"
    mujer = "mujer"
    no_binario = "no_binario"
    otro = "otro"
```

### `PatientCreate`

```python
gender_identity: Optional[GenderIdentity] = None
```

### `PatientUpdate`

```python
gender_identity: Optional[GenderIdentity] = None
```

### `PatientOut`

```python
gender_identity: Optional[str] = None
```

### `create_patient` handler

```python
gender_identity=encrypt_if_set(payload.gender_identity),
```

### `update_patient` handler

El loop genérico ya aplica `encrypt_if_set` para campos en `_PATIENT_SENSITIVE` — solo requiere agregar `"gender_identity"` al set.

### `_decrypt_patient_orm`

Agregar `gender_identity` a la lógica de descifrado para que se descifre al leer (GET + lista de pacientes).

---

## Frontend — `PatientIntakeModal.jsx`

### New constant

```js
const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'mujer', label: 'Mujer' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'otro', label: 'Otro' },
];
```

### `EMPTY_FORM`

```js
gender_identity: '',
```

### `toForm`

```js
gender_identity: patient.gender_identity || '',
```

### `buildPayload`

```js
gender_identity: form.gender_identity || null,
```

### Layout — sección Identidad

El campo se inserta entre Estado civil y Ocupación como `<Field>` de ancho completo (fuera del grid de 2 columnas):

```
Mobile + Desktop:
┌──────────────────────────────────────┐
│ Nombre completo                      │
├───────────────────┬──────────────────┤
│ Fecha de nac.     │ Estado civil     │  ← grid 2-col existente (sm+)
├───────────────────┴──────────────────┤
│ Identidad de género                  │  ← nuevo, ancho completo
├──────────────────────────────────────┤
│ Ocupación                            │
└──────────────────────────────────────┘
```

Select con `inputClass` estándar, `disabled={saving || loading}`, sin efecto en `canSubmit` (campo 100% opcional).

---

## What does NOT change

- `canSubmit` logic — el campo no es requerido.
- `PatientCard` sidebar — solo muestra nombre; no hay cambio necesario.
- `PatientProfile` / `EvolucionPanel` — campo informativo de intake, no se agrega a vistas de evolución clínica.
- Embeddings / agent context — no se incluye en el contexto de Claude (dato de identidad, no clínico-evolutivo).

---

## Testing

- **Backend:** unit test en `PatientCreate` — campo omitido, campo `hombre`, campo valor inválido (espera 422).
- **Backend:** verificar que `gender_identity` aparece en `_PATIENT_SENSITIVE` y que el valor se cifra/descifra correctamente en create + update + get.
- **Frontend:** `PatientIntakeModal.test.jsx` — render del select, valor vacío por defecto, submit sin el campo (crea paciente ok), submit con valor.
