'use client'

import { useState } from 'react'

const faqs = [
  {
    question: '¿Es seguro subir datos de pacientes?',
    answer:
      'Sí. SyqueX fue diseñado desde cero para cumplir con la Ley Federal de Protección de Datos Personales en Posesión de Particulares (LFPDPPP). Todos los datos clínicos se guardan cifrados con estándares bancarios — solo tú tienes acceso a tu expediente. Para la generación de notas utilizamos la API de Anthropic bajo un contrato de procesamiento de datos (DPA) que prohíbe explícitamente usar tu información para entrenar modelos de inteligencia artificial. Los datos se procesan únicamente para generar la nota y se olvidan inmediatamente. SyqueX es la única herramienta de documentación clínica en México diseñada específicamente para cumplir con la ley mexicana de privacidad.',
  },
  {
    question: '¿No puede hacer lo mismo ChatGPT?',
    answer:
      'ChatGPT puede generar texto clínico, pero no recuerda nada. Cada vez que abres una conversación nueva, empieza desde cero — no sabe quién es tu paciente, qué trabajaron la sesión pasada ni qué patrones ha mostrado en los últimos meses. SyqueX construye memoria clínica acumulativa: cada sesión que documentas enriquece el historial del paciente. Con el tiempo el agente detecta patrones entre sesiones, identifica señales de alerta y sugiere focos para la próxima sesión basándose en todo el historial, no solo en lo que escribiste hoy. Además, usar ChatGPT con datos reales de pacientes tiene implicaciones legales bajo la LFPDPPP que SyqueX resuelve desde el primer día.',
  },
  {
    question: '¿El psicólogo sigue siendo responsable del contenido clínico?',
    answer:
      'Siempre. SyqueX es una herramienta de apoyo, no un sustituto del criterio profesional. El agente genera una propuesta de nota basada en tu dictado — tú la revisas, la editas y la confirmas antes de que quede guardada en el expediente. Ninguna nota se guarda sin tu aprobación explícita. La inteligencia clínica, el diagnóstico y las decisiones terapéuticas son y seguirán siendo tuyas. SyqueX existe para que dediques menos tiempo al papeleo y más tiempo a lo que solo tú puedes hacer.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="bg-white max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="font-serif text-2xl font-semibold text-ink mb-10">
        Preguntas frecuentes
      </h2>
      <div className="divide-y divide-ink-muted">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index
          return (
            <div key={index}>
              <button
                onClick={() => toggle(index)}
                className="w-full flex items-center justify-between py-5 text-left gap-4"
                aria-expanded={isOpen}
              >
                <span className="font-semibold text-ink">{faq.question}</span>
                <svg
                  className={`shrink-0 w-5 h-5 text-ink-secondary transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <p className="text-sm text-ink-secondary leading-relaxed pb-5">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
