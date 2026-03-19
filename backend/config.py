from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    SECRET_KEY: str = "super_secret_dev_key_change_in_prod"
    ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"
    
    # Clinical logic config config
    MAX_DICTATION_LENGTH: int = 5000
    MAX_SESSIONS_CONTEXT: int = 6
    EMBEDDING_DIMENSIONS: int = 1536

    class Config:
        env_file = ".env"

settings = Settings()

class ClinicalNoteConfig:
    MAX_DICTATION_LENGTH: int = settings.MAX_DICTATION_LENGTH
    MAX_SESSIONS_CONTEXT: int = settings.MAX_SESSIONS_CONTEXT
    EMBEDDING_DIMENSIONS: int = settings.EMBEDDING_DIMENSIONS
