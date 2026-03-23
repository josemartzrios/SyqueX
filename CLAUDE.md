# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SyqueX (PsicoAgente) is a clinical AI assistant for psychologists. Clinicians dictate session notes, the system generates structured SOAP notes via Claude, stores them with vector embeddings for semantic search, and tracks patient evolution over time.

## Development Commands

### Full Stack (local)
```bash
# Start PostgreSQL
docker-compose up -d postgres

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
OPENAI_API_KEY=...
DATABASE_URL=postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente
```

## Architecture

### Stack
- **Frontend**: React 18 + Vite, Tailwind CSS (via CDN in index.html), plain JavaScript
- **Backend**: Python 3.11, FastAPI + Uvicorn (async)
- **Database**: PostgreSQL 16 + pgvector extension, SQLAlchemy 2.0 async, asyncpg driver
- **LLMs**: Anthropic Claude for note generation, OpenAI `text-embedding-3-small` for 1536-dim embeddings
- **Deployment**: Vercel (frontend), Railway (backend), Supabase (DB)

### Backend Structure (`/backend/`)

**`agent/`** — capa del agente LLM

| File | Role |
|------|------|
| `agent/agent.py` | Orquestación Claude + `SYSTEM_PROMPT` |
| `agent/tools.py` | Schemas `AGENT_TOOLS` para Claude + implementaciones (vector search, pattern detection) |
| `agent/embeddings.py` | Servicio OpenAI embeddings (`text-embedding-3-small`) |
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

### MVP (lanzamiento)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Jerarquía visual SOAP** | Badges de color por sección S/O/A/P, separadores y peso tipográfico diferenciado |
| 2 | **CTA confirmar nota** | Botón visible "Confirmar nota / Guardar en expediente" con estado Borrador explícito |
| 3 | **Evolución del paciente** | Vista de historial de sesiones con tendencias y progreso longitudinal |
| 4 | **Descargar nota en PDF** | Exportar nota SOAP confirmada como PDF con membrete profesional |

### Post-MVP (Fase 2)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Dictado por voz** | Transcripción de audio en tiempo real directamente en el campo de dictado |
| 2 | **Google Drive** | Guardar notas automáticamente en carpetas del psicólogo en Drive |
| 3 | **Google Calendar** | Vincular sesiones con eventos del calendario del psicólogo |

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
