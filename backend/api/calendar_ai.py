import json
import logging
from datetime import date, time
from typing import List
from pydantic import BaseModel, field_validator
from anthropic import AsyncAnthropic
from config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Eres un asistente de agenda para psicólogos. Cuando el psicólogo describe su disponibilidad en texto libre en español, extrae los días y horarios y genera slots de citas de 50 minutos consecutivos.

Devuelve ÚNICAMENTE un array JSON con objetos de la forma:
[{"slot_date": "YYYY-MM-DD", "start_time": "HH:MM", "duration_minutes": 50}, ...]

Reglas:
- Genera citas de 50 minutos que comiencen consecutivamente dentro de cada rango horario indicado
- Resuelve fechas relativas ("mañana", "el lunes", "esta semana") usando la fecha de hoy
- Si el texto no contiene fechas u horas identificables, devuelve []
- Devuelve SOLO el array JSON, sin texto adicional ni explicaciones"""


class SlotProposal(BaseModel):
    slot_date: date
    start_time: time
    duration_minutes: int = 50

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
    user_message = f"Hoy es {reference_date}.\nDisponibilidad: \"{text}\""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        slots_data = json.loads(raw)
        if not isinstance(slots_data, list):
            return []
        return [SlotProposal(**s) for s in slots_data]
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning("parse_availability could not parse Claude response: %s", e)
        return []
    except Exception as e:
        logger.error("parse_availability unexpected error: %s", e)
        return []
