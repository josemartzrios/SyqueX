import json
import logging
from datetime import date, time
from typing import List
from pydantic import BaseModel, field_validator
from anthropic import AsyncAnthropic
from config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Eres un asistente de agenda para psicólogos. Cuando el psicólogo describe su disponibilidad en texto libre en español, extrae los días y horarios y genera slots de citas de 60 minutos consecutivos.

Devuelve ÚNICAMENTE un array JSON con objetos de la forma:
[{"slot_date": "YYYY-MM-DD", "start_time": "HH:MM", "duration_minutes": 60}, ...]

Reglas:
- Genera citas de 60 minutos que comiencen consecutivamente dentro de cada rango horario indicado
- Resuelve fechas relativas ("mañana", "el lunes", "esta semana") usando la fecha de referencia dada
- Para rangos o listas de días de la semana sin fecha específica: genera slots para las PRÓXIMAS 4 SEMANAS a partir de la fecha de referencia, incluyendo todos los días mencionados en ese período
- Los rangos de días son inclusivos en toda la semana: "lunes a sábado" incluye lunes, martes, miércoles, jueves, viernes y sábado; "lunes a domingo" incluye los 7 días
- Sábado y domingo son días completamente válidos — respeta exactamente los días que el psicólogo indique, sin excluir ningún día de la semana
- Si el texto especifica "esta semana" genera solo esa semana; si dice "la próxima semana" genera solo esa semana
- Si el texto no contiene días u horas identificables, devuelve []
- Devuelve SOLO el array JSON, sin texto adicional ni explicaciones

Ejemplos:
- "lunes a viernes de 9 a 2" → slots 09:00–13:00 para cada lunes-viernes de las próximas 4 semanas
- "lunes a sábado de 8 a 2" → slots 08:00–13:00 para cada lunes, martes, miércoles, jueves, viernes y sábado de las próximas 4 semanas
- "sábados de 9 a 1" → slots 09:00, 10:00, 11:00, 12:00 para cada sábado de las próximas 4 semanas
- "martes y jueves de 3 a 5pm" → slots 15:00, 16:00 para cada martes y jueves de las próximas 4 semanas
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
    user_message = f"Hoy es {reference_date}.\nDisponibilidad: \"{text}\""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
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
