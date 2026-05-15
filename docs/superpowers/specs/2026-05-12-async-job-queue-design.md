# Async Job Queue para Generación de Notas Clínicas

**Fecha:** 2026-05-12
**Estado:** Aprobado

## Contexto y problema

SyqueX genera notas clínicas llamando a la Anthropic API (Claude) de forma síncrona en el request HTTP. Bajo carga pico (100 psicólogos simultáneos), esto crea 100 conexiones HTTP bloqueadas esperando respuestas de Claude (10-15s cada una), con riesgo de 429s de Anthropic que hoy se muestran como mensajes de error silenciosos dentro de la nota.

**Objetivo:** aceptar dictados inmediatamente y procesar la nota en background, sin que el usuario espere bloqueado.

---

## Arquitectura

### Modelo de datos — tabla `job_queue`

Nueva tabla en PostgreSQL (sin infra adicional):

| Campo            | Tipo       | Notas |
|------------------|------------|-------|
| `id`             | UUID PK    | No secuencial — evita enumeración |
| `psychologist_id`| UUID FK    | Para autorización en SSE |
| `session_id`     | UUID FK    | Referencia a `sessions` |
| `patient_id`     | UUID FK    | |
| `status`         | enum       | `pending \| processing \| completed \| failed` |
| `format_`        | str        | `SOAP \| chat \| custom` |
| `raw_dictation`  | text       | **CIFRADO** con `encrypt_if_set()` (LFPDPPP) |
| `template_fields`| JSONB      | nullable — solo para notas custom |
| `result`         | JSONB      | **CIFRADO**, nullable — nota generada |
| `error_message`  | text       | nullable — mensaje genérico, sin stacktrace |
| `attempts`       | int        | default 0 — para retry |
| `created_at`     | timestamp  | |
| `updated_at`     | timestamp  | |

**Limpieza:** jobs `completed` y `failed` eliminados a las 24h via cron existente (`api/cron.py`). Minimiza datos clínicos en reposo (LFPDPPP).

---

## API

### `POST /api/v1/sessions/{patient_id}/process` (modificado)

**Antes:** procesaba síncronamente y retornaba la nota.
**Ahora:**

1. Valida JWT + ownership del paciente (sin cambios)
2. Corre `_sanitizar_dictado()` antes de encolar — prompt injection check previo al encolado
3. Cifra `raw_dictation` con `encrypt_if_set()`
4. Inserta job con `status=pending`
5. Retorna `202 Accepted`: `{ "job_id": "uuid", "status": "pending" }`

### `GET /api/v1/jobs/{job_id}/stream` (nuevo — SSE)

- Valida JWT
- Verifica `job.psychologist_id == token.sub` — sin esto cualquier usuario autenticado podría escuchar notas ajenas
- Emite eventos cada 2s con `{ "status": "pending|processing|completed|failed" }`
- Al completar: emite el resultado de la nota (descifrado en memoria, nunca en log)
- Cierra conexión al recibir `completed` o `failed`, o tras 5 min de timeout
- **Auth:** JWT via query param `?token=` (limitación de la API nativa `EventSource`)

### `GET /api/v1/jobs/{job_id}` (nuevo — polling fallback)

- Misma autorización que SSE
- Retorna `{ status, result? }` — para clientes donde SSE falle

### `POST /api/v1/sessions/{session_id}/confirm` (sin cambios)

Solo escribe en DB, no llama a Claude. No requiere modificación.

---

## Worker (`agent/worker.py`)

Asyncio background task iniciado en `startup_event()` de `main.py`:

```python
asyncio.create_task(job_worker())
```

**Loop de procesamiento:**

1. `SELECT id FROM job_queue WHERE status='pending' ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`
2. Por cada job en paralelo (`asyncio.gather`, concurrencia=10):
   a. `status = processing`, `attempts += 1`
   b. Descifra `raw_dictation`
   c. Llama `process_session()` (función existente sin modificar)
   d. Si Anthropic retorna 429 → backoff exponencial (30s → 60s → 120s), **no** incrementa `attempts` como fallo
   e. Si éxito → cifra `result`, `status = completed`, `updated_at = now()`
   f. Si error tras 3 intentos → `status = failed`, `error_message` genérico (sin detalles internos)
3. `raw_dictation` **nunca** aparece en logs — solo se loguea `job_id` y `status`

**Concurrencia inicial:** 10 jobs paralelos, configurable via `config.py` (`WORKER_CONCURRENCY: int = 10`).

---

## Frontend

### Nuevo flujo en `App.jsx`

```
handleProcess()
  → POST /process → { job_id }
  → openJobStream(job_id)  ← SSE via EventSource nativo
  → muestra estado en UI
  → onComplete(result) → renderiza nota
```

### Estados de UI

| Status      | UI                                      |
|-------------|-----------------------------------------|
| `pending`   | "En cola..." (ícono reloj, sage muted)  |
| `processing`| "Generando nota..." (spinner, sage)     |
| `completed` | Nota aparece con transición suave       |
| `failed`    | "No se pudo generar la nota. Intenta de nuevo." + botón reintentar |

### SSE en `api.js`

```js
openJobStream(jobId, token, { onStatus, onComplete, onError }) {
  const source = new EventSource(`/api/v1/jobs/${jobId}/stream?token=${token}`)
  source.addEventListener('status', (e) => onStatus(JSON.parse(e.data)))
  source.addEventListener('complete', (e) => { onComplete(JSON.parse(e.data)); source.close() })
  source.onerror = () => { source.close(); onError() }
}
```

---

## Seguridad

| Riesgo | Mitigación |
|--------|-----------|
| Acceso a nota de otro psicólogo | SSE y polling validan `job.psychologist_id == token.sub` |
| Datos clínicos en reposo | `raw_dictation` y `result` cifrados con Fernet (encrypt_if_set) |
| Enumeración de job IDs | UUIDs v4, no secuenciales |
| Datos clínicos en logs | Worker loguea solo job_id y status, nunca contenido del dictado |
| Acumulación de datos | Limpieza automática a las 24h via cron |
| Prompt injection | `_sanitizar_dictado()` corre antes de encolar, no en el worker |
| Auth en SSE | JWT en query param (limitación de EventSource) validado igual que headers |
| Stacktraces expuestos | `error_message` siempre es texto genérico para el cliente |

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `backend/database.py` | Agregar modelo `JobQueue` |
| `backend/agent/worker.py` | Nuevo — loop de procesamiento |
| `backend/api/routes.py` | Modificar `/process`, agregar `/jobs/{id}/stream` y `/jobs/{id}` |
| `backend/main.py` | Iniciar worker en `startup_event()` |
| `backend/config.py` | Agregar `WORKER_CONCURRENCY: int = 10` |
| `frontend/src/api.js` | Agregar `openJobStream()` |
| `frontend/src/App.jsx` | Nuevo flujo post-process con estados de job |

---

## Lo que NO cambia

- `process_session()` en `agent/agent.py` — el worker la llama sin modificarla
- El flujo de confirmación (`/confirm`) — sigue siendo síncrono, solo escribe en DB
- El rate limiting existente (slowapi) — aplica al endpoint de encolado igual que antes
- La lógica de cifrado — se reutiliza `encrypt_if_set` / `decrypt_if_set`
