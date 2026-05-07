export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-ink-muted">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
        <span className="font-semibold text-sage tracking-tight text-xl">SyqueX</span>
        <div className="flex items-center gap-6">
          <a href="#features" className="hidden sm:block text-sm text-ink-secondary hover:text-ink transition-colors">
            Funciones
          </a>
          <a href="#pricing" className="hidden sm:block text-sm text-ink-secondary hover:text-ink transition-colors">
            Precios
          </a>
          <a
            href="https://app.syquex.mx/login"
            className="text-sm font-medium text-white bg-sage hover:bg-sage-dark px-5 py-2 rounded-lg transition-colors"
          >
            Iniciar sesión
          </a>
        </div>
      </div>
    </nav>
  )
}
