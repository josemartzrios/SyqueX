from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente"
    ANTHROPIC_API_KEY: str = ""
    # CRÍTICO: cambiar en producción — mínimo 64 caracteres aleatorios
    SECRET_KEY: str = "dev_only_key_MUST_change_in_production_use_64_random_chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Orígenes permitidos separados por coma
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"  # development | staging | production

    # Clinical logic config
    MAX_DICTATION_LENGTH: int = 5000
    MAX_SESSIONS_CONTEXT: int = 6
    EMBEDDING_DIMENSIONS: int = 1024

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID: str = ""

    # Resend
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "hola@syquex.mx"

    # Internal cron key
    INTERNAL_API_KEY: str = "dev_internal_key_change_in_prod"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def get_allowed_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

settings = Settings()

class ClinicalNoteConfig:
    MAX_DICTATION_LENGTH: int = settings.MAX_DICTATION_LENGTH
    MAX_SESSIONS_CONTEXT: int = settings.MAX_SESSIONS_CONTEXT
    EMBEDDING_DIMENSIONS: int = settings.EMBEDDING_DIMENSIONS
