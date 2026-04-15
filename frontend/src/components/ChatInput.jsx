import { useState } from 'react';

const WHITESPACE_RE = /\s+/;
const NEWLINE_RE = /\n/;

export default function ChatInput({ onSend, loading }) {
  const [dictation, setDictation] = useState('');

  const handleSend = (format) => {
    if (!dictation.trim() || loading) return;
    onSend(dictation, format);
    setDictation('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend('chat');
    }
  };

  const trimmed = dictation.trim();
  const wordCount = trimmed ? trimmed.split(WHITESPACE_RE).length : 0;
  const hasText = wordCount > 0;

  return (
    <div className={`bg-white border rounded-2xl px-4 py-3 flex flex-col gap-2 transition-all
      ${loading
        ? 'border-ink/[0.07]'
        : 'border-ink/[0.10] focus-within:border-sage/50 focus-within:shadow-sm focus-within:shadow-sage/10'
      }`}
    >
      {/* Textarea — full width, sin botón al lado */}
      <textarea
        className="w-full bg-transparent text-ink placeholder-ink-tertiary font-sans text-[14px] leading-relaxed focus:outline-none resize-none max-h-40 overflow-y-auto"
        placeholder="Escribe libremente..."
        value={dictation}
        onChange={(e) => setDictation(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        rows={Math.min(5, Math.max(2, dictation.split(NEWLINE_RE).length))}
      />

      {/* Barra de acciones */}
      <div className="flex items-center gap-2 border-t border-ink/[0.05] pt-2">

        {/* Generar nota clínica */}
        <button
          onClick={() => handleSend('SOAP')}
          disabled={loading || !hasText}
          className={`flex items-center gap-1.5 border text-[12px] font-medium rounded-xl px-3 py-1.5 transition-all flex-shrink-0 ${hasText && !loading
              ? 'border-sage/30 hover:border-sage/60 bg-sage-light/50 hover:bg-sage-light text-sage hover:text-sage-dark'
              : 'border-ink/[0.08] text-ink-muted cursor-not-allowed'
            }`}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="hidden sm:inline">Generar nota clínica</span>
          <span className="sm:hidden">Nota</span>
        </button>

        {/* Word count / hint */}
        <span className="flex-1 text-[10px] text-ink-muted text-center">
          {hasText
            ? `${wordCount} ${wordCount === 1 ? 'palabra' : 'palabras'}`
            : 'Enter para chat · Shift+Enter nueva línea'}
        </span>

        {/* Enviar chat */}
        <button
          onClick={() => handleSend('chat')}
          disabled={loading || !hasText}
          className="flex items-center gap-1.5 bg-sage hover:bg-sage-dark text-white rounded-xl px-3 py-1.5 flex-shrink-0 transition-all disabled:opacity-25 active:scale-95"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          <span className="text-[12px] font-medium">Chat</span>
        </button>

      </div>
    </div>
  );
}
