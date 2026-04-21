"""Tests for DELETE /api/v1/sessions/{session_id}"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


def _result(scalar_one_or_none=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar_one_or_none
    return r


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    db.execute.return_value = _result()
    return db


@pytest.fixture
def app(mock_db, monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())
    with patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db, Psychologist
        from api.auth import get_current_psychologist
        from api.routes import get_db_with_user

        async def override_get_db():
            yield mock_db

        async def override_get_db_with_user(psychologist=None):
            yield mock_db

        fake_psy = MagicMock(spec=Psychologist)
        fake_psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_psy.is_active = True

        async def override_current_user():
            return fake_psy

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_db_with_user] = override_get_db_with_user
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()


@pytest.fixture
def session_uuid():
    return uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


class TestDeleteDraftSession:
    @pytest.mark.asyncio
    async def test_returns_204_for_draft(self, app, mock_db, session_uuid):
        sess = MagicMock()
        sess.id = session_uuid
        sess.status = "draft"
        mock_db.execute.return_value = _result(scalar_one_or_none=sess)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 204
        mock_db.delete.assert_called_once_with(sess)
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_404_when_session_not_found(self, app, mock_db, session_uuid):
        mock_db.execute.return_value = _result(scalar_one_or_none=None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_409_when_session_confirmed(self, app, mock_db, session_uuid):
        sess = MagicMock()
        sess.id = session_uuid
        sess.status = "confirmed"
        mock_db.execute.return_value = _result(scalar_one_or_none=sess)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(f"/api/v1/sessions/{session_uuid}")

        assert response.status_code == 409
        mock_db.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_400_for_invalid_uuid(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete("/api/v1/sessions/not-a-uuid")

        assert response.status_code == 400
