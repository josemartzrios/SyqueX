export default function Footer() {
  return (
    <footer className="bg-surface border-t border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-ink-secondary">
          <div className="space-y-1">
            <p>© 2026 SyqueX</p>
            <p>Ciudad de México, México · RFC: [RFC]</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href="/privacidad" className="hover:text-ink transition-colors">
              Aviso de Privacidad
            </a>
            <a href="/terminos" className="hover:text-ink transition-colors">
              Términos y Condiciones
            </a>
            <a
              href="mailto:hola@syquex.mx"
              className="hover:text-ink transition-colors"
            >
              hola@syquex.mx
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
