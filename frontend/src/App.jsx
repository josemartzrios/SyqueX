import { useState, useEffect, useRef } from 'react'
import ChatInput from './components/ChatInput'
import Sidebar from './components/Sidebar'
import { processSession, createPatient, getPatientSessions, listConversations, archiveSession } from './api'

function App() {
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [messages, setMessages] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedPatientName, setSelectedPatientName] = useState(null);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const scrollRef = useRef(null);

  const fetchConversations = async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  };

  const loadPatientChat = (patientId, patientName, history = []) => {
    setSelectedPatientId(patientId);
    setSelectedPatientName(patientName);

    if (history.length === 0) {
      setMessages([{
        role: 'assistant',
        type: 'welcome',
        text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?`
      }]);
      return;
    }

    const historyMessages = [];
    history.forEach(session => {
      if (session.raw_dictation) historyMessages.push({ role: 'user', text: session.raw_dictation });
      if (session.ai_response) historyMessages.push({ role: 'assistant', type: 'bot', text: session.ai_response });
    });
    setMessages(historyMessages);
  };

  const handleSelectConversation = async (conv) => {
    try {
      const history = await getPatientSessions(conv.patient_id);
      loadPatientChat(conv.patient_id, conv.patient_name, history);
    } catch (err) {
      loadPatientChat(conv.patient_id, conv.patient_name);
    }
  };

  const handleDeleteConversation = async (sessionId) => {
    try {
      await archiveSession(sessionId);
      setConversations(prev => prev.filter(c => c.id !== sessionId));
    } catch (err) {
      console.error("Error archiving conversation:", err);
    }
  };

  const handleSavePatient = async () => {
    if (!newPatientName.trim()) return;
    try {
      const resp = await createPatient(newPatientName);
      setIsCreatingPatient(false);
      setNewPatientName("");
      loadPatientChat(resp.patient_id, newPatientName);
      fetchConversations();
    } catch (err) {
      alert("Error al crear paciente: " + err.message);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendDictation = async (dictation, format) => {
    setMessages(prev => [
      ...prev,
      { role: 'user', text: dictation },
      { role: 'assistant', type: 'loading' }
    ]);

    try {
      const noteData = await processSession(selectedPatientId, dictation, format);
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          type: 'bot',
          text: noteData.text_fallback || "Sin respuesta recibida.",
          sessionId: noteData.session_id,
        }
      ]);
      fetchConversations();
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', type: 'error', text: 'Anomalía de conexión: ' + err.message }
      ]);
    }
  };

  const isLoading = messages[messages.length - 1]?.type === 'loading';
  const hasActivePatient = !!selectedPatientId;

  return (
    <div className="h-screen bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden selection:bg-cyan-500/30">

      {/* Demo disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-widest text-cyan-500 font-bold">Versión demo</span>
              <h2 className="text-slate-800 text-lg font-bold leading-snug">Esta es una versión demo de SyqueX</h2>
            </div>
            <div className="text-slate-600 text-sm leading-relaxed flex flex-col gap-3">
              <p>Todos los pacientes y datos mostrados son ficticios y generados para fines de demostración únicamente.</p>
              <p className="font-medium text-slate-700">No introduzcas datos reales de pacientes en esta versión.</p>
            </div>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="mt-1 w-full bg-cyan-500 hover:bg-cyan-400 active:scale-95 transition-all text-white font-semibold rounded-xl py-3 text-sm shadow-sm"
            >
              Entendido, continuar al demo
            </button>
          </div>
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Header */}
      <header className="px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-white/95 backdrop-blur z-20 flex items-center justify-between gap-2 sm:gap-4 shadow-sm min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors relative flex-shrink-0"
            title="Bandeja de conversaciones"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {conversations.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-500 rounded-full"></span>
            )}
          </button>
          <span className="font-bold tracking-tight text-slate-800 text-lg sm:text-xl flex items-center gap-1.5 truncate">
            SyqueX <span className="text-cyan-500 font-normal text-xs sm:text-sm opacity-80 font-mono flex-shrink-0">v1.2</span>
          </span>
        </div>

        {/* Right side: patient name or create form */}
        <div className="flex items-center gap-2 min-w-0">
          {isCreatingPatient ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Nombre..."
                className="bg-slate-50 border border-cyan-400/60 rounded-full px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-cyan-500 transition-all w-32 sm:w-52"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePatient()}
              />
              <button onClick={handleSavePatient} className="text-cyan-500 hover:text-cyan-400 p-1.5 flex-shrink-0" title="Guardar">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </button>
              <button onClick={() => { setIsCreatingPatient(false); setNewPatientName(""); }} className="text-slate-400 hover:text-slate-500 p-1.5 flex-shrink-0" title="Cancelar">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              {selectedPatientName && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm min-w-0 max-w-[140px] sm:max-w-[220px]">
                  <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-slate-400 font-bold flex-shrink-0">Paciente:</span>
                  <span className="text-cyan-500 text-sm font-medium truncate">{selectedPatientName}</span>
                </div>
              )}
              <button
                onClick={() => setIsCreatingPatient(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-cyan-50 border border-cyan-200 text-cyan-500 hover:bg-cyan-100 transition-all shadow-sm active:scale-95"
                title="Nuevo Paciente"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 flex flex-col relative bg-transparent min-h-0">

        {/* Empty state — no conversation selected */}
        {!hasActivePatient && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">No hay conversación activa</p>
              <p className="text-slate-400 text-xs mt-1">Selecciona una conversación de la bandeja o crea un nuevo paciente</p>
            </div>
          </div>
        )}

        {/* Message feed */}
        {hasActivePatient && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto p-3 sm:p-4 md:p-6 space-y-5 sm:space-y-7 z-10 will-change-scroll pb-10">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>

                {msg.role === 'user' && (
                  <div className="max-w-[90%] md:max-w-[85%] bg-cyan-500 text-white rounded-3xl rounded-br-md px-5 py-3 shadow-sm text-[15px] leading-relaxed">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div className="max-w-[100%] md:max-w-[95%] flex w-full">
                    <div className="flex-1 min-w-0">

                      {msg.type === 'welcome' && (
                        <div className="text-slate-600 font-sans text-[15.5px] leading-relaxed pt-1.5 whitespace-pre-wrap">
                          {msg.text}
                          <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full animate-pulse ml-2 mb-0.5"></span>
                        </div>
                      )}

                      {msg.type === 'loading' && (
                        <div className="py-2 flex items-center gap-2 mt-1 ml-1">
                          <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></span>
                          <span className="w-2 h-2 bg-cyan-500/70 rounded-full animate-bounce delay-75"></span>
                          <span className="w-2 h-2 bg-cyan-500/40 rounded-full animate-bounce delay-150"></span>
                        </div>
                      )}

                      {msg.type === 'error' && (
                        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mt-1 text-sm inline-block">
                          <strong className="text-red-500">Error detectado:</strong> {msg.text}
                        </div>
                      )}

                      {msg.type === 'bot' && (
                        <div className="w-full">
                          <div className="text-slate-700 font-sans text-[15.5px] leading-relaxed pt-1.5 whitespace-pre-wrap">
                            {msg.text}
                          </div>
                          <div className="flex gap-2 pt-4 mt-4 border-t border-slate-200">
                            <button
                              onClick={() => {
                                const blob = new Blob([msg.text], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `SyqueX_Nota_${new Date().toISOString().split('T')[0]}.txt`;
                                link.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="text-[13px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 py-1.5 px-4 rounded-lg flex items-center gap-2 transition-colors border border-slate-200 shadow-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              Descargar en .TXT
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input area — only when patient is active */}
        {hasActivePatient && (
          <div className="p-2 sm:p-3 pb-5 sm:pb-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-20 w-full relative">
            <div className="max-w-3xl mx-auto relative px-1 sm:px-2 md:px-0">
              <ChatInput onSend={handleSendDictation} loading={isLoading} />
              <div className="text-center mt-3 text-[10px] text-slate-400 font-sans tracking-wide">
                SyqueX Clinical AI puede cometer errores. El contenido debe ser revisado por el profesional.
              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  )
}

export default App
