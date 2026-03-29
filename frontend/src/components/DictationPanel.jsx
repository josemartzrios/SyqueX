import { useState } from 'react';

export default function DictationPanel({ onGenerate, loading, patientName }) {
  const [value, setValue] = useState('');

  const handleGenerate = () => {
    if (!value.trim() || loading) return;
    onGenerate(value.trim());
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with label and date */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-3">
          Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        {/* Textarea */}
        <textarea
          className="w-full h-52 resize-none bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[14px] leading-relaxed text-[#18181b] outline-none focus:border-[#5a9e8a] focus:ring-0 transition-colors placeholder-ink-muted disabled:bg-slate-50"
          placeholder="Dicta los puntos clave de la sesión…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          readOnly={loading}
        />
      </div>

      {/* Toolbar with buttons */}
      <div className="px-5 pb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Voice button (disabled) */}
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#f4f4f2] border border-black/[0.07] rounded-xl text-[14px] font-medium text-ink-muted opacity-50 cursor-not-allowed transition-colors"
          >
            ⏺ Voz — próximamente
          </button>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !value.trim()}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
              loading || !value.trim()
                ? 'bg-[#5a9e8a] text-white opacity-40 cursor-not-allowed'
                : 'bg-[#5a9e8a] text-white hover:bg-[#4a8a78] active:scale-95'
            }`}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando…
              </>
            ) : (
              <>
                Generar nota →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
