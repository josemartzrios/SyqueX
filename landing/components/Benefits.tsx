const benefits = [
  {
    icon: '⚡',
    title: 'Notas personalizadas o SOAP en segundos',
    description:
      'La IA estructura el dictado a tu estilo o en formato SOAP (Subjetivo, Objetivo, Análisis y Plan)',
  },
  {
    icon: '🔍',
    title: 'Historial con búsqueda semántica',
    description:
      'Encuentra patrones clínicos en sesiones anteriores al instante con ayuda del agente de IA.',
  },
  {
    icon: '🔒',
    title: 'Datos protegidos bajo LFPDPPP',
    description:
      'Tu información y la de tus pacientes protegidas con encriptación y respaldos bajo la ley mexicana de privacidad.',
  },
]

export default function Benefits() {
  return (
    <section className="bg-surface border-y border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {benefits.map((b) => (
            <div key={b.title} className="text-center sm:text-left">
              <div className="text-2xl mb-3">{b.icon}</div>
              <h3 className="font-semibold text-ink mb-2">{b.title}</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                {b.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
