"""
Unit tests for the OpenAI embedding service (agent/embeddings.py).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from openai import AuthenticationError, PermissionDeniedError

from agent.embeddings import OpenAIEmbeddingService


ZERO_VECTOR = [0.0] * 1536
FAKE_EMBEDDING = [0.1] * 1536


def _make_openai_response(embedding: list[float]):
    """Build a mock OpenAI embeddings response object."""
    response = MagicMock()
    response.data = [MagicMock(embedding=embedding)]
    return response


def _make_auth_error():
    """Build an AuthenticationError-compatible mock."""
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.headers = {}
    return AuthenticationError(
        message="Invalid API Key",
        response=mock_response,
        body={"error": {"message": "Invalid API Key", "type": "invalid_request_error"}},
    )


class TestGetEmbeddingEmptyInput:
    @pytest.mark.asyncio
    async def test_empty_string_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        result = await svc.get_embedding("")
        assert result == ZERO_VECTOR

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        result = await svc.get_embedding("   ")
        assert result == ZERO_VECTOR

    @pytest.mark.asyncio
    async def test_none_like_empty_string_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        result = await svc.get_embedding("")
        assert len(result) == 1536
        assert all(v == 0.0 for v in result)


class TestGetEmbeddingSuccess:
    @pytest.mark.asyncio
    async def test_returns_embedding_from_api(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_make_openai_response(FAKE_EMBEDDING)
        )
        svc._openai_client = mock_client

        result = await svc.get_embedding("Paciente refiere ansiedad")
        assert result == FAKE_EMBEDDING

    @pytest.mark.asyncio
    async def test_calls_correct_model(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_make_openai_response(FAKE_EMBEDDING)
        )
        svc._openai_client = mock_client

        await svc.get_embedding("texto de prueba")
        call_kwargs = mock_client.embeddings.create.call_args.kwargs
        assert call_kwargs["model"] == "text-embedding-3-small"

    @pytest.mark.asyncio
    async def test_passes_text_as_input(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_make_openai_response(FAKE_EMBEDDING)
        )
        svc._openai_client = mock_client

        await svc.get_embedding("texto de prueba")
        call_kwargs = mock_client.embeddings.create.call_args.kwargs
        assert call_kwargs["input"] == "texto de prueba"

    @pytest.mark.asyncio
    async def test_returns_1536_dimensions(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_make_openai_response(FAKE_EMBEDDING)
        )
        svc._openai_client = mock_client

        result = await svc.get_embedding("texto")
        assert len(result) == 1536


class TestGetEmbeddingAuthErrors:
    @pytest.mark.asyncio
    async def test_authentication_error_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create.side_effect = _make_auth_error()
        svc._openai_client = mock_client

        result = await svc.get_embedding("texto")
        assert result == ZERO_VECTOR

    @pytest.mark.asyncio
    async def test_permission_denied_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.headers = {}
        mock_client.embeddings.create.side_effect = PermissionDeniedError(
            message="Permission denied",
            response=mock_response,
            body={"error": {"message": "Permission denied"}},
        )
        svc._openai_client = mock_client

        result = await svc.get_embedding("texto")
        assert result == ZERO_VECTOR

    @pytest.mark.asyncio
    async def test_auth_error_does_not_raise(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create.side_effect = _make_auth_error()
        svc._openai_client = mock_client

        # Should NOT raise — must degrade gracefully
        result = await svc.get_embedding("texto")
        assert isinstance(result, list)


class TestGetEmbeddingTransientErrors:
    @pytest.mark.asyncio
    async def test_generic_exception_returns_zero_vector(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create.side_effect = Exception("network timeout")
        svc._openai_client = mock_client

        result = await svc.get_embedding("texto")
        assert result == ZERO_VECTOR

    @pytest.mark.asyncio
    async def test_transient_error_does_not_raise(self):
        svc = OpenAIEmbeddingService()
        mock_client = AsyncMock()
        mock_client.embeddings.create.side_effect = ConnectionError("timeout")
        svc._openai_client = mock_client

        result = await svc.get_embedding("texto")
        assert isinstance(result, list)
        assert len(result) == 1536


class TestClientLazyInitialization:
    def test_client_is_none_on_init(self):
        svc = OpenAIEmbeddingService()
        assert svc._openai_client is None

    @patch("agent.embeddings.settings")
    def test_client_created_on_first_access(self, mock_settings):
        mock_settings.OPENAI_API_KEY = "test-key"
        svc = OpenAIEmbeddingService()
        with patch("agent.embeddings.AsyncOpenAI") as mock_openai_cls:
            mock_openai_cls.return_value = MagicMock()
            _ = svc.openai_client
            mock_openai_cls.assert_called_once_with(api_key="test-key")

    @patch("agent.embeddings.settings")
    def test_client_not_recreated_on_second_access(self, mock_settings):
        mock_settings.OPENAI_API_KEY = "test-key"
        svc = OpenAIEmbeddingService()
        with patch("agent.embeddings.AsyncOpenAI") as mock_openai_cls:
            mock_openai_cls.return_value = MagicMock()
            _ = svc.openai_client
            _ = svc.openai_client
            # Created only once
            assert mock_openai_cls.call_count == 1


class TestModuleLevelExports:
    def test_module_exports_get_embedding_function(self):
        from agent.embeddings import get_embedding
        assert callable(get_embedding)

    def test_module_exports_embedding_service_instance(self):
        from agent.embeddings import embedding_service
        assert isinstance(embedding_service, OpenAIEmbeddingService)
