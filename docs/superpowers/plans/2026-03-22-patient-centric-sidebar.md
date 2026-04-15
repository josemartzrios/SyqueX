# Patient-Centric Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where every chat message creates a new sidebar entry — sidebar must show one entry per patient, chat messages must be ephemeral (no DB write).

**Architecture:** Three backend changes in `routes.py` (schema fix, conditional Session creation, patient-centric query) plus one frontend line in `App.jsx`. All changes are independent and low-risk.

**Tech Stack:** FastAPI + SQLAlchemy async, PostgreSQL (`DISTINCT ON`), React 18, pytest + httpx AsyncClient.

**Spec:** `docs/superpowers/specs/2026-03-22-patient-centric-sidebar-design.md`

---

## File Map

| File | Change |
|------|--------|
| `backend/api/routes.py` | 3 changes: schema, endpoint logic, query |
| `backend/tests/test_api_routes.py` | 2 new test classes + update existing assertion |
| `frontend/src/App.jsx` | 1 line: guard `fetchConversations` to SOAP only |

---

## Task 1 — Make `ProcessSessionOut.session_id` optional

**Files:**
- Modify: `backend/api/routes.py:98`

- [ ] **Step 1: Update the schema**

In `routes.py` line 96–99, change:
```python
# Before
class ProcessSessionOut(BaseModel):
    text_fallback: Optional[str]
    session_id: str

# After
class ProcessSessionOut(BaseModel):
    text_fallback: Optional[str]
    session_id: Optional[str] = None
```

- [ ] **Step 2: Run existing tests — should still pass**

```bash
cd backend
python -m pytest tests/test_api_routes.py::TestProcessSession -v
```

Expected: all existing `TestProcessSession` tests pass (the SOAP path still returns a `session_id`).

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes.py
git commit -m "fix: make ProcessSessionOut.session_id optional for chat responses"
```

---

## Task 2 — Skip Session creation for `format='chat'`

**Files:**
- Modify: `backend/api/routes.py:259–296`
- Test: `backend/tests/test_api_routes.py`

- [ ] **Step 1: Write failing tests**

Add this class at the end of `test_api_routes.py`:

```python
# ---------------------------------------------------------------------------
# POST /api/v1/sessions/{patient_id}/process — chat vs SOAP format
# ---------------------------------------------------------------------------

class TestProcessSessionFormat:
    """Chat format must not create a Session; SOAP format must."""

    def _mock_claude(self, text="Respuesta del agente"):
        """Returns a context manager that patches AsyncAnthropic."""
        from unittest.mock import patch, AsyncMock, MagicMock
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = text
        mock_resp = MagicMock()
        mock_resp.content = [mock_block]

        patcher = patch("agent.agent.AsyncAnthropic")
        mock_cls = patcher.start()
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = mock_client
        return patcher

    @pytest.mark.asyncio
    async def test_chat_format_returns_no_session_id(self, app, mock_db, patient_uuid):
        """format='chat' → response has no session_id."""
        mock_db.execute.side_effect = [
            _result(scalar_one_or_none=None),  # _get_patient_context: profile
            _result(scalars_all=[]),            # _get_patient_context: sessions
        ]

        patcher = self._mock_claude()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/sessions/{patient_uuid}/process",
                    json={"raw_dictation": "El paciente llegó tranquilo.", "format": "chat"},
                )
        finally:
            patcher.stop()

        assert response.status_code == 200
        data = response.json()
        assert data["text_fallback"] is not None
        assert data.get("session_id") is None

    @pytest.mark.asyncio
    async def test_chat_format_does_not_persist_session(self, app, mock_db, patient_uuid):
        """format='chat' → db.add() is never called."""
        mock_db.execute.side_effect = [
            _result(scalar_one_or_none=None),
            _result(scalars_all=[]),
        ]

        patcher = self._mock_claude()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post(
                    f"/api/v1/sessions/{patient_uuid}/process",
                    json={"raw_dictation": "Sesión de seguimiento.", "format": "chat"},
                )
        finally:
            patcher.stop()

        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_soap_format_returns_session_id(self, app, mock_db, patient_uuid):
        """format='SOAP' → response includes session_id (existing behavior preserved)."""
        mock_db.execute.side_effect = [
            _result(scalar_one_or_none=None),  # profile
            _result(scalars_all=[]),            # sessions history
            _result(scalar_one_or_none=None),  # last session (session_number)
        ]

        patcher = self._mock_claude("Subjetivo:\nPaciente ansiosa.")
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/sessions/{patient_uuid}/process",
                    json={"raw_dictation": "Paciente ansiosa.", "format": "SOAP"},
                )
        finally:
            patcher.stop()

        assert response.status_code == 200
        data = response.json()
        assert data.get("session_id") is not None
```

- [ ] **Step 2: Run tests — expect failure**

```bash
python -m pytest tests/test_api_routes.py::TestProcessSessionFormat -v
```

Expected: `test_chat_format_returns_no_session_id` and `test_chat_format_does_not_persist_session` FAIL (session_id still returned, db.add still called).

- [ ] **Step 3: Implement the fix in `routes.py`**

First, add `text` to the SQLAlchemy import at the top of `routes.py` (needed for Task 3):
```python
# Before
from sqlalchemy import select, func
# After
from sqlalchemy import select, func, text
```

Then replace the current `process_session_endpoint` (around line 259):

```python
@router.post("/sessions/{patient_id}/process", response_model=ProcessSessionOut, tags=["sessions"])
@limiter.limit("30/hour")
async def process_session_endpoint(
    request: Request,
    patient_id: str,
    rec: ProcessSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    patient_uuid = _parse_uuid(patient_id, "patient_id")
    response = await process_session(db, patient_id, rec.raw_dictation, None, rec.format)

    # Chat messages are ephemeral — no Session created in DB
    if rec.format == "chat":
        return ProcessSessionOut(text_fallback=response.get("text_fallback"))

    # SOAP and other formats: persist as draft Session
    session_id = str(uuid.uuid4())

    res_last = await db.execute(
        select(Session)
        .where(Session.patient_id == patient_uuid)
        .order_by(Session.session_number.desc())
        .limit(1)
    )
    last_session = res_last.scalar_one_or_none()
    current_session_number = (last_session.session_number + 1) if last_session else 1

    new_session = Session(
        id=uuid.UUID(session_id),
        patient_id=patient_uuid,
        session_number=current_session_number,
        session_date=date.today(),
        raw_dictation=rec.raw_dictation,
        ai_response=response.get("text_fallback"),
        messages=response.get("session_messages", []),
        status="draft",
    )
    db.add(new_session)
    await db.commit()

    return ProcessSessionOut(
        text_fallback=response.get("text_fallback"),
        session_id=session_id,
    )
```

Note: `process_session` in `agent.py` signature is `(db, patient_id, raw_dictation, session_id, format_)`. Pass `None` for `session_id` on chat — the agent never uses it.

- [ ] **Step 4: Run all new tests — expect pass**

```bash
python -m pytest tests/test_api_routes.py::TestProcessSessionFormat -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
python -m pytest tests/ -v
```

Expected: all tests PASS. The existing `test_returns_200_with_text_fallback` sends no `format` field, which defaults to `"SOAP"` — behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat: skip Session creation for chat messages (ephemeral chat)"
```

---

## Task 3 — Rewrite `list_conversations` — one entry per patient

**Files:**
- Modify: `backend/api/routes.py:79–94` (ConversationOut schema)
- Modify: `backend/api/routes.py:359–397` (list_conversations endpoint)
- Test: `backend/tests/test_api_routes.py`

- [ ] **Step 1: Update `ConversationOut` schema for nullable fields**

Patient with no Sessions has no `session_number`, `status`, or `message_count`. Update schema (lines 79–87):

```python
class ConversationOut(BaseModel):
    id: Optional[str]             # session id — None if patient has no sessions
    patient_id: str
    patient_name: str
    session_number: Optional[int]
    session_date: Optional[date]
    dictation_preview: Optional[str]
    status: Optional[str]
    message_count: Optional[int]

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Update `_result()` helper to support `.mappings()`, then write failing tests**

The new query uses `res.mappings().all()`. The existing `_result()` helper in `test_api_routes.py` doesn't mock `.mappings()`. Add it (find the `_result` function at line ~61 and add two lines):

```python
def _result(scalars_all=None, scalar_one_or_none=None, scalar_one=0, all_rows=None):
    r = MagicMock()
    items = scalars_all or []
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = items
    scalars_mock.__iter__ = MagicMock(return_value=iter(items))
    r.scalars.return_value = scalars_mock
    r.scalar_one_or_none.return_value = scalar_one_or_none
    r.scalar_one.return_value = scalar_one
    r.all.return_value = all_rows or []
    # Support .mappings().all() for raw SQL queries
    mappings_mock = MagicMock()
    mappings_mock.all.return_value = all_rows or []
    r.mappings.return_value = mappings_mock
    return r
```

Then add the test class:

```python
# ---------------------------------------------------------------------------
# GET /api/v1/conversations — one entry per patient
# ---------------------------------------------------------------------------

class TestListConversations:
    @pytest.mark.asyncio
    async def test_returns_one_entry_per_patient(self, app, mock_db):
        """Two patients with sessions → two entries."""
        import uuid as uuid_mod
        from datetime import date

        p1_id = uuid_mod.uuid4()
        p2_id = uuid_mod.uuid4()
        s1_id = uuid_mod.uuid4()
        s2_id = uuid_mod.uuid4()

        # .mappings().all() returns list of dict-like objects
        row1 = {
            "patient_id": p1_id, "patient_name": "Ana García",
            "session_id": s1_id, "session_number": 3,
            "session_date": date.today(), "dictation_preview": "Dictado Ana",
            "status": "draft", "messages": [],
        }
        row2 = {
            "patient_id": p2_id, "patient_name": "Luis Pérez",
            "session_id": s2_id, "session_number": 1,
            "session_date": date.today(), "dictation_preview": None,
            "status": "confirmed", "messages": [{}, {}],
        }
        mock_db.execute.return_value = _result(all_rows=[row1, row2])

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/conversations")

        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 2
        patient_names = {item["patient_name"] for item in items}
        assert patient_names == {"Ana García", "Luis Pérez"}

    @pytest.mark.asyncio
    async def test_patient_with_no_sessions_appears(self, app, mock_db):
        """Patient with zero Sessions (chat-only) still appears with nulls."""
        import uuid as uuid_mod

        p_id = uuid_mod.uuid4()
        row = {
            "patient_id": p_id, "patient_name": "María Sin Notas",
            "session_id": None, "session_number": None,
            "session_date": None, "dictation_preview": None,
            "status": None, "messages": None,
        }
        mock_db.execute.return_value = _result(all_rows=[row])

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/conversations")

        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 1
        assert items[0]["patient_name"] == "María Sin Notas"
        assert items[0]["id"] is None
        assert items[0]["session_number"] is None
```

- [ ] **Step 3: Run tests — expect failure**

```bash
python -m pytest tests/test_api_routes.py::TestListConversations -v
```

Expected: FAIL — current query returns rows per Session, not per patient, and doesn't handle None sessions.

- [ ] **Step 4: Rewrite `list_conversations` in `routes.py`**

Replace the entire `list_conversations` endpoint (lines ~359–397). `text` is already imported at the top after Task 2's Step 3:

```python
@router.get("/conversations", response_model=PaginatedConversations, tags=["conversations"])
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    # One entry per patient: most recent Session preview via DISTINCT ON (PostgreSQL)
    # LEFT JOIN ensures patients with zero Sessions still appear
    sql = text("""
        SELECT DISTINCT ON (p.id)
            p.id            AS patient_id,
            p.name          AS patient_name,
            s.id            AS session_id,
            s.session_number,
            s.session_date,
            s.raw_dictation AS dictation_preview,
            s.status,
            s.messages
        FROM patients p
        LEFT JOIN sessions s
            ON s.patient_id = p.id
            AND s.is_archived = FALSE
        ORDER BY p.id, s.created_at DESC NULLS LAST
    """)

    res = await db.execute(sql)
    rows = res.mappings().all()

    items = []
    for row in rows:
        raw = row.get("dictation_preview")
        preview = (raw[:120] + "...") if raw and len(raw) > 120 else raw
        messages = row.get("messages") or []

        items.append(ConversationOut(
            id=str(row["session_id"]) if row["session_id"] else None,
            patient_id=str(row["patient_id"]),
            patient_name=row["patient_name"],
            session_number=row.get("session_number"),
            session_date=row.get("session_date"),
            dictation_preview=preview,
            status=row.get("status"),
            message_count=len(messages) if isinstance(messages, list) else 0,
        ))

    total = len(items)
    offset = (page - 1) * page_size
    paged = items[offset: offset + page_size]
    pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedConversations(
        items=paged, total=total, page=page, page_size=page_size, pages=pages
    )
```

- [ ] **Step 5: Run new tests — expect pass**

```bash
python -m pytest tests/test_api_routes.py::TestListConversations -v
```

Expected: both tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes.py backend/tests/test_api_routes.py
git commit -m "feat: list_conversations returns one entry per patient with LEFT JOIN"
```

---

## Task 4 — Frontend: `fetchConversations` only after SOAP

**Files:**
- Modify: `frontend/src/App.jsx:223`

- [ ] **Step 1: Update `handleSendDictation`**

In `App.jsx` around line 217–229, add the `format === 'SOAP'` guard:

```js
// Before
      setMessages(prev => [...prev.slice(0, -1), botMessage]);
      fetchConversations();

// After
      setMessages(prev => [...prev.slice(0, -1), botMessage]);
      if (format === 'SOAP') fetchConversations();
```

- [ ] **Step 2: Manual verification**

Start both servers and run through the flow:

1. Create a new patient → sidebar shows one new entry ✓
2. Send 3 chat messages → sidebar stays at one entry, no new entries ✓
3. Click "Generar nota clínica" → sidebar entry updates its preview text ✓
4. Confirm the note → no new sidebar entry ✓

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "fix: only refresh sidebar after SOAP generation, not after chat"
```

---

## Done

All four tasks complete. The sidebar now shows one entry per patient. Chat messages are ephemeral — no DB write, no sidebar growth. SOAP generation persists a Session and updates the patient's sidebar preview.
