import logging
from cryptography.fernet import Fernet, InvalidToken
from config import settings

logger = logging.getLogger(__name__)

# v1: es el prefijo inicial. Al rotar, los nuevos datos se escribirán con v2:.
# Mapeo: v1: → ENCRYPTION_KEY_V1 (si existe) else ENCRYPTION_KEY
#        v2: → ENCRYPTION_KEY (llave activa tras rotación)
_CURRENT_PREFIX = "v1:"
_V1_PREFIX = "v1:"
_V2_PREFIX = "v2:"


class DecryptionError(Exception):
    pass


def _get_fernet(prefix: str) -> Fernet:
    if prefix == _V2_PREFIX:
        return Fernet(settings.ENCRYPTION_KEY.encode())
    if prefix == _V1_PREFIX:
        key = getattr(settings, "ENCRYPTION_KEY_V1", "") or getattr(settings, "ENCRYPTION_KEY", "")
        return Fernet(key.encode() if key else b"")
    raise DecryptionError(f"Prefijo de versión desconocido: {prefix!r}")


def encrypt(plaintext: str) -> str:
    f = Fernet(settings.ENCRYPTION_KEY.encode())
    token = f.encrypt(plaintext.encode()).decode()
    return f"{_CURRENT_PREFIX}{token}"


def decrypt(ciphertext: str) -> str:
    for prefix in (_V1_PREFIX, _V2_PREFIX):
        if ciphertext.startswith(prefix):
            token = ciphertext[len(prefix):]
            try:
                f = _get_fernet(prefix)
                return f.decrypt(token.encode()).decode()
            except InvalidToken as e:
                raise DecryptionError(f"No se pudo descifrar el token: {e}") from e
    raise DecryptionError(f"Prefijo de versión desconocido en: {ciphertext[:10]!r}")


def encrypt_if_set(value: str | None) -> str | None:
    if value is None:
        return None
    return encrypt(value)


def decrypt_if_set(value: str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str) and (value.startswith(_V1_PREFIX) or value.startswith(_V2_PREFIX)):
        return decrypt(value)
    return value  # valor legacy sin cifrar o ya descifrado — retornar tal cual


def validate_key() -> None:
    key = getattr(settings, "ENCRYPTION_KEY", None)
    if not key:
        logger.critical("ENCRYPTION_KEY ausente — configura la variable de entorno en Railway")
        raise SystemExit(1)
    try:
        Fernet(key.encode())
    except Exception:
        logger.critical("ENCRYPTION_KEY inválida — debe ser una llave Fernet base64 de 32 bytes")
        raise SystemExit(1)
