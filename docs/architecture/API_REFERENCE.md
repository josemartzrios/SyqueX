# SyqueX — API Reference

> **Version:** 1.0.0 · **Base URL:** `{VITE_API_URL}/api/v1` · **Auth:** Bearer JWT  
> **Content-Type:** `application/json` (except login which uses `multipart/form-data`)

---

## Authentication

All endpoints except `/auth/*` (login, register, forgot/reset-password) and `/health` require a valid JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

Tokens expire in **30 minutes**. The client silently refreshes via `POST /auth/refresh` using an httpOnly cookie. On 401, the frontend auto-retries once with a refreshed token before redirecting to login.

---

## Error Format

All errors return a consistent JSON shape:

```json
{
  "detail": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}
```

### Standard Error Codes

| HTTP Status | Code | Description |
|---|---|---|
| 400 | `INVALID_UUID` | Path parameter is not a valid UUID |
| 400 | `DICTATION_TOO_LONG` | Dictation exceeds 5000 character limit |
| 400 | `PROMPT_INJECTION` | Dictation contains suspicious content |
| 401 | — | Invalid or expired JWT token |
| 402 | `SUBSCRIPTION_EXPIRED` | Trial ended, subscription inactive |
| 403 | — | Insufficient permissions |
| 404 | `SESSION_NOT_FOUND` | Session UUID does not exist |
| 404 | `PATIENT_NOT_FOUND` | Patient UUID does not exist |
| 409 | `EMAIL_TAKEN` | Registration email already in use |
| 429 | — | Rate limit exceeded |
| 502 | `LLM_AUTH_ERROR` | Anthropic API authentication failure |
| 502 | `EMBEDDING_SERVICE_ERROR` | FastEmbed misconfigured or unavailable |

---

## Endpoints

### Health

#### `GET /health`

Health check — no auth required.

**Response:** `200 OK`
```json
{ "status": "ok" }
```

---

### Auth — `/auth`

#### `POST /auth/register`

Create a new psychologist account with trial subscription.

**Request Body:**
```json
{
  "name": "Dra. Ana López",
  "email": "ana@example.com",
  "password": "SecurePass1",
  "cedula_profesional": "12345678",
  "accepted_privacy": true,
  "accepted_terms": true,
  "privacy_version": "1.0",
  "terms_version": "1.0"
}
```

**Password Policy:** Minimum 8 characters, at least 1 uppercase letter, at least 1 number.

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**Side Effects:**
- Creates Stripe Customer
- Creates Subscription (status: `trialing`, 14-day trial)
- Sends welcome email via Resend
- Inserts audit log entry

---

#### `POST /auth/login`

Authenticate with email and password. Uses OAuth2 form format.

**Request:** `Content-Type: multipart/form-data`
```
username=ana@example.com&password=SecurePass1
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800
}
```
Sets `refresh_token` httpOnly cookie (path: `/api/v1/auth`, SameSite: strict).

**Rate Limits:** 5 failed attempts per email in 15min window, then 30min lockout.

---

#### `POST /auth/refresh`

Rotate refresh token and get a new access token.

**Request:** No body. Requires `refresh_token` httpOnly cookie.

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**Security:** If a revoked token is presented (stolen token detection), ALL tokens for that user are revoked immediately.

---

#### `POST /auth/logout`

Revoke the current refresh token and clear the cookie.

**Response:** `200 OK`
```json
{ "ok": true }
```

---

#### `POST /auth/forgot-password`

Request a password reset email. Always returns success (prevents email enumeration).

**Rate Limits:** 3/hour global, 1/10min per email.

**Request Body:**
```json
{ "email": "ana@example.com" }
```

**Response:** `200 OK`
```json
{ "message": "Si el email existe, recibirás un enlace en los próximos minutos" }
```

---

#### `POST /auth/reset-password`

Reset password using a one-time token from the email link.

**Rate Limits:** 5/hour. Token expires in 60 minutes. Max 3 failed attempts per token.

**Request Body:**
```json
{
  "token": "abc123...",
  "new_password": "NewSecurePass1"
}
```

**Response:** `200 OK` — Returns new access token + sets refresh cookie.

---

### Patients — `/patients`

#### `GET /patients`

List all active (non-deleted) patients, ordered by name.

**Response:** `200 OK`
```json
[
  {
    "id": "uuid-here",
    "name": "Juan Martínez",
    "risk_level": "low",
    "date_of_birth": "1990-05-15",
    "diagnosis_tags": ["ansiedad", "depresion"]
  }
]
```

---

#### `POST /patients`

Create a new patient.

**Request Body:**
```json
{
  "name": "María García",
  "date_of_birth": "1985-03-20",
  "diagnosis_tags": ["trastorno_adaptativo"],
  "risk_level": "medium"
}
```

**Response:** `201 Created`
```json
{
  "id": "new-uuid",
  "name": "María García",
  "risk_level": "medium",
  "date_of_birth": "1985-03-20",
  "diagnosis_tags": ["trastorno_adaptativo"]
}
```

---

#### `GET /patients/{patient_id}/profile`

Get clinical profile with recurring themes, risk/protective factors, and recent assessments.

**Response:** `200 OK`
```json
{
  "profile": {
    "recurring_themes": ["ansiedad laboral", "conflicto familiar"],
    "protective_factors": ["red de apoyo", "adherencia al tratamiento"],
    "risk_factors": ["ideación suicida previa"],
    "progress_indicators": { "last_suggested_steps": ["..."] }
  },
  "recent_sessions": [
    { "session_date": "2026-04-10", "assessment": "Mejoría en manejo de ansiedad..." }
  ]
}
```

---

#### `GET /patients/{patient_id}/sessions`

Paginated list of non-archived sessions with clinical notes.

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number (1-indexed) |
| `page_size` | int | 50 | Items per page (max 200) |

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "session-uuid",
      "session_number": 5,
      "session_date": "2026-04-10",
      "raw_dictation": "El paciente refiere...",
      "ai_response": "S — Subjetivo...",
      "status": "confirmed",
      "format": "SOAP",
      "structured_note": {
        "subjective": "...",
        "objective": "...",
        "assessment": "...",
        "plan": "..."
      },
      "detected_patterns": ["ansiedad recurrente"],
      "alerts": [],
      "suggested_next_steps": ["TCC registro de pensamientos"],
      "clinical_note_id": "note-uuid"
    }
  ],
  "total": 12,
  "page": 1,
  "page_size": 50,
  "pages": 1
}
```

---

#### `GET /patients/{patient_id}/report`

Generate an evolution report for a given period.

**Query Parameters:**
| Param | Type | Default | Values |
|---|---|---|---|
| `period` | string | `quarterly` | `monthly`, `quarterly`, `annual` |

**Response:** `200 OK`
```json
{
  "report_text": "Reporte quarterly para el paciente...",
  "metrics": { "progreso_general": "8/10", "adherencia": "alta" },
  "period_start": "2026-01-01",
  "period_end": "2026-03-31"
}
```

---

#### `GET /patients/{patient_id}/search`

Semantic search across the patient's clinical note history.

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Natural language search query |

**Response:** `200 OK`
```json
[
  {
    "session_number": 3,
    "date": "2026-02-15",
    "summary_fragment": "Assessment text...",
    "relevance_score": 0.87
  }
]
```

---

### Sessions — `/sessions`

#### `POST /sessions/{patient_id}/process`

Process a dictation through the AI agent.

**Rate Limits:** 30/hour

**Request Body:**
```json
{
  "raw_dictation": "El paciente llega puntual. Refiere que esta semana...",
  "format": "SOAP"
}
```

Format values: `SOAP` (generates structured note) or `chat` (free conversation).

**Response:** `200 OK`
```json
{
  "text_fallback": "S — Subjetivo\nEl paciente refiere...",
  "session_id": "new-session-uuid"
}
```

---

#### `POST /sessions/{session_id}/confirm`

Confirm a draft session and persist the clinical note with embedding.

**Request Body:**
```json
{
  "edited_note": {
    "format": "SOAP",
    "structured_note": {
      "subjective": "...",
      "objective": "...",
      "assessment": "...",
      "plan": "..."
    },
    "detected_patterns": ["..."],
    "alerts": [],
    "suggested_next_steps": ["..."],
    "evolution_delta": {}
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "clinical-note-uuid",
  "status": "confirmed"
}
```

**Side Effects:** Background task updates patient profile summary via Claude.

---

#### `PATCH /sessions/{session_id}/archive`

Archive a single session (soft-hide from UI).

**Response:** `200 OK`
```json
{ "id": "session-uuid", "archived": true }
```

---

#### `PATCH /patients/{patient_id}/sessions/archive`

Archive all sessions for a patient.

**Response:** `200 OK`
```json
{ "id": "patient-uuid", "archived": true }
```

---

### Conversations — `/conversations`

#### `GET /conversations`

Cross-patient view: one entry per patient showing the most recent session.

**Query Parameters:**
| Param | Type | Default |
|---|---|---|
| `page` | int | 1 |
| `page_size` | int | 50 |

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "session-uuid",
      "patient_id": "patient-uuid",
      "patient_name": "Juan Martínez",
      "session_number": 5,
      "session_date": "2026-04-10",
      "dictation_preview": "El paciente refiere mejoría en...",
      "status": "confirmed",
      "message_count": 4
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 50,
  "pages": 1
}
```

---

### Billing — `/billing`

#### `GET /billing/status`

Get current subscription/trial status.

**Response:** `200 OK`
```json
{
  "status": "trialing",
  "days_remaining": 10
}
```

Or for active subscriptions:
```json
{
  "status": "active",
  "current_period_end": "2026-05-16T00:00:00Z"
}
```

---

#### `POST /billing/checkout`

Create a Stripe Checkout Session for subscription activation.

**Response:** `200 OK`
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/..."
}
```

---

#### `POST /billing/webhook`

Stripe webhook receiver. Handles: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `customer.subscription.updated`.

**Authentication:** Stripe signature verification (not JWT).

**Idempotency:** Events are tracked in `processed_stripe_events` table.

---

### Privacy — `/privacy`

#### `GET /privacy/export`

Export all user data as JSON (LFPDPPP compliance).

**Response:** `200 OK` with `Content-Disposition: attachment` header.

```json
{
  "psychologist": {
    "name": "...",
    "email": "...",
    "registered_at": "...",
    "accepted_privacy_at": "..."
  },
  "patients": [
    {
      "name": "...",
      "created_at": "...",
      "sessions": [...]
    }
  ]
}
```

---

### Cron — `/cron`

#### `GET /cron/daily`

Trigger daily maintenance tasks (trial expiration emails).

**Authentication:** `Authorization: Bearer {CRON_SECRET}` (not JWT).

**Response:** `200 OK`
```json
{ "status": "ok", "emails_sent": 2 }
```
