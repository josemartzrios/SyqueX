# Patient Password Recovery — Design Spec
**Fecha:** 2026-05-06
**Branch base:** `feature/patient-portal`
**Estado:** Aprobado

---

## Resumen

Flujo de recuperación de contraseña para pacientes en el portal. Usa Resend (ya integrado). El flujo de psicólogos (`PasswordResetToken` + `send_reset_email`) sirve como referencia directa.

---

## Decisiones de diseño

| Decisión | Elección | Motivo |
|---|---|---|
| Flujo UX | Toggle inline en `PatientLogin` | Menos navegación, mismo layout |
| Link placement | Bajo el botón (centrado) | Consistente con el flujo de la página |
| Token model | Nueva tabla `PatientPasswordResetToken` | Separación limpia, hereda patrón de seguridad existente |
| Expiry | 60 minutos | Paridad con flujo de psicólogos |
| Post-reset | JWT inmediato, redirige a `/portal` | Evita fricción de re-login |
| Sin user enumeration | Respuesta genérica siempre | Seguridad: no revelar si el email existe |

---

## 1. Modelo de datos

Nueva tabla en `backend/database.py`:

```python
class PatientPasswordResetToken(Base):
    __tablename__ = "patient_password_reset_tokens"

    id: UUID (PK)
    patient_user_id: UUID (FK → PatientUser, ondelete CASCADE)
    token_hash: str(64), unique, indexed   # SHA-256 del token raw
    expires_at: datetime                    # now + 60 min
    used_at: datetime | None
    failed_attempts: int = 0
    ip_address: str(45) | None
    created_at: datetime
```

Sin cambios a `PatientUser`. Múltiples tokens pendientes permitidos; solo se valida el más reciente no usado / no expirado.

---

## 2. Backend

### Archivo: `backend/api/patient_auth.py`

#### `POST /api/v1/auth/patient/forgot-password`

```
Body:    { email: str }
Returns: { message: str }   # siempre el mismo mensaje
```

- Rate limit: 3 req/hora + 1 req/10 min por email
- Busca `PatientUser` activo (`is_active=True`) con ese email
- Si existe: genera token raw (32 bytes urlsafe), hashea SHA-256, crea `PatientPasswordResetToken` (60 min)
- Llama `send_patient_reset_email(email, patient_name, token_raw)`
- Respuesta invariante: `"Si esa dirección tiene una cuenta activa, recibirás un link en los próximos minutos."`

#### `POST /api/v1/auth/patient/reset-password`

```
Body:    { token: str, new_password: str }
Returns: { access_token: str, token_type: "bearer" }
```

- Rate limit: 5 req/hora
- Hashea el token recibido (SHA-256), busca en `PatientPasswordResetToken`
- Rechaza si: no encontrado, `used_at` no es null, `failed_attempts >= 3`, `expires_at < now`
- Si falla alguna validación: incrementa `failed_attempts`, responde 400 con mensaje genérico
- Si pasa: actualiza `PatientUser.password_hash` (bcrypt), marca `used_at = now`
- Devuelve JWT con claim `role: "patient"`

### Archivo: `backend/services/email.py`

Nueva función `send_patient_reset_email(email: str, patient_name: str, token: str)`:
- Estilo HTML idéntico a `send_patient_invite()`
- Paleta sage `#5a9e8a`, tipografía Georgia para headings
- Link: `{FRONTEND_URL}/portal/reset?token={token}`
- Expiry note: "Este link es válido por 60 minutos."
- Comportamiento mock cuando `RESEND_API_KEY` no está configurado (igual que las demás funciones)

---

## 3. Frontend

### `frontend/src/pages/PatientLogin.jsx`

Agrega estado local `mode: 'login' | 'forgot' | 'sent'`. El layout sage+white no cambia.

**`mode: 'login'`** — estado actual + link bajo el botón:
```jsx
<hr className="divider" />
<button onClick={() => setMode('forgot')} className="text-[9px] text-[#5a9e8a] text-center underline">
  ¿Olvidaste tu contraseña?
</button>
```

**`mode: 'forgot'`** — heading cambia, form muestra solo email:
- Heading: "Recuperar contraseña"
- Subheading: "Te enviaremos un link para crear una nueva contraseña."
- Campo: Correo electrónico
- Botón: "Enviar link de recuperación →"
- Footer: "← Volver al inicio de sesión" (click → `setMode('login')`)
- Submit llama `requestPatientPasswordReset(email)` → `setMode('sent')`

**`mode: 'sent'`** — success box inline:
```jsx
<div className="bg-[#f0faf7] border border-[#5a9e8a] rounded-xl px-3 py-3 flex gap-3">
  <CheckIcon className="text-[#5a9e8a]" />
  <div>
    <p className="text-[13px] font-semibold font-serif text-[#5a9e8a]">Revisa tu correo</p>
    <p className="text-[11px] text-[#9ca3af]">
      Si esa dirección tiene una cuenta activa, recibirás un link en los próximos minutos.
    </p>
  </div>
</div>
<button onClick={() => setMode('login')}>← Volver al inicio de sesión</button>
```

### `frontend/src/pages/PatientResetPassword.jsx`

Página nueva. Ruta: `/portal/reset` (con `?token=` en query string).

- Layout idéntico a `PatientInviteAccept.jsx` (split sage+white)
- Sage panel: heading "Nueva contraseña", sub "Elige una contraseña segura para tu portal."
- Form panel: "Crear nueva contraseña"
  - Campo: Nueva contraseña (min 8 chars)
  - Campo: Confirmar contraseña
  - Botón: "Guardar nueva contraseña →"
- Al submit: llama `resetPatientPassword(token, newPassword)`
  - Éxito → guarda JWT (`setPatientToken`), `navigateTo('/portal')`, `setScreen('patient-portal')`
  - Error token inválido/expirado → muestra error box: "Este link ya expiró o no es válido." + link "Solicitar uno nuevo" (→ `/portal/login`)
- Si no hay `?token=` en URL → redirige inmediatamente a `/portal/login`

### `frontend/src/patientApi.js`

```js
export async function requestPatientPasswordReset(email) {
  // POST /api/v1/auth/patient/forgot-password
}

export async function resetPatientPassword(token, newPassword) {
  // POST /api/v1/auth/patient/reset-password
  // Si OK: llama setPatientToken(data.access_token)
}
```

### `frontend/src/App.jsx`

Registrar ruta `/portal/reset` → renderiza `<PatientResetPassword setScreen={setScreen} />`. Leer `token` de `window.location.search`.

---

## 4. Pruebas

### Backend — `backend/tests/test_patient_auth.py`

| Caso | Resultado esperado |
|---|---|
| `forgot` email existente | 200, mensaje genérico, token creado en DB |
| `forgot` email inexistente | 200, mismo mensaje (sin user enumeration) |
| `reset` token válido | 200 + JWT, `password_hash` actualizado, `used_at` seteado |
| `reset` token expirado | 400 |
| `reset` token ya usado (`used_at` not null) | 400 |
| `reset` token con `failed_attempts >= 3` | 400 |
| `reset` token inválido | 400 + incrementa `failed_attempts` |
| `forgot` 4ta req en la misma hora | 429 |

### Frontend — `PatientLogin.test.jsx`

- Render login → click "¿Olvidaste?" → modo `forgot` visible
- Submit forgot → mock API → modo `sent` con success box
- Click "← Volver" desde `forgot` → modo `login`
- Click "← Volver" desde `sent` → modo `login`

### Frontend — `PatientResetPassword.test.jsx`

- Token válido en URL → submit → redirige a `/portal`
- API retorna error → muestra error box con link al login
- Sin `?token=` en URL → redirige a `/portal/login`

---

## 5. Archivos impactados

| Archivo | Cambio |
|---|---|
| `backend/database.py` | + `PatientPasswordResetToken` model |
| `backend/api/patient_auth.py` | + 2 endpoints (`forgot-password`, `reset-password`) |
| `backend/services/email.py` | + `send_patient_reset_email()` |
| `backend/tests/test_patient_auth.py` | + 8 casos de prueba |
| `frontend/src/pages/PatientLogin.jsx` | + modo `forgot` / `sent` |
| `frontend/src/pages/PatientResetPassword.jsx` | archivo nuevo |
| `frontend/src/patientApi.js` | + 2 funciones |
| `frontend/src/App.jsx` | + ruta `/portal/reset` |
| `frontend/src/PatientResetPassword.test.jsx` | archivo nuevo |
