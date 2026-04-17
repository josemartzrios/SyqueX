from pydantic_settings import BaseSettings
from pydantic import model_validator
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

    @model_validator(mode='after')
    def _validate_production_secrets(self):
        """Fail-fast: impedir arranque sin secretos reales en prod/staging."""
        if self.ENVIRONMENT in ("production", "staging"):
            _default_key = "dev_only_key_MUST_change_in_production_use_64_random_chars"
            if self.SECRET_KEY == _default_key or len(self.SECRET_KEY) < 64:
                raise ValueError(
                    "CRITICAL: SECRET_KEY must be a random string of 64+ characters in production"
                )
            if not self.ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY is required in production")
            if not self.STRIPE_SECRET_KEY:
                raise ValueError("STRIPE_SECRET_KEY is required in production")
            if not self.STRIPE_WEBHOOK_SECRET:
                raise ValueError("STRIPE_WEBHOOK_SECRET is required in production")
            _default_internal = "dev_internal_key_change_in_prod"
            if self.INTERNAL_API_KEY == _default_internal:
                raise ValueError("INTERNAL_API_KEY must be changed in production")
        return self

settings = Settings()

class ClinicalNoteConfig:
    MAX_DICTATION_LENGTH: int = settings.MAX_DICTATION_LENGTH
    MAX_SESSIONS_CONTEXT: int = settings.MAX_SESSIONS_CONTEXT
    EMBEDDING_DIMENSIONS: int = settings.EMBEDDING_DIMENSIONS
