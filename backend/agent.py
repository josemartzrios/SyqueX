import json
import logging
from typing import List, Dict, Any
from anthropic import AsyncAnthropic
from config import settings, ClinicalNoteConfig
from tools import (
    AGENT_TOOLS,
    search_patient_history,
    detect_patterns_between_sessions,
    create_or_update_clinical_note,
    suggest_next_session
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres SyqueX, un asistente de IA clínico especializado en salud mental.
Tu principal tarea es ayudar a los psicólogos a organizar sus sesiones, analizar síntomas, y dialogar profesionalmente.

REGLAS FUNDAMENTALES Y DE SEGURIDAD (CRÍTICAS):
1. RESPUESTA EN TEXTO PLANO (CRÍTICO): Responde exclusivamente en texto plano. 
   ESTÁ TOTALMENTE PROHIBIDO usar formato Markdown. No uses asteriscos (**), almohadillas (#), guiones bajos (_), corchetes ([]) o cualquier otro símbolo de formato.
   Si necesitas resaltar algo o hacer una lista, utiliza saltos de línea simples.
2. Si el psicólogo te dicta una sesión, puedes devolverle el resumen organizado o resaltar lo más importante directamente en tu conversación clínica.
3. CONTROL DE LÍMITES (CRÍTICO): Si el usuario te hace peticiones fuera del ámbito clínico, psicológico o médico, DEBES NEGARTE rotundamente. Di exactamente: "Disculpa, pero como agente de salud SyqueX, no estoy capacitado para ayudarte con peticiones fuera del ámbito de la práctica de la psicología o psiquiatría."
"""

async def process_session(db, patient_id: str, raw_dictation: str, session_id: str, format_: str = "SOAP") -> dict:
    if len(raw_dictation) > ClinicalNoteConfig.MAX_DICTATION_LENGTH:
        raise ValueError("Dictation exceeds maximum allowed length.")
        
    messages = [{"role": "user", "content": raw_dictation}]

    try:
        anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages
        )

        reply_text = "\n".join([b.text for b in response.content if b.type == "text"])
        return {"text_fallback": reply_text}

    except Exception as e:
        logger.error(f"Error calling Anthropic API: {e}")
        return {"text_fallback": f"Error de red o API en SyqueX: {str(e)}"}
