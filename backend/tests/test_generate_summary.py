import pytest
from unittest.mock import AsyncMock, MagicMock, patch

SOAP_NOTE = {
    "format": "SOAP",
    "subjective": "Paciente refiere ansiedad ante conflictos con pareja.",
    "objective": "Afecto ansioso moderado. Colaboradora durante sesión.",
    "assessment": "Pensamiento catastrófico ante situaciones ambiguas.",
    "plan": "Registro de pensamientos automáticos. Próxima sesión martes 20 de mayo.",
}

CUSTOM_NOTE = {
    "format": "custom",
    "custom_fields": {"Motivo": "Ansiedad", "Intervención": "TCC", "Tarea": "Diario emocional"},
}

EXPECTED_KEYS = {"topics_worked", "homework", "next_session_date"}

@pytest.mark.asyncio
async def test_generate_summary_soap_returns_three_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text='{"topics_worked": "Identificamos pensamientos automáticos.", "homework": "Registrar 3 momentos de ansiedad.", "next_session_date": "2025-05-20"}')]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        result = await generate_patient_summary(SOAP_NOTE)

    assert set(result.keys()) == EXPECTED_KEYS
    assert result["topics_worked"] != ""
    assert result["next_session_date"] == "2025-05-20"


@pytest.mark.asyncio
async def test_generate_summary_custom_returns_three_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text='{"topics_worked": "Trabajamos emociones.", "homework": "Diario emocional.", "next_session_date": null}')]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        result = await generate_patient_summary(CUSTOM_NOTE)

    assert set(result.keys()) == EXPECTED_KEYS
    assert result["next_session_date"] is None


@pytest.mark.asyncio
async def test_generate_summary_invalid_json_raises():
    """Invalid JSON from Claude propagates as JSONDecodeError (caller handles 500)."""
    import json
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text="No puedo procesar esto.")]

    with patch("agent.agent.AsyncAnthropic") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        from agent.agent import generate_patient_summary
        with pytest.raises(json.JSONDecodeError):
            await generate_patient_summary(SOAP_NOTE)
