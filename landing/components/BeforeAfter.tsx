import FadeIn from './FadeIn'

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 mt-0.5">
      <circle cx="10" cy="10" r="10" fill="#5a9e8a" />
      <path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BeforeAfter() {
  return (
    <section className="bg-surface py-20 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <FadeIn>
          <h2 className="font-serif text-3xl font-normal text-center mb-12 text-ink">
            Antes y después de{' '}
            <em className="text-sage">SyqueX</em>
          </h2>
        </FadeIn>
        <div className="flex gap-7 flex-wrap justify-center">
          <FadeIn delay={0.1} className="w-full sm:flex-1 sm:min-w-[280px]">
            <div className="bg-white rounded-2xl p-5 sm:p-8 border border-ink-muted">
              <div className="text-xs font-bold text-red-500 tracking-widest mb-4">ANTES</div>
              <div className="flex flex-col gap-3.5">
                {[
                  '20 minutos redactando notas después de cada sesión',
                  'Llegar a la cita sin recordar bien el caso',
                  'Buscar entre hojas o archivos de Word el historial',
                  'No detectar patrones entre sesiones',
                  'Documentación incompleta si hay auditoría',
                ].map((t) => (
                  <div key={t} className="flex gap-2.5 items-start">
                    <span className="text-red-500 text-base mt-0.5 shrink-0">✕</span>
                    <span className="text-sm leading-relaxed text-ink-secondary">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.2} className="w-full sm:flex-1 sm:min-w-[280px]">
            <div className="bg-white rounded-2xl p-5 sm:p-8 border-2 border-sage relative">
              <div className="absolute -top-3 left-5 bg-sage text-white text-xs font-bold px-4 py-1 rounded-full tracking-widest">
                DESPUÉS
              </div>
              <div className="mt-2 flex flex-col gap-3.5">
                {[
                  'Nota clínica lista en 45 segundos',
                  'Resumen inteligente del paciente antes de cada cita',
                  'Historial completo buscable con IA',
                  'Detección automática de patrones y señales de alerta',
                  'Expediente clínico conforme a NOM-004',
                ].map((t) => (
                  <div key={t} className="flex gap-2.5 items-start">
                    <CheckIcon />
                    <span className="text-sm leading-relaxed text-ink">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}
