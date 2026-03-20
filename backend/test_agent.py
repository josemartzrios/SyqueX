import asyncio
import logging
import uuid
import json
import sys

# Asegurar importaciones relativas dentro de la carpeta backend
from database import AsyncSessionLocal
from agent import process_session

logging.basicConfig(level=logging.INFO)

async def test_agent_locally():
    print("\n" + "="*50)
    print("🚀 INICIANDO PRUEBA LOCAL DEL AGENTE (RAG CLÍNICO)")
    print("="*50)
    
    # Datos de prueba usando el paciente semilla existente
    patient_id = "00000000-0000-0000-0000-000000000001"
    session_id = str(uuid.uuid4())
    format_type = "SOAP"
    
    dictation = """
    El paciente llega comentando que esta semana durmió mejor. Menciona que los ejercicios 
    de respiración profunda le ayudaron a bajar los picos de ansiedad en la oficina. 
    Sin embargo, reporta sentirse 'bloqueado' por las mañanas y sin ganas de salir de cama.
    Hoy trabajamos reestructuración cognitiva para esos pensamientos matutinos.
    """
    
    print(f"✓ Paciente ID: {patient_id}")
    print(f"✓ Sesión ID Simulada: {session_id}")
    print(f"✓ Formato: {format_type}")
    print(f"\nDictado Crudo:\n{dictation.strip()}")
    print("\n⏳ Conectando con Anthropic (Claude 3) y Base de datos pgvector...")
    print("   Espere un momento mientras el agente analiza el caso y ejecuta tools...\n")
    
    async with AsyncSessionLocal() as db:
        try:
            # Invocar al motor tal cual lo hace FastAPI
            result = await process_session(db, patient_id, dictation, session_id, format_type)
            
            print("✅ === RESPUESTA GENERADA EXITOSAMENTE ===\n")
            # Imprimir el JSON devuelto ordenado y legible
            print(json.dumps(result, indent=2, ensure_ascii=False))
            
        except Exception as e:
            print(f"\n❌ ERROR FATAL DURANTE LA EJECUCIÓN: {str(e)}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        # Manejo de Loop asíncrono seguro para Windows (evita EventLoop cerrado)
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_agent_locally())
