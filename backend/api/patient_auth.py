from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone

from database import get_db, PatientUser
from config import settings
import jwt

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_patient_access_token(patient_user: PatientUser) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(patient_user.id),
        "patient_id": str(patient_user.patient_id),
        "role": "patient",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class PatientLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/accept-invite")
async def accept_invite(req: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PatientUser).where(PatientUser.invite_token == req.token))
    patient_user = result.scalar_one_or_none()

    if not patient_user:
        raise HTTPException(status_code=400, detail="Token inválido o expirado.")

    now = datetime.now(timezone.utc)
    if patient_user.invite_token_expires_at and now > patient_user.invite_token_expires_at:
        raise HTTPException(status_code=400, detail="El token ha expirado.")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

    patient_user.password_hash = hash_password(req.password)
    patient_user.invite_token = None
    patient_user.invite_token_expires_at = None
    patient_user.accepted_at = now
    patient_user.is_active = True

    await db.commit()

    # Create JWT
    access_token = create_patient_access_token(patient_user)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "patient",
        "patient_id": str(patient_user.patient_id)
    }


@router.post("/login")
async def patient_login(req: PatientLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PatientUser).where(PatientUser.email == req.email))
    patient_user = result.scalar_one_or_none()

    if not patient_user or not patient_user.password_hash or not verify_password(req.password, patient_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email o contraseña incorrectos.")

    if not patient_user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta inactiva.")

    # Create JWT
    access_token = create_patient_access_token(patient_user)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "patient",
        "patient_id": str(patient_user.patient_id)
    }
