# backend/tests/test_calendar_ai.py
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, call, patch
from datetime import date, time
from api.calendar_ai import parse_availability, SlotProposal, _normalize_times


class TestParseAvailability:
    @pytest.mark.asyncio
    async def test_returns_slots_for_valid_text(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='[{"slot_date":"2026-05-18","start_time":"09:00","duration_minutes":60},{"slot_date":"2026-05-18","start_time":"10:00","duration_minutes":60}]')]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes de 9 a 10:40", "2026-05-15")

        assert len(result) == 2
        assert result[0].slot_date == date(2026, 5, 18)
        assert result[0].start_time == time(9, 0)
        assert result[0].duration_minutes == 60

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_claude_returns_empty(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="[]")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto sin fechas", "2026-05-15")

        assert result == []

    @pytest.mark.asyncio
    async def test_parses_json_wrapped_in_markdown_code_fence(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='```json\n[{"slot_date":"2026-05-18","start_time":"07:00","duration_minutes":60}]\n```')]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes de 7 a 8", "2026-05-15")

        assert len(result) == 1
        assert result[0].start_time == time(7, 0)

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_invalid_json(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="No puedo determinar las fechas")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto ambiguo", "2026-05-15")

        assert result == []

    @pytest.mark.asyncio
    async def test_lunes_a_viernes_uses_max_tokens_4096(self):
        # "Lunes a viernes de 8 a 2" generates 120 slots (20 days × 6 slots).
        # With max_tokens=1024 the JSON would be truncated → JSONDecodeError → [].
        # This test verifies max_tokens is high enough and that normalization runs.
        slots_json = json.dumps([
            {"slot_date": f"2026-05-{19 + i}", "start_time": "08:00", "duration_minutes": 60}
            for i in range(5)
        ])
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=slots_json)]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes a viernes de 8 a 2", "2026-05-19")

        create_call = instance.messages.create.call_args
        assert create_call.kwargs["max_tokens"] >= 4096, (
            "max_tokens must be >=4096 — 'lunes a viernes' generates ~120 slots (~2800 tokens)"
        )
        # _normalize_times must have converted "8 a 2" → "8 a 14" in the user message
        user_content = create_call.kwargs["messages"][0]["content"]
        assert "8 a 14" in user_content, f"Expected '8 a 14' after normalization, got: {user_content!r}"
        assert len(result) == 5

    def test_normalize_times_converts_end_hour_to_pm(self):
        assert _normalize_times("lunes a viernes de 8 a 2") == "lunes a viernes de 8 a 14"
        assert _normalize_times("miércoles de 7 a 4") == "miércoles de 7 a 16"
        assert _normalize_times("de 9 a 3") == "de 9 a 15"

    def test_normalize_times_leaves_unambiguous_ranges(self):
        assert _normalize_times("de 9 a 14") == "de 9 a 14"  # end >= start, no change
        assert _normalize_times("de 8 a 12") == "de 8 a 12"  # end >= start, no change
        assert _normalize_times("lunes a viernes") == "lunes a viernes"  # no digits
