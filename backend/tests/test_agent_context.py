"""
Unit tests for _get_patient_context (agent/agent.py).

Covers the chat_mode flag introduced to fix the Evolution tab "no prior sessions"
bug: in chat_mode the function must inject labeled ai_response blocks instead of
raw session message turns, and must filter out chat-format and draft sessions.
"""
import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PATIENT_ID = str(uuid.uuid4())


def _make_db(profile=None, sessions=None):
    """Return a mock AsyncSession whose execute() returns profile then sessions."""
    db = AsyncMock()

    profile_result = MagicMock()
    profile_result.scalar_one_or_none.return_value = profile

    sessions_result = MagicMock()
    sessions_scalars = MagicMock()
    sessions_scalars.all.return_value = sessions or []
    sessions_result.scalars.return_value = sessions_scalars

    db.execute.side_effect = [profile_result, sessions_result]
    return db


def _make_session(
    session_number=1,
    session_date=date(2026, 1, 15),
    format_="SOAP",
    status="confirmed",
    ai_response="Subjetivo: paciente estable.",
    messages=None,
):
    s = MagicMock()
    s.session_number = session_number
    s.session_date = session_date
    s.format = format_
    s.status = status
    s.ai_response = ai_response
    s.messages = json.dumps(messages or [
        {"role": "user", "content": "dictado"},
        {"role": "assistant", "content": "respuesta SOAP"},
    ])
    s.is_archived = False
    return s


# ---------------------------------------------------------------------------
# Patch encrypt/decrypt to pass-through in all tests
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def passthrough_crypto():
    with (
        patch("agent.agent.encrypt_if_set", side_effect=lambda x: x),
        patch("agent.agent.decrypt_if_set", side_effect=lambda x: x),
    ):
        yield


# ---------------------------------------------------------------------------
# chat_mode=True: labeled ai_response blocks
# ---------------------------------------------------------------------------

class TestChatModeContext:

    @pytest.mark.asyncio
    async def test_confirmed_soap_session_produces_labeled_block(self):
        """A confirmed SOAP session produces a [NOTA CLÍNICA PREVIA] block with its ai_response."""
        from agent.agent import _get_patient_context

        session = _make_session(
            session_number=1,
            session_date=date(2026, 1, 15),
            ai_response="Subjetivo: paciente ansiosa.\nPlan: continuar TCC.",
        )
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID, "Ana García", chat_mode=True)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 1, "Should produce exactly one labeled session block"
        assert "Sesión #1" in labeled[0]["content"]
        assert "2026-01-15" in labeled[0]["content"]
        assert "Subjetivo: paciente ansiosa." in labeled[0]["content"]

    @pytest.mark.asyncio
    async def test_chat_format_sessions_are_excluded(self):
        """chat-format sessions must NOT appear in the Evolution tab context."""
        from agent.agent import _get_patient_context

        chat_session = _make_session(format_="chat", ai_response="respuesta previa del chat")
        db = _make_db(sessions=[chat_session])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=True)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 0, "chat-format sessions must be filtered out in chat_mode"

    @pytest.mark.asyncio
    async def test_draft_sessions_are_excluded(self):
        """Draft (unconfirmed) sessions must NOT appear in Evolution tab context."""
        from agent.agent import _get_patient_context

        draft = _make_session(status="draft", ai_response="Nota incompleta.")
        db = _make_db(sessions=[draft])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=True)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 0, "draft sessions must be filtered out in chat_mode"

    @pytest.mark.asyncio
    async def test_session_without_ai_response_is_skipped(self):
        """Sessions with no ai_response produce no labeled block (not an error)."""
        from agent.agent import _get_patient_context

        session = _make_session(ai_response=None)
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=True)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 0

    @pytest.mark.asyncio
    async def test_multiple_sessions_ordered_oldest_first(self):
        """Multiple clinical sessions appear oldest-first in context."""
        from agent.agent import _get_patient_context

        # DB returns newest-first (DESC order), reversed in code → oldest first in context
        session2 = _make_session(session_number=2, session_date=date(2026, 2, 1), ai_response="Sesion 2")
        session1 = _make_session(session_number=1, session_date=date(2026, 1, 1), ai_response="Sesion 1")
        db = _make_db(sessions=[session2, session1])  # newest first from DB

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=True)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 2
        # After reversed(), session1 (oldest) comes first
        assert "Sesión #1" in labeled[0]["content"]
        assert "Sesión #2" in labeled[1]["content"]

    @pytest.mark.asyncio
    async def test_raw_messages_not_used_in_chat_mode(self):
        """In chat_mode, session.messages (raw turns) must NOT be in context."""
        from agent.agent import _get_patient_context

        session = _make_session(
            ai_response="Plan: mindfulness.",
            messages=[{"role": "user", "content": "DICTADO_SECRETO"}],
        )
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=True)

        all_content = " ".join(m.get("content", "") for m in ctx)
        assert "DICTADO_SECRETO" not in all_content, "Raw message turns must not appear in chat_mode"


# ---------------------------------------------------------------------------
# chat_mode=False (default): raw session message turns
# ---------------------------------------------------------------------------

class TestNoteGenerationContext:

    @pytest.mark.asyncio
    async def test_raw_message_turns_injected(self):
        """chat_mode=False (default) must inject raw session turns, not labeled blocks."""
        from agent.agent import _get_patient_context

        session = _make_session(
            ai_response="Nota SOAP.",
            messages=[
                {"role": "user", "content": "dictado_clinico"},
                {"role": "assistant", "content": "respuesta_nota"},
            ],
        )
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=False)

        raw_contents = [m.get("content") for m in ctx]
        assert "dictado_clinico" in raw_contents
        assert "respuesta_nota" in raw_contents

    @pytest.mark.asyncio
    async def test_labeled_blocks_not_present_in_note_mode(self):
        """chat_mode=False must NOT produce [NOTA CLÍNICA PREVIA] blocks."""
        from agent.agent import _get_patient_context

        session = _make_session()
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID, chat_mode=False)

        labeled = [m for m in ctx if "[NOTA CLÍNICA PREVIA" in (m.get("content") or "")]
        assert len(labeled) == 0

    @pytest.mark.asyncio
    async def test_default_is_note_generation_mode(self):
        """Calling without chat_mode kwarg must behave as chat_mode=False."""
        from agent.agent import _get_patient_context

        session = _make_session(
            messages=[{"role": "user", "content": "dictado_default"}, {"role": "assistant", "content": "respuesta"}],
        )
        db = _make_db(sessions=[session])

        ctx = await _get_patient_context(db, PATIENT_ID)

        assert any(m.get("content") == "dictado_default" for m in ctx)
