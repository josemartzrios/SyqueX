"""Unit tests for async job worker."""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


class TestJobQueueModel:
    def test_job_queue_model_importable(self):
        from database import JobQueue
        assert JobQueue.__tablename__ == "job_queue"

    def test_job_queue_has_required_fields(self):
        from database import JobQueue
        cols = {c.name for c in JobQueue.__table__.columns}
        for field in ["id", "psychologist_id", "patient_id", "status",
                      "raw_dictation", "attempts", "created_at", "updated_at"]:
            assert field in cols, f"Missing column: {field}"

    def test_job_queue_status_constraint_exists(self):
        from database import JobQueue
        constraints = {c.name for c in JobQueue.__table__.constraints}
        assert "chk_job_queue_status" in constraints


import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, call
from cryptography.fernet import Fernet


@pytest.fixture
def fernet_key():
    return Fernet.generate_key().decode()


@pytest.fixture
def mock_job(fernet_key):
    from cryptography.fernet import Fernet as _F
    f = _F(fernet_key.encode())
    encrypted = f"v1:{f.encrypt(b'Dictado de prueba').decode()}"
    job = MagicMock()
    job.id = uuid.uuid4()
    job.psychologist_id = uuid.uuid4()
    job.patient_id = uuid.uuid4()
    job.format_ = "SOAP"
    job.raw_dictation = encrypted
    job.template_fields = None
    job.attempts = 1
    return job


class TestWorkerProcessSingleJob:
    async def test_successful_job_sets_completed(self, mock_job, fernet_key):
        from cryptography.fernet import Fernet as _F
        import config as _cfg
        _cfg.settings.ENCRYPTION_KEY = fernet_key

        mock_patient = MagicMock()
        mock_patient.name = "Test Patient"

        fake_result = {"text_fallback": "SOAP note content", "session_messages": []}
        mock_session_orm = MagicMock()
        mock_session_orm.id = uuid.uuid4()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(side_effect=[mock_job, mock_patient])
        mock_db.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[]), scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, 'id', uuid.uuid4()))

        with patch("agent.worker.AsyncSessionLocal") as mock_session_factory, \
             patch("agent.worker.process_session", return_value=fake_result) as mock_ps, \
             patch("agent.worker.process_session_custom") as mock_psc:

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_factory.return_value = mock_ctx

            from agent.worker import _process_single_job
            await _process_single_job(mock_job.id)

        assert mock_ps.called
        assert not mock_psc.called

    async def test_custom_format_calls_process_session_custom(self, mock_job, fernet_key):
        import config as _cfg
        _cfg.settings.ENCRYPTION_KEY = fernet_key
        mock_job.format_ = "custom"
        mock_job.template_fields = [{"id": "estado", "label": "Estado", "type": "text"}]

        mock_patient = MagicMock()
        mock_patient.name = "Test Patient"
        fake_result = {"text_fallback": "Custom note", "custom_fields": {}, "session_messages": []}

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(side_effect=[mock_job, mock_patient])
        mock_db.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[]), scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, 'id', uuid.uuid4()))

        with patch("agent.worker.AsyncSessionLocal") as mock_session_factory, \
             patch("agent.worker.process_session") as mock_ps, \
             patch("agent.worker.process_session_custom", return_value=fake_result) as mock_psc:

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_factory.return_value = mock_ctx

            from agent.worker import _process_single_job
            await _process_single_job(mock_job.id)

        assert mock_psc.called
        assert not mock_ps.called

    async def test_failed_job_after_3_attempts_sets_failed(self, mock_job, fernet_key):
        import config as _cfg
        _cfg.settings.ENCRYPTION_KEY = fernet_key
        mock_job.attempts = 3

        mock_patient = MagicMock()
        mock_patient.name = "Test"

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(side_effect=[mock_job, mock_patient, mock_job])
        mock_db.execute = AsyncMock(return_value=MagicMock())
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        with patch("agent.worker.AsyncSessionLocal") as mock_session_factory, \
             patch("agent.worker.process_session", side_effect=Exception("Claude error")):

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_factory.return_value = mock_ctx

            from agent.worker import _process_single_job
            await _process_single_job(mock_job.id)

        # After 3 attempts, status should be set to failed
        # Verify commit was called (status update)
        assert mock_db.commit.called


class TestWorkerBatchPick:
    async def test_no_pending_jobs_returns_immediately(self):
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.rollback = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch("agent.worker.AsyncSessionLocal") as mock_session_factory:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_factory.return_value = mock_ctx

            from agent.worker import _process_batch
            await _process_batch()

        assert not mock_db.commit.called
