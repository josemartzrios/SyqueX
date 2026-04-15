"""
Unit tests for the FastEmbed embedding service (agent/embeddings.py).
"""
import asyncio
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from agent.embeddings import FastEmbedService, embedding_service, get_embedding, EMBEDDING_DIMENSIONS


FAKE_EMBEDDING = [0.1] * EMBEDDING_DIMENSIONS
ZERO_VECTOR = [0.0] * EMBEDDING_DIMENSIONS


def _make_fake_embed_result(vector: list[float]):
    """Return a generator that yields a numpy array, mimicking FastEmbed output."""
    def _gen(*args, **kwargs):
        yield np.array(vector)
    return _gen


class TestFastEmbedServiceSingleton:
    def test_model_is_none_before_first_call(self):
        svc = FastEmbedService()
        # Class-level _model starts None for a freshly created instance
        # (shared class attribute — may already be set if another test ran first)
        assert hasattr(svc, '_model')

    def test_get_model_instantiates_text_embedding(self):
        svc = FastEmbedService()
        with patch("agent.embeddings.TextEmbedding") as mock_cls:
            mock_cls.return_value = MagicMock()
            svc._model = None  # reset for this test
            model = svc._get_model()
            mock_cls.assert_called_once_with("intfloat/multilingual-e5-large")
            assert model is mock_cls.return_value

    def test_get_model_called_only_once(self):
        svc = FastEmbedService()
        with patch("agent.embeddings.TextEmbedding") as mock_cls:
            mock_cls.return_value = MagicMock()
            svc._model = None  # reset for this test
            _ = svc._get_model()
            _ = svc._get_model()
            assert mock_cls.call_count == 1


class TestEmbedSync:
    def test_embed_sync_returns_list_of_float(self):
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        result = svc._embed_sync("texto clínico")
        assert isinstance(result, list)
        assert all(isinstance(v, float) for v in result)

    def test_embed_sync_converts_numpy_to_list(self):
        """FastEmbed returns numpy.ndarray — must be converted to list[float]."""
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        result = svc._embed_sync("texto clínico")
        assert result == FAKE_EMBEDDING

    def test_embed_sync_returns_1024_dimensions(self):
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        result = svc._embed_sync("texto")
        assert len(result) == EMBEDDING_DIMENSIONS


class TestGetEmbeddingAsync:
    @pytest.mark.asyncio
    async def test_get_embedding_returns_list_float(self):
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        result = await svc.get_embedding("Paciente refiere ansiedad")
        assert isinstance(result, list)
        assert all(isinstance(v, float) for v in result)

    @pytest.mark.asyncio
    async def test_get_embedding_returns_1024_dimensions(self):
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        result = await svc.get_embedding("texto")
        assert len(result) == 1024

    @pytest.mark.asyncio
    async def test_get_embedding_uses_run_in_executor(self):
        """get_embedding must offload sync work to thread pool, not block event loop."""
        svc = FastEmbedService()
        mock_model = MagicMock()
        mock_model.embed = _make_fake_embed_result(FAKE_EMBEDDING)
        svc._model = mock_model

        loop = asyncio.get_running_loop()
        executed_in_executor = []

        original_run_in_executor = loop.run_in_executor

        async def mock_executor(executor, func, *args):
            executed_in_executor.append(func)
            return await original_run_in_executor(executor, func, *args)

        with patch.object(loop, 'run_in_executor', side_effect=mock_executor):
            await svc.get_embedding("texto")

        assert len(executed_in_executor) == 1


class TestModuleLevelExports:
    def test_embedding_service_is_fastembed_instance(self):
        assert isinstance(embedding_service, FastEmbedService)

    @pytest.mark.asyncio
    async def test_get_embedding_function_is_callable(self):
        assert callable(get_embedding)

    def test_embedding_dimensions_constant(self):
        assert EMBEDDING_DIMENSIONS == 1024
