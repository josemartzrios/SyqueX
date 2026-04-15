export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-surface border-b border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-ink tracking-tight text-lg">
          SyqueX
        </span>
        <a
          href="https://app.syquex.mx/login"
          className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors"
        >
          Iniciar sesión →
        </a>
      </div>
    </nav>
  )
}
