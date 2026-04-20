# Cifrado de Datos Sensibles — LFPDPPP

**Fecha:** 2026-04-19  
**Estado:** Aprobado  
**Rama base:** `dev`

## Contexto

SyqueX procesa datos clínicos de pacientes (notas SOAP, dictados, historial médico) que constituyen *datos sensibles* bajo LFPDPPP Art. 19. Actualmente estos campos se guardan en texto plano en PostgreSQL. Si la BD es comprometida, los datos son legibles sin restricción.

Este spec define el esquema de cifrado simétrico a nivel de aplicación para cumplir con el principio de seguridad de la LFPDPPP.

## Objetivos

- Cifrar todos los campos clínicos sensibles antes de persistirlos en BD
- Descifrar en memoria al momento de la consulta, nunca persistir texto plano
- Fallar explícitamente al arranque si la llave no está configurada
- Soportar rotación de llaves sin downtime mediante prefijo de versión

## Fuera de alcance

- Cifrado a nivel de columna en PostgreSQL (pgcrypto) — descartado por incompatibilidad con ORM
- Llaves por usuario/psicólogo — descartado por complejidad pre-MVP
- Migración de datos existentes — la BD de producción arranca limpia

## Decisiones de diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Algoritmo | Fernet (AES-128-CBC + HMAC-SHA256) | Estándar Python, autenticado, sin boilerplate |
| Gestión de llave | Env var `ENCRYPTION_KEY` en Railway | Simple, seguro, sin cambios de schema |
| Ubicación del cifrado | `routes.py` y `agent/` antes de `db.add()` / `db.commit()` | La BD nunca ve texto plano |
| Ubicación del descifrado | Inmediatamente después de leer de BD, antes de usar el valor | Transparente para el frontend y el agente |
| Versioning | Prefijo `v{n}:` en cada valor | Permite rotación futura |

## Módulo `backend/crypto.py`

```python
# Interfaz pública
encrypt(plaintext: str) -> str              # -> "v1:<fernet_token>"
decrypt(ciphertext: str) -> str             # acepta "v1:...", "v2:...", etc.
encrypt_if_set(value: str | None) -> str | None
decrypt_if_set(value: str | None) -> str | None
validate_key() -> None                      # llamado al arranque; SystemExit(1) si inválida
```

Internamente:
- Lee `ENCRYPTION_KEY` desde `settings`; opcionalmente `ENCRYPTION_KEY_V1` para rotación
- Cada valor cifrado con la llave activa lleva prefijo `v1:` (primera versión)
- Al descifrar, parsea el prefijo: `v1:` → usa `ENCRYPTION_KEY_V1` si está presente, o `ENCRYPTION_KEY` si no; `v2:` → usa `ENCRYPTION_KEY`
- El número de versión en el prefijo indica con qué generación de llave fue cifrado, no el nombre del env var
- Si el prefijo no coincide con ninguna versión conocida, lanza `DecryptionError`

### Mapeo prefijo → llave

| Prefijo | Env var usado |
|---------|--------------|
| `v1:` | `ENCRYPTION_KEY_V1` (si existe), else `ENCRYPTION_KEY` |
| `v2:` | `ENCRYPTION_KEY` |

Al rotar, los datos nuevos se escriben con `v2:`. Los datos `v1:` se descifran con `ENCRYPTION_KEY_V1` hasta que `rotate_keys.py` los re-cifre a `v2:`.

## Campos cifrados

### `clinical_notes`
| Campo | Acción |
|-------|--------|
| `subjective` | Cifrar al escribir, descifrar al leer |
| `objective` | Cifrar al escribir, descifrar al leer |
| `assessment` | Cifrar al escribir, descifrar al leer |
| `plan` | Cifrar al escribir, descifrar al leer |
| `data_field` | Cifrar al escribir, descifrar al leer |

### `sessions`
| Campo | Acción |
|-------|--------|
| `raw_dictation` | Cifrar al escribir, descifrar al leer |
| `ai_response` | Cifrar al escribir, descifrar al leer |
| `messages` (JSONB → Text) | `json.dumps(list)` → `encrypt()` al escribir; `decrypt()` → `json.loads()` al leer. Ver nota de migración abajo. |

### `patients`
| Campo | Acción |
|-------|--------|
| `medical_history` | Cifrar al escribir, descifrar al leer |
| `psychological_history` | Cifrar al escribir, descifrar al leer |
| `reason_for_consultation` | Cifrar al escribir, descifrar al leer |
| `address` | Cifrar al escribir, descifrar al leer |
| `emergency_contact` (JSONB → Text) | `json.dumps(dict)` → `encrypt()` al escribir; `decrypt()` → `json.loads()` al leer. Ver nota de migración abajo. |

### `patient_profiles`
| Campo | Acción |
|-------|--------|
| `patient_summary` | Cifrar al escribir, descifrar al leer |

### No se cifra
- `embedding` — vector numérico, no PII
- `detected_patterns`, `alerts`, `suggested_next_steps` — metadatos sin identidad directa
- `name`, `email` del psicólogo — necesarios para auth/búsqueda
- Campos operacionales: fechas, IDs, status, flags

## Migración de columnas JSONB → Text

`emergency_contact` (patients) y `messages` (sessions) son actualmente JSONB. Para cifrarlos como string se deben convertir a Text.

### Cambios en el modelo ORM (`database.py`)
```python
# patients
emergency_contact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

# sessions
messages: Mapped[str] = mapped_column(Text, default="[]")
```

### Migración DDL en `init_db()` (idempotente)
```sql
-- emergency_contact
ALTER TABLE patients ALTER COLUMN emergency_contact TYPE TEXT
  USING emergency_contact::text;

-- messages
ALTER TABLE sessions ALTER COLUMN messages TYPE TEXT
  USING messages::text;
```

Nota: La BD de producción arranca limpia, por lo que no hay filas con valores JSONB previos. En entornos de desarrollo con datos existentes, la cláusula `USING` convierte el JSON a su representación string, que después el código de cifrado procesará como texto plano legacy (ver manejo de legacy abajo).

### Manejo de valores legacy en sessions.messages

En entornos de desarrollo puede haber filas con `messages` como string JSON plano (no cifrado, resultado de la migración USING). Al leer, `decrypt_if_set` debe manejar este caso:

```python
def decrypt_if_set(value: str | None) -> str | None:
    if value is None:
        return None
    if value.startswith("v1:") or value.startswith("v2:"):
        return decrypt(value)
    return value  # valor legacy sin cifrar — retornar tal cual
```

Esto garantiza compatibilidad hacia atrás sin romper entornos de staging/dev.

## Rutas de escritura cubiertas

| Endpoint / función | Campos cifrados |
|--------------------|-----------------|
| `POST /patients` | `medical_history`, `psychological_history`, `reason_for_consultation`, `address`, `emergency_contact` |
| `PATCH /patients/{id}` | Mismos campos de patients si están presentes en el request |
| `POST /sessions/{patient_id}/process` | `raw_dictation` al crear; `ai_response` y `messages` al guardar respuesta del agente |
| `POST /sessions/{session_id}/confirm` | `subjective`, `objective`, `assessment`, `plan`, `data_field` |
| `update_patient_profile_summary()` | `patient_summary` |

**Orden de operaciones en `confirm_session`:** El embedding se computa del texto plano **antes** de cifrar. El orden es: (1) computar `text_to_embed` desde `note_data` en plano, (2) llamar `get_embedding(text_to_embed)`, (3) cifrar cada campo SOAP, (4) construir `ClinicalNote` con campos cifrados + embedding. Cifrar antes del embedding haría el índice de búsqueda semánticamente inútil.

## Rutas de lectura cubiertas

| Endpoint / función | Campos descifrados |
|--------------------|--------------------|
| `POST /patients` (respuesta 201) | Descifrar atributos del ORM antes de `PatientOut.model_validate(patient)`: `address`, `emergency_contact` (json.loads), `reason_for_consultation`, `medical_history`, `psychological_history` |
| `GET /patients/{id}` | Mismos campos que POST response |
| `PATCH /patients/{id}` (respuesta) | Mismos campos — descifrar atributos del ORM post-`db.refresh` antes de `PatientOut.model_validate(patient)` |
| `GET /patients/{id}/sessions` | Todos los campos de `clinical_notes` y `sessions` |
| `GET /patients/{id}/profile` | `assessment` (join con `clinical_notes`), `patient_summary` |
| `GET /conversations` (list_conversations) | `raw_dictation`: `decrypt_if_set(row.get("dictation_preview"))`, luego truncar a 120 chars. `messages`: `json.loads(decrypt_if_set(row.get("messages")) or "[]")`, luego `len()` para `message_count` |
| `agent/tools.py: search_patient_history` | `cn.assessment` — descifrar después de leer de BD, antes de retornar al agente |
| `agent/tools.py: detect_patterns_between_sessions` | `cn.subjective`, `cn.assessment` — descifrar después de leer, antes de pasar a Claude |
| `agent/agent.py: _get_patient_context` | `session.messages` (decrypt_if_set → json.loads), `profile.patient_summary` (decrypt_if_set) |

## Flujo de datos (ejemplo: confirmar sesión)

```
Frontend → POST /sessions/{id}/confirm
  → routes.py recibe texto plano en note_data
  → get_embedding(texto_plano)            ← PRIMERO el embedding
  → encrypt() cada campo SOAP             ← LUEGO cifrar
  → db.add(ClinicalNote con texto cifrado + embedding)
  → BD guarda "v1:<token>"

Frontend → GET /patients/{id}/sessions
  → routes.py lee registros cifrados de BD
  → decrypt() cada campo sensible
  → serializa respuesta Pydantic con texto plano
  → HTTPS → Frontend
```

## Config (`config.py`)

```python
ENCRYPTION_KEY: str = ""          # Fernet key base64url — llave activa
ENCRYPTION_KEY_V1: str = ""       # Solo durante rotación — llave anterior
```

Validación en `model_validator` (producción y staging):
```python
if not self.ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY is required in production/staging")
```

Esta validación es el punto de gatekeeping principal — falla antes de que arranque la app. `validate_key()` en `crypto.py` es un check secundario de formato (llave Fernet válida).

## Arranque seguro (`main.py`)

En el `lifespan` de FastAPI, después de que `settings` cargue correctamente:

```python
from crypto import validate_key
validate_key()
```

`validate_key()` verifica que `ENCRYPTION_KEY` tenga formato Fernet válido. Si falla:

```python
logger.critical("ENCRYPTION_KEY inválida — debe ser una llave Fernet base64 de 32 bytes")
raise SystemExit(1)
```

## Rotación de llaves (operación futura)

Para rotar la llave activa:
1. Generar nueva llave (`Fernet.generate_key()`)
2. Configurar `ENCRYPTION_KEY_V1` = llave anterior; `ENCRYPTION_KEY` = nueva llave
3. Redesplegar — sistema descifra `v1:` con `ENCRYPTION_KEY_V1`, escribe nuevos registros como `v2:`
4. Correr script `rotate_keys.py`: re-cifra todos los `v1:` registros a `v2:`
5. Verificar que no quedan `v1:` en BD
6. Eliminar `ENCRYPTION_KEY_V1` del env, redesplegar

Para el MVP solo se implementa el soporte de lectura multi-versión (paso 3). El script `rotate_keys.py` es trabajo futuro.

## Generación de llave

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Guardar en Railway como `ENCRYPTION_KEY`.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/crypto.py` | Nuevo — módulo de cifrado |
| `backend/config.py` | Agregar `ENCRYPTION_KEY`, `ENCRYPTION_KEY_V1`; validación en prod/staging |
| `backend/main.py` | Llamar `validate_key()` en lifespan |
| `backend/database.py` | Cambiar `emergency_contact` y `messages` de JSONB → Text; migración DDL en `init_db()` |
| `backend/api/routes.py` | Cifrar al escribir, descifrar al leer (todas las rutas cubiertas) |
| `backend/agent/tools.py` | Descifrar `assessment`, `subjective` después de leer de BD |
| `backend/agent/agent.py` | Descifrar `session.messages` y `profile.patient_summary` en `_get_patient_context` |
| `backend/requirements.txt` | Agregar `cryptography` como dependencia directa explícita |

## Dependencias

Agregar `cryptography` explícitamente en `requirements.txt`. No asumir que viene transitivamente de otras librerías.
