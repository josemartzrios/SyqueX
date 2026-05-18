import FadeIn from './FadeIn'

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 mt-0.5">
      <circle cx="10" cy="10" r="10" fill="#5a9e8a" />
      <path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MockEvolucion() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-ink-muted w-full max-w-[320px]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-sage flex items-center justify-center text-white text-xs font-semibold shrink-0">
          CA
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">Carlos Mendoza</div>
          <div className="text-xs text-ink-tertiary">7 sesiones confirmadas</div>
        </div>
      </div>
      <div className="flex border-b-2 border-ink-muted mb-3 overflow-hidden">
        {['Escribir', 'Nota', 'Historial', 'Evolución'].map((t, i) => (
          <div
            key={t}
            className={`text-xs px-2.5 py-2 ${i === 3
              ? 'text-sage border-b-2 border-sage -mb-0.5 font-semibold'
              : 'text-ink-tertiary'
              }`}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="bg-sage text-white text-xs px-3.5 py-3 rounded-xl mb-3 ml-8 leading-relaxed">
        ¿Qué patrones destacan en las últimas sesiones?
      </div>
      <div className="bg-surface border border-ink-muted text-xs px-3.5 py-3 rounded-xl mb-3 leading-relaxed text-ink">
        <strong>Hay dos patrones que destacan</strong> en el historial de Carlos.
        <br />
        <br />
        El primero es un <strong>avance progresivo en el insight</strong>: pasó de
        reconocer el patrón de manera general en la sesión 1, a vincularlo con una
        experiencia pasada...
        <br />
        <br />
        El segundo es una{' '}
        <strong>brecha entre el avance conductual y la regulación emocional</strong>
        ...
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['¿Hay señales de alerta activas?', '¿Qué trabajar en la próxima sesión?'].map(
          (s) => (
            <div
              key={s}
              className="text-xs px-3 py-1.5 rounded-full border border-sage text-sage bg-sage-light"
            >
              {s}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function MockPortalPaciente() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-ink-muted w-full max-w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="w-8 h-8 rounded-lg bg-sage flex items-center justify-center text-white text-sm font-bold">
          s
        </div>
        <span className="text-xs text-ink-tertiary">Cerrar sesión</span>
      </div>

      <div className="text-lg font-bold text-ink mb-4">Mis Sesiones</div>

      {/* Session pills */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="px-3.5 py-2.5 rounded-xl border border-ink-muted bg-white">
          <div className="text-[10px] text-sage font-semibold mb-1 tracking-wide">6 MAY</div>
          <div className="text-xs text-ink-secondary">Hoy exploramos cómo algunas ...</div>
        </div>
        <div className="px-3.5 py-2.5 rounded-xl border-2 border-sage bg-white">
          <div className="text-[10px] text-sage font-semibold mb-1 tracking-wide">6 MAY</div>
          <div className="text-xs text-ink font-medium">Hoy hablamos sobre la discusió...</div>
        </div>
      </div>

      {/* Session detail */}
      <div className="border border-ink-muted rounded-xl p-4 bg-white">
        <div className="text-[10px] text-sage font-bold tracking-widest mb-1">RESUMEN DE SESIÓN</div>
        <div className="text-sm font-semibold text-ink mb-3.5">6 de mayo de 2026</div>

        <div className="text-[10px] text-sage font-bold tracking-widest mb-1.5">TEMAS TRABAJADOS</div>
        <p className="text-xs leading-relaxed text-ink-secondary mb-4">
          Hoy hablamos sobre la discusión que tuviste con tu pareja y cómo reconoces
          que a veces sientes que tus reacciones se te van de las manos, algo que has
          notado que también pasó en relaciones anteriores.
        </p>

        <div className="text-[10px] text-sage font-bold tracking-widest mb-2">TAREAS Y PROPÓSITOS</div>
        <div className="px-3.5 py-2.5 rounded-xl border-l-[3px] border-sage bg-surface text-xs leading-relaxed text-ink italic mb-3.5">
          Hablar las cosas en persona y no por teléfono.
        </div>

        <div className="text-[10px] text-sage font-bold tracking-widest mb-1">PRÓXIMA SESIÓN</div>
        <div className="text-sm font-semibold text-ink">29 de mayo</div>
      </div>
    </div>
  )
}

function MockAgendamiento() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-ink-muted w-full max-w-[320px]">
      <div className="text-[10px] text-sage font-bold tracking-widest mb-3">
        DICTADO DE DISPONIBILIDAD
      </div>

      <div className="bg-surface border border-ink-muted text-xs px-3.5 py-3 rounded-xl mb-4 leading-relaxed text-ink-secondary italic">
        "Tengo libre martes y jueves de 4 a 6, y sábados de 9 a 12..."
      </div>

      <div className="text-[10px] text-ink-tertiary font-semibold tracking-wide mb-2">
        Horarios detectados:
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {['MAR 4–6pm', 'JUE 4–6pm', 'SÁB 9–12pm'].map((slot) => (
          <span
            key={slot}
            className="bg-sage-light text-sage text-xs font-semibold px-3 py-1 rounded-full"
          >
            {slot}
          </span>
        ))}
      </div>

      <button
        disabled
        aria-hidden="true"
        className="bg-sage text-white text-xs font-semibold rounded-xl py-2.5 w-full mb-3 cursor-default opacity-100"
      >
        Publicar horarios
      </button>

      <div className="flex justify-center">
        <span className="bg-sage-light text-sage text-xs rounded-full px-3 py-1 flex items-center gap-1">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#5a9e8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Notificación enviada al paciente
        </span>
      </div>
    </div>
  )
}

export default function FeatureHighlight() {
  return (
    <>
      {/* Agendamiento inteligente */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-8 sm:gap-14 flex-wrap justify-center">
          <FadeIn className="flex-none w-full sm:w-auto flex justify-center sm:block">
            <MockAgendamiento />
          </FadeIn>
          <FadeIn delay={0.2} className="w-full sm:flex-1 sm:min-w-[280px] max-w-lg">
            <div className="text-xs font-bold text-sage tracking-widest mb-3">
              AGENDAMIENTO INTELIGENTE
            </div>
            <h2 className="font-serif text-3xl font-normal mb-4 text-ink leading-snug">
              Dicta tus horas libres.{' '}
              <em>El paciente agenda solo.</em>
            </h2>
            <p className="text-sm leading-relaxed text-ink-secondary mb-6">
              Sin formularios ni apps externas. Dicta cuándo estás disponible y SyqueX
              publica tus horarios en el portal del paciente automáticamente.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Dicta tu disponibilidad — la IA interpreta los horarios y tú confirmas',
                'El paciente elige su cita desde su portal, sin idas y vueltas por WhatsApp',
                'Ambos reciben notificación por correo al instante',
              ].map((t) => (
                <div key={t} className="flex gap-2.5 items-start">
                  <CheckIcon />
                  <span className="text-sm leading-relaxed text-ink">{t}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Agente de evolución clínica */}
      <section className="bg-surface py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-8 sm:gap-14 flex-wrap justify-center">
          <FadeIn className="flex-none w-full sm:w-auto flex justify-center sm:block">
            <MockEvolucion />
          </FadeIn>
          <FadeIn delay={0.2} className="w-full sm:flex-1 sm:min-w-[280px] max-w-lg">
            <div className="text-xs font-bold text-sage tracking-widest mb-3">
              LO QUE NOS HACE DIFERENTES
            </div>
            <h2 className="font-serif text-3xl font-normal mb-4 text-ink leading-snug">
              Un agente de IA que conoce a{' '}
              <em>todo</em> el historial de tu paciente
            </h2>
            <p className="text-sm leading-relaxed text-ink-secondary mb-6">
              No es un chatbot genérico. SyqueX analiza cada nota que has dictado,
              cada sesión confirmada, cada patrón emocional. Pregúntale lo que
              necesites antes de tu próxima cita.
            </p>
            <div className="flex flex-col gap-3">
              {[
                '"¿Cuándo mencionó el paciente ideación suicida por primera vez?"',
                '"¿Está cumpliendo los acuerdos conductuales?"',
                '"¿Qué sugiere trabajar en la próxima sesión?"',
              ].map((t) => (
                <div key={t} className="flex gap-2.5 items-start">
                  <CheckIcon />
                  <span className="text-sm leading-relaxed text-ink italic">{t}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Seguimiento del paciente con acuerdos */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-8 sm:gap-14 flex-wrap justify-center">
          <FadeIn delay={0.2} className="w-full sm:flex-1 sm:min-w-[280px] max-w-lg">
            <div className="text-xs font-bold text-sage tracking-widest mb-3">
              SEGUIMIENTO DE PACIENTES
            </div>
            <h2 className="font-serif text-3xl font-normal mb-4 text-ink leading-snug">
              Tu paciente llega preparado.
              <br />
              <em>Tú también.</em>
            </h2>
            <p className="text-sm leading-relaxed text-ink-secondary mb-6">
              Al confirmar una nota, SyqueX envía los temas trabajados y
              tareas de la sesión al portal del paciente. Él los ve, los completa,
              y tú llegas a la siguiente sesión con contexto real.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Temas trabajados y tareas generados automáticamente por la IA',
                'El psicólogo edita lo que considere necesario',
                'El paciente visualiza lo conversado y sus tareas en su portal',
              ].map((t) => (
                <div key={t} className="flex gap-2.5 items-start">
                  <CheckIcon />
                  <span className="text-sm leading-relaxed text-ink">{t}</span>
                </div>
              ))}
            </div>
          </FadeIn>
          <FadeIn className="flex-none w-full sm:w-auto flex justify-center sm:block">
            <MockPortalPaciente />
          </FadeIn>
        </div>
      </section>
    </>
  )
}
