# Diseño: Sidebar por Paciente (Chat Efímero)

**Fecha:** 2026-03-22
**Rama:** feature/soap-visual-hierarchy
**Estado:** Aprobado

---

## Problema

Cada mensaje enviado llama a `POST /sessions/{patient_id}/process`, que siempre crea un registro `Session`. El sidebar muestra una entrada por `Session`, creciendo con cada mensaje — incluso chat libre sin valor clínico persistente.

## Objetivo

El sidebar muestra **una entrada por paciente**. Solo aparece una entrada nueva cuando se crea un nuevo paciente. Chat efímero. Notas SOAP siguen creando Sessions para historial clínico interno.

---

## Cambio 1 — Chat efímero (backend: `routes.py`)

`POST /sessions/{patient_id}/process` con `format='chat'`:
- Llama a Claude con contexto del paciente
- Retorna solo `text_fallback`
- **No crea Session en BD**

`format='SOAP'` mantiene comportamiento actual: crea `Session(status='draft')`.

### Schema fix requerido

`ProcessSessionOut.session_id` debe ser opcional — para chat no hay session creada:

```python
class ProcessSessionOut(BaseModel):
    text_fallback: Optional[str]
    session_id: Optional[str] = None  # None cuando format='chat'
```

### Lógica en el endpoint

`session_id` se genera solo si se va a crear una Session:

```python
response = await process_session(...)  # llama a Claude siempre

if rec.format != "chat":
    session_id = str(uuid.uuid4())
    new_session = Session(id=uuid.UUID(session_id), ...)
    db.add(new_session)
    await db.commit()
    return ProcessSessionOut(text_fallback=response.get("text_fallback"), session_id=session_id)
else:
    return ProcessSessionOut(text_fallback=response.get("text_fallback"))
```

---

## Cambio 2 — Query sidebar por paciente (backend: `routes.py`)

El endpoint `listConversations` (o equivalente) cambia de "una fila por Session" a **"una fila por paciente"** usando `DISTINCT ON (patient_id)` de PostgreSQL, con la Session más reciente como preview.

Pacientes **sin ninguna Session** (solo han tenido chat efímero) también deben aparecer — requiere `LEFT JOIN` de `Patient` hacia `Session`.

### Query pattern

```sql
-- Todos los pacientes del psicólogo, con datos de su Session más reciente (si existe)
SELECT DISTINCT ON (p.id)
  p.id            AS patient_id,
  p.name          AS patient_name,
  s.id            AS session_id,
  s.session_number,
  s.session_date,
  s.raw_dictation AS dictation_preview,
  s.status
FROM patients p
LEFT JOIN sessions s
  ON s.patient_id = p.id
  AND s.is_archived = FALSE
WHERE p.psychologist_id = :psychologist_id
ORDER BY p.id, s.created_at DESC NULLS LAST
```

**Nota:** La implementación actual de `listConversations` no filtra por `psychologist_id` (limitación pre-existente en demo). Esta spec mantiene ese comportamiento — el filtro se añadirá cuando se implemente autenticación multi-tenant real.

### Campos retornados por entrada

| Campo | Fuente | Nullable |
|-------|--------|----------|
| `patient_id` | `patients.id` | No |
| `patient_name` | `patients.name` | No |
| `session_id` | `sessions.id` | Sí (si no hay Sessions) |
| `session_number` | `sessions.session_number` | Sí |
| `session_date` | `sessions.session_date` | Sí |
| `dictation_preview` | `sessions.raw_dictation` (truncado) | Sí |

---

## Cambio 3 — Frontend (mínimo)

`handleSendDictation` en `App.jsx` ya diferencia correctamente:
- `format='chat'` → `type: 'chat'`, no usa `session_id` → **sin cambios**
- `format='SOAP'` → `type: 'bot'`, usa `noteData.session_id` → **sin cambios**

`fetchConversations()` se llama **solo después de SOAP** (no después de chat). El chat no modifica la BD, por lo que refetching sería polling innecesario. El sidebar ya refleja el estado correcto.

---

## Flujo resultante

```
Nuevo paciente creado
  → sidebar: nueva entrada (sin preview aún)        ✓

Chat libre (format='chat')
  → Claude responde
  → BD: sin cambios
  → sidebar: fetchConversations, sin nueva entrada   ✓

Generar nota SOAP (format='SOAP')
  → Session creada en BD (status='draft')
  → sidebar: actualiza preview del paciente          ✓

Paciente sin notas SOAP (solo chat)
  → aparece en sidebar sin preview de dictado        ✓

Confirmar nota
  → Session.status → 'confirmed', ClinicalNote creada
  → sidebar: sin nueva entrada                       ✓
```

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `backend/api/routes.py` | `ProcessSessionOut`: `session_id` → `Optional[str] = None` |
| `backend/api/routes.py` | `process_session_endpoint`: skip Session creation si `format='chat'` |
| `backend/api/routes.py` | `listConversations`: reescribir query con LEFT JOIN + DISTINCT ON patient_id |
| `frontend/src/App.jsx` | Ninguno requerido |
