export default function Pricing() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="inline-block border border-ink-muted rounded-xl px-8 py-8 max-w-sm w-full text-left">
        <p className="text-3xl font-semibold text-ink mb-1">$499 MXN</p>
        <p className="text-ink-secondary text-sm mb-6">
          por mes · Incluye todos los pacientes
        </p>

        <ul className="space-y-2 mb-6 text-sm text-ink-secondary">
          {[
            'Pacientes ilimitados',
            'Notas SOAP con IA',
            'Historial clínico completo',
            'Soporte por email',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-sage">✓</span> {f}
            </li>
          ))}
        </ul>

        <a
          href="https://app.syquex.mx/registro"
          className="block w-full text-center bg-sage hover:bg-sage-dark text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
        >
          Empieza gratis — 14 días
        </a>

        <p className="text-xs text-ink-tertiary mt-4 leading-relaxed">
          Puedes cancelar en cualquier momento escribiendo a hola@syquex.mx.
          Al cancelar, tu acceso continúa hasta el fin del período pagado.
          No se emiten reembolsos por períodos parciales.
        </p>
      </div>
    </section>
  )
}
