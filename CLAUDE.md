# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SyqueX (PsicoAgente) is a clinical AI assistant for psychologists. Clinicians dictate session notes, the system generates structured SOAP notes via Claude, stores them with vector embeddings for semantic search, and tracks patient evolution over time.

## Development Commands

### Full Stack (local)
```bash
# Start PostgreSQL
docker-compose up -d postgres


Terminal 1 — Backend:                                                       
.\start-backend.ps1  
.\start-frontend.ps1                                                      
                                                                                                                         

El script de backend crea el venv con Python 3.11 automáticamente si no     existe, así no tienes que hacerlo manualmente.                            

  ▎ Si PowerShell bloquea la ejecución de scripts, corre primero:
  ▎ Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Backend (from /backend)
cd "C:\Users\josma\OneDrive\Escritorio\SyqueX\backend"
                                                                              # Crear venv con Python 3.11 explícitamente
& "C:\Users\josma\AppData\Local\Programs\Python\Python311\python.exe" -m  venv venv       

# Activar venv
.\venv\Scripts\Activate.ps1

# Verificar que ahora usa 3.11
python --version   # debe decir Python 3.11.x

# Instalar dependencias
pip install -r requirements.txt

python seed.py          # Initialize DB with test data
uvicorn main:app --reload

Para usar el seed demo:
  # 1. Parar el servidor
  # 2. Instalar fastembed (primera vez descarga ~570 MB)
  pip install -r requirements.txt
  # 3. Correr seed
  python seed_demo.py
  # 4. Arrancar servidor — init_db() aplica la migración
  uvicorn main:app --reload
  # Login: ana@syquex.demo / demo1234

# Frontend (from /frontend)
npm install
npm run dev             # Vite dev server at http://localhost:5173
```

### Frontend only
```bash
cd frontend
npm run dev       # Dev server
npm run build     # Production build
npm run preview   # Preview production build
```

### Database
```bash
docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente
```

## Environment Setup

Copy `.env.example` to `.env` in `/backend/`:
```
ANTHROPIC_API_KEY=...
DATABASE_URL=postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente
```

## Architecture

### Stack
- **Frontend**: React 18 + Vite, Tailwind CSS (via CDN in index.html), plain JavaScript
- **Backend**: Python 3.11, FastAPI + Uvicorn (async)
- **Database**: PostgreSQL 16 + pgvector extension, SQLAlchemy 2.0 async, asyncpg driver
- **LLMs**: Anthropic Claude for note generation.
- **Deployment**: Vercel (frontend), Railway (backend), Supabase (DB)

### Backend Structure (`/backend/`)

**`agent/`** — capa del agente LLM

| File | Role |
|------|------|
| `agent/agent.py` | Orquestación Claude + `SYSTEM_PROMPT` |
| `agent/tools.py` | Schemas `AGENT_TOOLS` para Claude + implementaciones (vector search, pattern detection) |
| `agent/embeddings.py` |  (`text-embedding-3-small`) |
| `agent/interfaces.py` | ABCs: `IEmbeddingService`, `BaseTool` |

**`api/`** — capa HTTP

| File | Role |
|------|------|
| `api/routes.py` | Todos los endpoints FastAPI + schemas Pydantic request/response |

**Raíz** — compartidos

| File | Role |
|------|------|
| `main.py` | Entry point: crea `app`, middleware CORS, startup `init_db()`, incluye router |
| `database.py` | Modelos SQLAlchemy + pgvector HNSW index setup |
| `config.py` | Pydantic-settings config (clinical limits, API keys, DB URL) |
| `exceptions.py` | Domain exceptions |
| `seed.py` | DB seeding script para desarrollo |

**Data flow for session processing:**
1. `POST /sessions/{patient_id}/process` → `api/routes.py` → `agent/agent.py` llama Claude con el dictado
2. Claude usa tools de `agent/tools.py` (semantic history search, pattern detection)
3. Claude retorna respuesta de texto
4. `POST /sessions/{session_id}/confirm` → guarda `ClinicalNote` con embedding de `agent/embeddings.py` en DB

### Frontend Structure (`/frontend/src/`)

- **`App.jsx`** (~1276 lines): Single orchestrator — holds all state (messages, patients, sessions), dispatches API calls, renders layout
- **`api.js`**: Thin HTTP client; all backend endpoints abstracted here
- **`components/`**: `ChatInput`, `NoteReview`, `PatientCard`, `SessionHistory` — presentational components receiving props/callbacks from `App.jsx`

Tailwind is loaded via CDN in `index.html` (not npm), so no `tailwind.config.js` exists.

### Database Schema

- `psychologists` → users/auth
- `patients` → per psychologist
- `sessions` → raw dictation + AI response text
- `clinical_notes` → SOAP structured data + pgvector embedding (1536d, HNSW index)
- `patient_profiles` → recurring themes, protective/risk factors, progress indicators

### Clinical Configuration (in `config.py`)
- `MAX_DICTATION_LENGTH`: 5000 chars
- `MAX_SESSIONS_CONTEXT`: 6 sessions passed as context to Claude
- `EMBEDDING_DIMENSIONS`: 1536

## Roadmap

> **Pivote de producto — 2026-03-26:** La app pasó de chat-first a documentation-first.
> Split-document view implementado. Ver diseño aprobado más abajo.

---

### Estado actual

**Rama activa:** `feature/desktop-ui-cleanup`

- [x] Split-document view (dictado izq + SOAP der) — implementado
- [x] Mobile: tabs Dictar / Nota / Historial — implementado
- [x] Auth con JWT + registro + login — implementado
- [x] Botón nuevo paciente → icono junto al label PACIENTES
- [x] Eliminar botón voz deshabilitado
- [x] Eliminar historial duplicado del panel dictado
- [x] Cards revisión desktop → estilo mobile unificado
- [x] Empty state SOAP → ícono sutil

---

### Sprint siguiente — Bloqueantes producción

No se puede hacer deploy a producción sin estos cinco ítems, en este orden:

| # | Feature | Nota |
|---|---------|------|
| 1 | **Fix flujo activar pago** | Billing endpoint retorna 404 — core del revenue |
| 2 | **Página Aviso de Privacidad** (`/privacidad`) | LFPDPPP Art. 8 — link obligatorio en registro |
| 3 | **Página Términos y Condiciones** (`/terminos`) | Link obligatorio en registro |
| 4 | **Auditoría de vulnerabilidades** | OWASP top 10 sobre endpoints auth/billing |
| 5 | **Auditoría LFPDPPP — audit_logs** | Verificar que todos los eventos sensibles quedan registrados |

Spec de referencia: `docs/superpowers/specs/2026-03-30-auth-billing-launch-design.md`

---

### Pre-deploy backlog

Mejoras clínicas y UX que agregan valor antes del lanzamiento — no bloqueantes.

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Más preguntas clínicas en intake** | Ampliar modal de nuevo paciente con campos clínicos relevantes (motivo, antecedentes, medicación, etc.) |
| 2 | **Agente conoce nombre del paciente** | El agente de conversación debe referirse al paciente por nombre en todo momento |
| 3 | **Borrador / guardado automático** | Guardar dictado y nota en progreso antes de confirmar — previene pérdida de datos |
| 4 | **Tipografía nota clínica** | Selector de fuente en el panel SOAP (serif / sans) |
| 5 | **Mejorar Evolución chat** | Estado vacío más poderoso ("Analiza N sesiones de [paciente]…"); chips ordenados por relevancia clínica (factores de riesgo primero) |

---

### Post-MVP

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Dictado de voz con streaming** | Transcripción en tiempo real + SOAP construyéndose progresivamente (Whisper API) |
| 2 | **Descargar nota clínica como PDF** | Export con membrete profesional |
| 3 | **Vincular Google Drive** | Guardar notas automáticamente en carpetas del psicólogo |
| 4 | **Vincular Google Calendar** | Vincular sesiones con eventos del calendario |
| 5 | **Cargar texto desde archivo** | Subir texto para procesarlo como dictado |
| 6 | **Pegar texto largo (referencia parcial)** | Referenciar fragmentos sin pegar el contenido completo |
| 7 | **Visualizar contraseña** | Toggle show/hide en login y registro |

---

## Diseño visual aprobado

- **Paleta:** base `#ffffff` · sidebar `#f4f4f2` · sage `#5a9e8a` · amber `#c4935a` · ink `#18181b`
  - La calidez viene de los acentos (sage/amber), no de los fondos — evita el efecto beige
- **Tipografía nota:** serif (Georgia) — como un expediente real. Dictado: sans.
- **Profundidad:** surface color shifts únicamente, sin sombras
- **SOAP:** labels en small caps, color según estado (sage=done, amber=streaming, muted=pending), separación solo por espacio y peso — sin cards ni bordes
- **Historial de sesiones:** vive en tab "Historial" — NO en la vista de sesión activa
- **Desktop:** split-view — panel dictado (320px izq) + panel nota (flex derecho)
- **Mobile:** tabs Dictar / Nota / Historial

**Mockups aprobados:**
- `docs/mockups/syquex-v2-desktop.html`
- `docs/mockups/syquex-v2-mobile.html`

## Branching Strategy

Git Flow simplificado para un solo desarrollador con CI/CD automático.

| Rama | Entorno | Deploy |
|------|---------|--------|
| `main` | Producción | Auto → Vercel prod + Railway prod |
| `dev` | Staging | Auto → Vercel preview + Railway staging |
| `feature/*` | Preview | Vercel preview URL por branch |
| `hotfix/*` | — | Merge directo a `main`, luego backport a `dev` |

**Flujo normal:**
```
feature/nombre → dev → main
```

**Flujo hotfix:**
```
hotfix/nombre → main (fix urgente) → dev (backport)
```

**Reglas:**
- Nunca commitear directo a `main`
- `dev` es la rama base para todo trabajo nuevo
- Los `feature/*` salen de `dev` y vuelven a `dev` via PR
- Los `hotfix/*` salen de `main` y se mergean a `main` + `dev`

## Deuda técnica pendiente

### CORS — ALLOWED_ORIGINS no se carga desde Railway (post-demo)

La variable de entorno `ALLOWED_ORIGINS=https://syquex.vercel.app` está configurada en Railway pero `settings.get_allowed_origins()` retorna el default (`http://localhost:5173`) en runtime. Causa raíz desconocida — el debug log `[CORS_DEBUG]` en `main.py` imprime `repr(os.environ.get("ALLOWED_ORIGINS"))` al startup; revisar los logs de Railway para diagnosticar.

**Workaround activo:** `allow_origin_regex=r"https://syquex(-[a-z0-9]+)*\.vercel\.app"` en `main.py` — no depende del env var.

**Al investigar:** Railway → servicio → Logs → buscar `[CORS_DEBUG]`. Si muestra `NOT_SET` o caracteres raros, el env var no llega al proceso Python. Verificar que el env var está en el environment correcto (Production vs Preview en Railway) y que el servicio redesplegó después de guardarlo.
