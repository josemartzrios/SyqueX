import pytest
from httpx import AsyncClient, ASGITransport
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

_NOW = datetime(2026, 4, 21, 12, 0, 0, tzinfo=timezone.utc)

def _result(scalar_one_or_none=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar_one_or_none
    return r

@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
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
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer fake-token"}

@pytest.mark.asyncio
async def test_get_template_returns_null_when_none(client: AsyncClient, auth_headers, mock_db):
    mock_db.execute.return_value = _result(scalar_one_or_none=None)
    r = await client.get("/api/v1/template", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() is None

@pytest.mark.asyncio
async def test_post_template_creates_and_returns(client: AsyncClient, auth_headers, mock_db):
    payload = {"fields": [
        {"id": "f1", "label": "Estado afectivo", "type": "text", "options": [], "guiding_question": "", "order": 1}
    ]}
    
    # Mock for post (upsert)
    tmpl = MagicMock()
    tmpl.id = uuid.uuid4()
    tmpl.fields = payload["fields"]
    tmpl.created_at = _NOW
    tmpl.updated_at = _NOW
    mock_db.execute.return_value = _result(scalar_one_or_none=None)
    mock_db.refresh.side_effect = lambda x: setattr(x, 'id', tmpl.id) or setattr(x, 'created_at', _NOW) or setattr(x, 'updated_at', _NOW)

    r = await client.post("/api/v1/template", json=payload, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["fields"][0]["label"] == "Estado afectivo"

@pytest.mark.asyncio
async def test_get_template_returns_saved(client: AsyncClient, auth_headers, mock_db):
    fields = [{"id": "f1", "label": "Plan", "type": "text", "options": [], "guiding_question": "", "order": 1}]
    tmpl = MagicMock()
    tmpl.id = uuid.uuid4()
    tmpl.fields = fields
    tmpl.created_at = _NOW
    tmpl.updated_at = _NOW
    
    mock_db.execute.return_value = _result(scalar_one_or_none=tmpl)
    
    r = await client.get("/api/v1/template", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["fields"][0]["label"] == "Plan"
