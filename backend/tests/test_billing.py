"""Tests for billing endpoints: GET /status and POST /cancel."""
import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


def _result(sub=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = sub
    return r


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute.return_value = _result()
    return db


@pytest.fixture
def app(mock_db, monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())
    with patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db
        from api.auth import get_current_psychologist

        fake_psy = MagicMock()
        fake_psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_psy.is_active = True
        fake_psy.trial_ends_at = None
        fake_psy.stripe_customer_id = "cus_test"

        async def override_get_db():
            yield mock_db

        async def override_current_user():
            return fake_psy

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()


@pytest.fixture
def active_sub():
    sub = MagicMock()
    sub.status = "active"
    sub.stripe_subscription_id = "sub_test123"
    sub.cancel_at_period_end = False
    sub.canceled_at = None
    sub.current_period_end = datetime(2026, 6, 7, tzinfo=timezone.utc)
    return sub


class TestBillingStatusCancelAtPeriodEnd:
    @pytest.mark.asyncio
    async def test_active_status_includes_cancel_at_period_end_false(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/billing/status")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is False

    @pytest.mark.asyncio
    async def test_active_status_includes_cancel_at_period_end_true(self, app, mock_db, active_sub):
        active_sub.cancel_at_period_end = True
        mock_db.execute.return_value = _result(sub=active_sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/billing/status")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is True
