import re
import logging
from anthropic import AsyncAnthropic
from fastapi import HTTPException
from sqlalchemy import select
from config import settings, ClinicalNoteConfig

logger = logging.getLogger(__name__)

# Patrones de prompt injection conocidos
_INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|prior)\s+instructions",
    r"system\s+prompt",
    r"jailbreak",
    r"you\s+are\s+now",
    r"forget\s+your",
    r"new\s+instructions",
    r"\[INST\]",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"disregard\s+(all|previous)",
    r"override\s+(your|the)\s+(instructions|rules)",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

def _sanitizar_dictado(texto: str) -> str:
    """Valida que el dictado no contenga intentos de prompt injection."""
    if _INJECTION_RE.search(texto):
        logger.warning("Prompt injection attempt detected in dictation input")
        raise HTTPException(
            status_code=400,
            detail="El dictado contiene contenido no válido para procesamiento clínico.",
        )
    return texto[:settings.MAX_DICTATION_LENGTH].strip()

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
    Builds the full context message list for a patient:
    1. A clinical profile block (patient_summary + risk/protective factors + recurring themes)
    2. Verbatim turns from the last N confirmed sessions (for recency)
    """
    from database import Session as SessionModel, PatientProfile

    # --- 1. Load clinical profile ---
    profile_result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_block_parts = []
    if profile:
        if profile.patient_summary:
            profile_block_parts.append(f"Resumen clínico del paciente:\n{profile.patient_summary}")
        if profile.recurring_themes:
            profile_block_parts.append(f"Temas recurrentes: {', '.join(profile.recurring_themes)}")
        if profile.risk_factors:
            profile_block_parts.append(f"Factores de riesgo: {', '.join(profile.risk_factors)}")
        if profile.protective_factors:
            profile_block_parts.append(f"Factores protectores: {', '.join(profile.protective_factors)}")

    context = []
    if profile_block_parts:
        profile_text = "\n".join(profile_block_parts)
        context.append({
            "role": "user",
            "content": f"[CONTEXTO CLÍNICO DEL PACIENTE — solo para referencia, no es un dictado nuevo]\n{profile_text}"
        })
        context.append({
            "role": "assistant",
            "content": "Entendido. Tengo en cuenta el historial clínico del paciente para esta sesión."
        })

    # --- 2. Load verbatim turns from last N sessions ---
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

    for session in reversed(sessions):  # Oldest first for correct temporal order
        if session.messages:
            context.extend(session.messages)

    return context


async def update_patient_profile_summary(db, patient_id: str, session_note: dict) -> None:
    """
    After a session is confirmed, asks Claude to generate/update a compact clinical
    summary of the patient (max ~300 words). Also extracts risk_factors,
    protective_factors, and progress_indicators from the new note and persists them.
    """
    from database import PatientProfile, Session as SessionModel

    profile_result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_id)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        return

    # Build context for Claude: existing summary + new session data
    existing_summary = profile.patient_summary or "Sin resumen previo."
    new_note_text = session_note.get("text_fallback", "")
    detected_patterns = session_note.get("detected_patterns", [])
    alerts = session_note.get("alerts", [])

    summary_prompt = (
        f"Resumen clínico previo del paciente:\n{existing_summary}\n\n"
        f"Nueva sesión registrada:\n{new_note_text}\n\n"
        f"Patrones detectados: {', '.join(detected_patterns) if detected_patterns else 'Ninguno'}\n"
        f"Alertas: {', '.join(alerts) if alerts else 'Ninguna'}\n\n"
        "Con base en todo lo anterior, genera un resumen clínico actualizado del paciente "
        "en texto plano, sin Markdown, de máximo 300 palabras. "
        "El resumen debe incluir: motivo de consulta principal, evolución observada, "
        "temas recurrentes, factores de riesgo activos y factores protectores. "
        "Escribe solo el resumen, sin encabezados ni etiquetas."
    )

    try:
        anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            temperature=0,
            system="Eres un asistente clínico especializado. Responde exclusivamente en texto plano sin Markdown.",
            messages=[{"role": "user", "content": summary_prompt}],
        )
        new_summary = "\n".join([b.text for b in response.content if b.type == "text"]).strip()
        profile.patient_summary = new_summary
    except Exception as e:
        logger.error(f"Error generating patient summary: {e}")

    # Update structured profile fields from the new session
    if detected_patterns:
        profile.recurring_themes = list(set((profile.recurring_themes or []) + detected_patterns))
    if alerts:
        profile.risk_factors = list(set((profile.risk_factors or []) + alerts))

    suggested_next = session_note.get("suggested_next_steps", [])
    if suggested_next:
        indicators = profile.progress_indicators or {}
        indicators["last_suggested_steps"] = suggested_next
        profile.progress_indicators = indicators

    await db.commit()


async def process_session(db, patient_id: str, raw_dictation: str, session_id: str, format_: str = "SOAP") -> dict:
    if len(raw_dictation) > ClinicalNoteConfig.MAX_DICTATION_LENGTH:
        raise ValueError("Dictation exceeds maximum allowed length.")

    # Sanitizar contra prompt injection antes de enviar al LLM
    dictado_seguro = _sanitizar_dictado(raw_dictation)

    # Load persistent context from previous sessions
    context_messages = await _get_patient_context(db, patient_id)

    # Append the current user message to the full conversation history
    messages = context_messages + [{"role": "user", "content": dictado_seguro}]

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
            {"role": "user", "content": dictado_seguro},
            {"role": "assistant", "content": reply_text},
        ]

        return {"text_fallback": reply_text, "session_messages": session_messages}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error calling Anthropic API: %s", e, exc_info=True)
        return {
            "text_fallback": "Error al procesar el dictado. Por favor intenta nuevamente.",
            "session_messages": [{"role": "user", "content": dictado_seguro}],
        }
