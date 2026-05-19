import json
import logging
import re
from datetime import date, time
from typing import List
from pydantic import BaseModel, field_validator
from anthropic import AsyncAnthropic
from config import settings

logger = logging.getLogger(__name__)

# Matches "X a Y" where both are bare numbers (no am/pm attached).
# Used to detect ambiguous time ranges before sending to Claude.
_TIME_RANGE_RE = re.compile(
    r'(?<!\d)(\d{1,2})(?!\s*[aApP][mM])\s+a\s+(\d{1,2})(?!\s*[aApP][mM])'
)


def _normalize_times(text: str) -> str:
    """
    Pre-process ambiguous time ranges deterministically before sending to Claude.

    When end_hour < start_hour with no am/pm (e.g. "8 a 4", "9 a 3"), the end
    is always PM in a clinical scheduling context. Convert to 24h so Claude has
    no room for misinterpretation: "8 a 4" → "8 a 16".

    Also converts explicit am/pm suffixes to 24h: "7am" → "7", "4pm" → "16".
    Leaves alone: "lunes a viernes" (no digits), "9 a 14" (end >= start),
    "8 a 4pm" / "7am a 4" (already has am/pm marker).
    """
    def _replace(m: re.Match) -> str:
        start, end = int(m.group(1)), int(m.group(2))
        if end < start and 1 <= end <= 11:
            return f"{m.group(1)} a {end + 12}"
        return m.group(0)

    normalized = _TIME_RANGE_RE.sub(_replace, text)

    # Convert "Xam"/"Xpm" suffixes to bare 24h numbers
    def _ampm(m: re.Match) -> str:
        h = int(m.group(1))
        suffix = m.group(2).lower()
        if suffix == "pm" and h != 12:
            h += 12
        elif suffix == "am" and h == 12:
            h = 0
        return str(h)

    normalized = re.sub(r'(\d{1,2})\s*([aApP][mM])', _ampm, normalized)

    if normalized != text:
        logger.debug("_normalize_times: %r → %r", text, normalized)
    return normalized

_SYSTEM_PROMPT = """Eres un asistente de agenda para psicólogos. Cuando el psicólogo describe su disponibilidad en texto libre en español, extrae los días y horarios y genera slots de citas de 60 minutos consecutivos.

Devuelve ÚNICAMENTE un array JSON con objetos de la forma:
[{"slot_date": "YYYY-MM-DD", "start_time": "HH:MM", "duration_minutes": 60}, ...]

Reglas:
- Genera citas de 60 minutos que comiencen consecutivamente dentro de cada rango horario indicado
- Ignora frases de intención conversacional ("quiero agendar", "necesito", "quisiera", "me gustaría", etc.) — extrae solo la información de días y horarios que contenga el texto
- Resuelve fechas relativas ("mañana", "el lunes", "esta semana") usando la fecha de referencia dada
- Para rangos o listas de días de la semana sin fecha específica: genera slots para las PRÓXIMAS 4 SEMANAS a partir de la fecha de referencia, incluyendo todos los días mencionados en ese período
- Los rangos de días son inclusivos en toda la semana: "lunes a sábado" incluye lunes, martes, miércoles, jueves, viernes y sábado; "lunes a domingo" incluye los 7 días
- Sábado y domingo son días completamente válidos — respeta exactamente los días que el psicólogo indique, sin excluir ningún día de la semana
- Si el texto dice "esta semana" o "la próxima semana" SIN especificar días concretos, asume lunes a viernes de esa semana
- Si el texto dice "esta semana" o "la próxima semana" CON días específicos, genera slots solo para esos días dentro de esa semana
- Formato de hora: "7am" = 07:00, "4pm" = 16:00, "12pm" = 12:00, "12am" = 00:00. La "a" entre horas es el conector español "hasta": "7am a 4pm" = desde 07:00 hasta 16:00
- Cuando NO hay am/pm y el número final < número inicial (ej. "7 a 4", "8 a 3"), el número final siempre es PM: "7 a 4" = 07:00 a 16:00, "8 a 3" = 08:00 a 15:00. Cuando el número final >= número inicial sin am/pm (ej. "9 a 14"), se usan tal cual en 24h
- Solo devuelve [] si el texto realmente no contiene ninguna información de horario (ni días ni horas)
- Devuelve SOLO el array JSON, sin texto adicional ni explicaciones

Ejemplos:
- "lunes a viernes de 9 a 2" → slots 09:00–13:00 para cada lunes-viernes de las próximas 4 semanas
- "de martes a viernes de 7am a 4pm" → slots 07:00–15:00 (9 slots) para cada martes-viernes de las próximas 4 semanas
- "quiero agendar esta semana, de 9 a 3" → slots 09:00, 10:00, 11:00, 12:00, 13:00, 14:00 para cada lunes-viernes de la semana actual (3 < 9 → 3pm = 15:00, último slot a las 14:00)
- "miércoles de 7 a 4" → slots 07:00, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00 para cada miércoles de las próximas 4 semanas (4 < 7 → 4pm = 16:00)
- "esta semana de 8 a 12" → slots 08:00, 09:00, 10:00, 11:00 para lunes-viernes de la semana actual
- "lunes a sábado de 8 a 2" → slots 08:00–13:00 para cada lunes, martes, miércoles, jueves, viernes y sábado de las próximas 4 semanas
- "sábados de 9 a 1" → slots 09:00, 10:00, 11:00, 12:00 para cada sábado de las próximas 4 semanas
- "martes y jueves de 3 a 5pm" → slots 15:00, 16:00 para cada martes y jueves de las próximas 4 semanas
- "lunes de 8am a 1pm" → slots 08:00, 09:00, 10:00, 11:00, 12:00 para cada lunes de las próximas 4 semanas
- "mañana de 10 a 12" → slots 10:00, 11:00 solo para el día siguiente a la fecha de referencia"""


class SlotProposal(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int = 60

    @field_validator("start_time", mode="before")
    @classmethod
    def parse_time(cls, v):
        if isinstance(v, str):
            h, m = v.split(":")
            return time(int(h), int(m))
        return v


async def parse_availability(text: str, reference_date: str) -> List[SlotProposal]:
    """Llama a Claude para extraer slots de disponibilidad desde texto libre."""
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    normalized = _normalize_times(text)
    user_message = f"Hoy es {reference_date}.\nDisponibilidad: \"{normalized}\""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        logger.debug("parse_availability raw Claude response: %r", raw)
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        slots_data = json.loads(raw)
        if not isinstance(slots_data, list):
            logger.warning("parse_availability: Claude returned non-list type=%s raw=%r", type(slots_data).__name__, raw)
            return []
        if not slots_data:
            logger.warning("parse_availability: Claude returned empty list for input=%r", text)
        return [SlotProposal(**s) for s in slots_data]
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning("parse_availability could not parse Claude response: %s | raw=%r", e, locals().get("raw", "<no raw>"))
        return []
    except Exception as e:
        logger.error("parse_availability unexpected error: %s", e, exc_info=True)
        return []
