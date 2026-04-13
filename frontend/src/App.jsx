import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import PatientSidebar from './components/PatientSidebar'
import PatientHeader from './components/PatientHeader'
import SoapNoteDocument from './components/SoapNoteDocument'
import DictationPanel from './components/DictationPanel'
import NewPatientModal from './components/NewPatientModal'
import EvolucionPanel from './components/EvolucionPanel'
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout, logout } from './api'
import { getScreenFromUrl, navigateTo, refreshAccessToken, clearAccessToken, getAccessToken, setAccessToken } from './auth.js';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import ResetPasswordScreen from './components/ResetPasswordScreen.jsx';
import BillingScreen from './components/BillingScreen.jsx';
import TrialBanner from './components/TrialBanner.jsx';

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
export function toggleExpandedSession(currentId, clickedId) {
  return currentId === clickedId ? null : clickedId;
}

function App() {
  // Estado de pantalla
  const [authScreen, setAuthScreen] = useState(() => getScreenFromUrl());
  const [billingStatus, setBillingStatus] = useState(null);

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
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  
  // Desktop two-mode layout state
  const [desktopMode, setDesktopMode] = useState('session'); // 'session' | 'review'
  const [reviewExpandedSessionId, setReviewExpandedSessionId] = useState(null);
  
  // Evolución tab state
  const [evolutionMessages, setEvolutionMessages] = useState(new Map()); // Map<patientId, Message[]>
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [evolutionSending, setEvolutionSending] = useState(false);
  const [evolutionError, setEvolutionError] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  
  const evolutionMessagesRef = useRef(evolutionMessages);
  useEffect(() => { evolutionMessagesRef.current = evolutionMessages; }, [evolutionMessages]);
  const scrollRef = useRef(null);
  const mobileScrollRef = useRef(null);

  const checkBillingAndRoute = useCallback(async () => {
    try {
      const status = await getBillingStatus();
      setBillingStatus(status);
      if (status.status === 'trialing' || status.status === 'active') {
        setAuthScreen({ screen: 'app' });
      } else {
        setAuthScreen({ screen: 'billing' });
      }
    } catch {
      setAuthScreen({ screen: 'billing' });
    }
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setAuthScreen({ screen: 'login' });
    }
  }

  // Inicializar auth al montar
  useEffect(() => {
    setAuthCallbacks({
      onUnauthorized: () => {
        clearAccessToken();
        setAuthScreen({ screen: 'login' });
      },
      onPaymentRequired: () => {
        setAuthScreen({ screen: 'billing' });
      },
    });

    async function initAuth() {
      const { screen } = authScreen;
      // Si es register o reset-password, no intentar refresh
      if (screen === 'register' || screen === 'reset-password') return;

      // Intentar refresh silencioso
      const token = await refreshAccessToken(
        (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'
      );

      if (token) {
        setAccessToken(token);
        await checkBillingAndRoute();
      } else {
        setAuthScreen({ screen: 'login' });
      }
    }

    initAuth();
  }, []); // solo al montar

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
    setExpandedSessionId(null);
    setDesktopMode('session');
    setReviewExpandedSessionId(null);
    // Reset evolution state for new patient (evolutionMessages Map se conserva)
    setPatientProfile(null);
    setEvolutionError(null);
    setEvolutionSending(false);

    if (history.length === 0) {
      setMessages([{ role: 'assistant', type: 'welcome', text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?` }]);
      return;
    }

    const historyMessages = [];
    history.forEach(session => {
      if (session.raw_dictation) {
        historyMessages.push({ role: 'user', text: session.raw_dictation });
      }

      if (session.format === 'chat') {
        if (session.ai_response) {
          historyMessages.push({ role: 'assistant', type: 'chat', text: session.ai_response });
        }
        return;
      }

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

  const loadEvolutionChat = async (patientId) => {
    setEvolutionLoading(true);
    try {
      const sessions = await getPatientSessions(patientId, 200);
      const chatSessions = sessions
        .filter(s => s.format === 'chat')
        .sort((a, b) => a.session_number - b.session_number);
      const messages = [];
      chatSessions.forEach(s => {
        messages.push({ role: 'user', content: s.raw_dictation });
        if (s.ai_response) messages.push({ role: 'agent', content: s.ai_response });
      });
      setEvolutionMessages(prev => new Map(prev).set(patientId, messages));
    } catch (err) {
      console.error('Error loading evolution chat:', err);
      setEvolutionMessages(prev => new Map(prev).set(patientId, []));
    } finally {
      setEvolutionLoading(false);
    }
  };

  const loadPatientProfile = async (patientId) => {
    try {
      const profile = await getPatientProfile(patientId);
      setPatientProfile(profile);
    } catch (err) {
      console.error('Error loading patient profile:', err);
      setPatientProfile(null);
    }
  };

  const handleEvolutionSend = async (text) => {
    if (!selectedPatientId || !text.trim()) return;
    const patientId = selectedPatientId;

    // Optimistic user append
    setEvolutionMessages(prev => {
      const current = prev.get(patientId) || [];
      return new Map(prev).set(patientId, [...current, { role: 'user', content: text }]);
    });
    setEvolutionSending(true);
    setEvolutionError(null);

    try {
      const response = await processSession(patientId, text, 'chat');
      setEvolutionMessages(prev => {
        const current = prev.get(patientId) || [];
        return new Map(prev).set(patientId, [...current, { role: 'agent', content: response.text_fallback || '' }]);
      });
    } catch (err) {
      setEvolutionError('No se pudo enviar. Intenta de nuevo.');
    } finally {
      setEvolutionSending(false);
    }
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

  // Callback for NewPatientModal
  const handleModalPatientCreated = (patient) => {
    setIsCreatingPatient(false);
    loadPatientChat(patient.id, patient.name);
    setConversations(prev => [{
      id: null,
      patient_id: String(patient.id),
      patient_name: patient.name,
      session_number: null,
      session_date: null,
      dictation_preview: null,
      status: null,
      message_count: 0,
    }, ...prev]);
  };

  const handleToggleSession = (sessionId) => {
    setExpandedSessionId(prev => toggleExpandedSession(prev, sessionId));
  };

  useEffect(() => { fetchConversations(); }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (mobileTab === 'evolucion' && selectedPatientId) {
      if (!evolutionMessagesRef.current.has(selectedPatientId)) {
        loadEvolutionChat(selectedPatientId);
      }
      if (!patientProfile) {
        loadPatientProfile(selectedPatientId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileTab, selectedPatientId]);

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


  const isLoading = messages[messages.length - 1]?.type === 'loading';
  const hasActivePatient = !!selectedPatientId;
  const soapSessions = sessionHistory.filter(s => s.format !== 'chat');

  // Derive the latest note message for the note panel
  const latestNoteMsg = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'loading' || (m.type === 'bot' && m.noteData) || m.type === 'error') return m;
    }
    return null;
  })();

  // Screen manager — antes del return principal
  if (authScreen.screen === 'loading') {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="text-ink-tertiary text-sm">Cargando…</div>
      </div>
    );
  }
  if (authScreen.screen === 'login') {
    return <LoginScreen
      onSuccess={() => checkBillingAndRoute()}
      onRegister={() => { navigateTo('/registro'); setAuthScreen({ screen: 'register' }); }}
      onForgotPassword={() => { navigateTo('/forgot-password'); setAuthScreen({ screen: 'forgot-password' }); }}
    />;
  }
  if (authScreen.screen === 'register') {
    return <RegisterScreen
      onSuccess={() => checkBillingAndRoute()}
      onLogin={() => { navigateTo('/'); setAuthScreen({ screen: 'login' }); }}
    />;
  }
  if (authScreen.screen === 'forgot-password') {
    return <ForgotPasswordScreen
      onBack={() => { navigateTo('/'); setAuthScreen({ screen: 'login' }); }}
    />;
  }
  if (authScreen.screen === 'reset-password') {
    return <ResetPasswordScreen
      resetToken={authScreen.resetToken}
      onSuccess={() => checkBillingAndRoute()}
      onInvalidToken={() => { navigateTo('/forgot-password'); setAuthScreen({ screen: 'forgot-password' }); }}
    />;
  }
  if (authScreen.screen === 'billing') {
    return <BillingScreen
      onActivated={() => checkBillingAndRoute()}
    />;
  }

  return (
    <div className="h-screen bg-white font-sans flex flex-col overflow-hidden">
      {billingStatus?.status === 'trialing' && billingStatus?.days_remaining != null && (
        <TrialBanner
          daysRemaining={billingStatus.days_remaining}
          onActivate={async () => {
            const { checkout_url } = await createCheckout();
            window.location.href = checkout_url;
          }}
        />
      )}

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
        onLogout={handleLogout}
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
          onLogout={handleLogout}
        />

        {/* Right work area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Patient header */}
          <PatientHeader
            patientName={hasActivePatient ? selectedPatientName : null}
            sessionCount={sessionHistory.filter(s => s.status === 'confirmed').length}
          />

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
                {soapSessions.length > 0 && (
                  <div className="flex-1 overflow-y-auto border-t border-black/[0.07] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-2">Historial</p>
                    <div className="space-y-1">
                      {soapSessions.map((s, i) => {
                        const isExpanded = expandedSessionId === String(s.id);
                        const hasNote = s.status === 'confirmed' && s.structured_note;
                        return (
                          <div
                            key={s.id || i}
                            className={`rounded-lg overflow-hidden transition-all ${
                              isExpanded ? 'bg-[#fafaf9] border border-[#5a9e8a]/25' : ''
                            }`}
                          >
                            <div
                              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/[0.04] transition-colors cursor-pointer"
                              onClick={() => hasNote && handleToggleSession(String(s.id))}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
                              <span className="text-[12px] text-ink-secondary truncate flex-1">
                                Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
                              </span>
                              {hasNote && (
                                <svg
                                  className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-[#5a9e8a]' : 'text-[#9ca3af]'}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9l6 6 6-6" />
                                </svg>
                              )}
                            </div>
                            {isExpanded && hasNote && (
                              <div className="border-t border-ink/[0.06]">
                                <SoapNoteDocument
                                  noteData={{
                                    clinical_note: {
                                      structured_note: s.structured_note,
                                      detected_patterns: s.detected_patterns || [],
                                      alerts: s.alerts || [],
                                      session_id: String(s.id),
                                    },
                                    text_fallback: s.ai_response,
                                  }}
                                  readOnly
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
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
          <button
            onClick={() => setIsCreatingPatient(true)}
            className="flex items-center gap-1.5 text-[#5a9e8a] border border-[#5a9e8a]/30 bg-[#5a9e8a]/[0.06] rounded-full px-3 py-1.5 text-[13px] font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo
          </button>
        </header>

        {/* No patient selected — empty state */}
        {!hasActivePatient && EMPTY_STATE}

        {/* Patient active — strip + tabs */}
        {hasActivePatient && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Patient strip */}
            <PatientHeader
              patientName={selectedPatientName}
              sessionCount={sessionHistory.filter(s => s.status === 'confirmed').length}
              compact
            />

            {/* Tab nav */}
            <div className="flex border-b border-ink/[0.07] bg-white flex-shrink-0">
              {['dictar', 'nota', 'historial', 'evolucion'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-3 text-[12px] font-medium capitalize transition-colors border-b-2 ${
                    mobileTab === tab
                      ? 'border-[#5a9e8a] text-[#5a9e8a]'
                      : 'border-transparent text-ink-secondary hover:text-ink'
                  }`}
                >
                  {tab === 'dictar' ? 'Dictar'
                    : tab === 'nota' ? 'Nota'
                    : tab === 'historial' ? 'Historial'
                    : 'Evolución'}
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
                {soapSessions.length === 0 ? (
                    <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
                  ) : (
                    <div className="space-y-2">
                      {soapSessions.map((s, i) => {
                        const isExpanded = expandedSessionId === String(s.id);
                        const hasNote = s.status === 'confirmed' && s.structured_note;
                        return (
                          <div
                            key={s.id || i}
                            className={`rounded-xl overflow-hidden transition-all ${
                              isExpanded
                                ? 'bg-[#fafaf9] border-[1.5px] border-[#5a9e8a]/25'
                                : 'bg-[#f4f4f2]'
                            }`}
                          >
                            <div
                              className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
                              onClick={() => hasNote && handleToggleSession(String(s.id))}
                            >
                              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-ink">
                                  Sesión #{s.session_number || (soapSessions.length - i)} · {formatDate(s.session_date)}
                                </p>
                                {s.raw_dictation && (
                                  <p className="text-[12px] text-ink-muted mt-0.5 line-clamp-2">{s.raw_dictation}</p>
                                )}
                                <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'}`}>
                                  {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                                </span>
                              </div>
                              {hasNote && (
                                <svg
                                  className={`w-4 h-4 mt-1 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-[#5a9e8a]' : 'text-[#9ca3af]'}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9l6 6 6-6" />
                                </svg>
                              )}
                            </div>
                            {isExpanded && hasNote && (
                              <div className="border-t border-ink/[0.06]">
                                <SoapNoteDocument
                                  noteData={{
                                    clinical_note: {
                                      structured_note: s.structured_note,
                                      detected_patterns: s.detected_patterns || [],
                                      alerts: s.alerts || [],
                                      session_id: String(s.id),
                                    },
                                    text_fallback: s.ai_response,
                                  }}
                                  readOnly
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}

            {/* Tab: Evolución */}
            {mobileTab === 'evolucion' && (
              <EvolucionPanel
                patient={{ id: selectedPatientId, name: selectedPatientName }}
                messages={evolutionMessages.get(selectedPatientId) || []}
                profile={patientProfile}
                loading={evolutionLoading}
                onSend={handleEvolutionSend}
                sending={evolutionSending}
                error={evolutionError}
              />
            )}

          </div>
        )}
      </div>

      {/* NewPatientModal — shared between desktop + mobile */}
      <NewPatientModal
        open={isCreatingPatient}
        onClose={() => setIsCreatingPatient(false)}
        onCreated={handleModalPatientCreated}
      />

    </div>
  );
}

export default App
