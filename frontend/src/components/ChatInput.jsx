import { useState } from 'react';

export default function ChatInput({ onSend, loading }) {
  const [dictation, setDictation] = useState('');

  const handleProcess = () => {
    if (!dictation.trim() || loading) return;
    onSend(dictation, "SOAP");
    setDictation('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleProcess();
    }
  };

  const wordCount = dictation.trim() ? dictation.trim().split(/\s+/).length : 0;

  return (
    <div className={`bg-white border rounded-2xl px-4 py-3 flex flex-col gap-2 transition-all
      ${loading
        ? 'border-ink/[0.07]'
        : 'border-ink/[0.10] focus-within:border-sage/50 focus-within:shadow-sm focus-within:shadow-sage/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <textarea
          className="flex-1 bg-transparent text-ink placeholder-ink-tertiary font-sans text-[14px] leading-relaxed focus:outline-none resize-none max-h-40 overflow-y-auto pt-0.5"
          placeholder="Dictar nota de sesión... (Enter para enviar)"
          value={dictation}
          onChange={(e) => setDictation(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={Math.min(5, Math.max(2, dictation.split('\n').length))}
        />
        <button
          onClick={handleProcess}
          disabled={loading || !dictation.trim()}
          className="bg-sage hover:bg-sage-dark text-white p-2 rounded-xl flex-shrink-0 transition-all disabled:opacity-25 active:scale-95 mt-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      </div>

      {wordCount > 0 && (
        <div className="flex items-center justify-between text-[10px] text-ink-muted border-t border-ink/[0.05] pt-2">
          <span>{wordCount} {wordCount === 1 ? 'palabra' : 'palabras'}</span>
          <span>Shift+Enter para nueva línea</span>
        </div>
      )}
    </div>
  );
}
