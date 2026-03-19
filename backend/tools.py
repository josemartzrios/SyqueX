import json
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from .database import ClinicalNote, Session, PatientProfile

# Anthropic Tools JSON Schemas
AGENT_TOOLS = [
    {
        "name": "create_or_update_clinical_note",
        "description": "Create or update a structured clinical note (SOAP, DAP, BIRP) based on dictation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "UUID of the session"},
                "raw_dictation": {"type": "string", "description": "Original dictation by the psychologist"},
                "format": {"type": "string", "enum": ["SOAP", "DAP", "BIRP"]},
                "structured_note": {
                    "type": "object",
                    "description": "Sections of the note according to format (e.g., subjective, objective, assessment, plan)"
                },
                "detected_patterns": {"type": "array", "items": {"type": "string"}},
                "alerts": {"type": "array", "items": {"type": "string"}},
                "suggested_next_steps": {"type": "array", "items": {"type": "string"}},
                "evolution_delta": {"type": "object", "description": "Delta representing changes from previous session"}
            },
            "required": ["session_id", "raw_dictation", "format", "structured_note", "detected_patterns", "alerts", "suggested_next_steps", "evolution_delta"]
        }
    },
    {
        "name": "search_patient_history",
        "description": "Semantic search on patient's past sessions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "query": {"type": "string", "description": "Natural language query"},
                "limit": {"type": "integer", "default": 5},
                "date_from": {"type": "string", "description": "ISO date string", "nullable": True}
            },
            "required": ["patient_id", "query"]
        }
    },
    {
        "name": "detect_patterns_between_sessions",
        "description": "Compare new session text with the last N sessions to detect patterns.",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "new_session_text": {"type": "string"},
                "last_n_sessions": {"type": "integer", "default": 6}
            },
            "required": ["patient_id", "new_session_text"]
        }
    },
    {
        "name": "generate_evolution_report",
        "description": "Generate a comprehensive report for a given period.",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "period": {"type": "string", "enum": ["monthly", "quarterly", "annual"]}
            },
            "required": ["patient_id", "period"]
        }
    },
    {
        "name": "suggest_next_session",
        "description": "Suggest next session's priorities and techniques.",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "current_note": {"type": "object", "description": "The current structured note"}
            },
            "required": ["patient_id", "current_note"]
        }
    }
]

# Implementations (mocked to logic expected by agent flow, but database logic works where specified)
async def create_or_update_clinical_note(db: AsyncSession, **kwargs):
    # En phase 3 y 4 esto se usa para devolver el JSON al frontend 
    # y en el POST /confirm se guarda realmente. 
    # Por ahora actua devolviendo status ok.
    return {"note_id": kwargs["session_id"], "status": "staged"}

from .embeddings import get_embedding # We will create this in phase 2/3

async def search_patient_history(db: AsyncSession, patient_id: str, query: str, limit: int = 5, date_from: str = None):
    query_embedding = await get_embedding(query)
    
    # Query using pgvector cosine similarity (<=>)
    stmt = text("""
        SELECT s.session_number, s.session_date, cn.assessment, 
               1 - (cn.embedding <=> :embedding::vector) as relevance_score
        FROM clinical_notes cn
        JOIN sessions s ON cn.session_id = s.id
        WHERE s.patient_id = :patient_id
        ORDER BY cn.embedding <=> :embedding::vector
        LIMIT :limit
    """)
    result = await db.execute(stmt, {
        "embedding": str(query_embedding), 
        "patient_id": patient_id, 
        "limit": limit
    })
    
    docs = []
    for row in result:
        docs.append({
            "session_number": row[0],
            "date": str(row[1]),
            "summary_fragment": row[2] if row[2] else "",
            "relevance_score": row[3]
        })
    return docs

async def detect_patterns_between_sessions(db: AsyncSession, patient_id: str, new_session_text: str, last_n_sessions: int = 6):
    # Recupera las ultimas sesiones
    # En la implementacion real llamaría a un minimodelo o el agente lo genera localmente.
    # Dado que es un sub-tool para proporcionar contexto, enviaremos los datos para que el agente infiera.
    stmt = text("""
        SELECT s.session_number, s.session_date, cn.subjective, cn.assessment
        FROM clinical_notes cn
        JOIN sessions s ON cn.session_id = s.id
        WHERE s.patient_id = :patient_id
        ORDER BY s.session_date DESC
        LIMIT :limit
    """)
    result = await db.execute(stmt, {"patient_id": patient_id, "limit": last_n_sessions})
    history = "\n".join([f"Session {row[0]} ({row[1]}): {row[2][:100]}..." for row in result])
    
    # Fake pattern processing for the MVP structure
    return {
        "patterns": ["Menciona recurrentemente problemas con figura materna"],
        "alerts": ["Aumento leve de ansiedad referida"],
        "evolution_delta": {"mood": "stable", "anxiety": "increased"}
    }

async def generate_evolution_report(db: AsyncSession, patient_id: str, period: str):
    return {
        "report_text": f"Reporte {period} para el paciente. Progreso favorable.",
        "metrics": {"progreso_general": "8/10", "adherencia": "alta"},
        "period_start": "2024-01-01",
        "period_end": "2024-03-31"
    }

async def suggest_next_session(db: AsyncSession, patient_id: str, current_note: dict):
    return {
        "priority_areas": ["Explorar origen de la ansiedad post-trabajo", "Validar emociones respecto a familia"],
        "suggested_questions": ["¿Qué sentiste exactamente cuando eso pasó?", "¿Cómo te cuidaste después?"],
        "recommended_techniques": ["TCC: Registro de pensamientos", "Mindfulness"],
        "risk_assessment": "low"
    }
