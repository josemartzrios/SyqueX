import pytest
from httpx import AsyncClient, ASGITransport
from main import app

@pytest.mark.asyncio
async def test_refresh_returns_new_access_token():
    """Con un refresh token válido en cookie, retorna nuevo access_token."""
    pass

@pytest.mark.asyncio
async def test_refresh_rejects_revoked_token():
    """Un token ya revocado retorna 401."""
    pass

@pytest.mark.asyncio
async def test_refresh_detects_token_reuse():
    """Presentar un token ya usado revoca todos los tokens del psicólogo."""
    pass

@pytest.mark.asyncio
async def test_logout_revokes_token():
    """Logout revoca el refresh token y limpia la cookie."""
    pass
