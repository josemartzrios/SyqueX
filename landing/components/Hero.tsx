export default function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
      <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-ink leading-tight tracking-tight mb-6">
        El asistente de documentación clínica
        <br className="hidden sm:block" /> para psicólogos
      </h1>
      <p className="text-lg sm:text-xl text-ink-secondary max-w-xl mx-auto mb-10 leading-relaxed">
        Dicta tu sesión. SyqueX genera la nota personalizada o SOAP al instante —
        estructurada, lista para el expediente.
      </p>
      <p className="text-lg sm:text-xl text-ink-secondary max-w-xl mx-auto mb-10 leading-relaxed">
        Deja de perder tiempo revisando archivos o notas dispersas.
        En segundos tienes contexto del paciente gracias al agente de IA.
      </p>
      <a
        href="https://app.syquex.mx/registro"
        className="inline-block bg-sage hover:bg-sage-dark text-white font-medium px-8 py-3 rounded-lg transition-colors text-base"
      >
        Empieza gratis — 14 días
      </a>
    </section>
  )
}
