# Spec: Duplicate Email Registration Error Handling

**Date:** 2026-04-20
**Branch:** feature/fix-duplicate-email-cors
**Status:** Approved

## Problem

When a user tries to register with an already-existing email in production (Railway + Vercel), the frontend shows a generic "failed to fetch" error instead of a helpful message.

**Root cause:** FastAPI/Starlette exception handlers bypass the CORS middleware — the 409 response is sent without `Access-Control-Allow-Origin`, so the browser rejects it as a network error (`TypeError: Failed to fetch`) before the frontend can read the body.

In local development this works correctly because CORS is permissive.

The backend already has the correct logic (`api/auth.py:222-228` raises `DomainError` with `http_status=409` and `code="EMAIL_TAKEN"`). The fix is entirely in how the response is delivered and displayed.

## Scope

- `backend/main.py` — two function changes (`domain_error_handler` + `global_error_handler`)
- `frontend/src/components/RegisterScreen.jsx` — one UX improvement

No schema changes, no new endpoints, no changes to `api.js` or `App.jsx`.

## Design

### Backend — `main.py`: CORS headers on exception responses

**File:** `backend/main.py`
**Functions:** `domain_error_handler` and `global_error_handler`

Inject `Access-Control-Allow-Origin` manually into the `JSONResponse` when the request `Origin` matches a permitted origin.

The allowed origin regex already exists in `main.py:65`. Reuse it exactly — including anchors and the `app.syquex.mx` branch — to avoid a security regression from an unanchored match.

Extract it as a module-level constant and apply it to both handlers:

```python
import re

_ALLOWED_ORIGIN_RE = re.compile(
    r"^https://(syquex(-[a-z0-9]+)*\.vercel\.app|app\.syquex\.mx)$"
)

def _cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin", "")
    if origin == "http://localhost:5173" or _ALLOWED_ORIGIN_RE.match(origin):
        return {"Access-Control-Allow-Origin": origin}
    return {}


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    logger.warning(
        "Domain error [%s]: %s — %s %s",
        exc.code, exc.message, request.method, request.url.path,
    )
    return JSONResponse(
        status_code=exc.http_status,
        content={"detail": exc.message, "code": exc.code},
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
        headers=_cors_headers(request),
    )
```

### Frontend — `RegisterScreen.jsx`: specific UX for `EMAIL_TAKEN`

**File:** `frontend/src/components/RegisterScreen.jsx`
**Function:** `handleSubmit` catch block

When `err.code === 'EMAIL_TAKEN'`, store the sentinel string `'EMAIL_TAKEN'` in `error` state (the `setError('')` reset on each submit already clears it correctly). Render a message with an inline link to login. The component already receives `onLogin` as a prop — no prop changes needed.

```jsx
} catch (err) {
  if (err.code === 'EMAIL_TAKEN') {
    setError('EMAIL_TAKEN');
  } else {
    setError(err.message || 'Error al crear la cuenta');
  }
}
```

Replace the plain error `<p>` in the render with:

```jsx
{error === 'EMAIL_TAKEN' ? (
  <p className="text-red-600 text-sm">
    Este email ya tiene una cuenta.{' '}
    <button onClick={onLogin} className="underline font-medium">
      Iniciar sesión
    </button>
  </p>
) : error ? (
  <p className="text-red-600 text-sm">{error}</p>
) : null}
```

## Error flow (after fix)

```
[user submits existing email]
        ↓
Backend: SELECT → email exists → raise DomainError(http_status=409, code="EMAIL_TAKEN")
        ↓
domain_error_handler: returns JSONResponse 409 + Access-Control-Allow-Origin header
        ↓
Browser: accepts response (CORS header present)
        ↓
_handleResponse: throws ApiError(message="El email ya está registrado.", status=409, code="EMAIL_TAKEN")
        ↓
RegisterScreen catch: err.code === 'EMAIL_TAKEN' → renders inline "Iniciar sesión" link
```

## What does not change

- `api/auth.py` — duplicate check already correct
- `api.js` — `_handleResponse` already parses `body.detail` and `body.code`
- `App.jsx` — no prop changes needed
- DB schema, models, other routes

## Testing

> **Important:** both changes must deploy together. The frontend `EMAIL_TAKEN` branch has no visible effect in production until the backend CORS fix is live — deploying the frontend alone changes nothing for end users.

- **Manual (production):** register with existing email on Railway/Vercel → verify "Este email ya tiene una cuenta. Iniciar sesión" appears and the link works.
- **Manual (local):** same test locally to confirm no regression (local already works; verify the new UX renders).
- **Unit test:** add case to `RegisterScreen.test.jsx` — mock `register` rejecting with `new ApiError('El email ya está registrado.', 409, 'EMAIL_TAKEN')`, assert the "Iniciar sesión" button renders and `onLogin` is called on click.
