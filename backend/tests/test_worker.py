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
