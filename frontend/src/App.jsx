import { useState, useEffect, useRef } from 'react'
import ChatInput from './components/ChatInput'
import NoteReview from './components/NoteReview'
import { processSession, listPatients, createPatient, getPatientSessions } from './api'

// Asumimos un paciente por defecto para MVP de chat directo
const DEFAULT_PATIENT_ID = "00000000-0000-0000-0000-000000000001";

function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      type: 'welcome',
      text: 'Hola Doctor. ¿Sobre qué paciente deseas dictar la sesión de hoy? '
    }
  ]);

  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(DEFAULT_PATIENT_ID);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const scrollRef = useRef(null);

  const resetChat = (patientName = "su paciente", history = []) => {
    const welcomeMsg = {
      role: 'assistant',
      type: 'welcome',
      text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy? `
    };

    if (history.length > 0) {
      const historyMessages = [];
      history.forEach(session => {
        if (session.raw_dictation) {
          historyMessages.push({ role: 'user', text: session.raw_dictation });
        }
        if (session.ai_response) {
          historyMessages.push({ role: 'assistant', type: 'bot', text: session.ai_response });
        }
      });
      setMessages([welcomeMsg, ...historyMessages]);
    } else {
      setMessages([welcomeMsg]);
    }
  };

  const handlePatientChange = async (id) => {
    const p = patients.find(x => x.id === id);
    setSelectedPatientId(id);
    try {
      const history = await getPatientSessions(id);
      resetChat(p?.name, history);
    } catch (err) {
      console.error("Error loading chat history:", err);
      resetChat(p?.name);
    }
  };

  const handleSavePatient = async () => {
    if (!newPatientName.trim()) return;

    try {
      const resp = await createPatient(newPatientName);
      const updated = await listPatients();
      setPatients(updated);
      setSelectedPatientId(resp.patient_id);
      resetChat(newPatientName);
      setIsCreatingPatient(false);
      setNewPatientName("");
    } catch (err) {
      alert("Error al crear paciente: " + err.message);
    }
  };

  useEffect(() => {
    // Cargar lista de pacientes al iniciar
    const fetchPatients = async () => {
      try {
        const data = await listPatients();
        setPatients(data);
        if (data.length > 0) {
          setSelectedPatientId(data[0].id);
          const history = await getPatientSessions(data[0].id);
          resetChat(data[0].name, history);
        }
      } catch (err) {
        console.error("Error loading patients:", err);
      }
    };
    fetchPatients();
  }, []);

  useEffect(() => {
    // Auto-scroll al fondo estilo chat
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
        { role: 'assistant', type: 'bot', text: noteData.text_fallback || "Sin respuesta recibida." }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', type: 'error', text: 'Anomalía de conexión: ' + err.message }
      ]);
    }
  };

  const isLoading = messages[messages.length - 1]?.type === 'loading';

  return (
    <div className="h-screen bg-[#060d1a] text-slate-200 font-sans flex flex-col overflow-hidden selection:bg-cyan-500/30">

      {/* Header Centrado y Limpio */}
      <header className="px-6 py-4 border-b border-[#111e38] bg-[#0a1122]/95 backdrop-blur z-20 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <span className="font-bold tracking-tight text-slate-100 text-xl flex items-center gap-2">
          SyqueX <span className="text-cyan-500 font-normal text-sm opacity-80 font-mono">v1.2</span>
        </span>

        {/* Selector o Creador de Paciente */}
        <div className="flex items-center gap-3">
          {isCreatingPatient ? (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <input
                autoFocus
                type="text"
                placeholder="Nombre del paciente..."
                className="bg-[#111e38] border border-cyan-800/50 rounded-full px-4 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition-all w-48 sm:w-64"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePatient()}
              />
              <button
                onClick={handleSavePatient}
                className="text-cyan-400 hover:text-cyan-300 font-bold p-1"
                title="Guardar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              </button>
              <button
                onClick={() => setIsCreatingPatient(false)}
                className="text-slate-500 hover:text-slate-400 font-bold p-1"
                title="Cancelar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-[#111e38] border border-slate-700/50 rounded-full px-4 py-1.5 shadow-inner transition-all hover:border-slate-600">
                <label className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Paciente:</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="bg-transparent text-cyan-400 text-sm font-medium focus:outline-none cursor-pointer appearance-none hover:text-cyan-300 transition-colors pr-2"
                >
                  {patients.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#0a1122] text-slate-200">{p.name}</option>
                  ))}
                </select>
                <svg className="w-3 h-3 text-slate-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
              </div>

              <button
                onClick={() => setIsCreatingPatient(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 hover:bg-cyan-800/60 transition-all shadow-lg shadow-cyan-900/10 active:scale-95"
                title="Nuevo Paciente"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Feed Chat Principal */}
      <main className="flex-1 flex flex-col relative bg-transparent min-h-0">

        <div ref={scrollRef} className="flex-1 overflow-y-auto w-full max-w-5xl mx-auto p-4 md:p-6 space-y-7 z-10 will-change-scroll pb-10">

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>

              {/* User Bubble (Mobile iMessage style) */}
              {msg.role === 'user' && (
                <div className="max-w-[90%] md:max-w-[85%] bg-cyan-900/40 border border-cyan-800/60 text-slate-100 rounded-3xl rounded-br-md px-5 py-3 shadow-[0_2px_10px_rgba(6,182,212,0.05)] text-[15px] leading-relaxed backdrop-blur-sm">
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              )}

              {/* AI Bubble (Claude Style) */}
              {msg.role === 'assistant' && (
                <div className="max-w-[100%] md:max-w-[95%] flex gap-3 md:gap-4 w-full">
                  <div className="flex-1 min-w-0">

                    {msg.type === 'welcome' && (
                      <div className="text-slate-200 font-sans text-[15.5px] leading-relaxed pt-1.5 whitespace-pre-wrap">
                        {msg.text}
                        <span className="inline-block w-2h-2 h-2 bg-cyan-500 rounded-full animate-pulse ml-2 mb-0.5"></span>
                      </div>
                    )}

                    {msg.type === 'loading' && (
                      <div className="text-slate-400 py-2 flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-cyan-500/70 rounded-full animate-bounce delay-75"></span>
                        <span className="w-2 h-2 bg-cyan-500/40 rounded-full animate-bounce delay-150"></span>
                      </div>
                    )}

                    {msg.type === 'error' && (
                      <div className="bg-red-950/20 border border-red-900/40 text-red-300 rounded-xl p-3 mt-1 text-sm inline-block">
                        <strong className="text-red-400">Error detectado:</strong> {msg.text}
                      </div>
                    )}

                    {msg.type === 'bot' && (
                      <div className="w-full">
                        <div className="text-slate-200 font-sans text-[15.5px] leading-relaxed pt-1.5 whitespace-pre-wrap">
                          {msg.text}
                        </div>
                        <div className="flex gap-2 pt-4 mt-4 border-t border-slate-800/80">
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
                            className="text-[13px] font-medium bg-[#111e38] hover:bg-[#1a2d52] text-slate-300 py-1.5 px-4 rounded-lg flex items-center gap-2 transition-colors border border-cyan-800/40 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
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

        {/* Zona Inferior Flotante - ChatInput area */}
        <div className="p-3 pb-6 bg-gradient-to-t from-[#060d1a] via-[#060d1a] to-transparent z-20 w-full relative">
          <div className="max-w-5xl mx-auto relative px-2 md:px-0">
            <ChatInput onSend={handleSendDictation} loading={isLoading} />
            <div className="text-center mt-3 text-[10px] text-slate-500 font-sans tracking-wide">
              SyqueX Clinical AI puede cometer errores. El contenido debe ser revisado por el profesional.
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}

export default App
