from datetime import datetime


class DomainError(Exception):
    """Base exception for all application domain errors."""
    http_status: int = 500

    def __init__(self, message: str, code: str = None, details: dict = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
        self.timestamp = datetime.utcnow()


class DictationTooLongError(DomainError):
    http_status = 400


class PromptInjectionError(DomainError):
    http_status = 400


class UnauthorizedAccessError(DomainError):
    http_status = 403


class PatientNotFoundError(DomainError):
    http_status = 404


class SessionNotFoundError(DomainError):
    http_status = 404


class InvalidUUIDError(DomainError):
    http_status = 400


class LLMServiceError(DomainError):
    """Raised when the LLM provider (Anthropic) call fails unrecoverably."""
    http_status = 502


class EmbeddingServiceError(DomainError):
    """Raised when the embedding provider (FastEmbed) is misconfigured or unavailable."""
    http_status = 502


class DatabaseError(DomainError):
    http_status = 500
