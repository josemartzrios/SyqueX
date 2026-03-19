import asyncio
import uuid
import logging
from datetime import date, timedelta
from database import engine, AsyncSessionLocal, init_db
from database import Psychologist, Patient, Session, ClinicalNote, PatientProfile
from embeddings import get_embedding
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)

async def seed():
    logging.info("Initializing DB schema...")
    await init_db()
    
    async with AsyncSessionLocal() as db:
        # 1. Psychologist
        query = select(Psychologist).where(Psychologist.email == "ana.garcia@clinica.com")
        res = await db.execute(query)
        psy = res.scalar_one_or_none()
        if not psy:
            psy = Psychologist(name="Dr. Ana García", email="ana.garcia@clinica.com")
            db.add(psy)
            await db.commit()
            await db.refresh(psy)
        
        # 2. Patient
        patient_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
        res = await db.execute(select(Patient).where(Patient.id == patient_id))
        patient = res.scalar_one_or_none()
        if not patient:
            patient = Patient(
                id=patient_id,
                psychologist_id=psy.id,
                name="Juan Martínez",
                date_of_birth=date.today() - timedelta(days=34*365),
                diagnosis_tags=["ansiedad generalizada", "duelo"],
                risk_level="low"
            )
            db.add(patient)
            
            # Profile
            profile = PatientProfile(
                patient_id=patient.id,
                recurring_themes=["conflictos con figura materna", "ansiedad laboral", "proceso de divorcio"],
                protective_factors=["red de apoyo de amigos", "compromiso con la terapia"],
                risk_factors=["aislamiento ocasional"],
                progress_indicators={"ansiedad": "disminuyendo", "adherencia": "alta"}
            )
            db.add(profile)
            await db.commit()
            await db.refresh(patient)

        # 3. Sessions
        # Comprobar si ya hay sesiones
        res = await db.execute(select(Session).where(Session.patient_id == patient.id))
        sessions_exist = res.scalars().all()
        
        if len(sessions_exist) < 4:
            logging.info("Generando 4 sesiones con embeddings reales (esto usará la API de OpenAI)...")
            
            mock_sessions = [
                {
                    "raw_dictation": "El paciente Juan se presentó con mucha ansiedad al hablar sobre su madre. Explica que la relación se ha vuelto tirante por su divorcio.",
                    "note": {
                        "subjective": "Juan se siente juzgado por su madre respecto a su divorcio.",
                        "objective": "Afecto ansioso, movimiento constante de manos.",
                        "assessment": "Ansiedad elevada relacionada con críticas familiares y duelo del divorcio.",
                        "plan": "Explorar límites con la madre la próxima semana.",
                        "detected_patterns": ["conflictos con figura materna"]
                    }
                },
                {
                    "raw_dictation": "Hablamos hoy del trabajo. Hay una fuerte presión laboral que está desencadenando ataques de pánico leves.",
                    "note": {
                        "subjective": "'Siento que no doy abasto en el trabajo, me aprieta el pecho.'",
                        "objective": "Tono de voz agitado al describir el ambiente laboral.",
                        "assessment": "Estrés agudo laboral que se suma al cuadro ansioso. Somatización.",
                        "plan": "Enseñar técnicas de respiración diafragmática.",
                        "detected_patterns": ["ansiedad laboral"]
                    }
                },
                {
                    "raw_dictation": "Juan estuvo mucho más tranquilo. Logró poner límites a su madre y no contestar llamadas el fin de semana. El divorcio sigue siendo un tema doloroso pero gestionable.",
                    "note": {
                        "subjective": "'Pude ignorar las llamadas de mi madre y me sentí en paz.'",
                        "objective": "Postura más relajada, sonrisa ocasional.",
                        "assessment": "Avance en establecer límites sanos. Disminución de ansiedad reactiva.",
                        "plan": "Validar el progreso y seguir trabajando asertividad.",
                        "detected_patterns": ["mejoría en asertividad"]
                    }
                },
                {
                    "raw_dictation": "Recayó la ansiedad tras recibir los papeles finales del divorcio. Lo sintió muy definitivo y le generó miedo a la soledad.",
                    "note": {
                        "subjective": "'Ver el papel firmado me pegó muy duro, tengo miedo a quedarme solo para siempre.'",
                        "objective": "Llanto en sesión, postura encorvada.",
                        "assessment": "Reacción esperable de duelo ante cierre de ciclo. Temor al abandono.",
                        "plan": "Contención emocional. Trabajar reestructuración cognitiva sobre la soledad.",
                        "detected_patterns": ["miedo a la soledad", "proceso de divorcio"]
                    }
                }
            ]

            for i, sd in enumerate(mock_sessions):
                session = Session(
                    patient_id=patient.id,
                    session_number=i+1,
                    session_date=date.today() - timedelta(days=28 - (i*7)),
                    raw_dictation=sd["raw_dictation"],
                    status="confirmed"
                )
                db.add(session)
                await db.commit()
                await db.refresh(session)
                
                # Create embedding representing the whole text
                text_to_embed = " ".join([sd["note"]["subjective"], sd["note"]["objective"], sd["note"]["assessment"], sd["note"]["plan"]])
                logging.info(f"Generating embedding for session {i+1}...")
                
                try:
                    embedding = await get_embedding(text_to_embed)
                except Exception as e:
                    logging.warning(f"Error api OpenAI: {e}. Usando vector zero como fallback.")
                    embedding = [0.0]*1536
                
                cn = ClinicalNote(
                    session_id=session.id,
                    format="SOAP",
                    subjective=sd["note"]["subjective"],
                    objective=sd["note"]["objective"],
                    assessment=sd["note"]["assessment"],
                    plan=sd["note"]["plan"],
                    detected_patterns=sd["note"]["detected_patterns"],
                    embedding=embedding
                )
                db.add(cn)
                
            await db.commit()
            logging.info("Seed data instertada correctamente.")
        else:
            logging.info("Seed data ya existía.")

if __name__ == "__main__":
    asyncio.run(seed())
