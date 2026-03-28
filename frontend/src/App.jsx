import { useState, useEffect, useRef } from 'react'
import ChatInput from './components/ChatInput'
import Sidebar from './components/Sidebar'
import NoteReview from './components/NoteReview'
import MobileTabNav from './components/MobileTabNav.jsx'
import MobileHistoryChips from './components/MobileHistoryChips.jsx'
import MobileEvolucion from './components/MobileEvolucion.jsx'
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions } from './api'

// ── Module-level constants ─────────────────────────────────────────────────
const SOAP_HEADER_BOLD_RE = /^\*\*(S|O|A|P)\s*[—–\-]/i;
const SOAP_HEADER_MD_RE   = /^##\s*(S|O|A|P)\s*[—–\-]/i;
const BOLD_LINE_RE        = /^\*\*[^*]+\*\*\s*$/;
const BOLD_INLINE_RE      = /\*\*([^*]+)\*\*/;

// ── Static JSX (hoisted outside components to avoid recreation on render) ──
const EMPTY_STATE = (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
    <div className="w-14 h-14 rounded-2xl bg-parchment-dark border border-ink/[0.07] flex items-center justify-center">
      <svg className="w-7 h-7 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <div>
      <p className="text-ink-secondary text-sm font-medium">Sin expediente activo</p>
      <p className="text-ink-tertiary text-xs mt-1">Selecciona una sesión o crea un nuevo paciente para comenzar</p>
    </div>
  </div>
);

const LOADING_DOTS = (
  <div className="flex items-center gap-1.5 py-2">
    <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
    <span className="w-1.5 h-1.5 bg-sage/70 rounded-full animate-bounce" style={{ animationDelay: '120ms' }}></span>
    <span className="w-1.5 h-1.5 bg-sage/40 rounded-full animate-bounce" style={{ animationDelay: '240ms' }}></span>
  </div>
);

// ── Clinical note renderer ───────────────────────────────────────────────────
function ClinicalNote({ text }) {
  const lines = text.split('\n');
  const result = [];

  lines.forEach((line, i) => {
    // SOAP section header: **S —, **O —, **A —, **P —
    const soapMatch = line.match(SOAP_HEADER_BOLD_RE) || line.match(SOAP_HEADER_MD_RE);
    if (soapMatch) {
      const clean = line.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^#+\s*/, '');
      result.push(
        <div key={i} className={`${result.length > 0 ? 'mt-5' : ''} mb-2`}>
          <span className="text-[10px] font-bold text-sage tracking-[0.14em] uppercase">{clean}</span>
          <div className="h-px bg-sage/20 mt-1.5" />
        </div>
      );
      return;
    }

    // Bold full line = subheader
    if (BOLD_LINE_RE.test(line)) {
      const clean = line.replace(/\*\*/g, '').trim();
      result.push(
        <p key={i} className="font-semibold text-ink text-[13px] mt-4 mb-1 leading-snug">{clean}</p>
      );
      return;
    }

    // Empty line
    if (!line.trim()) {
      result.push(<div key={i} className="h-1.5" />);
      return;
    }

    // Regular line — render inline **bold**
    const parts = line.split(BOLD_INLINE_RE);
    result.push(
      <p key={i} className="text-ink-secondary text-[14px] leading-relaxed">
        {parts.map((part, j) =>
          j % 2 === 1
            ? <strong key={j} className="font-medium text-ink">{part}</strong>
            : part
        )}
      </p>
    );
  });

  return <div>{result}</div>;
}

// ── Desktop conversation item ────────────────────────────────────────────────
function DesktopConvItem({ conv, active, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group px-3 py-2.5 mx-2 mb-0.5 rounded-xl cursor-pointer transition-colors relative
        ${active ? 'bg-sage-light' : 'hover:bg-parchment-dark/70'}`}
    >
      <div className="pr-6">
        <p className={`text-[13px] font-medium truncate leading-snug ${active ? 'text-ink' : 'text-ink-secondary'}`}>
          {conv.patient_name}
        </p>
        <p className="text-[11px] text-ink-tertiary mt-0.5">
          Sesión #{conv.session_number} · {formatDate(conv.session_date)}
        </p>
        {conv.dictation_preview && (
          <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-1">{conv.dictation_preview}</p>
        )}
      </div>
      <button
        onClick={handleDelete}
        title={confirmDelete ? 'Confirmar' : 'Archivar'}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100
          ${confirmDelete ? 'bg-red-50 text-red-400 !opacity-100' : 'text-ink-muted hover:text-red-400 hover:bg-red-50'}`}
      >
        {confirmDelete
          ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        }
      </button>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

// ── Helper: mark pending SOAP notes as read-only ────────────────────────────
export function markPendingNotesReadOnly(messages) {
  return messages.map(msg =>
    msg.type === 'bot' && msg.noteData
      ? { ...msg, readOnly: true }
      : msg
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [messages, setMessages] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedPatientName, setSelectedPatientName] = useState(null);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [mobileTab, setMobileTab] = useState('dictar');
  const [sessionHistory, setSessionHistory] = useState([]);
  const scrollRef = useRef(null);
  const mobileScrollRef = useRef(null);

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
    setMobileTab('dictar');
    setSessionHistory(history);

    if (history.length === 0) {
      setMessages([{ role: 'assistant', type: 'welcome', text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?` }]);
      return;
    }

    const historyMessages = [];
    history.forEach(session => {
      if (session.raw_dictation) {
        historyMessages.push({ role: 'user', text: session.raw_dictation });
      }

      // Chat sessions: render as plain text, no NoteReview component
      if (session.format === 'chat') {
        if (session.ai_response) {
          historyMessages.push({ role: 'assistant', type: 'chat', text: session.ai_response });
        }
        return;
      }

      // SOAP and other structured formats
      const hasStructuredNote = session.status === 'confirmed' && session.structured_note;
      if (hasStructuredNote) {
        historyMessages.push({
          role: 'assistant',
          type: 'bot',
          noteData: {
            clinical_note: {
              structured_note: session.structured_note,
              detected_patterns: session.detected_patterns || [],
              alerts: session.alerts || [],
              session_id: String(session.id),
            },
            text_fallback: session.ai_response,
          },
          sessionId: String(session.id),
          readOnly: true,
        });
      } else if (session.ai_response) {
        historyMessages.push({
          role: 'assistant',
          type: 'bot',
          noteData: {
            clinical_note: null,
            text_fallback: session.ai_response,
            session_id: String(session.id),
          },
          sessionId: String(session.id),
          readOnly: false,
        });
      }
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

  const handleDeleteConversation = async (sessionId, patientId) => {
    try {
      if (patientId) await archivePatientSessions(patientId);
      setConversations(prev => prev.filter(c => c.patient_id !== patientId));
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
      loadPatientChat(resp.id, newPatientName);
      // Add placeholder immediately so the patient is visible in sidebar before their first SOAP session.
      // fetchConversations() would overwrite this with an empty result (INNER JOIN, no sessions yet).
      setConversations(prev => [{
        id: null,
        patient_id: String(resp.id),
        patient_name: newPatientName,
        session_number: null,
        session_date: null,
        dictation_preview: null,
        status: null,
        message_count: 0,
      }, ...prev]);
    } catch (err) {
      alert("Error al crear paciente: " + err.message);
    }
  };

  useEffect(() => { fetchConversations(); }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
  }, [messages]);

  const handleSendDictation = async (dictation, format) => {
    setMessages(prev => [
      ...markPendingNotesReadOnly(prev),
      { role: 'user', text: dictation },
      { role: 'assistant', type: 'loading' }
    ]);
    if (format === 'SOAP') setMobileTab('nota');
    try {
      const noteData = await processSession(selectedPatientId, dictation, format);
      const botMessage = format === 'SOAP'
        ? { role: 'assistant', type: 'bot', noteData, sessionId: noteData.session_id }
        : { role: 'assistant', type: 'chat', text: noteData.text_fallback || '' };
      setMessages(prev => [...prev.slice(0, -1), botMessage]);
      fetchConversations();
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', type: 'error', text: 'Anomalía de conexión: ' + err.message }
      ]);
    }
  };

  const handleSendEvolucionChat = (text) => {
    handleSendDictation(text, 'chat');
    setMobileTab('evolucion');
  };

  const isLoading = messages[messages.length - 1]?.type === 'loading';
  const hasActivePatient = !!selectedPatientId;

  return (
    <div className="h-screen bg-parchment font-sans flex flex-col overflow-hidden">

      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4">
          <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-sm w-full p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.15em] text-sage font-bold">Versión demo</span>
              <h2 className="text-ink text-lg font-semibold leading-snug">Esta es una versión demo de SyqueX</h2>
            </div>
            <div className="text-ink-secondary text-sm leading-relaxed flex flex-col gap-3">
              <p>Todos los pacientes y datos mostrados son ficticios y generados para fines de demostración únicamente.</p>
              <p className="font-medium text-ink">No introduzcas datos reales de pacientes en esta versión.</p>
            </div>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="mt-1 w-full bg-sage hover:bg-sage-dark active:scale-[0.98] transition-all text-white font-medium rounded-xl py-3 text-sm"
            >
              Entendido, continuar al demo
            </button>
          </div>
        </div>
      )}

      {/* Mobile slide-over sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop persistent left panel */}
        <aside className="hidden md:flex w-60 flex-col border-r border-ink/[0.07] bg-white/40 flex-shrink-0">
          <div className="px-4 py-4 border-b border-ink/[0.07] flex items-center justify-between flex-shrink-0">
            <span className="font-semibold text-ink text-[15px] tracking-tight">SyqueX</span>
            <span className="text-[10px] text-ink-tertiary font-mono">v1.2</span>
          </div>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-tertiary font-bold">Sesiones</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-ink-tertiary text-[13px]">Sin sesiones aún.</p>
                <p className="text-ink-muted text-xs mt-1">Crea un paciente para comenzar.</p>
              </div>
            ) : (
              conversations.map(conv => (
                <DesktopConvItem
                  key={conv.patient_id}
                  conv={conv}
                  active={conv.patient_id === selectedPatientId}
                  onClick={() => handleSelectConversation(conv)}
                  onDelete={() => handleDeleteConversation(conv.id, conv.patient_id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Right workspace */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Top bar */}
          <header className="px-3 sm:px-5 py-3 border-b border-ink/[0.07] bg-white/60 backdrop-blur z-20 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile menu */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-ink/[0.05] transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Logo — mobile only */}
              <span className="md:hidden font-semibold text-ink text-[15px] tracking-tight">SyqueX</span>
              {/* Patient breadcrumb — desktop */}
              {selectedPatientName && (
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-ink-muted text-[13px]">/</span>
                  <span className="text-ink text-[14px] font-medium">{selectedPatientName}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile patient badge */}
              {selectedPatientName && !isCreatingPatient && (
                <div className="md:hidden flex items-center gap-1.5 bg-parchment-dark border border-ink/[0.08] rounded-full px-3 py-1.5 min-w-0 max-w-[140px]">
                  <span className="text-ink-secondary text-[12px] font-medium truncate">{selectedPatientName}</span>
                </div>
              )}

              {isCreatingPatient ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Nombre del paciente..."
                    className="bg-parchment border border-ink/[0.15] rounded-full px-3 py-1.5 text-sm text-ink placeholder-ink-tertiary focus:outline-none focus:border-sage/60 transition-all w-36 sm:w-52"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePatient()}
                  />
                  <button onClick={handleSavePatient} className="text-sage hover:text-sage-dark p-1.5 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={() => { setIsCreatingPatient(false); setNewPatientName(""); }} className="text-ink-tertiary hover:text-ink-secondary p-1.5 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingPatient(true)}
                  className="flex items-center gap-1.5 text-sage hover:text-sage-dark border border-sage/30 hover:border-sage/60 bg-sage-light/50 hover:bg-sage-light rounded-full px-3 py-1.5 transition-all text-[13px] font-medium flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                  <span className="hidden sm:inline">Nuevo paciente</span>
                </button>
              )}
            </div>
          </header>

          {/* Workspace */}
          <main className="flex-1 flex flex-col relative min-h-0 overflow-hidden">

            {/* Empty state — ambos layouts */}
            {!hasActivePatient && EMPTY_STATE}

            {/* ── MOBILE LAYOUT (md:hidden) ── */}
            {hasActivePatient && (
              <div className="flex flex-col flex-1 min-h-0 md:hidden">

                {/* Patient strip */}
                <div className="px-5 py-3 bg-parchment border-b border-ink/[0.06] flex items-center gap-3 flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-sage flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
                    {selectedPatientName?.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-ink leading-tight">{selectedPatientName}</p>
                    <p className="text-[11px] text-ink-tertiary">
                      {sessionHistory.filter(s => s.status === 'confirmed').length} sesiones confirmadas
                    </p>
                  </div>
                </div>

                {/* Tab nav */}
                <MobileTabNav activeTab={mobileTab} onTabChange={setMobileTab} />

                {/* Tab: Dictar */}
                {mobileTab === 'dictar' && (
                  <div className="flex flex-col flex-1 min-h-0">
                    <MobileHistoryChips sessions={sessionHistory} />
                    <div className="flex-1 overflow-y-auto px-5 py-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted mb-3">
                        Dictado · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <textarea
                        className="w-full h-40 resize-none border border-ink/[0.10] rounded-[10px] px-4 py-3 text-[14px] leading-relaxed text-ink bg-parchment outline-none focus:border-sage focus:bg-white transition-colors placeholder-ink-muted"
                        placeholder="Dicta los puntos clave de la sesión…"
                        id="mobile-dictation-input"
                      />
                    </div>
                    <div className="px-5 py-4 border-t border-ink/[0.06] bg-white flex gap-3 flex-shrink-0">
                      <button
                        disabled
                        className="flex-1 py-3 bg-parchment border border-ink/[0.10] rounded-[10px] text-[12px] font-medium text-ink-muted opacity-50 cursor-not-allowed"
                      >
                        ⏺ Próximamente
                      </button>
                      <button
                        onClick={() => {
                          const el = document.getElementById('mobile-dictation-input');
                          if (el?.value.trim()) handleSendDictation(el.value.trim(), 'SOAP');
                        }}
                        disabled={isLoading}
                        className="flex-[2] py-3 bg-sage text-white rounded-[10px] text-[14px] font-semibold disabled:opacity-50 active:bg-sage-dark transition-colors"
                      >
                        Generar nota →
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab: Nota */}
                {mobileTab === 'nota' && (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div ref={mobileScrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
                      {/* Mostrar el último mensaje bot/loading/error */}
                      {messages.length === 0 || messages[messages.length - 1]?.type === 'welcome' ? (
                        <p className="text-ink-tertiary text-[14px] text-center mt-10">
                          Dicta una sesión para generar la nota SOAP.
                        </p>
                      ) : (
                        messages.slice().reverse().map((msg, idx) => {
                          if (msg.type === 'loading') return (
                            <div key={idx} className="flex gap-2 items-center">
                              {[0, 0.2, 0.4].map((d, i) => (
                                <div key={i} className="w-2 h-2 rounded-full bg-ink-muted animate-pulse"
                                     style={{ animationDelay: `${d}s` }} />
                              ))}
                              <span className="text-ink-tertiary text-sm">Generando nota…</span>
                            </div>
                          );
                          if (msg.type === 'bot' && msg.noteData) return (
                            <NoteReview key={idx} noteData={msg.noteData} onConfirm={fetchConversations} readOnly={msg.readOnly} />
                          );
                          if (msg.type === 'error') return (
                            <div key={idx} className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                              <strong>Error:</strong> {msg.text}
                            </div>
                          );
                          return null;
                        }).find(Boolean) || (
                          <p className="text-ink-tertiary text-[14px] text-center mt-10">
                            Dicta una sesión para generar la nota SOAP.
                          </p>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Tab: Evolución */}
                {mobileTab === 'evolucion' && (
                  <MobileEvolucion
                    messages={messages}
                    patientName={selectedPatientName}
                    onSendChat={handleSendEvolucionChat}
                    loading={isLoading}
                  />
                )}
              </div>
            )}

            {/* ── DESKTOP LAYOUT (hidden md:flex) ── */}
            {hasActivePatient && (
              <>
                <div ref={scrollRef} className="hidden md:block flex-1 overflow-y-auto w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-7 pb-10">
                  {messages.map((msg, idx) => (
                    <div key={idx} className="w-full">
                      {msg.role === 'user' && (
                        <div className="flex justify-end">
                          <div className="max-w-[80%]">
                            <div className="flex items-center justify-end gap-1.5 mb-1.5">
                              <span className="text-[10px] uppercase tracking-[0.13em] text-ink-tertiary font-bold">Dictado</span>
                            </div>
                            <div className="bg-parchment-dark border border-ink/[0.07] rounded-2xl rounded-tr-sm px-4 py-3">
                              <p className="text-ink-secondary text-[14px] leading-relaxed italic whitespace-pre-wrap">{msg.text}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.role === 'assistant' && (
                        <div>
                          {msg.type === 'welcome' && (
                            <p className="text-ink-secondary text-[15px] leading-relaxed">
                              {msg.text}
                              <span className="inline-block w-1.5 h-1.5 bg-sage rounded-full animate-pulse ml-2 mb-0.5 align-middle"></span>
                            </p>
                          )}
                          {msg.type === 'chat' && (
                            <div className="flex gap-3">
                              <div className="w-[3px] rounded-full bg-sage/50 flex-shrink-0 self-stretch" />
                              <div>
                                <span className="text-[10px] uppercase tracking-[0.13em] text-sage font-bold block mb-1.5">SyqueX</span>
                                <p className="text-ink text-[14px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                              </div>
                            </div>
                          )}
                          {msg.type === 'loading' && LOADING_DOTS}
                          {msg.type === 'error' && (
                            <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                              <strong className="font-medium">Error:</strong> {msg.text}
                            </div>
                          )}
                          {msg.type === 'bot' && msg.noteData && (
                            <NoteReview noteData={msg.noteData} onConfirm={fetchConversations} readOnly={msg.readOnly} />
                          )}
                          {msg.type === 'bot' && !msg.noteData && msg.text && (
                            <ClinicalNote text={msg.text} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="hidden md:block px-3 sm:px-6 pb-5 sm:pb-6 pt-2 bg-gradient-to-t from-parchment via-parchment/95 to-transparent z-20 flex-shrink-0">
                  <div className="max-w-2xl mx-auto">
                    <ChatInput onSend={handleSendDictation} loading={isLoading} />
                    <p className="text-center mt-3 text-[10px] text-ink-muted tracking-wide">
                      SyqueX Clinical AI puede cometer errores. El contenido debe ser revisado por el profesional.
                    </p>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App
