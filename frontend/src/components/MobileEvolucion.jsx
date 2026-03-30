// frontend/src/components/MobileEvolucion.jsx
import { useState } from 'react';

const QUICK_QUESTIONS = [
  '¿Evolución de riesgo?',
  '¿Temas recurrentes?',
  '¿Progreso en objetivos?',
];

function extractSummary(messages) {
  // Busca el último bot message con evolution_report
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'bot' && m.noteData?.evolution_report?.summary) {
      return m.noteData.evolution_report.summary;
    }
    // Fallback: detected_patterns del último bot message
    if (m.type === 'bot' && m.noteData?.clinical_note?.detected_patterns?.length > 0) {
      return m.noteData.clinical_note.detected_patterns
        .map(p => p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()))
        .join(' · ');
    }
  }
  return null;
}

export default function MobileEvolucion({ messages, patientName, onSendChat, loading }) {
  const [input, setInput] = useState('');

  const summary = extractSummary(messages);
  const chatMessages = messages.filter(m => m.type === 'chat' || m.role === 'user');

  const handleSend = (text) => {
    if (!text.trim() || loading) return;
    onSendChat(text.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Resumen automático */}
      {summary ? (
        <div className="px-5 py-4 bg-sage-light border-b border-sage/[0.15] flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-sage-dark mb-1.5">
            Resumen del paciente
          </p>
          <p className="text-[13px] leading-relaxed text-ink" style={{ fontFamily: 'Georgia, serif' }}>
            {summary}
          </p>
        </div>
      ) : (
        <div className="px-5 py-4 bg-sage-light border-b border-sage/[0.15] flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-sage-dark mb-1.5">
            Resumen del paciente
          </p>
          <p className="text-[13px] text-ink-tertiary italic" style={{ fontFamily: 'Georgia, serif' }}>
            Confirma la primera nota para ver el resumen clínico.
          </p>
        </div>
      )}

      {/* Preguntas rápidas */}
      <div className="px-5 py-3 border-b border-ink/[0.06] bg-white flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-ink-muted mb-2">
          Preguntas frecuentes
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              disabled={loading}
              className="px-3 py-1.5 bg-white border border-sage/30 rounded-full text-[12px] font-medium text-sage-dark hover:bg-sage-light active:bg-sage-light transition-colors disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
           style={{ WebkitOverflowScrolling: 'touch' }}>
        {chatMessages.length === 0 && (
          <p className="text-ink-tertiary text-[13px] text-center mt-8">
            Pregunta al agente sobre la evolución de {patientName}.
          </p>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            {msg.role === 'assistant' && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-muted mb-1">
                Agente clínico
              </span>
            )}
            <div className={`max-w-[82%] px-4 py-3 text-[14px] leading-relaxed rounded-xl ${
              msg.role === 'user'
                ? 'bg-sage text-white rounded-tr-none'
                : 'bg-white border border-ink/[0.10] text-ink rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-muted">Agente</span>
            <div className="flex gap-1 mt-1.5">
              {[0, 0.2, 0.4].map((delay, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-pulse"
                     style={{ animationDelay: `${delay}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="px-4 py-3 border-t border-ink/[0.06] bg-white flex gap-2 items-center flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend(input)}
          placeholder={`Pregunta sobre ${patientName}…`}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-parchment rounded-full text-[14px] text-ink placeholder-ink-muted outline-none border-none disabled:opacity-50"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim() || loading}
          className="w-9 h-9 flex-shrink-0 bg-sage rounded-full flex items-center justify-center text-white text-base font-bold disabled:opacity-40 active:bg-sage-dark transition-colors"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
