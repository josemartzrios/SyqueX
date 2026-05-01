import { useState } from 'react'

const SLIDES_DESKTOP = [
  {
    icon: '👋',
    title: 'Bienvenido a SyqueX',
    body: 'Tu flujo de trabajo: agrega un paciente → dicta tus apuntes → la IA genera la nota → confirma y guarda.',
    flow: true,
  },
  {
    icon: '👤',
    title: 'Crea tu primer paciente',
    body: 'Haz clic en el botón + junto a "Pacientes" en el sidebar. Cada paciente tiene su propio historial de sesiones y notas clínicas.',
  },
  {
    icon: '🎙️',
    title: 'Dicta o escribe tus apuntes',
    body: 'Escribe libremente en el panel de dictado — sin estructura. La IA organiza automáticamente tu nota clínica.',
  },
  {
    icon: '📄',
    title: 'Revisa y confirma la nota',
    body: 'La nota generada aparece a la derecha. Edita cualquier campo directo en la nota antes de confirmar. Queda guardada en el expediente.',
  },
]

function FlowDiagram() {
  const steps = ['Paciente', 'Dictar', 'Nota IA', 'Confirmar']
  return (
    <div className="flex items-center justify-center gap-1 mt-3 flex-wrap">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className="text-[11px] font-medium bg-[#f4f4f2] text-[#18181b] px-2 py-1 rounded-md">{s}</span>
          {i < steps.length - 1 && <span className="text-[#5a9e8a] text-[10px]">→</span>}
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ current, total }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-[3px] flex-1 rounded-full transition-colors ${
            i < current ? 'bg-[#5a9e8a]' : i === current ? 'bg-[#c4935a]' : 'bg-[#e5e7eb]'
          }`}
        />
      ))}
    </div>
  )
}

export default function TutorialModal({ visible, onClose, isMobile, noteFormat }) {
  const [step, setStep] = useState(0)

  if (!visible) return null

  const slides = isMobile ? [...SLIDES_DESKTOP, { pwa: true }] : SLIDES_DESKTOP
  const total = slides.length
  const current = slides[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  const handleClose = () => {
    localStorage.setItem('syquex_tutorial_done', 'true')
    onClose()
  }

  const handleNext = () => {
    if (isLast) { handleClose(); return }
    setStep((s) => s + 1)
  }

  const handlePrev = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,24,27,0.55)' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[#9ca3af] uppercase tracking-wide font-medium">
            {step + 1} de {total}
          </span>
          <button
            onClick={handleClose}
            aria-label="Cerrar tutorial"
            className="text-[#d1d5db] hover:text-[#9ca3af] transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <ProgressBar current={step} total={total} />

        {/* Slide content */}
        {!current.pwa && (
          <div className="text-center">
            <div className="text-3xl mb-2">{current.icon}</div>
            <p className="text-[15px] font-semibold text-[#18181b] mb-2">{current.title}</p>
            <p className="text-[13px] text-[#6b7280] leading-relaxed">{current.body}</p>
            {current.flow && <FlowDiagram />}
          </div>
        )}

        {/* Placeholder for PWA slide — Task 4 */}
        {current.pwa && (
          <div className="text-center">
            <div className="text-3xl mb-2">📱</div>
            <p className="text-[15px] font-semibold text-[#18181b] mb-2">Instala la app en tu celular</p>
            <p className="text-[13px] text-[#6b7280]">Cargando instrucciones...</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {!isFirst ? (
            <button
              onClick={handlePrev}
              className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors"
            >
              ← Anterior
            </button>
          ) : <div />}

          <button
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-[#5a9e8a] text-white text-[13px] font-medium hover:bg-[#4e8c7a] transition-colors"
          >
            {isLast ? 'Finalizar' : 'Siguiente →'}
          </button>
        </div>

      </div>
    </div>
  )
}
