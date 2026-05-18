import FadeIn from './FadeIn'

const steps = [
  {
    step: '01',
    title: 'Dicta tu disponibilidad',
    desc: 'Antes de tu primera sesión, dicta tus horas libres. La IA extrae los horarios y los publica automáticamente en el portal del paciente. Ambos reciben notificación por correo al confirmar la cita.',
    badge: 'Dictado de voz',
  },
  {
    step: '02',
    title: 'Dicta lo que pasó',
    desc: 'Al terminar tu sesión, escribe o dicta un resumen libre. No necesitas estructura ni formato — escríbelo como lo piensas.',
    badge: 'SOAP o personalizada',
  },
  {
    step: '03',
    title: 'SyqueX genera la nota',
    desc: 'La IA estructura tu dictado en una nota clínica profesional con observaciones, estado de ánimo y plan terapéutico. Edita lo que quieras antes de confirmar.',
    badge: 'Editable y descargable',
  },
  {
    step: '04',
    title: 'Pregúntale al agente',
    desc: 'Antes de tu próxima sesión, pregunta: "¿Qué patrones hay?", "¿Hay señales de alerta?", "¿Cuáles son los acuerdos pendientes?". El agente analiza todas las sesiones.',
    badge: 'Tu copiloto clínico',
  },
  {
    step: '05',
    title: 'El paciente lleva su seguimiento',
    desc: 'Al confirmar la nota, SyqueX genera un resumen con los temas trabajados y las tareas al portal del paciente. Tú los revisas y envías. El paciente los consulta cuando quiera, dándole seguimiento a sus tareas.',
    badge: 'Seguimiento entre sesiones',
  },
]

export default function HowItWorks() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <h2 className="font-serif text-3xl font-normal text-center mb-2 text-ink">
            Cómo funciona
          </h2>
          <p className="text-center text-ink-tertiary text-sm mb-12">
            Cinco pasos. El ciclo completo.
          </p>
        </FadeIn>
        <div className="flex gap-7 flex-wrap justify-center">
          {steps.map(({ step, title, desc, badge }, i) => (
            <FadeIn key={step} delay={i * 0.15} className="w-full sm:flex-1 sm:min-w-[260px]">
              <div className="bg-white rounded-2xl p-5 sm:p-8 border border-ink-muted h-full hover:shadow-xl hover:shadow-sage/10 hover:-translate-y-1 transition-all duration-300">
                <div className="font-serif text-5xl text-sage-light font-bold mb-3">{step}</div>
                <h3 className="text-lg font-semibold mb-2.5 text-ink">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-secondary mb-4">{desc}</p>
                <div className="inline-block text-xs font-semibold text-sage bg-sage-light px-3 py-1 rounded-full">
                  {badge}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
