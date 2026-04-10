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

> **⚠️ Pivote de producto — 2026-03-26**
> Feedback de psicólogo real llevó a una reestructura del paradigma de interacción.
> Ver sección **"Reestructura UI — Documentation-First"** más abajo para el nuevo plan.

### Fase 1 — Reestructura UI (próximo sprint)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Split-document view** | Panel izquierdo: dictado. Panel derecho: nota SOAP emergiendo progresivamente mientras se genera. Reemplaza el chat como interfaz primaria. |
| 2 | **SOAP como documento tipográfico** | Secciones S/O/A/P separadas por peso tipográfico y espacio, no por cards/bordes. Serif en el documento, sans en el dictado. |
| 3 | **Historial compacto** | Sesiones anteriores como chips horizontales en una barra, no como lista de chat. |
| 4 | **Chat on-demand** | Botón "Evolución del paciente" en el header del paciente abre panel lateral. El chat deja de ser la interfaz primaria. |
| 5 | **Intake de paciente nuevo** | Modal con datos básicos (nombre, edad, motivo, antecedentes). El agente completa el historial clínico con preguntas durante la primera sesión. |

### Fase 2 — Voz (post Fase 1)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Dictado por voz con streaming** | Transcripción en tiempo real mientras el psicólogo habla + nota SOAP construyéndose progresivamente en el panel derecho simultáneamente. |

### Post-MVP

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | **Descargar nota en PDF** | Exportar nota SOAP confirmada como PDF con membrete profesional |
| 2 | **Google Drive** | Guardar notas automáticamente en carpetas del psicólogo en Drive |
| 3 | **Google Calendar** | Vincular sesiones con eventos del calendario del psicólogo |

---

## Reestructura UI — Documentation-First

**Origen:** Feedback de psicólogo real (2026-03-26). Tres señales:
1. El chat es demasiado largo — el psicólogo quiere documentación, no conversación
2. Para sesiones nuevas, el agente debe guiar el intake del historial clínico
3. Notas por voz son prioritarias (mueven a Fase 1→2 desde Post-MVP)

**Decisión de diseño:** La app pasa de chat-first a documentation-first.

### Nuevo modelo de interacción

```
ANTES: Chat primario → SOAP aparece como respuesta de burbuja
AHORA: Split-document → dictado izquierda, SOAP emerge tipográficamente a la derecha
```

- El **chat** (análisis de evolución, patrones) pasa a ser **on-demand** — botón "Evolución del paciente" en el header
- El **historial** de sesiones es una **barra de chips** compacta, no lista de mensajes
- El **botón de voz** existe desde Fase 1 (preparado) — activo en Fase 2

### Diseño visual (aprobado ✓)

- **Paleta:** base `#ffffff` · sidebar `#f4f4f2` · sage `#5a9e8a` · amber `#c4935a` · ink `#18181b`
  - La calidez viene de los acentos (sage/amber), no de los fondos — evita el efecto beige
- **Tipografía nota:** serif (Georgia) — como un expediente real. Dictado: sans.
- **Profundidad:** surface color shifts únicamente, sin sombras
- **SOAP:** labels en small caps con letra de color según estado (sage=done, amber=streaming, muted=pending), contenido en serif, separación solo por espacio y peso — sin cards ni bordes
- **Historial de sesiones:** vive en tab "Historial" (desktop y mobile) — NO en la vista de sesión activa. La vista de dictado/nota queda limpia.
- **Desktop:** split-view — panel dictado (320px izq) + panel nota (flex derecho)
- **Mobile:** tabs Dictar / Nota / Historial — misma info, adaptada al espacio

**Mockups aprobados:**
- `docs/mockups/syquex-v2-desktop.html` — layout split-document, modal nuevo paciente, panel Evolución
- `docs/mockups/syquex-v2-mobile.html` — 3 frames: lista pacientes, dictar, nota generándose

### Flujo de paciente nuevo

1. Botón "+ Nuevo paciente" → modal con: nombre, edad, motivo de consulta, antecedentes (opcional)
2. Al crear → primera sesión abierta automáticamente
3. Durante el dictado de la primera sesión, el agente hace preguntas de seguimiento para completar el historial clínico si falta información

### Estrategia de implementación

- **Fase 1 primero** (UI restructure) — valida el nuevo paradigma sin la complejidad técnica de streaming de voz
- **Fase 2 después** (voz con streaming) — sobre la nueva UI ya estable
- Trabajar en `feature/documentation-first-ui` desde `dev`, sin tocar el demo desplegado

### Estado actual (2026-03-28)

- [x] Feedback de psicólogo procesado y decisiones de diseño tomadas
- [x] Mockups de desktop y mobile aprobados
- [x] Spec escrito: `docs/superpowers/specs/2026-03-28-mvp-frontend-redesign.md`
- [ ] **Próximo paso:** crear `feature/documentation-first-ui` desde `dev` e implementar según spec

### Decisiones MVP (2026-03-28)

- **Demo interno** — una cuenta fija (`ana@syquex.demo / demo1234`), sin login frontend por ahora
- **Frontend only** — backend sin cambios en este sprint
- **Reemplazo incremental** — App.jsx mantiene estado/callbacks, se reemplaza el render layer
- **Happy path primero:** seleccionar paciente → dictar → generar nota → confirmar
- **Fuera del scope:** login UI, panel Evolución, dictado por voz, PDF/Drive

### Componentes del MVP

| Componente | Estado |
|-----------|--------|
| `DictationPanel` | Nuevo |
| `SoapNoteDocument` | Nuevo (reemplaza NoteReview) |
| `PatientHeader` | Nuevo |
| `NewPatientModal` | Nuevo |
| `PatientSidebar` | Rediseño visual |
| `App.jsx` render layer | Reemplazar (estado intacto) |
| `index.html` | Agregar CSS variables (design tokens) |

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
