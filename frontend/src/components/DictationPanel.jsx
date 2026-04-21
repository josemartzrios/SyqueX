export default function DictationPanel({ value, onChange, onGenerate, loading, orphanedSessions = [], onResumeOrphan, onDiscardOrphan }) {
  const handleGenerate = () => {
    if (!value.trim() || loading) return;
    onGenerate(value.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        
        {orphanedSessions.length > 0 && !loading && (
          <div className="mb-4 space-y-2">
            <p className="text-[10px] font-bold text-[#c4935a] uppercase tracking-wide px-1">Sesiones sin confirmar</p>
            {orphanedSessions.map(orphan => (
              <div key={orphan.id} className="bg-[#fdf8f4] border border-[#f5e6d3] rounded-xl px-4 py-3 flex items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-ink line-clamp-1 italic">"{orphan.raw_dictation}"</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    {new Date(orphan.session_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                    onClick={() => onDiscardOrphan(orphan.id)}
                    className="p-1.5 text-ink-tertiary hover:text-red-500 transition-colors"
                    title="Descartar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => onResumeOrphan(orphan)}
                    className="bg-[#c4935a] text-white px-3 py-1 rounded-lg text-[11px] font-medium hover:bg-[#b07d4b] transition-colors"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="w-full h-52 resize-none bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-[#18181b] outline-none focus:border-[#5a9e8a] focus:ring-0 transition-colors placeholder-ink-muted disabled:bg-slate-50"
          placeholder="Dicta los puntos clave de la sesión…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        {value.trim() && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c4935a]" />
            <span className="text-[10px] text-[#c4935a] font-medium">Borrador guardado</span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex-shrink-0">
        <button
          onClick={handleGenerate}
          disabled={loading || !value.trim()}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
            loading || !value.trim()
              ? 'bg-[#5a9e8a] text-white opacity-40 cursor-not-allowed'
              : 'bg-[#5a9e8a] text-white hover:bg-[#4a8a78] active:scale-95'
          }`}
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Generando nota">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generando…
            </>
          ) : (
            <>Generar nota →</>
          )}
        </button>
      </div>
    </div>
  );
}
