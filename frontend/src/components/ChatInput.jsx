import { useState } from 'react';

export default function ChatInput({ onSend, loading }) {
  const [dictation, setDictation] = useState('');

  const handleProcess = () => {
    if (!dictation.trim() || loading) return;
    onSend(dictation, "SOAP"); // Formato por defecto para el MVP austero
    setDictation('');
  };

  const handleKeyDown = (e) => {
    // Mandar con Enter, pero permitir salto de línea con Shift + Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleProcess();
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl px-4 py-2 flex flex-col gap-2 shadow-md relative overflow-hidden transition-all focus-within:border-cyan-400/60 focus-within:shadow-cyan-100">

      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"></div>

      <div className="flex items-center gap-3">
        <textarea
          className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 font-sans text-[16px] sm:text-[15px] focus:outline-none resize-none max-h-36 sm:max-h-48 overflow-y-auto py-2"
          placeholder="Escribe tu mensaje a SyqueX..."
          value={dictation}
          onChange={(e) => setDictation(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={Math.min(5, Math.max(1, dictation.split('\n').length))}
        />
        
        <button 
          onClick={handleProcess}
          disabled={loading || !dictation.trim()}
          className="bg-cyan-500 hover:bg-cyan-400 text-white p-2 rounded-full flex-shrink-0 transition-all disabled:opacity-30 active:scale-95"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
        </button>
      </div>
    </div>
  )
}
