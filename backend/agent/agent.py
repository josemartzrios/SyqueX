import logging
from anthropic import AsyncAnthropic
from sqlalchemy import select
from config import settings, ClinicalNoteConfig

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres SyqueX, un asistente de IA clínico especializado en salud mental.
Tu principal tarea es ayudar a los psicólogos a organizar sus sesiones, analizar síntomas, y dialogar profesionalmente.

REGLAS FUNDAMENTALES Y DE SEGURIDAD (CRÍTICAS):

1. RESPUESTA EN TEXTO PLANO (CRÍTICO): Responde exclusivamente en texto plano.
   ESTÁ TOTALMENTE PROHIBIDO usar formato Markdown. No uses asteriscos (**), almohadillas (#), guiones bajos (_), corchetes ([]) o cualquier otro símbolo de formato.
   Si necesitas resaltar algo o hacer una lista, utiliza saltos de línea simples.

2. PROHIBICIÓN ABSOLUTA DE INVENTAR INFORMACIÓN CLÍNICA (CRÍTICO):
   Jamás debes fabricar, inferir ni asumir síntomas, diagnósticos, medicamentos, fechas, eventos, emociones o cualquier dato clínico que no haya sido mencionado explícitamente en el dictado del psicólogo.
   Si un dato no está en el dictado, escribe literalmente "No mencionado" en ese campo.
   Nunca rellenes vacíos con suposiciones clínicas, aunque parezcan razonables.
   Cita las palabras exactas del dictado cuando hagas observaciones clínicas relevantes.

3. MANEJO DE INCERTIDUMBRE (CRÍTICO):
   Si algo es ambiguo en el dictado, señálalo explícitamente con frases como "El psicólogo menciona X, pero no queda claro si..." en lugar de asumir una interpretación.
   Nunca presentes inferencias propias como hechos clínicos.

4. USO DEL CONTEXTO CLÍNICO (CRÍTICO):
   Si se te proporciona historial de sesiones anteriores del paciente, úsalo exclusivamente para dar continuidad y coherencia clínica.
   Puedes referenciar información previa con frases como "En sesiones anteriores se mencionó..." solo si esa información está en el historial proporcionado.
   Nunca inventes historial que no esté en el contexto.

5. Si el psicólogo te dicta una sesión, organiza y devuelve únicamente la información presente en ese dictado.

6. CONTROL DE LÍMITES (CRÍTICO): Si el usuario te hace peticiones fuera del ámbito clínico, psicológico o médico, DEBES NEGARTE rotundamente. Di exactamente: "Disculpa, pero como agente de salud SyqueX, no estoy capacitado para ayudarte con peticiones fuera del ámbito de la práctica de la psicología o psiquiatría."
"""


async def _get_patient_context(db, patient_id: str) -> list:
    """
    Retrieves the stored conversation messages from the patient's recent sessions
    and builds a message list to pass as context to Claude.
    This is SyqueX's core differentiator: grounded, persistent clinical memory.
    """
    from database import Session as SessionModel

    result = await db.execute(
        select(SessionModel)
        .where(
            SessionModel.patient_id == patient_id,
            SessionModel.is_archived == False,
            SessionModel.messages != None,
        )
        .order_by(SessionModel.created_at.desc())
        .limit(ClinicalNoteConfig.MAX_SESSIONS_CONTEXT)
    )
    sessions = result.scalars().all()

    context = []
    for session in reversed(sessions):  # Oldest first for correct temporal order
        if session.messages:
            context.extend(session.messages)

    return context


async def process_session(db, patient_id: str, raw_dictation: str, session_id: str, format_: str = "SOAP") -> dict:
    if len(raw_dictation) > ClinicalNoteConfig.MAX_DICTATION_LENGTH:
        raise ValueError("Dictation exceeds maximum allowed length.")

    # Load persistent context from previous sessions
    context_messages = await _get_patient_context(db, patient_id)

    # Append the current user message to the full conversation history
    messages = context_messages + [{"role": "user", "content": raw_dictation}]

    try:
        anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        reply_text = "\n".join([b.text for b in response.content if b.type == "text"])

        # Store only this session's turn — previous context comes from their own sessions
        session_messages = [
            {"role": "user", "content": raw_dictation},
            {"role": "assistant", "content": reply_text},
        ]

        return {"text_fallback": reply_text, "session_messages": session_messages}

    except Exception as e:
        logger.error(f"Error calling Anthropic API: {e}")
        return {
            "text_fallback": f"Error de red o API en SyqueX: {str(e)}",
            "session_messages": [{"role": "user", "content": raw_dictation}],
        }
