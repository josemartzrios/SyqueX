import FadeIn from './FadeIn'

export default function VideoDemo() {
  return (
    <section className="py-12 sm:py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
        {/* Copy — always on top */}
        <FadeIn className="w-full text-center">
          <div className="text-xs font-bold text-sage tracking-widest mb-3">
            MÍRALO EN ACCIÓN
          </div>
          <h2 className="font-serif text-3xl font-normal mb-4 text-ink leading-snug">
            De dictado a nota clínica<br />
            <em>en menos de un minuto</em>
          </h2>
          <p className="text-sm leading-relaxed text-ink-secondary max-w-xl mx-auto">
            Dicta libremente lo que ocurrió en sesión. SyqueX estructura la nota,
            detecta patrones y prepara el resumen para tu próxima cita — todo
            sin cambiar tu flujo de trabajo.
          </p>
        </FadeIn>

        {/* Phone-sized video — centered on mobile, right-aligned on desktop */}
        <FadeIn delay={0.2} className="flex justify-center sm:justify-end w-full">
          <div
            className="rounded-[2rem] overflow-hidden shadow-2xl border-4 border-ink-muted bg-black w-full"
            style={{ maxWidth: '300px' }}
          >
            <div style={{ position: 'relative', paddingBottom: '177.78%', height: 0, overflow: 'hidden' }}>
              <iframe
                src="https://www.youtube.com/embed/czmHUu2LU30?rel=0&modestbranding=1"
                frameBorder={0}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title="SyqueX en acción — crea una nota clínica en segundos"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
