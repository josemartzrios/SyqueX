import FadeIn from './FadeIn'

const rows: [string, string, string][] = [
  ['Recuerda sesiones anteriores', '✕', '✓'],
  ['Nota clínica estructurada', 'Manual', 'Automática'],
  ['Historial del paciente', 'No existe', 'Completo'],
  ['Análisis de patrones', 'Por sesión', 'Cruzado'],
  ['Acuerdo DPA de privacidad', 'No', 'Sí'],
  ['Conforme a NOM-004', 'No', 'Sí'],
]

export default function ChatGPTComparison() {
  return (
    <section className="bg-surface py-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <FadeIn>
          <h2 className="font-serif text-3xl font-normal text-center mb-2 text-ink">
            ¿Por qué no usar ChatGPT?
          </h2>
          <p className="text-center text-sm text-ink-tertiary mb-10">
            ChatGPT no recuerda a tu paciente. SyqueX sí.
          </p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="bg-white rounded-2xl overflow-hidden border border-ink-muted">
            <div className="flex border-b border-ink-muted">
              <div className="flex-[2] px-3 sm:px-5 py-4 text-xs sm:text-sm font-semibold text-ink-secondary bg-surface" />
              <div className="flex-1 px-3 sm:px-5 py-4 text-xs sm:text-sm font-semibold text-ink-secondary text-center bg-surface">
                ChatGPT
              </div>
              <div className="flex-1 px-3 sm:px-5 py-4 text-xs sm:text-sm font-semibold text-sage text-center bg-sage-light">
                SyqueX
              </div>
            </div>
            {rows.map(([label, gpt, sq], i) => (
              <div
                key={label}
                className={`flex border-t border-ink-muted ${i % 2 === 0 ? 'bg-white' : 'bg-surface'}`}
              >
                <div className="flex-[2] px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm text-ink">{label}</div>
                <div
                  className={`flex-1 px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm text-center ${
                    gpt === '✕' || gpt === 'No' ? 'text-red-400' : 'text-ink-tertiary'
                  }`}
                >
                  {gpt}
                </div>
                <div className="flex-1 px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm text-center text-sage font-semibold">
                  {sq}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
