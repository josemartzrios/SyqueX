"""
Unit tests for domain exceptions (exceptions.py).
"""
import pytest
from datetime import datetime
from exceptions import (
    DomainError,
    DictationTooLongError,
    PromptInjectionError,
    UnauthorizedAccessError,
    PatientNotFoundError,
    SessionNotFoundError,
    InvalidUUIDError,
    LLMServiceError,
    EmbeddingServiceError,
    DatabaseError,
)


class TestDomainError:
    def test_message_stored(self):
        err = DomainError("algo salió mal")
        assert err.message == "algo salió mal"
        assert str(err) == "algo salió mal"

    def test_default_code_is_class_name(self):
        err = DomainError("msg")
        assert err.code == "DomainError"

    def test_custom_code(self):
        err = DomainError("msg", code="CUSTOM_CODE")
        assert err.code == "CUSTOM_CODE"

    def test_default_details_empty_dict(self):
        err = DomainError("msg")
        assert err.details == {}

    def test_custom_details(self):
        err = DomainError("msg", details={"key": "value", "count": 3})
        assert err.details["key"] == "value"
        assert err.details["count"] == 3

    def test_timestamp_is_datetime(self):
        err = DomainError("msg")
        assert isinstance(err.timestamp, datetime)

    def test_default_http_status(self):
        assert DomainError.http_status == 500

    def test_is_exception(self):
        with pytest.raises(DomainError):
            raise DomainError("test")


class TestDictationTooLongError:
    def test_http_status_is_400(self):
        assert DictationTooLongError.http_status == 400

    def test_instantiation(self):
        err = DictationTooLongError(
            "Dictado muy largo",
            code="DICTATION_TOO_LONG",
            details={"max_length": 5000, "received": 6000},
        )
        assert err.http_status == 400
        assert err.code == "DICTATION_TOO_LONG"
        assert err.details["max_length"] == 5000
        assert err.details["received"] == 6000

    def test_inherits_domain_error(self):
        assert issubclass(DictationTooLongError, DomainError)


class TestPromptInjectionError:
    def test_http_status_is_400(self):
        assert PromptInjectionError.http_status == 400

    def test_instantiation(self):
        err = PromptInjectionError("Intento de inyección detectado", code="PROMPT_INJECTION")
        assert err.message == "Intento de inyección detectado"
        assert err.code == "PROMPT_INJECTION"

    def test_inherits_domain_error(self):
        assert issubclass(PromptInjectionError, DomainError)


class TestUnauthorizedAccessError:
    def test_http_status_is_403(self):
        assert UnauthorizedAccessError.http_status == 403

    def test_inherits_domain_error(self):
        assert issubclass(UnauthorizedAccessError, DomainError)


class TestPatientNotFoundError:
    def test_http_status_is_404(self):
        assert PatientNotFoundError.http_status == 404

    def test_instantiation(self):
        err = PatientNotFoundError(
            "Paciente no encontrado",
            code="PATIENT_NOT_FOUND",
            details={"patient_id": "abc-123"},
        )
        assert err.details["patient_id"] == "abc-123"

    def test_inherits_domain_error(self):
        assert issubclass(PatientNotFoundError, DomainError)


class TestSessionNotFoundError:
    def test_http_status_is_404(self):
        assert SessionNotFoundError.http_status == 404

    def test_inherits_domain_error(self):
        assert issubclass(SessionNotFoundError, DomainError)


class TestInvalidUUIDError:
    def test_http_status_is_400(self):
        assert InvalidUUIDError.http_status == 400

    def test_inherits_domain_error(self):
        assert issubclass(InvalidUUIDError, DomainError)


class TestLLMServiceError:
    def test_http_status_is_502(self):
        assert LLMServiceError.http_status == 502

    def test_inherits_domain_error(self):
        assert issubclass(LLMServiceError, DomainError)


class TestEmbeddingServiceError:
    def test_http_status_is_502(self):
        assert EmbeddingServiceError.http_status == 502

    def test_inherits_domain_error(self):
        assert issubclass(EmbeddingServiceError, DomainError)


class TestDatabaseError:
    def test_http_status_is_500(self):
        assert DatabaseError.http_status == 500

    def test_inherits_domain_error(self):
        assert issubclass(DatabaseError, DomainError)


@pytest.mark.parametrize("exc_class,expected_status", [
    (DomainError, 500),
    (DictationTooLongError, 400),
    (PromptInjectionError, 400),
    (UnauthorizedAccessError, 403),
    (PatientNotFoundError, 404),
    (SessionNotFoundError, 404),
    (InvalidUUIDError, 400),
    (LLMServiceError, 502),
    (EmbeddingServiceError, 502),
    (DatabaseError, 500),
])
def test_exception_http_status_mapping(exc_class, expected_status):
    assert exc_class.http_status == expected_status
