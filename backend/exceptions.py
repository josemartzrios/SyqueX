from datetime import datetime, timezone

UTC = timezone.utc


class DomainError(Exception):
    """Base exception for all application domain errors."""
    http_status: int = 500

    def __init__(self, message: str, code: str = None, details: dict = None, http_status: int = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
        if http_status:
            self.http_status = http_status
        self.timestamp = datetime.now(UTC)


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


class SubscriptionExpired(DomainError):
    """Suscripción expirada o inactiva — requiere pago."""
    http_status = 402

    def __init__(self, message: str = "Suscripción inactiva. Activa tu plan para continuar."):
        super().__init__(message, code="SUBSCRIPTION_EXPIRED")
