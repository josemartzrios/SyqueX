# SyqueX — System Architecture Document

> **Version:** 1.0.0 · **Last Updated:** 2026-04-16 · **Status:** Pre-Production  
> **Classification:** Internal Engineering · **Audience:** Engineering, DevOps, Security Auditors

---

## 1. Executive Summary

SyqueX is a **clinical AI assistant for mental health professionals** (psychologists and psychiatrists). The platform transforms free-form session dictations into structured **SOAP clinical notes** using Anthropic Claude, stores them with **vector embeddings** for semantic search, and tracks **patient evolution** over time through AI-powered analysis.

### Key Capabilities

| Capability | Description |
|---|---|
| **Dictation → SOAP** | Free-text dictation is processed by Claude into structured Subjective/Objective/Assessment/Plan notes |
| **Semantic History Search** | pgvector HNSW indexes enable cosine-similarity search across all clinical notes |
| **Patient Evolution Tracking** | Longitudinal AI analysis across sessions detects recurring themes, risk factors, and progress |
| **LFPDPPP Compliance** | Audit logging, data export, soft-delete, and local embeddings (no data egress for vectors) |
| **SaaS Billing** | Stripe-powered trial → subscription lifecycle with webhook-driven state management |

---

## 2. High-Level System Topology

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Browser (React 18 SPA)"]
    end

    subgraph "Edge / CDN"
        Vercel["Vercel<br/>Static SPA + Edge Network"]
    end

    subgraph "Compute Layer"
        Railway["Railway<br/>FastAPI + Uvicorn (async)"]
    end

    subgraph "Data Layer"
        Supabase["Supabase<br/>PostgreSQL 16 + pgvector"]
    end

    subgraph "External Services"
        Anthropic["Anthropic API<br/>Claude Sonnet 4.6"]
        Stripe["Stripe<br/>Payments + Webhooks"]
        Resend["Resend<br/>Transactional Email"]
    end

    Browser -->|"HTTPS / JSON"| Vercel
    Vercel -->|"Proxy / Rewrite"| Railway
    Browser -->|"HTTPS / JSON<br/>Bearer JWT"| Railway
    Railway -->|"AsyncPG<br/>TCP/SSL"| Supabase
    Railway -->|"Messages API"| Anthropic
    Railway -->|"Checkout + Webhooks"| Stripe
    Railway -->|"Email API"| Resend

    style Browser fill:#f4f4f2,stroke:#18181b,color:#18181b
    style Vercel fill:#000,stroke:#fff,color:#fff
    style Railway fill:#0B0D0E,stroke:#C049DB,color:#fff
    style Supabase fill:#3ECF8E,stroke:#1F6F4A,color:#fff
    style Anthropic fill:#D97706,stroke:#92400E,color:#fff
    style Stripe fill:#635BFF,stroke:#3D38B5,color:#fff
    style Resend fill:#000,stroke:#fff,color:#fff
```

### Technology Decision Matrix

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React 18 + Vite | Fast HMR, minimal bundle, proven ecosystem |
| **Styling** | Tailwind CSS (CDN) | Rapid prototyping without build pipeline overhead |
| **Backend** | FastAPI + Uvicorn | Async-native, Pydantic validation, OpenAPI auto-docs |
| **ORM** | SQLAlchemy 2.0 (async) | Mature, type-safe, asyncpg driver for zero-copy I/O |
| **Database** | PostgreSQL 16 + pgvector | ACID compliance + native vector similarity search |
| **LLM** | Anthropic Claude Sonnet 4.6 | Best-in-class clinical reasoning, tool_use API |
| **Embeddings** | FastEmbed (intfloat/multilingual-e5-large) | Local inference — no PII egress (LFPDPPP compliant) |
| **Auth** | JWT (PyJWT) + bcrypt + httpOnly cookies | Stateless access, secure refresh rotation |
| **Payments** | Stripe Checkout + Webhooks | PCI-compliant, MXN support, idempotent webhooks |
| **Email** | Resend | Simple transactional API, custom domain support |
| **Frontend Hosting** | Vercel | Automatic preview deployments, global CDN |
| **Backend Hosting** | Railway | Docker support, auto-deploy from GitHub, env management |
| **Database Hosting** | Supabase | Managed PostgreSQL with pgvector extension support |

---

## 3. Backend Architecture

### 3.1 Module Dependency Graph

```mermaid
graph LR
    subgraph "HTTP Layer"
        main["main.py<br/>FastAPI app + middleware"]
        auth["api/auth.py<br/>JWT + registration"]
        routes["api/routes.py<br/>Clinical endpoints"]
        billing["api/billing.py<br/>Stripe integration"]
        privacy["api/privacy.py<br/>Data export LFPDPPP"]
        cron["api/cron.py<br/>Scheduled jobs"]
        audit["api/audit.py<br/>Audit logging utility"]
        limiter["api/limiter.py<br/>Rate limiting slowapi"]
    end

    subgraph "Agent Layer"
        agent["agent/agent.py<br/>Claude orchestration"]
        tools["agent/tools.py<br/>Tool schemas + impls"]
        embeddings["agent/embeddings.py<br/>FastEmbed service"]
        interfaces["agent/interfaces.py<br/>ABCs SOLID"]
    end

    subgraph "Domain Layer"
        config["config.py<br/>Pydantic Settings"]
        exceptions["exceptions.py<br/>Domain errors"]
        database["database.py<br/>SQLAlchemy models + init"]
    end

    subgraph "Services"
        email["services/email.py<br/>Resend transactional"]
    end

    main --> auth & routes & billing & privacy & cron
    auth --> config & database & email
    routes --> agent & database & tools & embeddings
    billing --> auth & database
    privacy --> auth & database
    cron --> database & email
    agent --> config & database & exceptions
    tools --> embeddings & database
    embeddings --> interfaces
    audit --> database
    routes --> limiter
    auth --> limiter

    style main fill:#5a9e8a,stroke:#18181b,color:#fff
    style agent fill:#c4935a,stroke:#18181b,color:#fff
    style database fill:#635BFF,stroke:#18181b,color:#fff
```

### 3.2 File Inventory

| File | Lines | Role |
|---|---|---|
| `main.py` | 101 | App factory, CORS, security headers, error handlers, router mounting |
| `config.py` | 49 | Pydantic-settings: DB URL, API keys, clinical limits, Stripe/Resend config |
| `database.py` | 400 | 10 SQLAlchemy models, `init_db()` with idempotent migrations, pgvector HNSW index |
| `exceptions.py` | 60 | Domain error hierarchy with HTTP status mapping |
| `api/auth.py` | 526 | Register, login, refresh, logout, forgot/reset-password, brute-force protection |
| `api/routes.py` | 475 | Patients CRUD, sessions process/confirm/archive, conversations, profiles, search |
| `api/billing.py` | 130 | Stripe Checkout Sessions, webhook handler (idempotent), billing status |
| `api/privacy.py` | 64 | LFPDPPP data export endpoint |
| `api/cron.py` | 46 | Daily cron: trial-ending email notifications |
| `api/audit.py` | 41 | Audit log insertion utility |
| `api/limiter.py` | ~5 | slowapi Limiter singleton |
| `agent/agent.py` | 271 | System prompts (SOAP + Chat), patient context builder, Claude API calls, prompt injection guard |
| `agent/tools.py` | 169 | 5 tool schemas for Claude tool_use, semantic search implementation |
| `agent/embeddings.py` | 44 | FastEmbed wrapper (multilingual-e5-large, 1024d), thread-safe lazy init |
| `agent/interfaces.py` | 17 | `IEmbeddingService` and `BaseTool` ABCs |
| `services/email.py` | 54 | Welcome, reset, trial-ending emails via Resend |

### 3.3 Middleware Stack

Middleware executes **outside-in** (Starlette reverses `add_middleware` order):

```mermaid
graph TB
    Request["Incoming Request"] --> CORS
    CORS["CORSMiddleware<br/>Origin validation + preflight"] --> Security
    Security["SecurityHeadersMiddleware<br/>X-Frame-Options, HSTS, etc."] --> RateLimit
    RateLimit["SlowAPI Rate Limiter<br/>Per-endpoint limits"] --> Router
    Router["FastAPI Router<br/>Path matching + DI"] --> Handler
    Handler["Endpoint Handler"] --> Response["Response"]

    style CORS fill:#5a9e8a,stroke:#18181b,color:#fff
    style Security fill:#c4935a,stroke:#18181b,color:#fff
    style RateLimit fill:#635BFF,stroke:#18181b,color:#fff
```

**Security Headers Applied:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Strict-Transport-Security: max-age=31536000` (production only)

---

## 4. Frontend Architecture

### 4.1 Component Tree

```mermaid
graph TB
    App["App.jsx<br/>941 lines - state orchestrator"]

    subgraph "Auth Screens"
        Login["LoginScreen"]
        Register["RegisterScreen"]
        Forgot["ForgotPasswordScreen"]
        Reset["ResetPasswordScreen"]
        Billing["BillingScreen"]
    end

    subgraph "Main Application"
        Trial["TrialBanner"]
        SidebarComp["Sidebar - mobile slide-over"]
        PatientSidebar["PatientSidebar - desktop"]
        PatientHeader["PatientHeader"]
        DictationPanel["DictationPanel"]
        SoapNote["SoapNoteDocument"]
        Evolucion["EvolucionPanel"]
        MobileEvolucion["MobileEvolucion"]
        MobileHistory["MobileHistoryChips"]
        MobileTabNav["MobileTabNav"]
        NoteReview["NoteReview"]
        ChatInput["ChatInput"]
        NewPatientModal["NewPatientModal"]
        PasswordStrength["PasswordStrength"]
    end

    subgraph "Data Layer"
        API["api.js<br/>HTTP client + auto-refresh"]
        Auth["auth.js<br/>Token lifecycle"]
    end

    App --> Login & Register & Forgot & Reset & Billing
    App --> Trial & SidebarComp & PatientSidebar & PatientHeader
    App --> DictationPanel & SoapNote & Evolucion
    App --> MobileEvolucion & MobileHistory & MobileTabNav
    App --> NewPatientModal
    DictationPanel --> ChatInput
    SoapNote --> NoteReview
    Register --> PasswordStrength
    App --> API
    API --> Auth

    style App fill:#5a9e8a,stroke:#18181b,color:#fff
    style API fill:#c4935a,stroke:#18181b,color:#fff
    style Auth fill:#635BFF,stroke:#18181b,color:#fff
```

### 4.2 State Management

The application uses **React built-in `useState` + `useEffect` + `useCallback`** — no external state library. All state lives at the `App.jsx` root and flows down via props.

| State Variable | Type | Purpose |
|---|---|---|
| `authScreen` | `{screen, resetToken?}` | Current authentication/routing screen |
| `billingStatus` | `object` | Trial/active/billing status from backend |
| `selectedPatientId` | `UUID` | Currently active patient |
| `messages` | `Message[]` | Chat/dictation message history |
| `currentSessionNote` | `NoteState` | Active SOAP note being generated/displayed |
| `sessionHistory` | `Session[]` | All sessions for selected patient |
| `conversations` | `Conversation[]` | Cross-patient conversation list |
| `desktopMode` | `'session' \| 'review'` | Desktop two-mode layout toggle |
| `evolutionMessages` | `Map<patientId, Message[]>` | Per-patient evolution chat history |
| `mobileTab` | `string` | Active mobile tab (dictar/nota/historial/evolucion) |

### 4.3 Responsive Layout Strategy

| Breakpoint | Layout |
|---|---|
| **Desktop** (`md+`, ≥768px) | 3-column: PatientSidebar (240px) + Split work area (Dictation 320px + Note flex) |
| **Mobile** (`<md`) | Single column with tab navigation: Dictar / Nota / Historial / Evolucion |

---

## 5. Core Data Flows

### 5.1 Dictation to SOAP Note Pipeline

```mermaid
sequenceDiagram
    participant UI as React SPA
    participant API as FastAPI
    participant Agent as agent.py
    participant Claude as Anthropic Claude
    participant DB as PostgreSQL
    participant Embed as FastEmbed

    UI->>API: POST /sessions/{patient_id}/process
    API->>Agent: process_session(db, patient_id, dictation)
    
    Note over Agent: 1. Validate length 5000 chars
    Note over Agent: 2. Sanitize prompt injection
    Agent->>DB: Load patient context (profile + last 6 sessions)
    DB-->>Agent: Context messages[]
    
    Agent->>Claude: messages.create() with SOAP_SYSTEM_PROMPT
    Claude-->>Agent: SOAP note text
    
    Agent-->>API: text_fallback + session_messages
    API->>DB: INSERT Session status draft
    API-->>UI: text_fallback + session_id
    
    Note over UI: User reviews and edits SOAP note
    
    UI->>API: POST /sessions/{session_id}/confirm
    API->>Embed: get_embedding(note_text)
    Embed-->>API: float[1024]
    API->>DB: INSERT ClinicalNote SOAP fields + embedding
    API->>DB: UPDATE Session status confirmed
    
    Note over API: Background task after response
    API->>Agent: update_patient_profile_summary()
    Agent->>Claude: Generate updated clinical summary
    Agent->>DB: UPDATE PatientProfile
    
    API-->>UI: id + status confirmed
```

### 5.2 Authentication Lifecycle

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant API as FastAPI
    participant DB as PostgreSQL
    participant Stripe as Stripe API

    Note over Browser: Registration Flow
    Browser->>API: POST /auth/register
    API->>API: Validate password policy
    API->>DB: Check email uniqueness
    API->>DB: INSERT Psychologist (bcrypt hash, trial +14d)
    API->>Stripe: Customer.create()
    API->>DB: INSERT Subscription (status trialing)
    API->>DB: INSERT AuditLog
    API-->>Browser: access_token
    
    Note over Browser: Login Flow
    Browser->>API: POST /auth/login (OAuth2 form)
    API->>API: Check brute-force 5 attempts / 15min
    API->>DB: SELECT Psychologist
    API->>API: bcrypt.verify()
    API->>DB: INSERT RefreshToken (SHA-256 hash)
    API-->>Browser: access_token + Set-Cookie refresh_token httpOnly
    
    Note over Browser: Silent Refresh
    Browser->>API: POST /auth/refresh Cookie refresh_token
    API->>DB: Lookup RefreshToken by hash
    API->>API: Detect stolen token (revoked reuse)
    API->>DB: Revoke old INSERT new RefreshToken
    API-->>Browser: access_token + new refresh_token
```

### 5.3 Embedding and RAG Pipeline

```mermaid
graph LR
    subgraph "Write Path on confirm"
        Note["Clinical Note Text"] --> E5["FastEmbed<br/>multilingual-e5-large"]
        E5 --> Vec["float 1024"]
        Vec --> PG["PostgreSQL<br/>pgvector column"]
    end

    subgraph "Read Path semantic search"
        Query["Natural Language Query"] --> E5Q["FastEmbed"]
        E5Q --> QVec["Query Vector"]
        QVec --> HNSW["HNSW Index<br/>cosine distance"]
        HNSW --> TopK["Top-K Results<br/>+ relevance score"]
    end

    style E5 fill:#c4935a,stroke:#18181b,color:#fff
    style E5Q fill:#c4935a,stroke:#18181b,color:#fff
    style PG fill:#3ECF8E,stroke:#1F6F4A,color:#fff
    style HNSW fill:#3ECF8E,stroke:#1F6F4A,color:#fff
```

**Key Design Decision:** Embeddings are generated **locally** via FastEmbed (BAAI/intfloat model) rather than via OpenAI API. This ensures **zero clinical data egress** for vector operations, critical for LFPDPPP compliance. Only dictation text is sent to Anthropic (necessary for note generation).

---

## 6. Infrastructure and Deployment

### 6.1 Deployment Topology

```mermaid
graph TB
    subgraph "GitHub Repository"
        Repo["josemartzrios/SyqueX"]
    end

    subgraph "CI/CD Pipeline"
        Push["git push"] --> VDeploy["Vercel Auto-Deploy"]
        Push --> RDeploy["Railway Auto-Deploy"]
    end

    subgraph "Vercel Frontend"
        VProd["Production<br/>syquex.vercel.app"]
        VPreview["Preview URLs<br/>per branch"]
    end

    subgraph "Railway Backend"
        RProd["Production<br/>Docker container"]
        RStaging["Staging<br/>Docker container"]
    end

    subgraph "Supabase Database"
        SProd["PostgreSQL 16<br/>pgvector enabled"]
    end

    Repo --> Push
    VDeploy --> VProd & VPreview
    RDeploy --> RProd & RStaging
    RProd --> SProd
    RStaging --> SProd

    style Repo fill:#24292E,stroke:#fff,color:#fff
    style VProd fill:#000,stroke:#fff,color:#fff
    style RProd fill:#0B0D0E,stroke:#C049DB,color:#fff
    style SProd fill:#3ECF8E,stroke:#1F6F4A,color:#fff
```

### 6.2 Branch Strategy

| Branch | Environment | Deployment |
|---|---|---|
| `main` | Production | Auto to Vercel prod + Railway prod |
| `dev` | Staging | Auto to Vercel preview + Railway staging |
| `feature/*` | Preview | Vercel preview URL per branch |
| `hotfix/*` | Emergency | Merge to `main`, backport to `dev` |

### 6.3 Environment Variables

| Variable | Service | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | Railway | Yes | `postgresql+asyncpg://...` connection string |
| `ANTHROPIC_API_KEY` | Railway | Yes | Claude API authentication |
| `SECRET_KEY` | Railway | Yes | JWT signing key (min 64 random chars) |
| `STRIPE_SECRET_KEY` | Railway | Yes | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Railway | Yes | Webhook signature verification |
| `STRIPE_PRICE_ID` | Railway | Yes | Subscription price identifier |
| `RESEND_API_KEY` | Railway | Yes | Transactional email API key |
| `ALLOWED_ORIGINS` | Railway | Recommended | CORS origins (comma-separated) |
| `ENVIRONMENT` | Railway | Yes | `development` / `staging` / `production` |
| `CRON_SECRET` | Railway | Yes | Bearer token for cron endpoint |
| `VITE_API_URL` | Vercel | Yes | Backend URL for the SPA |

---

## 7. Security Architecture

### 7.1 Security Layers

```mermaid
graph TB
    subgraph "Transport"
        TLS["TLS 1.3 via Vercel + Railway"]
        HSTS["HSTS in production"]
    end

    subgraph "Application"
        CORS["CORS Allowlist + Regex"]
        Headers["Security Headers"]
        RateLimit["Rate Limiting via slowapi"]
        BruteForce["Brute-Force Protection"]
    end

    subgraph "Authentication"
        BCrypt["bcrypt 12 rounds"]
        JWT["JWT HS256 30min TTL"]
        Refresh["Refresh Token Rotation httpOnly Secure SameSite strict"]
        Theft["Stolen Token Detection revoked reuse revoke all"]
    end

    subgraph "Data Protection"
        Sanitize["Prompt Injection Guard regex blocklist"]
        NoStackTrace["Global Error Handler no stack traces"]
        AuditLog["Immutable Audit Log INSERT-only no PII"]
        SoftDelete["Soft Delete LFPDPPP anonymization"]
        LocalEmbed["Local Embeddings no PII egress for vectors"]
    end

    TLS --> CORS --> Headers --> RateLimit --> BruteForce
    BruteForce --> BCrypt --> JWT --> Refresh --> Theft
    Theft --> Sanitize --> NoStackTrace --> AuditLog --> SoftDelete --> LocalEmbed

    style TLS fill:#5a9e8a,stroke:#18181b,color:#fff
    style BCrypt fill:#c4935a,stroke:#18181b,color:#fff
    style AuditLog fill:#635BFF,stroke:#18181b,color:#fff
```

### 7.2 Known Technical Debt

| Item | Severity | Description |
|---|---|---|
| In-memory brute-force tracking | Medium | `_failed_attempts` dict resets on restart. Migrate to Redis. |
| CORS env var not loading on Railway | Low | Workaround active via `allow_origin_regex`. Root cause unknown. |
| OpenAPI docs hidden but not auth-gated | Info | Docs disabled in prod via `docs_url=None`; consider BasicAuth for staging. |
| `datetime.utcnow()` deprecation | Low | Some models use `datetime.utcnow()` instead of `datetime.now(UTC)`. |

---

## 8. Testing Infrastructure

### 8.1 Backend Tests

| Test File | Coverage Area | Size |
|---|---|---|
| `tests/test_api_routes.py` | All clinical endpoints, pagination, UUID validation | ~39K |
| `tests/test_auth_register.py` | Registration flow, email uniqueness, password policy | ~2.7K |
| `tests/test_auth_refresh.py` | Token refresh, rotation, theft detection | ~672 |
| `tests/test_auth_forgot_reset.py` | Password reset lifecycle | ~2.3K |
| `tests/test_agent_process.py` | Agent orchestration, LLM mocking | ~19K |
| `tests/test_agent_sanitize.py` | Prompt injection detection | ~4.5K |
| `tests/test_agent_embeddings.py` | Embedding service, error handling | ~4.9K |
| `tests/test_config.py` | Settings validation | ~3.4K |
| `tests/test_exceptions.py` | Domain error hierarchy | ~4.9K |
| `tests/test_health.py` | Health check endpoint | ~722 |

### 8.2 Frontend Tests

| Test File | Coverage Area |
|---|---|
| `App.test.jsx` | App component logic, state transitions |
| `App.integration.test.jsx` | Full integration flows |
| `ChatInput.test.jsx` | Input validation, submission |
| `DictationPanel.test.jsx` | Dictation UI |
| `EvolucionPanel.test.jsx` | Evolution chat |
| `LoginScreen.test.jsx` | Login form |
| `NewPatientModal.test.jsx` | Patient creation modal |
| `NoteReview.test.jsx` | Note review component |
| `PasswordStrength.test.jsx` | Password policy UI |
| `PatientHeader.test.jsx` | Header modes |
| `PatientSidebar.test.jsx` | Sidebar interactions |
| `RegisterScreen.test.jsx` | Registration form |
| `Sidebar.test.jsx` | Mobile sidebar |
| `SoapNoteDocument.test.jsx` | SOAP note rendering and editing |

---

## 9. Appendices

### A. API Base URL Pattern
```
{VITE_API_URL}/api/v1/{resource}
```

### B. Router Mounting Order
```python
app.include_router(auth_router,    prefix="/api/v1")           # /api/v1/auth/*
app.include_router(billing_router, prefix="/api/v1/billing")   # /api/v1/billing/*
app.include_router(cron_router,    prefix="/api/v1/cron")      # /api/v1/cron/*
app.include_router(privacy_router, prefix="/api/v1/privacy")   # /api/v1/privacy/*
app.include_router(router,         prefix="/api/v1")           # /api/v1/* (clinical)
```

### C. Clinical Configuration Defaults
```python
MAX_DICTATION_LENGTH  = 5000   # characters
MAX_SESSIONS_CONTEXT  = 6      # sessions passed to Claude
EMBEDDING_DIMENSIONS  = 1024   # FastEmbed vector size
ACCESS_TOKEN_EXPIRE   = 30     # minutes
REFRESH_TOKEN_EXPIRE  = 7      # days
BCRYPT_ROUNDS         = 12
```
