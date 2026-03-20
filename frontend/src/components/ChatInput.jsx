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
    <div className="bg-[#0a1122]/90 backdrop-blur-xl border border-[#1a2d52] rounded-3xl px-4 py-2 flex flex-col gap-2 shadow-2xl relative overflow-hidden transition-all focus-within:border-cyan-900/80">
      
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
      
      <div className="flex items-center gap-3">
        <textarea 
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 font-sans text-[15px] focus:outline-none resize-none max-h-48 overflow-y-auto py-2"
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
          className="bg-slate-100 hover:bg-white text-slate-900 p-2 rounded-full flex-shrink-0 transition-opacity disabled:opacity-20 disabled:hover:bg-slate-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
        </button>
      </div>
    </div>
  )
}
