"""
Unit tests for application configuration (config.py).
"""
import pytest
from unittest.mock import patch
from config import Settings, ClinicalNoteConfig


class TestSettings:
    def test_default_max_dictation_length(self):
        s = Settings()
        assert s.MAX_DICTATION_LENGTH == 5000

    def test_default_max_sessions_context(self):
        s = Settings()
        assert s.MAX_SESSIONS_CONTEXT == 6

    def test_default_embedding_dimensions(self):
        s = Settings()
        assert s.EMBEDDING_DIMENSIONS == 1024

    def test_default_environment_is_development(self):
        s = Settings()
        assert s.ENVIRONMENT == "development"

    def test_is_production_returns_false_in_development(self):
        s = Settings(ENVIRONMENT="development")
        assert s.is_production() is False

    def test_is_production_returns_false_in_staging(self):
        s = Settings(ENVIRONMENT="staging")
        assert s.is_production() is False

    def test_is_production_returns_true_in_production(self):
        s = Settings(ENVIRONMENT="production")
        assert s.is_production() is True

    def test_get_allowed_origins_single(self):
        s = Settings(ALLOWED_ORIGINS="http://localhost:5173")
        origins = s.get_allowed_origins()
        assert origins == ["http://localhost:5173"]

    def test_get_allowed_origins_multiple(self):
        s = Settings(ALLOWED_ORIGINS="http://localhost:5173,https://syquex.vercel.app")
        origins = s.get_allowed_origins()
        assert len(origins) == 2
        assert "http://localhost:5173" in origins
        assert "https://syquex.vercel.app" in origins

    def test_get_allowed_origins_strips_spaces(self):
        s = Settings(ALLOWED_ORIGINS="http://localhost:5173 , https://example.com")
        origins = s.get_allowed_origins()
        assert "http://localhost:5173" in origins
        assert "https://example.com" in origins

    def test_get_allowed_origins_skips_empty_entries(self):
        s = Settings(ALLOWED_ORIGINS="http://localhost:5173,,https://example.com")
        origins = s.get_allowed_origins()
        assert len(origins) == 2

    def test_algorithm_default(self):
        s = Settings()
        assert s.ALGORITHM == "HS256"

    def test_access_token_expire_default(self):
        s = Settings()
        assert s.ACCESS_TOKEN_EXPIRE_MINUTES == 30

    def test_refresh_token_expire_default(self):
        s = Settings()
        assert s.REFRESH_TOKEN_EXPIRE_DAYS == 7


class TestClinicalNoteConfig:
    def test_max_dictation_length_mirrors_settings(self):
        from config import settings
        assert ClinicalNoteConfig.MAX_DICTATION_LENGTH == settings.MAX_DICTATION_LENGTH

    def test_max_sessions_context_mirrors_settings(self):
        from config import settings
        assert ClinicalNoteConfig.MAX_SESSIONS_CONTEXT == settings.MAX_SESSIONS_CONTEXT

    def test_embedding_dimensions_mirrors_settings(self):
        from config import settings
        assert ClinicalNoteConfig.EMBEDDING_DIMENSIONS == settings.EMBEDDING_DIMENSIONS

    def test_max_dictation_length_is_positive(self):
        assert ClinicalNoteConfig.MAX_DICTATION_LENGTH > 0

    def test_max_sessions_context_is_positive(self):
        assert ClinicalNoteConfig.MAX_SESSIONS_CONTEXT > 0

    def test_embedding_dimensions_is_1024(self):
        # BAAI/bge-m3 uses 1024 dimensions
        assert ClinicalNoteConfig.EMBEDDING_DIMENSIONS == 1024
