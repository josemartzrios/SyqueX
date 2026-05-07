const benefits = [
  {
    icon: '⚡',
    title: 'Notas clínicas en segundos',
    description:
      'Escribe libremente. SyqueX genera tu nota en el formato que tú elijas, personalizado a tu enfoque.',
  },
  {
    icon: '🧠',
    title: 'Memoria clínica acumulativa',
    description:
      'El agente recuerda el historial completo de cada paciente. Detecta patrones, señales de alerta y evolución sin que tengas que releer ninguna nota.',
  },
  {
    icon: '📋',
    title: 'Seguimiento para tus pacientes',
    description:
      'Tu paciente recibe las tareas y acuerdos de cada sesión. Llega preparado. No olvida lo que trabajaron juntos.',
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
