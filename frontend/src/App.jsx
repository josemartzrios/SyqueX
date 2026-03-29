import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import PatientSidebar from './components/PatientSidebar'
import SoapNoteDocument from './components/SoapNoteDocument'
import DictationPanel from './components/DictationPanel'
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

  // Derive the latest note message for the note panel
  const latestNoteMsg = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'loading' || (m.type === 'bot' && m.noteData) || m.type === 'error') return m;
    }
    return null;
  })();

  return (
    <div className="h-screen bg-white font-sans flex flex-col overflow-hidden">

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

      {/* ── DESKTOP LAYOUT (md+) ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* Left sidebar — patient list */}
        <PatientSidebar
          conversations={conversations}
          selectedPatientId={selectedPatientId}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onNewPatient={() => setIsCreatingPatient(true)}
          isCreatingPatient={isCreatingPatient}
          newPatientName={newPatientName}
          onNewPatientNameChange={(e) => setNewPatientName(e.target.value)}
          onSavePatient={handleSavePatient}
          onCancelNewPatient={() => { setIsCreatingPatient(false); setNewPatientName(''); }}
        />

        {/* Right work area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Patient header */}
          <header className="px-6 py-3.5 border-b border-black/[0.07] bg-white flex items-center gap-3 flex-shrink-0 min-h-[52px]">
            {hasActivePatient ? (
              <>
                <div className="w-7 h-7 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {selectedPatientName?.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-[#18181b] text-[15px] font-semibold">{selectedPatientName}</span>
                <span className="text-ink-muted text-[12px] ml-1">
                  · {sessionHistory.filter(s => s.status === 'confirmed').length} sesiones
                </span>
              </>
            ) : (
              <span className="text-ink-tertiary text-[14px]">Selecciona un paciente</span>
            )}
          </header>

          {/* Content area */}
          {!hasActivePatient ? (
            EMPTY_STATE
          ) : (
            /* Split: Dictation (320px) | Note (flex) */
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* Left: Dictation panel */}
              <div className="w-80 flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#f4f4f2]">
                <DictationPanel
                  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                  loading={isLoading}
                />

                {/* Session history list below dictation */}
                {sessionHistory.length > 0 && (
                  <div className="flex-1 overflow-y-auto border-t border-black/[0.07] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-2">Historial</p>
                    <div className="space-y-1">
                      {sessionHistory.map((s, i) => (
                        <div key={s.id || i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/[0.04] transition-colors">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
                          <span className="text-[12px] text-ink-secondary truncate">
                            Sesión #{s.session_number || (sessionHistory.length - i)} · {formatDate(s.session_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Note panel */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-7 bg-white">
                {latestNoteMsg === null ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                    <p className="text-ink-tertiary text-[14px]">La nota SOAP aparecerá aquí.</p>
                    <p className="text-ink-muted text-[12px]">Escribe un dictado y haz clic en "Generar nota".</p>
                  </div>
                ) : latestNoteMsg.type === 'loading' ? (
                  <div className="flex items-center gap-3 py-6">
                    {LOADING_DOTS}
                    <span className="text-ink-tertiary text-[14px]">Generando nota SOAP…</span>
                  </div>
                ) : latestNoteMsg.type === 'error' ? (
                  <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                    <strong className="font-medium">Error:</strong> {latestNoteMsg.text}
                  </div>
                ) : latestNoteMsg.type === 'bot' && latestNoteMsg.noteData ? (
                  <SoapNoteDocument
                    noteData={latestNoteMsg.noteData}
                    onConfirm={fetchConversations}
                    readOnly={latestNoteMsg.readOnly}
                  />
                ) : null}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE LAYOUT (<md) ── */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="px-4 py-3 border-b border-ink/[0.07] bg-white flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-ink/[0.05] transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-[#18181b] text-[15px] tracking-tight">SyqueX</span>
          </div>
          {!isCreatingPatient ? (
            <button
              onClick={() => setIsCreatingPatient(true)}
              className="flex items-center gap-1.5 text-[#5a9e8a] border border-[#5a9e8a]/30 bg-[#5a9e8a]/[0.06] rounded-full px-3 py-1.5 text-[13px] font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Nuevo
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Nombre..."
                className="bg-[#f4f4f2] border border-ink/[0.15] rounded-full px-3 py-1.5 text-sm text-ink placeholder-ink-tertiary focus:outline-none focus:border-[#5a9e8a]/60 transition-all w-32"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePatient()}
              />
              <button onClick={handleSavePatient} className="text-[#5a9e8a] p-1.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={() => { setIsCreatingPatient(false); setNewPatientName(''); }} className="text-ink-tertiary p-1.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </header>

        {/* No patient selected — empty state */}
        {!hasActivePatient && EMPTY_STATE}

        {/* Patient active — strip + tabs */}
        {hasActivePatient && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Patient strip */}
            <div className="px-5 py-3 bg-[#f4f4f2] border-b border-ink/[0.06] flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
                {selectedPatientName?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#18181b] leading-tight">{selectedPatientName}</p>
                <p className="text-[11px] text-ink-tertiary">
                  {sessionHistory.filter(s => s.status === 'confirmed').length} sesiones confirmadas
                </p>
              </div>
            </div>

            {/* Tab nav */}
            <div className="flex border-b border-ink/[0.07] bg-white flex-shrink-0">
              {['dictar', 'nota', 'historial'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-3 text-[13px] font-medium capitalize transition-colors border-b-2 ${
                    mobileTab === tab
                      ? 'border-[#5a9e8a] text-[#5a9e8a]'
                      : 'border-transparent text-ink-secondary hover:text-ink'
                  }`}
                >
                  {tab === 'dictar' ? 'Dictar' : tab === 'nota' ? 'Nota' : 'Historial'}
                </button>
              ))}
            </div>

            {/* Tab: Dictar */}
            {mobileTab === 'dictar' && (
              <div className="flex flex-col flex-1 min-h-0 bg-[#f4f4f2]">
                <DictationPanel
                  onGenerate={(d) => handleSendDictation(d, 'SOAP')}
                  loading={isLoading}
                />
              </div>
            )}

            {/* Tab: Nota */}
            {mobileTab === 'nota' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div ref={mobileScrollRef} className="flex-1 overflow-y-auto px-4 py-5">
                  {latestNoteMsg === null ? (
                    <p className="text-ink-tertiary text-[14px] text-center mt-10">
                      Dicta una sesión para generar la nota SOAP.
                    </p>
                  ) : latestNoteMsg.type === 'loading' ? (
                    <div className="flex gap-2 items-center py-4">
                      {[0, 0.2, 0.4].map((d, i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-ink-muted animate-pulse" style={{ animationDelay: `${d}s` }} />
                      ))}
                      <span className="text-ink-tertiary text-sm">Generando nota…</span>
                    </div>
                  ) : latestNoteMsg.type === 'error' ? (
                    <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                      <strong>Error:</strong> {latestNoteMsg.text}
                    </div>
                  ) : latestNoteMsg.type === 'bot' && latestNoteMsg.noteData ? (
                    <SoapNoteDocument
                      noteData={latestNoteMsg.noteData}
                      onConfirm={fetchConversations}
                      readOnly={latestNoteMsg.readOnly}
                    />
                  ) : (
                    <p className="text-ink-tertiary text-[14px] text-center mt-10">
                      Dicta una sesión para generar la nota SOAP.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Historial */}
            {mobileTab === 'historial' && (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {sessionHistory.length === 0 ? (
                  <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
                ) : (
                  <div className="space-y-2">
                    {sessionHistory.map((s, i) => (
                      <div key={s.id || i} className="bg-[#f4f4f2] rounded-xl px-4 py-3 flex items-start gap-3">
                        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink">
                            Sesión #{s.session_number || (sessionHistory.length - i)} · {formatDate(s.session_date)}
                          </p>
                          {s.raw_dictation && (
                            <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
                          )}
                          <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'}`}>
                            {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}

export default App
