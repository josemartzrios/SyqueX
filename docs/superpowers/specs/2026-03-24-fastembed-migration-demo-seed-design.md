# Design Spec: FastEmbed Migration + Demo Seed
**Date:** 2026-03-24
**Status:** Approved
**Branch:** dev

---

## Overview

Two coupled changes:

1. **FastEmbed migration** — replace OpenAI `text-embedding-3-small` (external API, 1536 dims) with `BAAI/bge-m3` via FastEmbed (local, 1024 dims). Eliminates data egress to third-party servers, satisfying LFPDPPP requirements for sensitive clinical data.

2. **Demo seed script** — `backend/seed_demo.py` cleans the database and populates it with 3 realistic patients × 6 sessions each, with real local embeddings. Demonstrates the agent's persistent context value proposition.

---

## Motivation

- Patient clinical data (dictations, SOAP notes) cannot leave the server under LFPDPPP.
- OpenAI embeddings require sending note content to external servers.
- FastEmbed runs `BAAI/bge-m3` locally — no data egress, no API key needed for embeddings.
- The demo seed gives psychologists a convincing, production-like experience of the product's core value: the AI agent that remembers and connects patient history across sessions.

---

## Embedding Model

**Model:** `BAAI/bge-m3`
**Dimensions:** 1024
**Size:** ~570 MB (downloaded once, cached locally)
**Languages:** 100+ including Spanish
**Minimum FastEmbed version:** `>=0.3.6` (earliest confirmed support for `BAAI/bge-m3`)
**Why:** Top multilingual model available in FastEmbed; strong semantic quality for long clinical texts; fully local.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/agent/embeddings.py` | Replace `OpenAIEmbeddingService` with `FastEmbedService`; remove `OPENAI_API_KEY` reference; preserve `embedding_service` and `get_embedding` module-level exports; update fallback zero-vector to `[0.0] * 1024` |
| `backend/config.py` | Remove `OPENAI_API_KEY` field; update `EMBEDDING_DIMENSIONS = 1024` |
| `backend/database.py` | `Vector(1536)` → `Vector(1024)` in `ClinicalNote` ORM model; add migration block in `init_db()` |
| `backend/requirements.txt` | Remove `openai==1.50.0`; add `fastembed>=0.3.6` |
| `backend/exceptions.py` | Update `EmbeddingServiceError` docstring: replace "OpenAI" with "FastEmbed" |
| `backend/tests/test_agent_embeddings.py` | Full rewrite for `FastEmbedService`; mock `TextEmbedding`; update `isinstance` check to `FastEmbedService` |
| `backend/tests/test_api_routes.py` | Change mock vector from `[0.0] * 1536` → `[0.0] * 1024`; update dimension comment |
| `backend/tests/test_config.py` | Rename `test_embedding_dimensions_is_1536` → `test_embedding_dimensions_is_1024`; update assertion `== 1536` → `== 1024`; update comment to reference BAAI/bge-m3 |
| `backend/seed_demo.py` | New — demo seed script |
| `.env.example` | Remove `OPENAI_API_KEY` |

**Atomicity note:** `config.py` (remove `OPENAI_API_KEY`) and `embeddings.py` (remove reference to `settings.OPENAI_API_KEY`) must be changed in the same commit to avoid import-time errors.

---

## FastEmbedService Design

`agent/embeddings.py` replaces `OpenAIEmbeddingService` with `FastEmbedService` implementing the existing `IEmbeddingService` ABC. The module-level exports `embedding_service` and `get_embedding` are preserved so all existing callers require no changes.

```python
import asyncio
import threading
from fastembed import TextEmbedding
from agent.interfaces import IEmbeddingService

MODEL_NAME = "BAAI/bge-m3"
EMBEDDING_DIMENSIONS = 1024
ZERO_VECTOR = [0.0] * EMBEDDING_DIMENSIONS  # fallback on error


class FastEmbedService(IEmbeddingService):
    """Local embeddings via FastEmbed — no data egress, LFPDPPP compliant."""

    _model: TextEmbedding | None = None
    _lock: threading.Lock = threading.Lock()

    def _get_model(self) -> TextEmbedding:
        # Double-checked locking — model instantiated exactly once across threads
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = TextEmbedding(MODEL_NAME)
        return self._model

    def _embed_sync(self, text: str) -> list[float]:
        model = self._get_model()
        # FastEmbed returns a generator of numpy.ndarray — convert to list[float]
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()

    async def get_embedding(self, text: str) -> list[float]:
        # FastEmbed is synchronous — run in default thread pool executor
        # to avoid blocking the FastAPI event loop
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._embed_sync, text)


# Module-level exports preserved for backward compatibility with all callers
embedding_service = FastEmbedService()


async def get_embedding(text: str) -> list[float]:
    return await embedding_service.get_embedding(text)
```

---

## Database Migration

### ORM model (`database.py`)
Change `Vector(1536)` → `Vector(1024)` in `ClinicalNote.embedding`. This ensures `Base.metadata.create_all` creates the correct schema on fresh databases without requiring an immediate `ALTER TABLE` correction.

### `init_db()` migration block
Add to the safe migrations section for existing databases (staging on Railway). The migration must drop the HNSW index, alter the column type, then re-create the index:

```sql
-- Step 1: drop index (required before altering vector dimension)
DROP INDEX IF EXISTS clinical_notes_embedding_idx;

-- Step 2: alter column dimension (only if column exists at wrong size)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinical_notes'
          AND column_name = 'embedding'
    ) THEN
        ALTER TABLE clinical_notes ALTER COLUMN embedding TYPE vector(1024);
    END IF;
END$$;

-- Step 3: re-create HNSW index (also created by the existing index block below,
-- but the explicit re-creation here ensures it is re-built immediately)
CREATE INDEX IF NOT EXISTS clinical_notes_embedding_idx
    ON clinical_notes USING hnsw (embedding vector_cosine_ops);
```

### Seed script vs. `init_db()` — two paths reconciled

| Scenario | Who handles the column | Notes |
|----------|----------------------|-------|
| Fresh DB, `init_db()` has never run | `create_all` creates `vector(1024)` directly | No migration needed; ORM model is correct |
| Existing DB with `vector(1536)` | `init_db()` migration block alters to `vector(1024)` | Runs on next server start |
| Running seed on local demo DB | Seed drops + re-adds column as `vector(1024)` | Safe because all data is truncated first |

The seed's `DROP COLUMN / ADD COLUMN` approach is intentionally simpler than the server-side migration because the seed always clears all data. There is no conflict: on a demo DB, the seed runs first (while server is stopped), then `init_db()` runs on server start and the `ALTER TABLE` step is a no-op because the column already exists at 1024 dims.

### Required execution order (local seed)
1. Stop the server
2. `python seed_demo.py`
3. Start the server — `init_db()` skips the already-correct column, re-creates HNSW index

---

## Model Cache

FastEmbed caches models in `~/.cache/fastembed` by default. Configure via env var:

```
FASTEMBED_CACHE_PATH=/path/to/persistent/volume
```

- **Local dev:** default cache; model downloads once (~570 MB)
- **Railway staging:** set `FASTEMBED_CACHE_PATH` to a persistent volume to avoid re-download on every deploy
- **CI (tests):** `TextEmbedding` is mocked — no model download in CI

---

## Demo Seed Script (`seed_demo.py`)

### Safety Guard
```python
ENVIRONMENT = os.getenv("ENVIRONMENT", "local")
if ENVIRONMENT in ("production", "staging"):
    print("ERROR: seed_demo.py must not run against staging or production.")
    sys.exit(1)
```

### Execution Model
`asyncio.run()` wrapping async SQLAlchemy calls via `AsyncSessionLocal` from `database.py`. FastEmbed calls are synchronous and run inline (not in executor) — the seed is not a server process and blocking is acceptable.

```python
async def main():
    async with AsyncSessionLocal() as db:
        await seed_all(db)

if __name__ == "__main__":
    asyncio.run(main())
```

### Execution Flow
1. Check `ENVIRONMENT` — abort if staging/production
2. TRUNCATE all tables (cascade): `clinical_notes → sessions → patient_profiles → patients → psychologists → audit_logs`
3. Migrate embedding column: `DROP COLUMN IF EXISTS embedding; ADD COLUMN embedding vector(1024)`
4. Load FastEmbed model `BAAI/bge-m3`
5. INSERT psychologist (`Dr. Ana López / ana@syquex.demo / demo1234` bcrypt-hashed)
6. For each of 3 patients:
   a. INSERT patient
   b. For each of 6 sessions:
      - INSERT session (`status='confirmed'`)
      - Generate embedding via `list(model.embed([note_text]))[0].tolist()`
      - INSERT clinical_note with embedding + patterns + alerts
   c. INSERT patient_profile
7. Post-seed validation: assert `COUNT(clinical_notes WHERE embedding IS NOT NULL) == 18`
8. Print: `✓ 3 pacientes, 18 sesiones, 18 embeddings generados`

---

## Demo Seed Data

### Psychologist
- **Name:** Dr. Ana López
- **Email:** `ana@syquex.demo`
- **Password:** `demo1234` (bcrypt hashed)

### Patient 1: María González, 34 años
- **Diagnosis:** Ansiedad Generalizada
- **Risk:** medium
- **Tags:** `["ansiedad_generalizada", "insomnio", "perfeccionismo"]`

| # | Date | Theme | Agent Context Demonstrated |
|---|------|-------|---------------------------|
| 1 | 2025-12-17 | Presentación: ataques de pánico en el trabajo | — |
| 2 | 2025-12-24 | Detonante: reuniones con jefe identificado | Retoma síntomas físicos de S1 |
| 3 | 2026-01-07 | Técnicas de respiración, resistencia al cambio | Patrón de evitación detectado en S1-S2 |
| 4 | 2026-01-14 | Recaída por deadline laboral | Conecta perfeccionismo de S2 con recaída |
| 5 | 2026-01-21 | Reestructuración cognitiva | Evolución desde S1, patrones recurrentes |
| 6 | 2026-02-04 | Consolidación, plan de alta parcial | Resume arco completo de 6 sesiones |

### Patient 2: Carlos Mendoza, 28 años
- **Diagnosis:** Depresión leve
- **Risk:** low
- **Tags:** `["depresion_leve", "aislamiento_social", "anhedonia"]`

| # | Date | Theme | Agent Context Demonstrated |
|---|------|-------|---------------------------|
| 1 | 2025-12-10 | Presentación: anhedonia post-ruptura | — |
| 2 | 2025-12-17 | Aislamiento progresivo confirmado | Conecta anhedonia de S1 |
| 3 | 2025-12-24 | Activación conductual: retoma gimnasio | Historial de aislamiento S1-S2 |
| 4 | 2026-01-07 | Mejora de energía, cogniciones negativas persisten | Progreso conductual vs. cognitivo |
| 5 | 2026-01-14 | Trabajo en autoestima | Patrón autocrítico S2-S4 |
| 6 | 2026-01-28 | Estabilización, metas a 3 meses | Evolución completa desde ruptura |

### Patient 3: Laura Ramírez, 41 años
- **Diagnosis:** Conflicto de pareja
- **Risk:** low
- **Tags:** `["conflicto_pareja", "comunicacion", "codependencia"]`

| # | Date | Theme | Agent Context Demonstrated |
|---|------|-------|---------------------------|
| 1 | 2026-01-05 | Crisis: considera separación | — |
| 2 | 2026-01-12 | Patrones de comunicación disfuncionales | Detonantes de S1 |
| 3 | 2026-01-19 | Límites y necesidades propias | Codependencia emergente desde S1 |
| 4 | 2026-01-26 | Sesión de pareja (relatada), primera conversación real | Progreso vs. patrones históricos |
| 5 | 2026-02-02 | Ambivalencia: quiere pero no puede continuar igual | Límites trabajados en S3 |
| 6 | 2026-02-09 | Decisión tomada, trabajo en duelo anticipatorio | Arco completo, factores protectores |

### Key Design Principle for AI Responses
AI responses in sessions 3–6 of each patient explicitly reference earlier sessions by content — e.g., *"En sesiones anteriores hemos identificado que los ataques de pánico se intensifican los lunes ante reuniones con el jefe..."* This is the core demo moment that shows the agent's persistent context value.

---

## Tests

### `tests/test_agent_embeddings.py` — full rewrite
- Mock `fastembed.TextEmbedding` — no real model loaded in CI
- `isinstance(embedding_service, FastEmbedService)` — replaces old `OpenAIEmbeddingService` check
- Test: `get_embedding()` returns `list[float]` of length **1024**
- Test: model instantiated once (double-checked lock singleton)
- Test: `_embed_sync` converts `numpy.ndarray` → `list[float]` via `.tolist()`
- Test: `get_embedding()` calls `loop.run_in_executor(None, self._embed_sync, text)`

### `tests/test_config.py`
- Rename method: `test_embedding_dimensions_is_1536` → `test_embedding_dimensions_is_1024`
- Update assertion: `assert ClinicalNoteConfig.EMBEDDING_DIMENSIONS == 1024`
- Update comment: `# BAAI/bge-m3 uses 1024 dimensions`

### `tests/test_api_routes.py`
- Change mock vector value: `[0.0] * 1536` → `[0.0] * 1024`
- Update dimension comment: `# BAAI/bge-m3 uses 1024 dimensions`

---

## Out of Scope

- Alembic migrations for production (current deploy uses `init_db()` with safe ALTER TABLE blocks)
- Auth / login for demo psychologist (use existing auth flow with `ana@syquex.demo` / `demo1234`)
- PDF export, voice dictation (Roadmap Phase 2)
- Pre-warming FastEmbed model cache in Railway CI pipeline (future DevOps task)
