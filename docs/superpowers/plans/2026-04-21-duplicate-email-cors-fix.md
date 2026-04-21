# Duplicate Email CORS Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the production bug where registering with an existing email shows "Failed to fetch" instead of a helpful error, by injecting CORS headers into exception responses and rendering a specific UX for `EMAIL_TAKEN`.

**Architecture:** FastAPI exception handlers bypass CORSMiddleware, so the browser rejects non-200 error responses before the frontend can read them. The fix manually injects the correct `Access-Control-Allow-Origin` header inside both exception handlers using the same regex already present in `main.py`. The frontend catch block then branches on `err.code === 'EMAIL_TAKEN'` to render an inline login link.

**Tech Stack:** Python 3.11 / FastAPI, React 18 / Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `backend/main.py` | Add `_ALLOWED_ORIGIN_RE` + `_cors_headers()`, pass headers to both exception handlers |
| `frontend/src/components/RegisterScreen.jsx` | Branch on `EMAIL_TAKEN` in catch, replace plain error `<p>` with conditional render |
| `frontend/src/components/RegisterScreen.test.jsx` | Add test case for `EMAIL_TAKEN` UX |

---

## Task 1: Backend — inject CORS headers into exception handlers

**Files:**
- Modify: `backend/main.py:65,78-96`

- [ ] **Step 1: Add the `re` import and `_ALLOWED_ORIGIN_RE` constant**

Open `backend/main.py`. After the existing imports block (line 1–16), add at the top of the file (after the existing `import logging`):

```python
import re

_ALLOWED_ORIGIN_RE = re.compile(
    r"^https://(syquex(-[a-z0-9]+)*\.vercel\.app|app\.syquex\.mx)$"
)
```

> The regex is identical to the string already in `allow_origin_regex=` on line 65 — extracting it avoids drift if one ever changes.

- [ ] **Step 2: Add the `_cors_headers` helper**

Immediately after the `_ALLOWED_ORIGIN_RE` constant (before `logger = ...`), add:

```python
def _cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin", "")
    if origin == "http://localhost:5173" or _ALLOWED_ORIGIN_RE.match(origin):
        return {"Access-Control-Allow-Origin": origin}
    return {}
```

- [ ] **Step 3: Update `domain_error_handler` to include CORS headers**

Replace the existing `domain_error_handler` (lines 77–86) with:

```python
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
```

- [ ] **Step 4: Update `global_error_handler` to include CORS headers**

Replace the existing `global_error_handler` (lines 90–96) with:

```python
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
        headers=_cors_headers(request),
    )
```

- [ ] **Step 5: Verify the server starts cleanly**

```bash
cd backend
uvicorn main:app --reload
```

Expected: server starts without import errors. Check that `[CORS_DEBUG]` log lines still appear in development.

- [ ] **Step 6: Commit backend change**

```bash
git add backend/main.py
git commit -m "fix: inject CORS headers into exception handlers for production error responses"
```

---

## Task 2: Frontend — `EMAIL_TAKEN` specific UX in RegisterScreen

**Files:**
- Modify: `frontend/src/components/RegisterScreen.jsx`

- [ ] **Step 1: Update the catch block in `handleSubmit`**

Locate the catch block inside `handleSubmit` — it currently reads:

```jsx
} catch (err) {
  setError(err.message || 'Error al crear la cuenta');
}
```

Replace it with:

```jsx
} catch (err) {
  if (err.code === 'EMAIL_TAKEN') {
    setError('EMAIL_TAKEN');
  } else {
    setError(err.message || 'Error al crear la cuenta');
  }
}
```

- [ ] **Step 2: Replace the error `<p>` with conditional render**

Locate the single-line error render in the JSX — it currently reads:

```jsx
{error && <p className="text-red-600 text-sm">{error}</p>}
```

Replace it with:

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

- [ ] **Step 3: Verify locally**

Run `npm run dev` and manually test:
1. Register with an email that already exists → should see "Este email ya tiene una cuenta. Iniciar sesión"
2. Click "Iniciar sesión" → should trigger `onLogin` and navigate to the login screen
3. Register with a new email → happy path still works

- [ ] **Step 4: Commit frontend change**

```bash
git add frontend/src/components/RegisterScreen.jsx
git commit -m "feat: show inline login link when email is already registered"
```

---

## Task 3: Test — add `EMAIL_TAKEN` case to RegisterScreen tests

**Files:**
- Modify: `frontend/src/components/RegisterScreen.test.jsx`

- [ ] **Step 1: Update the mock and add the `ApiError` import**

Replace the current `vi.mock('../api', ...)` block (which only exports `register: vi.fn()`) with a factory that also preserves the real `ApiError` class:

```js
import { ApiError } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,       // re-exports ApiError, and everything else
    register: vi.fn(),
  }
})
```

Add the `import { ApiError }` line directly after the existing import lines at the top of the file. `ApiError` is a plain class (not a mock), so it can be imported normally — Vitest resolves it from the real module before the mock factory runs.

> The spread `...actual` passes through all real exports. Only `register` is replaced with a spy.

- [ ] **Step 2: Add the `EMAIL_TAKEN` test case**

After the existing `'shows error message if registration fails'` test, add:

```js
it('shows inline login link when email is already registered', async () => {
  const onLogin = vi.fn()
  api.register.mockRejectedValue(
    new ApiError('El email ya está registrado.', 409, 'EMAIL_TAKEN')
  )

  render(<RegisterScreen onSuccess={() => {}} onLogin={onLogin} />)
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
  await user.type(screen.getByLabelText(/Email/i), 'existing@example.com')
  await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')
  await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
  await user.click(screen.getByLabelText(/Términos y Condiciones/i))

  await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

  await waitFor(() => {
    expect(screen.getByText(/Este email ya tiene una cuenta/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Iniciar sesión/i })).toBeInTheDocument()
  })

  await user.click(screen.getByRole('button', { name: /Iniciar sesión/i }))
  expect(onLogin).toHaveBeenCalledOnce()
})
```

- [ ] **Step 3: Run the tests**

```bash
cd frontend
npm run test -- RegisterScreen
```

Expected output:
```
✓ renders all fields with proper labels
✓ calls register API and onSuccess when form is submitted
✓ shows error message if registration fails
✓ shows inline login link when email is already registered
```

- [ ] **Step 4: Commit test**

```bash
git add frontend/src/components/RegisterScreen.test.jsx
git commit -m "test: add EMAIL_TAKEN UX test to RegisterScreen"
```

---

## Deployment Note

Both backend and frontend changes must go live together. The frontend `EMAIL_TAKEN` branch has no visible effect in production until the backend CORS fix is deployed — Railway and Vercel both auto-deploy from `main` on merge.

After merging, verify manually on production:
1. Register with an existing email → "Este email ya tiene una cuenta. Iniciar sesión" appears
2. Click the link → login screen opens
