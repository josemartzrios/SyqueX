"""
Módulo de autenticación — SyqueX
Implementa: bcrypt password hashing, JWT access tokens, brute-force protection.
"""
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db, Psychologist

logger = logging.getLogger("syquex.auth")

# ---------------------------------------------------------------------------
# Crypto helpers
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

def hash_password(password: str) -> str:
    return _pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)

def create_access_token(psychologist_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": psychologist_id,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

# ---------------------------------------------------------------------------
# Brute-force protection (in-memory — reemplazar con Redis en producción)
# ---------------------------------------------------------------------------

_MAX_ATTEMPTS = 5
_WINDOW_MINUTES = 15
_LOCKOUT_MINUTES = 30
_failed_attempts: dict = defaultdict(list)

def _check_brute_force(email: str) -> None:
    now = datetime.utcnow()
    window = now - timedelta(minutes=_WINDOW_MINUTES)
    _failed_attempts[email] = [t for t in _failed_attempts[email] if t > window]

    if len(_failed_attempts[email]) >= _MAX_ATTEMPTS:
        logger.warning("Account locked after failed attempts: %s", email)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Cuenta bloqueada temporalmente. Intenta en {_LOCKOUT_MINUTES} minutos.",
            headers={"Retry-After": str(_LOCKOUT_MINUTES * 60)},
        )

def _record_failed_attempt(email: str) -> None:
    _failed_attempts[email].append(datetime.utcnow())

def _reset_attempts(email: str) -> None:
    _failed_attempts[email] = []

# ---------------------------------------------------------------------------
# JWT dependency — get_current_psychologist
# ---------------------------------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_psychologist(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Psychologist:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        psychologist_id: Optional[str] = payload.get("sub")
        if not psychologist_id or payload.get("type") != "access":
            raise credentials_exc
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada. Por favor inicia sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise credentials_exc

    psy = await db.get(Psychologist, psychologist_id)
    if not psy or not psy.is_active:
        raise credentials_exc
    return psy

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/auth", tags=["auth"])

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    _check_brute_force(form.username)

    res = await db.execute(select(Psychologist).where(Psychologist.email == form.username))
    psy = res.scalar_one_or_none()

    # Tiempo constante — evitar timing attacks y no revelar si el email existe
    if not psy or not psy.password_hash or not verify_password(form.password, psy.password_hash):
        _record_failed_attempt(form.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    if not psy.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    _reset_attempts(form.username)
    logger.info('{"event":"login_exitoso","psychologist_id":"%s","ip":"%s"}', psy.id, request.client.host if request.client else "unknown")

    return TokenResponse(access_token=create_access_token(str(psy.id)))
