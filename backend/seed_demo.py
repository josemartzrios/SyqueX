import asyncio
import os
import sys
import uuid
from datetime import date, datetime

from passlib.context import CryptContext
from fastembed import TextEmbedding
from sqlalchemy import text

# Add backend dir to sys.path so imports work when running as script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import AsyncSessionLocal, Psychologist, Patient, Session, ClinicalNote, PatientProfile

ENVIRONMENT = os.getenv("ENVIRONMENT", "local")

if ENVIRONMENT in ("production", "staging"):
    print("ERROR: seed_demo.py must not run against staging or production.")
    sys.exit(1)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main():
    async with AsyncSessionLocal() as db:
        await seed_all(db)


async def seed_all(db):
    # 1. TRUNCATE all tables (cascade)
    await db.execute(text(
        "TRUNCATE TABLE clinical_notes, sessions, patient_profiles, patients, "
        "psychologists, audit_logs RESTART IDENTITY CASCADE;"
    ))
    await db.commit()

    # 2. Migrate embedding column to vector(1024)
    await db.execute(text("ALTER TABLE clinical_notes DROP COLUMN IF EXISTS embedding;"))
    await db.execute(text("ALTER TABLE clinical_notes ADD COLUMN embedding vector(1024);"))
    await db.commit()

    # 3. Load FastEmbed model
    print("Cargando modelo FastEmbed BAAI/bge-m3 (primera vez: ~570 MB)...")
    model = TextEmbedding("BAAI/bge-m3")
    print("Modelo cargado.")

    # Helper: generate embedding
    def embed(text_content: str) -> list:
        return list(model.embed([text_content]))[0].tolist()

    # 4. INSERT psychologist
    psych = Psychologist(
        id=uuid.uuid4(),
        name="Dr. Ana López",
        email="ana@syquex.demo",
        password_hash=pwd_context.hash("demo1234"),
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(psych)
    await db.commit()

    # ─────────────────────────────────────────────────────────────────────────
    # PATIENT 1: María González
    # ─────────────────────────────────────────────────────────────────────────
    patient1 = Patient(
        id=uuid.uuid4(),
        psychologist_id=psych.id,
        name="María González",
        date_of_birth=date(1991, 3, 15),
        diagnosis_tags=["ansiedad_generalizada", "insomnio", "perfeccionismo"],
        risk_level="medium",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(patient1)
    await db.commit()

    # Session 1 — María
    s1_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=1,
        session_date=date(2025, 12, 17),
        raw_dictation=(
            "Paciente acude por primera vez. Refiere ataques de pánico frecuentes en el trabajo, "
            "especialmente los lunes antes de reuniones. Dificultad para dormir, pensamientos acelerados."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Paciente de 34 años acude por ataques de pánico en contexto laboral. Refiere episodios "
            "de palpitaciones, sudoración y sensación de ahogo los lunes ante reuniones. Insomnio de conciliación.\n\n"
            "**O:** Afecto ansioso, habla rápida. Niega ideación suicida.\n\n"
            "**A:** Cuadro compatible con Trastorno de Ansiedad Generalizada con componente situacional laboral.\n\n"
            "**P:** Psicoeducación sobre ansiedad. Inicio técnicas de respiración diafragmática. "
            "Registro de episodios de pánico para próxima sesión."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s1_p1)
    await db.commit()

    note1_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s1_p1.id,
        format="SOAP",
        subjective=(
            "Paciente de 34 años, primera consulta. Ataques de pánico en reuniones laborales los lunes. "
            "Insomnio de conciliación, pensamientos acelerados."
        ),
        objective="Afecto ansioso, habla rápida. Niega ideación suicida.",
        assessment="Trastorno de Ansiedad Generalizada con componente situacional laboral.",
        plan="Psicoeducación sobre ansiedad. Técnicas de respiración diafragmática. Registro de episodios.",
        detected_patterns=["ansiedad_situacional", "insomnio"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Paciente de 34 años, primera consulta. Ataques de pánico en reuniones laborales los lunes. "
            "Insomnio de conciliación, pensamientos acelerados. "
            "Trastorno de Ansiedad Generalizada con componente situacional laboral."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note1_p1)
    await db.commit()

    # Session 2 — María
    s2_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=2,
        session_date=date(2025, 12, 24),
        raw_dictation=(
            "Segunda sesión. Paciente identifica que el detonante principal son las reuniones con su jefe directo. "
            "Trae registro: 4 episodios esta semana. Siente que no puede 'fallar' en el trabajo."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Paciente identifica reuniones con jefe como detonante principal. Registro muestra 4 episodios "
            "de pánico esta semana. Refiere presión interna intensa por no cometer errores.\n\n"
            "**O:** Más reflexiva que sesión anterior. Contacto visual adecuado.\n\n"
            "**A:** En sesiones anteriores hemos identificado que los ataques de pánico se intensifican los lunes "
            "ante reuniones con el jefe. Hoy se confirma patrón de perfeccionismo como factor mantenedor.\n\n"
            "**P:** Explorar creencias perfeccionistas. Técnica de reestructuración cognitiva básica. Continuar registro."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s2_p1)
    await db.commit()

    note2_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s2_p1.id,
        format="SOAP",
        subjective="Detonante identificado: reuniones con jefe directo. 4 episodios registrados. Presión interna por no fallar.",
        objective="Más reflexiva, contacto visual adecuado.",
        assessment="Perfeccionismo como factor mantenedor de ansiedad. Patrón detonante confirmado.",
        plan="Explorar creencias perfeccionistas. Reestructuración cognitiva básica.",
        detected_patterns=["perfeccionismo", "ansiedad_laboral"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Detonante identificado: reuniones con jefe directo. 4 episodios registrados. Presión interna por no fallar. "
            "Perfeccionismo como factor mantenedor de ansiedad. Patrón detonante confirmado."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note2_p1)
    await db.commit()

    # Session 3 — María
    s3_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=3,
        session_date=date(2026, 1, 7),
        raw_dictation=(
            "Tercera sesión. Practicó técnicas de respiración pero con dificultad para aplicarlas en el momento. "
            "Muestra resistencia a cambiar su forma de trabajar."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Practicó respiración diafragmática con dificultad para aplicarla en situaciones reales. "
            "Resistencia al cambio en hábitos laborales.\n\n"
            "**O:** Tono defensivo al hablar de cambios en rutina laboral.\n\n"
            "**A:** Desde las primeras sesiones se observa un patrón de evitación: paciente anticipa el fracaso "
            "y evita situaciones que lo confirmen. La resistencia al cambio es coherente con este patrón.\n\n"
            "**P:** Trabajar en identificación de conductas de evitación. Experimento conductual: asistir a una reunión "
            "con técnica preparada."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s3_p1)
    await db.commit()

    note3_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s3_p1.id,
        format="SOAP",
        subjective="Dificultad para aplicar técnicas en situaciones reales. Resistencia a cambiar hábitos laborales.",
        objective="Tono defensivo al hablar de cambios.",
        assessment="Patrón de evitación detectado. Resistencia al cambio como conducta de seguridad.",
        plan="Identificación de conductas de evitación. Experimento conductual.",
        detected_patterns=["evitacion", "resistencia_cambio"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Dificultad para aplicar técnicas en situaciones reales. Resistencia a cambiar hábitos laborales. "
            "Patrón de evitación detectado. Resistencia al cambio como conducta de seguridad."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note3_p1)
    await db.commit()

    # Session 4 — María
    s4_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=4,
        session_date=date(2026, 1, 14),
        raw_dictation=(
            "Cuarta sesión. Tuvo un deadline importante y recayó en los ataques. "
            "Dice que 'todo lo que habíamos avanzado se perdió'. Se muestra desanimada."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Recaída por deadline laboral importante. Paciente percibe pérdida total del progreso "
            "terapéutico. Estado de ánimo bajo.\n\n"
            "**O:** Afecto deprimido leve. Llanto al relatar los episodios.\n\n"
            "**A:** La recaída ante el deadline conecta directamente con el perfeccionismo identificado en la sesión 2: "
            "la presión por no fallar ante una tarea importante activó todos los síntomas. Las recaídas son parte "
            "del proceso terapéutico normal.\n\n"
            "**P:** Normalizar la recaída. Analizar qué estrategias funcionaron parcialmente. Reforzar técnicas de breathing."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s4_p1)
    await db.commit()

    note4_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s4_p1.id,
        format="SOAP",
        subjective="Recaída por deadline laboral. Percibe pérdida de todo el progreso. Desanimada.",
        objective="Afecto deprimido leve. Llanto.",
        assessment="Recaída conectada con perfeccionismo (S2). Proceso terapéutico normal.",
        plan="Normalizar recaída. Análisis de estrategias parcialmente exitosas.",
        detected_patterns=["recaida", "perfeccionismo"],
        alerts=["estado_animo_bajo"],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Recaída por deadline laboral. Percibe pérdida de todo el progreso. Desanimada. "
            "Recaída conectada con perfeccionismo (S2). Proceso terapéutico normal."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note4_p1)
    await db.commit()

    # Session 5 — María
    s5_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=5,
        session_date=date(2026, 1, 21),
        raw_dictation=(
            "Quinta sesión. Trabajamos reestructuración cognitiva. Paciente logra identificar el pensamiento "
            "automático 'si fallo una vez, soy un fracaso'. Buen trabajo en sesión."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Trabajo productivo en reestructuración cognitiva. Paciente identifica pensamiento automático "
            "central: 'si fallo una vez, soy un fracaso'.\n\n"
            "**O:** Más tranquila, participativa. Notable mejoría en comparación con sesión 1.\n\n"
            "**A:** Evolución significativa desde la primera sesión. Los patrones recurrentes de perfeccionismo y "
            "evitación están siendo abordados con éxito. La identificación del pensamiento automático es un hito "
            "terapéutico importante.\n\n"
            "**P:** Registro de evidencias para y en contra del pensamiento automático. Continuar experimentos conductuales."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s5_p1)
    await db.commit()

    note5_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s5_p1.id,
        format="SOAP",
        subjective="Reestructuración cognitiva productiva. Identifica pensamiento automático: 'si fallo una vez, soy un fracaso'.",
        objective="Más tranquila, participativa. Mejoría notable.",
        assessment="Evolución significativa desde S1. Hito terapéutico: identificación de pensamiento automático central.",
        plan="Registro de evidencias. Continuar experimentos conductuales.",
        detected_patterns=["pensamiento_automatico", "progreso_terapeutico"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Reestructuración cognitiva productiva. Identifica pensamiento automático: 'si fallo una vez, soy un fracaso'. "
            "Evolución significativa desde S1. Hito terapéutico: identificación de pensamiento automático central."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note5_p1)
    await db.commit()

    # Session 6 — María
    s6_p1 = Session(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        session_number=6,
        session_date=date(2026, 2, 4),
        raw_dictation=(
            "Sexta sesión. Consolidación del trabajo. Paciente reporta menos episodios (1 en dos semanas). "
            "Discutimos plan de alta parcial con seguimiento mensual."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Reducción significativa de episodios (1 en 2 semanas vs. 4+ semanales al inicio). "
            "Paciente receptiva a plan de alta parcial.\n\n"
            "**O:** Estado de ánimo eutímico. Sonríe al comentar su progreso.\n\n"
            "**A:** A lo largo de las 6 sesiones, María ha pasado de ataques de pánico frecuentes a un episodio "
            "aislado en dos semanas. Los factores mantenedores (perfeccionismo, evitación) han sido identificados "
            "y trabajados. El pensamiento automático central está siendo cuestionado activamente.\n\n"
            "**P:** Alta parcial con seguimiento mensual. Autorregistro continuo. Plan de acción ante recaídas."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s6_p1)
    await db.commit()

    note6_p1 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s6_p1.id,
        format="SOAP",
        subjective="1 episodio en 2 semanas (vs. 4+ semanales al inicio). Acepta alta parcial.",
        objective="Estado de ánimo eutímico. Sonríe al hablar del progreso.",
        assessment="Alta parcial indicada. Arco terapéutico completo: de pánico frecuente a episodio aislado.",
        plan="Alta parcial, seguimiento mensual, plan de acción ante recaídas.",
        detected_patterns=["alta_parcial", "progreso_terapeutico"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "1 episodio en 2 semanas (vs. 4+ semanales al inicio). Acepta alta parcial. "
            "Alta parcial indicada. Arco terapéutico completo: de pánico frecuente a episodio aislado."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note6_p1)
    await db.commit()

    # Patient 1 profile
    profile1 = PatientProfile(
        id=uuid.uuid4(),
        patient_id=patient1.id,
        recurring_themes=["ansiedad_laboral", "perfeccionismo", "ataques_de_panico"],
        protective_factors=["motivacion_alta", "capacidad_de_reflexion"],
        risk_factors=["perfeccionismo_elevado", "presion_laboral"],
        progress_indicators={
            "sesiones_completadas": 6,
            "episodios_semana_inicio": 4,
            "episodios_semana_actual": 0.5,
            "hitos": ["identificacion_detonante", "identificacion_pensamiento_automatico", "alta_parcial"],
        },
        patient_summary="Paciente con TAG situacional laboral. Progreso notable en 6 sesiones. Alta parcial acordada.",
        updated_at=datetime.utcnow(),
    )
    db.add(profile1)
    await db.commit()

    # ─────────────────────────────────────────────────────────────────────────
    # PATIENT 2: Carlos Mendoza
    # ─────────────────────────────────────────────────────────────────────────
    patient2 = Patient(
        id=uuid.uuid4(),
        psychologist_id=psych.id,
        name="Carlos Mendoza",
        date_of_birth=date(1997, 6, 20),
        diagnosis_tags=["depresion_leve", "aislamiento_social", "anhedonia"],
        risk_level="low",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(patient2)
    await db.commit()

    # Session 1 — Carlos
    s1_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=1,
        session_date=date(2025, 12, 10),
        raw_dictation=(
            "Primera sesión. Paciente de 28 años acude tras ruptura sentimental hace 3 meses. Refiere pérdida de "
            "interés en actividades que antes disfrutaba (gym, videojuegos, amigos)."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Paciente acude por pérdida de interés generalizado tras ruptura sentimental. Anhedonia en "
            "actividades previamente placenteras: ejercicio, ocio, socialización.\n\n"
            "**O:** Afecto aplanado. Respuestas cortas. Niega ideación suicida.\n\n"
            "**A:** Cuadro compatible con episodio depresivo leve reactivo a pérdida.\n\n"
            "**P:** Psicoeducación sobre duelo y depresión reactiva. Explorar red de apoyo social. "
            "Próxima sesión: registro de actividades."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s1_p2)
    await db.commit()

    note1_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s1_p2.id,
        format="SOAP",
        subjective="28 años. Anhedonia post-ruptura (3 meses). Pérdida de interés en gym, videojuegos, amigos.",
        objective="Afecto aplanado, respuestas cortas. Niega ideación suicida.",
        assessment="Episodio depresivo leve reactivo a pérdida sentimental.",
        plan="Psicoeducación sobre duelo. Explorar red social. Registro de actividades.",
        detected_patterns=["anhedonia", "depresion_reactiva"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "28 años. Anhedonia post-ruptura (3 meses). Pérdida de interés en gym, videojuegos, amigos. "
            "Episodio depresivo leve reactivo a pérdida sentimental."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note1_p2)
    await db.commit()

    # Session 2 — Carlos
    s2_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=2,
        session_date=date(2025, 12, 17),
        raw_dictation=(
            "Segunda sesión. Aislamiento progresivo confirmado. No ha salido de casa en el fin de semana. "
            "Dice que 'no tiene sentido hacer nada'."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Aislamiento social progresivo: no salió de casa el fin de semana. "
            "Cognición nihilista: 'no tiene sentido hacer nada'.\n\n"
            "**O:** Descuidado en apariencia. Llega tarde a la sesión.\n\n"
            "**A:** El aislamiento conecta con la anhedonia identificada en la sesión 1: al no encontrar placer "
            "en actividades, el paciente las evita, lo que profundiza el estado depresivo.\n\n"
            "**P:** Activación conductual: programar una actividad mínima al día. Retomar contacto con un amigo."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s2_p2)
    await db.commit()

    note2_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s2_p2.id,
        format="SOAP",
        subjective="Aislamiento progresivo. No salió de casa el fin de semana. Cognición nihilista.",
        objective="Descuidado en apariencia. Llega tarde.",
        assessment="Aislamiento refuerza anhedonia (S1). Ciclo depresivo activo.",
        plan="Activación conductual. Una actividad mínima diaria. Contacto social con un amigo.",
        detected_patterns=["aislamiento_social", "cognicion_negativa"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Aislamiento progresivo. No salió de casa el fin de semana. Cognición nihilista. "
            "Aislamiento refuerza anhedonia (S1). Ciclo depresivo activo."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note2_p2)
    await db.commit()

    # Session 3 — Carlos
    s3_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=3,
        session_date=date(2025, 12, 24),
        raw_dictation=(
            "Tercera sesión. Buena noticia: retomó el gimnasio tres días esta semana. Dice que no lo disfruta "
            "todavía pero 'al menos fui'. Se muestra algo más activo."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Logro conductual: retomó el gimnasio 3 días. Anhedonia persistente pero conducta activa iniciada.\n\n"
            "**O:** Más dinámico que sesiones anteriores. Mantiene contacto visual.\n\n"
            "**A:** El retomar el gimnasio es un avance significativo considerando el historial de aislamiento de las "
            "sesiones 1 y 2. La disociación entre conducta y placer es normal al inicio de la activación conductual.\n\n"
            "**P:** Reforzar la activación conductual. Añadir una segunda actividad social. Registro de momentos de "
            "leve satisfacción."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s3_p2)
    await db.commit()

    note3_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s3_p2.id,
        format="SOAP",
        subjective="Retomó gimnasio 3 días. Anhedonia persistente pero conducta activa.",
        objective="Más dinámico. Mantiene contacto visual.",
        assessment="Avance conductual significativo vs. S1-S2. Activación efectiva.",
        plan="Reforzar activación. Segunda actividad social. Registro de satisfacción.",
        detected_patterns=["activacion_conductual", "progreso"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Retomó gimnasio 3 días. Anhedonia persistente pero conducta activa. "
            "Avance conductual significativo vs. S1-S2. Activación efectiva."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note3_p2)
    await db.commit()

    # Session 4 — Carlos
    s4_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=4,
        session_date=date(2026, 1, 7),
        raw_dictation=(
            "Cuarta sesión. Energía claramente mejorada. Sigue yendo al gym. Sin embargo, persisten cogniciones "
            "negativas: 'soy menos que antes de la ruptura'."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Mejoría clara en energía y conducta. Cogniciones negativas persistentes sobre autoestima "
            "('soy menos que antes de la ruptura').\n\n"
            "**O:** Afecto más vivo. Describe logros con voz más firme.\n\n"
            "**A:** Disociación entre progreso conductual (mejoría objetiva) y cognición (autoestima baja). El patrón "
            "autocrítico observado desde S2-S4 indica que el foco terapéutico debe desplazarse hacia la autoestima.\n\n"
            "**P:** Inicio de trabajo en autoestima. Listado de fortalezas. Cuestionamiento de cogniciones negativas "
            "sobre la ruptura."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s4_p2)
    await db.commit()

    note4_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s4_p2.id,
        format="SOAP",
        subjective="Energía mejorada. Gym constante. Cogniciones negativas persistentes: 'soy menos que antes'.",
        objective="Afecto más vivo, voz más firme.",
        assessment="Progreso conductual vs. cognición negativa persistente (patrón S2-S4).",
        plan="Trabajo en autoestima. Listado de fortalezas. Cuestionamiento de cogniciones.",
        detected_patterns=["autocritica", "disociacion_conducta_cognicion"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Energía mejorada. Gym constante. Cogniciones negativas persistentes: 'soy menos que antes'. "
            "Progreso conductual vs. cognición negativa persistente (patrón S2-S4)."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note4_p2)
    await db.commit()

    # Session 5 — Carlos
    s5_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=5,
        session_date=date(2026, 1, 14),
        raw_dictation=(
            "Quinta sesión. Trabajo en autoestima. Paciente elabora lista de fortalezas con dificultad "
            "('no se me ocurre nada positivo de mí'). Se trabaja en sesión."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Dificultad marcada para identificar fortalezas propias. Cognición: 'no se me ocurre nada "
            "positivo de mí'.\n\n"
            "**O:** Reflexivo, concentrado. Se esfuerza durante el ejercicio.\n\n"
            "**A:** El patrón autocrítico identificado en sesiones 2-4 está profundamente arraigado. La dificultad "
            "para identificar fortalezas es coherente con la baja autoestima post-ruptura.\n\n"
            "**P:** Continuar trabajo en autoestima. Tarea: buscar un momento del día donde algo salió bien. "
            "Explorar identidad pre-relación."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s5_p2)
    await db.commit()

    note5_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s5_p2.id,
        format="SOAP",
        subjective="Dificultad para identificar fortalezas. Cognición: 'no hay nada positivo en mí'.",
        objective="Reflexivo, concentrado, se esfuerza.",
        assessment="Autocrítica arraigada (S2-S4). Baja autoestima post-ruptura como foco.",
        plan="Continuar autoestima. Momento positivo del día. Explorar identidad pre-relación.",
        detected_patterns=["baja_autoestima", "autocritica"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Dificultad para identificar fortalezas. Cognición: 'no hay nada positivo en mí'. "
            "Autocrítica arraigada (S2-S4). Baja autoestima post-ruptura como foco."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note5_p2)
    await db.commit()

    # Session 6 — Carlos
    s6_p2 = Session(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        session_number=6,
        session_date=date(2026, 1, 28),
        raw_dictation=(
            "Sexta sesión. Estabilización clara. Gym 4 días, retomó contacto con amigos. Elaboramos metas a 3 meses: "
            "nuevo trabajo, retomar hobby de fotografía."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Estabilización conductual: gym 4 días, red social activa. Orientación hacia el futuro con metas "
            "concretas a 3 meses.\n\n"
            "**O:** Afecto eutímico. Sonríe espontáneamente al hablar de metas.\n\n"
            "**A:** Evolución completa desde la ruptura hasta la estabilización en 6 sesiones. El paciente ha pasado "
            "de anhedonia y aislamiento total a retomar actividades y proyectarse hacia el futuro. El trabajo en "
            "autoestima continúa pero con base más sólida.\n\n"
            "**P:** Alta parcial. Metas a 3 meses definidas. Seguimiento mensual. Plan de acción ante señales de recaída."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s6_p2)
    await db.commit()

    note6_p2 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s6_p2.id,
        format="SOAP",
        subjective="Estabilización. Gym 4 días, amigos retomados. Metas a 3 meses: trabajo, fotografía.",
        objective="Afecto eutímico. Sonríe al hablar de metas.",
        assessment="Evolución completa: de anhedonia total a orientación futura.",
        plan="Alta parcial. Metas a 3 meses. Seguimiento mensual.",
        detected_patterns=["estabilizacion", "orientacion_futura"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Estabilización. Gym 4 días, amigos retomados. Metas a 3 meses: trabajo, fotografía. "
            "Evolución completa: de anhedonia total a orientación futura."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note6_p2)
    await db.commit()

    # Patient 2 profile
    profile2 = PatientProfile(
        id=uuid.uuid4(),
        patient_id=patient2.id,
        recurring_themes=["anhedonia", "aislamiento_social", "autocritica"],
        protective_factors=["motivacion_para_cambio", "humor_preservado"],
        risk_factors=["tendencia_aislamiento", "autocritica_intensa"],
        progress_indicators={
            "sesiones_completadas": 6,
            "nivel_actividad_inicio": 1,
            "nivel_actividad_actual": 8,
            "hitos": ["retomar_gimnasio", "contacto_social", "metas_futuras"],
        },
        patient_summary="Depresión reactiva post-ruptura. Evolución muy positiva en 6 sesiones. Alta parcial.",
        updated_at=datetime.utcnow(),
    )
    db.add(profile2)
    await db.commit()

    # ─────────────────────────────────────────────────────────────────────────
    # PATIENT 3: Laura Ramírez
    # ─────────────────────────────────────────────────────────────────────────
    patient3 = Patient(
        id=uuid.uuid4(),
        psychologist_id=psych.id,
        name="Laura Ramírez",
        date_of_birth=date(1984, 11, 8),
        diagnosis_tags=["conflicto_pareja", "comunicacion", "codependencia"],
        risk_level="low",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(patient3)
    await db.commit()

    # Session 1 — Laura
    s1_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=1,
        session_date=date(2026, 1, 5),
        raw_dictation=(
            "Primera sesión. Paciente de 41 años. Crisis de pareja: considera separarse después de 10 años. "
            "Refiere que 'ya no se reconoce' en la relación."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Paciente acude en crisis de pareja. 10 años de relación. Considera separación. "
            "Pérdida de identidad percibida: 'ya no me reconozco'.\n\n"
            "**O:** Afecto angustiado, llanto intermitente. Niega violencia.\n\n"
            "**A:** Crisis relacional con componente de pérdida de identidad. Decisión de separación ambivalente.\n\n"
            "**P:** Explorar historia relacional. Identificar necesidades propias vs. de la pareja. "
            "No aconsejar ni guiar la decisión."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s1_p3)
    await db.commit()

    note1_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s1_p3.id,
        format="SOAP",
        subjective="41 años. Crisis de pareja tras 10 años. Considera separación. 'Ya no me reconozco'.",
        objective="Afecto angustiado, llanto intermitente. Niega violencia.",
        assessment="Crisis relacional con pérdida de identidad. Ambivalencia ante separación.",
        plan="Explorar historia relacional. Identificar necesidades propias. Sin guiar decisión.",
        detected_patterns=["crisis_relacional", "perdida_identidad"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "41 años. Crisis de pareja tras 10 años. Considera separación. 'Ya no me reconozco'. "
            "Crisis relacional con pérdida de identidad. Ambivalencia ante separación."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note1_p3)
    await db.commit()

    # Session 2 — Laura
    s2_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=2,
        session_date=date(2026, 1, 12),
        raw_dictation=(
            "Segunda sesión. Trabajo en patrones de comunicación. Identifica que siempre cede para evitar "
            "conflictos. Se angustia al pensar en expresar sus necesidades."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Patrón de comunicación disfuncional identificado: cede consistentemente para evitar conflictos. "
            "Angustia al contemplar asertividad.\n\n"
            "**O:** Habla rápido al describir situaciones con la pareja. Se detiene cuando se le pide que imagine "
            "expresar sus necesidades.\n\n"
            "**A:** Los detonantes de la crisis (identificados en S1) tienen raíz en este patrón comunicacional: "
            "la acumulación de necesidades no expresadas llevó a la crisis actual.\n\n"
            "**P:** Psicoeducación sobre comunicación asertiva. Ejercicio: identificar una necesidad no expresada "
            "esta semana."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s2_p3)
    await db.commit()

    note2_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s2_p3.id,
        format="SOAP",
        subjective="Patrón: cede siempre para evitar conflicto. Angustia ante asertividad.",
        objective="Habla rápido, se detiene al imaginar asertividad.",
        assessment="Comunicación disfuncional como raíz de la crisis (S1).",
        plan="Psicoeducación asertividad. Identificar una necesidad no expresada.",
        detected_patterns=["comunicacion_disfuncional", "evitacion_conflicto"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Patrón: cede siempre para evitar conflicto. Angustia ante asertividad. "
            "Comunicación disfuncional como raíz de la crisis (S1)."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note2_p3)
    await db.commit()

    # Session 3 — Laura
    s3_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=3,
        session_date=date(2026, 1, 19),
        raw_dictation=(
            "Tercera sesión. Trabajo en límites y necesidades propias. Paciente reconoce que 'siempre pone a su "
            "pareja primero'. Emerge patrón de codependencia."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Reconocimiento de patrón: 'siempre pongo a mi pareja primero'. Inicio de conciencia sobre "
            "codependencia.\n\n"
            "**O:** Más reflexiva. Menor llanto que sesiones anteriores.\n\n"
            "**A:** Desde la primera sesión emergen indicadores de codependencia: pérdida de identidad propia, "
            "comunicación cedente, necesidades subordinadas. Hoy el patrón se hace explícito para la paciente.\n\n"
            "**P:** Trabajo en límites saludables. Identificar actividades/intereses propios que no dependan de la "
            "pareja. Explorar historia de vínculos."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s3_p3)
    await db.commit()

    note3_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s3_p3.id,
        format="SOAP",
        subjective="'Siempre pongo a mi pareja primero'. Reconoce codependencia emergente.",
        objective="Más reflexiva, menor llanto.",
        assessment="Codependencia explicitada (emergente desde S1). Patrón sistémico claro.",
        plan="Límites saludables. Actividades propias. Explorar historia de vínculos.",
        detected_patterns=["codependencia", "perdida_identidad"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "'Siempre pongo a mi pareja primero'. Reconoce codependencia emergente. "
            "Codependencia explicitada (emergente desde S1). Patrón sistémico claro."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note3_p3)
    await db.commit()

    # Session 4 — Laura
    s4_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=4,
        session_date=date(2026, 1, 26),
        raw_dictation=(
            "Cuarta sesión. La paciente relata la primera conversación 'real' que tuvo con su pareja esta semana. "
            "Habló de sus necesidades. Fue difícil pero no hubo conflicto."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Primera conversación asertiva con la pareja. Expresó necesidades. Resultado: sin conflicto, "
            "pareja receptiva.\n\n"
            "**O:** Sorprendida y aliviada. Más erguida en la silla.\n\n"
            "**A:** Contraste significativo con los patrones históricos: en sesiones anteriores, la paciente anticipaba "
            "conflicto al expresar necesidades. El experimento conductual fue exitoso. Progreso real medible.\n\n"
            "**P:** Reforzar la comunicación asertiva. Planificar segunda conversación. Continuar trabajo en límites."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s4_p3)
    await db.commit()

    note4_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s4_p3.id,
        format="SOAP",
        subjective="Primera conversación asertiva exitosa. Expresó necesidades sin conflicto.",
        objective="Sorprendida y aliviada. Postura más erguida.",
        assessment="Contraste con patrones históricos (S1-S3). Experimento conductual exitoso.",
        plan="Reforzar asertividad. Segunda conversación. Continuar límites.",
        detected_patterns=["progreso_asertividad", "cambio_conductual"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Primera conversación asertiva exitosa. Expresó necesidades sin conflicto. "
            "Contraste con patrones históricos (S1-S3). Experimento conductual exitoso."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note4_p3)
    await db.commit()

    # Session 5 — Laura
    s5_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=5,
        session_date=date(2026, 2, 2),
        raw_dictation=(
            "Quinta sesión. Ambivalencia: quiere continuar la relación pero no puede seguir 'igual que antes'. "
            "Teme que los cambios que está haciendo destruyan la relación."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Ambivalencia clara: deseo de continuar la relación vs. incapacidad de volver al patrón anterior. "
            "Miedo a que el cambio personal rompa la relación.\n\n"
            "**O:** Tono tenso. Llanto al hablar del miedo a la pérdida.\n\n"
            "**A:** La ambivalencia es el reflejo del trabajo terapéutico: los límites trabajados en S3 están siendo "
            "internalizados, pero generan ansiedad porque implican un cambio en la dinámica relacional establecida.\n\n"
            "**P:** Explorar miedo a la pérdida. Trabajar en diferenciación entre cambio personal y ruptura relacional. "
            "No precipitar decisiones."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s5_p3)
    await db.commit()

    note5_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s5_p3.id,
        format="SOAP",
        subjective="Ambivalencia: quiere continuar pero no puede seguir igual. Teme que el cambio rompa la relación.",
        objective="Tono tenso, llanto ante miedo a pérdida.",
        assessment="Ambivalencia como señal de internalización de límites (S3). Ansiedad por cambio.",
        plan="Explorar miedo a pérdida. Diferenciar cambio personal de ruptura.",
        detected_patterns=["ambivalencia", "ansiedad_cambio"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Ambivalencia: quiere continuar pero no puede seguir igual. Teme que el cambio rompa la relación. "
            "Ambivalencia como señal de internalización de límites (S3). Ansiedad por cambio."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note5_p3)
    await db.commit()

    # Session 6 — Laura
    s6_p3 = Session(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        session_number=6,
        session_date=date(2026, 2, 9),
        raw_dictation=(
            "Sexta sesión. Decisión tomada: continuará la relación pero desde un lugar diferente. Inicio de trabajo "
            "en duelo anticipatorio por 'la versión de sí misma que deja atrás'."
        ),
        format="SOAP",
        ai_response=(
            "**S:** Decisión tomada: continuar la relación con cambios. Duelo anticipatorio por la identidad previa "
            "('la versión de mí misma que deja atrás').\n\n"
            "**O:** Serena, decidida. Sin llanto.\n\n"
            "**A:** A lo largo de las 6 sesiones, Laura ha recorrido el arco completo: de crisis e identidad perdida "
            "(S1) a límites internalizados, comunicación asertiva funcional, y decisión consciente. Los factores "
            "protectores (reflexividad, motivación) sostuvieron el proceso.\n\n"
            "**P:** Trabajo en duelo por identidad previa. Consolidar logros. Seguimiento mensual opcional."
        ),
        status="confirmed",
        is_archived=False,
        messages=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(s6_p3)
    await db.commit()

    note6_p3 = ClinicalNote(
        id=uuid.uuid4(),
        session_id=s6_p3.id,
        format="SOAP",
        subjective="Decisión: continuar relación desde lugar diferente. Duelo por identidad previa.",
        objective="Serena, decidida. Sin llanto.",
        assessment="Arco completo (S1-S6): de crisis a decisión consciente. Factores protectores activos.",
        plan="Duelo por identidad previa. Consolidar logros. Seguimiento opcional.",
        detected_patterns=["decision_consciente", "cierre_terapeutico"],
        alerts=[],
        suggested_next_steps=[],
        evolution_delta={},
        embedding=embed(
            "Decisión: continuar relación desde lugar diferente. Duelo por identidad previa. "
            "Arco completo (S1-S6): de crisis a decisión consciente. Factores protectores activos."
        ),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(note6_p3)
    await db.commit()

    # Patient 3 profile
    profile3 = PatientProfile(
        id=uuid.uuid4(),
        patient_id=patient3.id,
        recurring_themes=["codependencia", "comunicacion_disfuncional", "conflicto_pareja"],
        protective_factors=["alta_reflexividad", "motivacion_al_cambio", "apoyo_familiar"],
        risk_factors=["codependencia", "perdida_identidad_propia"],
        progress_indicators={
            "sesiones_completadas": 6,
            "nivel_asertividad_inicio": 1,
            "nivel_asertividad_actual": 7,
            "hitos": ["primera_conversacion_asertiva", "limites_internalizados", "decision_consciente"],
        },
        patient_summary=(
            "Conflicto de pareja con codependencia. Trabajo en límites y asertividad. "
            "Decisión consciente alcanzada."
        ),
        updated_at=datetime.utcnow(),
    )
    db.add(profile3)
    await db.commit()

    # ─────────────────────────────────────────────────────────────────────────
    # Post-seed validation
    # ─────────────────────────────────────────────────────────────────────────
    result = await db.execute(text("SELECT COUNT(*) FROM clinical_notes WHERE embedding IS NOT NULL;"))
    count = result.scalar()
    assert count == 18, f"Expected 18 embeddings, got {count}"
    print("✓ 3 pacientes, 18 sesiones, 18 embeddings generados")


if __name__ == "__main__":
    asyncio.run(main())
