import { useState, useEffect, useRef } from 'react'

// Genera chips de preguntas sugeridas a partir del perfil del paciente.
// Usa fallback estático si el perfil está vacío o es null.
const fmt = s => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

function generateChips(profile) {
  const themes = profile?.profile?.recurring_themes ?? []
  const risks  = profile?.profile?.risk_factors ?? []
  if (!profile || (themes.length === 0 && risks.length === 0)) {
    return [
      '¿Qué patrones destacan en las últimas sesiones?',
      '¿Hay señales de alerta activas?',
      '¿Qué sugiere trabajar en la próxima sesión?',
    ]
  }
  const chips = []
  themes.slice(0, 2).forEach(t => chips.push(`¿Cómo ha evolucionado ${fmt(t)}?`))
  risks.slice(0, 1).forEach(f => chips.push(`¿Persiste el factor de riesgo: ${fmt(f)}?`))
  return chips
}

export default function EvolucionPanel({ patient, messages, profile, loading, onSend, sending, error }) {
  const [input, setInput] = useState('')
  const [chips, setChips] = useState(() => generateChips(profile))
  const bottomRef = useRef(null)

  // Regenerate chips when profile changes (new patient loaded)
  useEffect(() => {
    setChips(generateChips(profile))
  }, [profile])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    onSend(text)
    setInput('')
  }

  const handleChip = (chip) => {
    onSend(chip)
    setChips(prev => prev.filter(c => c !== chip))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex-1 flex items-center justify-center" role="status">
            <div className="flex gap-1.5">
              {[0, 120, 240].map((delay, i) => (
                <span
                  key={i}
                  className="w-2 h-2 bg-[#5a9e8a] rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-ink-muted text-center px-6">
              Inicia una conversación sobre {patient.name}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#5a9e8a] text-white rounded-br-sm'
                    : 'bg-[#f4f4f2] text-[#18181b] rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Sending indicator — agent typing */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-[#f4f4f2] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              {[0, 120, 240].map((delay, i) => (
                <span key={i} className="w-1.5 h-1.5 bg-[#9ca3af] rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested chips */}
      {chips.length > 0 && !loading && (
        <div className="px-4 py-2 border-t border-black/[0.05] flex flex-wrap gap-2">
          {chips.map(chip => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              disabled={sending}
              className="text-[11px] text-[#c4935a] bg-[#fff7ed] border border-[#fed7aa] rounded-full px-3 py-1 hover:bg-[#ffedd5] transition-colors disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="px-4 py-1 text-[11px] text-red-500">{error}</p>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-black/[0.07] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || loading}
          placeholder="Pregunta al agente…"
          className="flex-1 bg-[#f9f9f8] border border-black/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-[#18181b] outline-none focus:border-[#5a9e8a] disabled:opacity-50 transition-colors placeholder-[#9ca3af]"
        />
        <button
          onClick={handleSend}
          disabled={sending || loading || !input.trim()}
          aria-label="Enviar"
          className="bg-[#5a9e8a] text-white rounded-xl px-4 py-2.5 text-[13px] font-medium disabled:opacity-40 hover:bg-[#4a8a78] active:scale-95 transition-all"
        >
          →
        </button>
      </div>

    </div>
  )
}
