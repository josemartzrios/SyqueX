import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import PatientSidebar from './components/PatientSidebar'
import PatientHeader from './components/PatientHeader'
import SoapNoteDocument from './components/SoapNoteDocument'
import DictationPanel from './components/DictationPanel'
import PatientIntakeModal from './components/PatientIntakeModal'
import EvolucionPanel from './components/EvolucionPanel'
import { processSession, confirmNote, getTemplate, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile, setAuthCallbacks, getBillingStatus, createCheckout, logout, deleteSession } from './api'
import useDraft from './hooks/useDraft';
import { getScreenFromUrl, navigateTo, refreshAccessToken, clearAccessToken, getAccessToken, setAccessToken } from './auth.js';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import ResetPasswordScreen from './components/ResetPasswordScreen.jsx';
import BillingScreen from './components/BillingScreen.jsx';
import TrialBanner from './components/TrialBanner.jsx';
import CustomNoteDocument from './components/CustomNoteDocument.jsx';
import OnboardingScreen from './components/OnboardingScreen.jsx';
import NoteConfigurator from './components/NoteConfigurator.jsx';
import { saveTemplate } from './api';

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

const NOTE_EMPTY_STATE = (
  <div className="flex flex-col items-center justify-center gap-4 text-center px-8 h-full">
    <div className="w-14 h-14 rounded-2xl bg-parchment-dark border border-ink/[0.07] flex items-center justify-center">
      <svg className="w-7 h-7 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <div>
      <p className="text-ink-secondary text-sm font-medium">Aún no hay nota generada</p>
      <p className="text-ink-tertiary text-xs mt-1">Dicta los puntos de la sesión y presiona «Generar nota →»</p>
    </div>
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
          <span className="font-sans text-[10px] font-bold text-sage tracking-[0.14em] uppercase">{clean}</span>
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

  return <div className="font-serif">{result}</div>;
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

  const [messages, setMessages] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedPatientName, setSelectedPatientName] = useState(null);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [newPatientName, setNewPatientName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { draft, setDraft, clearDraft } = useDraft(selectedPatientId);
  const [conversations, setConversations] = useState([]);
  const [mobileTab, setMobileTab] = useState('dictar');
  const [currentSessionNote, setCurrentSessionNote] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  
  // Desktop two-mode layout state
  const [desktopMode, setDesktopMode] = useState('session'); // 'session' | 'review'
  const [reviewExpandedSessionId, setReviewExpandedSessionId] = useState(null);

  // Template state
  const [template, setTemplate] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => localStorage.getItem('syquex_onboarding_done') === 'true');
  const [noteFormat, setNoteFormat] = useState(() => localStorage.getItem('syquex_note_format') || 'soap');
  const [showNoteConfigurator, setShowNoteConfigurator] = useState(false);
  const [isConfiguratorFirstTime, setIsConfiguratorFirstTime] = useState(false);
  const [newlyConfirmedSessionId, setNewlyConfirmedSessionId] = useState(null);
  const [toast, setToast] = useState(null);

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

  const fetchPatientSessions = async (patientId, patientName) => {
    setSessionsLoading(true);
    try {
      const history = await getPatientSessions(patientId);
      setSessionHistory(history);
      if (patientName) loadPatientChat(patientId, patientName, history);
    } catch (err) {
      console.error("Error loading sessions:", err);
    } finally {
      setSessionsLoading(false);
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
    setCurrentSessionNote(null);

    if (history.length === 0) {
      setMessages([{ role: 'assistant', type: 'welcome', text: `Hola Doctor. ¿Sobre qué desea dictar para ${patientName} hoy?` }]);
      return;
    }

    const historyMessages = [];
    // Only include confirmed sessions in chat bubbles
    const historyToShow = history.filter(s => s?.status === 'confirmed');
    historyToShow.forEach(session => {
      if (!session) return;
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
    setSelectedPatientId(conv.patient_id);
    setSelectedPatientName(conv.patient_name);
    fetchPatientSessions(conv.patient_id, conv.patient_name);
  };

  const handleDeleteConversation = async (sessionId, patientId) => {
    try {
      if (patientId) await archivePatientSessions(patientId);
      useDraft.clearDraftFor(patientId);
      setConversations(prev => prev.filter(c => c.patient_id !== patientId));
    } catch (err) {
      console.error("Error archiving conversation:", err);
    }
  };

  const handleSavePatient = async () => {
    // Legacy chat-style inline patient creation — deprecated.
    // PatientIntakeModal is the primary creation path (see handleModalPatientCreated).
    if (!newPatientName.trim()) return;
    alert("Por favor usa el botón Nuevo Paciente — ahora pide datos clínicos adicionales.");
    setIsCreatingPatient(true);
  };

  // Callback for PatientIntakeModal
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

  useEffect(() => {
    fetchConversations();
    getTemplate().then(setTemplate).catch(() => setTemplate({}));
  }, []);

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

  // Desktop: lazy load evolution cuando se activa modo Revisión
  useEffect(() => {
    if (desktopMode === 'review' && selectedPatientId) {
      if (!evolutionMessagesRef.current.has(selectedPatientId)) {
        loadEvolutionChat(selectedPatientId);
      }
      if (!patientProfile) {
        loadPatientProfile(selectedPatientId);
      }
    }
  }, [desktopMode, selectedPatientId]);

  useEffect(() => {
    localStorage.setItem('syquex_note_format', noteFormat);
  }, [noteFormat]);

  // Clear "Nueva" badge when patient changes
  useEffect(() => { setNewlyConfirmedSessionId(null); }, [selectedPatientId]);

  const handleSendDictation = async (dictation) => {
    const activeFormat = noteFormat;
    setMessages(prev => [
      ...markPendingNotesReadOnly(prev),
      { role: 'user', text: dictation },
      { role: 'assistant', type: 'loading' }
    ]);
    if (activeFormat === 'soap' || activeFormat === 'custom') setMobileTab('nota');
    if (activeFormat === 'soap' || activeFormat === 'custom') setCurrentSessionNote({ type: 'loading' });
    try {
      const noteData = await processSession(selectedPatientId, dictation, activeFormat);
      clearDraft();
      const botMessage = (activeFormat === 'soap' || activeFormat === 'custom')
        ? { role: 'assistant', type: 'bot', noteData, sessionId: noteData.session_id }
        : { role: 'assistant', type: 'chat', text: noteData.text_fallback || '' };
      setMessages(prev => [...prev.slice(0, -1), botMessage]);
      if (activeFormat === 'soap' || activeFormat === 'custom') {
        setCurrentSessionNote({
          type: 'bot',
          noteData,
          sessionId: noteData.session_id,
          readOnly: false,
        });
      }
      fetchConversations();
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', type: 'error', text: 'Anomalía de conexión: ' + err.message }
      ]);
      if (activeFormat === 'soap' || activeFormat === 'custom') {
        setCurrentSessionNote({
          type: 'error',
          text: 'Anomalía de conexión: ' + err.message,
        });
      }
    }
  };

  const handleResumeOrphan = (orphan) => {
    setDraft(orphan.raw_dictation);
    // Cleanup the bot message from chat that shows the orphaned state if needed
    // (In this version, we simple set the draft and the user will see it in the textarea)
  };

  const handleDiscardOrphan = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      if (selectedPatientId) fetchPatientSessions(selectedPatientId);
    } catch (err) {
      console.error("Error discarding orphan:", err);
    }
  };


  const isLoading = messages[messages.length - 1]?.type === 'loading';
  const hasActivePatient = !!selectedPatientId;
  const draftPatientIds = new Set(
    conversations.map(c => String(c.patient_id)).filter(useDraft.hasDraft)
  );
  
  const soapSessions = sessionHistory.filter(s => s.format !== 'chat');
  const confirmedSessions = soapSessions.filter(s => s.status === 'confirmed');
  const orphanedSessions = soapSessions.filter(s => s.status === 'draft');

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

  // Onboarding Screen Logic
  if (!onboardingCompleted && template !== null) {
    if (template.fields?.length > 0) {
      // Auto-complete if they already have a template
      localStorage.setItem('syquex_onboarding_done', 'true');
      setOnboardingCompleted(true);
    } else if (showNoteConfigurator) {
      return (
        <NoteConfigurator
          initialFields={[]}
          isFirstTime={true}
          onSave={async (fields) => {
            await saveTemplate(fields);
            setTemplate({ fields });
            setNoteFormat('custom');
            localStorage.setItem('syquex_onboarding_done', 'true');
            setOnboardingCompleted(true);
            setShowNoteConfigurator(false);
          }}
          onCancel={() => {
            setShowNoteConfigurator(false);
          }}
        />
      );
    } else {
      return (
        <OnboardingScreen
          onSelectSoap={() => {
            setNoteFormat('soap');
            localStorage.setItem('syquex_onboarding_done', 'true');
            setOnboardingCompleted(true);
          }}
          onSelectCustom={() => {
            setShowNoteConfigurator(true);
          }}
        />
      );
    }
  }

  return (
    <div className="h-screen bg-white font-sans flex flex-col overflow-hidden">
      {showNoteConfigurator && (
        <NoteConfigurator
          initialFields={template?.fields || []}
          isFirstTime={false}
          onSave={async (fields) => {
            await saveTemplate(fields);
            setTemplate({ fields });
            setNoteFormat('custom');
            setShowNoteConfigurator(false);
          }}
          onCancel={() => {
            setShowNoteConfigurator(false);
          }}
        />
      )}
      {billingStatus?.status === 'trialing' && billingStatus?.days_remaining != null && (
        <TrialBanner
          daysRemaining={billingStatus.days_remaining}
          onActivate={async () => {
            const { checkout_url } = await createCheckout();
            window.location.href = checkout_url;
          }}
        />
      )}

      {/* Mobile slide-over sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
        draftPatientIds={draftPatientIds}
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
          draftPatientIds={draftPatientIds}
        />

        {/* Right work area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Patient header */}
          <PatientHeader
            patientName={hasActivePatient ? selectedPatientName : null}
            sessionCount={soapSessions.filter(s => s.status === 'confirmed').length}
            mode={desktopMode}
            onModeChange={hasActivePatient ? setDesktopMode : undefined}
            patientId={selectedPatientId}
            onEditPatient={(id) => setEditingPatientId(id)}
          />

          {/* Content area */}
          {!hasActivePatient ? (
            EMPTY_STATE
          ) : (
            /* Split: Dictation (320px) | Note (flex) */
            <div className="flex-1 flex overflow-hidden min-h-0">
              {desktopMode === 'session' ? (
                <>
                  {/* Left: Dictation panel */}
                  <div className="w-80 flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#f4f4f2]">
                    <DictationPanel
                      value={draft}
                      onChange={setDraft}
                      onGenerate={(d) => handleSendDictation(d)}
                      loading={isLoading}
                      orphanedSessions={orphanedSessions}
                      onResumeOrphan={handleResumeOrphan}
                      onDiscardOrphan={handleDiscardOrphan}
                      noteFormat={noteFormat}
                      onFormatChange={(format) => {
                        if (format === 'custom' && (!template?.fields || template.fields.length === 0)) {
                          setIsConfiguratorFirstTime(false);
                          setShowNoteConfigurator(true);
                        } else {
                          setNoteFormat(format);
                        }
                      }}
                      onEditTemplate={() => {
                        setIsConfiguratorFirstTime(false);
                        setShowNoteConfigurator(true);
                      }}
                    />

                  </div>

                  {/* Right: Note panel */}
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-7 bg-white">
                    {currentSessionNote === null ? (
                      NOTE_EMPTY_STATE
                    ) : currentSessionNote.type === 'loading' ? (
                      <div className="flex items-center gap-3 py-6">
                        {LOADING_DOTS}
                        <span className="text-ink-tertiary text-[14px]">Generando nota SOAP…</span>
                      </div>
                    ) : currentSessionNote.type === 'error' ? (
                      <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                        <strong className="font-medium">Error:</strong> {currentSessionNote.text}
                      </div>
                    ) : currentSessionNote.type === 'bot' && currentSessionNote.noteData?.format === 'custom' ? (
                      <CustomNoteDocument
                        templateFields={currentSessionNote.noteData.template_fields || template?.fields || []}
                        values={currentSessionNote.noteData.custom_fields || {}}
                        onConfirm={async (editedValues) => {
                          const sid = currentSessionNote.noteData.session_id;
                          await confirmNote(sid, {
                            format: 'custom',
                            custom_fields: editedValues,
                          });
                          setNewlyConfirmedSessionId(sid);
                          fetchPatientSessions(selectedPatientId);
                          fetchConversations();
                          setDesktopMode('review');
                          setCurrentSessionNote(null);
                          setToast('Sesión confirmada — nota guardada en historial');
                          setTimeout(() => setToast(null), 3500);
                        }}
                        onDelete={async () => {
                          const sid = currentSessionNote.noteData.session_id;
                          await deleteSession(sid);
                          setCurrentSessionNote(null);
                          fetchPatientSessions(selectedPatientId);
                        }}
                      />
                    ) : currentSessionNote.type === 'bot' && currentSessionNote.noteData ? (
                      <SoapNoteDocument
                        noteData={currentSessionNote.noteData}
                        onConfirm={fetchConversations}
                        readOnly={currentSessionNote.readOnly}
                        onDelete={!currentSessionNote.readOnly ? async () => {
                          const sid = currentSessionNote.noteData?.session_id || currentSessionNote.noteData?.clinical_note?.session_id || currentSessionNote.sessionId;
                          if (!sid) return;
                          await deleteSession(sid);
                          setCurrentSessionNote(null);
                          fetchPatientSessions(selectedPatientId);
                        } : undefined}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  {/* Mode: Review */}
                  {/* Left: Historial (380px wide in Review mode) */}
                  <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#f4f4f2] overflow-y-auto px-5 py-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-ink-muted mb-4 px-2">Historial de Notas</p>
                    <div className="space-y-3">
                      {sessionsLoading ? (
                        <div className="flex flex-col items-center gap-2 py-8">
                          {LOADING_DOTS}
                          <p className="text-ink-tertiary text-[11px] uppercase tracking-wider">Cargando historial...</p>
                        </div>
                      ) : confirmedSessions.length === 0 ? (
                        <p className="text-ink-tertiary text-xs px-2 italic">Sin notas SOAP confirmadas.</p>
                      ) : (
                        confirmedSessions.map((s, i) => {
                          const isExpanded = reviewExpandedSessionId === String(s.id);
                          const isCustom = s.format === 'custom';
                          const hasNote = s.status === 'confirmed' && (s.structured_note || s.custom_fields);
                          return (
                            <div
                              key={s.id || i}
                              className={`rounded-xl overflow-hidden transition-all duration-200 bg-white border-l-[3px] ${
                                s.status === 'confirmed' ? 'border-l-[#5a9e8a]' : 'border-l-[#c4935a]'
                              } ${isExpanded ? 'ring-1 ring-[#5a9e8a]/20' : ''}`}
                            >
                              <div
                                className="px-3 py-3 flex items-start gap-3 cursor-pointer group"
                                onClick={() => hasNote && setReviewExpandedSessionId(toggleExpandedSession(reviewExpandedSessionId, String(s.id)))}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-[13px] font-semibold text-ink">Sesión #{s.session_number || (confirmedSessions.length - i)}</p>
                                      {String(s.id) === newlyConfirmedSessionId && (
                                        <span className="text-[9px] font-bold bg-[#5a9e8a] text-white rounded-full px-2 py-0.5">
                                          Nueva
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-ink-tertiary font-medium">{formatDate(s.session_date)}</span>
                                  </div>
                                  {!isExpanded && s.raw_dictation && (
                                    <>
                                      <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5 leading-relaxed">
                                        {s.raw_dictation}
                                      </p>
                                      <span className={`inline-block mt-1 text-[10px] font-medium uppercase tracking-wide ${
                                        s.status === 'confirmed' ? 'text-[#5a9e8a]' : 'text-[#c4935a]'
                                      }`}>
                                        {s.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {hasNote && (
                                  <svg
                                    className={`w-4 h-4 mt-0.5 text-ink-tertiary group-hover:text-ink-secondary transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#5a9e8a]' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                  </svg>
                                )}
                              </div>
                              {isExpanded && hasNote && (
                                <div className="bg-white border-t border-ink/[0.04]">
                                  {isCustom ? (
                                    <CustomNoteDocument
                                      templateFields={template?.fields || []}
                                      values={s.custom_fields || {}}
                                      readOnly
                                    />
                                  ) : (
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
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right: Evolution Area */}
                  <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    <EvolucionPanel
                      patient={{ id: selectedPatientId, name: selectedPatientName }}
                      messages={evolutionMessages.get(selectedPatientId) || []}
                      profile={patientProfile}
                      loading={evolutionLoading}
                      onSend={handleEvolutionSend}
                      sending={evolutionSending}
                      error={evolutionError}
                    />
                  </div>
                </>
              )}
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
              sessionCount={confirmedSessions.length}
              compact
              patientId={selectedPatientId}
              onEditPatient={(id) => setEditingPatientId(id)}
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
                  value={draft}
                  onChange={setDraft}
                  onGenerate={(d) => handleSendDictation(d)}
                  loading={isLoading}
                  orphanedSessions={orphanedSessions}
                  onResumeOrphan={handleResumeOrphan}
                  onDiscardOrphan={handleDiscardOrphan}
                  noteFormat={noteFormat}
                  onFormatChange={(format) => {
                    if (format === 'custom' && (!template?.fields || template.fields.length === 0)) {
                      setIsConfiguratorFirstTime(false);
                      setShowNoteConfigurator(true);
                    } else {
                      setNoteFormat(format);
                    }
                  }}
                  onEditTemplate={() => {
                    setIsConfiguratorFirstTime(false);
                    setShowNoteConfigurator(true);
                  }}
                />
              </div>
            )}

            {/* Tab: Nota */}
            {mobileTab === 'nota' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div ref={mobileScrollRef} className="flex-1 overflow-y-auto px-4 py-5">
                  {currentSessionNote === null ? (
                    NOTE_EMPTY_STATE
                  ) : currentSessionNote.type === 'loading' ? (
                    <div className="flex gap-2 items-center py-4">
                      {[0, 0.2, 0.4].map((d, i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-ink-muted animate-pulse" style={{ animationDelay: `${d}s` }} />
                      ))}
                      <span className="text-ink-tertiary text-sm">
                        {noteFormat === 'custom' ? 'Generando nota personalizada…' : 'Generando nota SOAP…'}
                      </span>
                    </div>
                  ) : currentSessionNote.type === 'error' ? (
                    <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 text-sm">
                      <strong>Error:</strong> {currentSessionNote.text}
                    </div>
                  ) : currentSessionNote.type === 'bot' && currentSessionNote.noteData?.format === 'custom' ? (
                    <CustomNoteDocument
                      templateFields={currentSessionNote.noteData.template_fields || template?.fields || []}
                      values={currentSessionNote.noteData.custom_fields || {}}
                      onConfirm={async (editedValues) => {
                        const sid = currentSessionNote.noteData.session_id;
                        await confirmNote(sid, {
                          format: 'custom',
                          custom_fields: editedValues,
                        });
                        setNewlyConfirmedSessionId(sid);
                        fetchPatientSessions(selectedPatientId);
                        fetchConversations();
                        setCurrentSessionNote(null);
                        setToast('Sesión confirmada — nota guardada en historial');
                        setTimeout(() => setToast(null), 3500);
                      }}
                      onDelete={async () => {
                        const sid = currentSessionNote.noteData.session_id;
                        await deleteSession(sid);
                        setCurrentSessionNote(null);
                        fetchPatientSessions(selectedPatientId);
                      }}
                    />
                  ) : currentSessionNote.type === 'bot' && currentSessionNote.noteData ? (
                    <SoapNoteDocument
                      noteData={currentSessionNote.noteData}
                      onConfirm={fetchConversations}
                      readOnly={currentSessionNote.readOnly}
                      onDelete={!currentSessionNote.readOnly ? async () => {
                        const sid = currentSessionNote.noteData?.session_id || currentSessionNote.noteData?.clinical_note?.session_id || currentSessionNote.sessionId;
                        if (!sid) return;
                        await deleteSession(sid);
                        setCurrentSessionNote(null);
                        fetchPatientSessions(selectedPatientId);
                      } : undefined}
                    />
                  ) : null}
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
                        const isCustom = s.format === 'custom';
                        const hasNote = s.status === 'confirmed' && (s.structured_note || s.custom_fields);
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
                                {isCustom ? (
                                  <CustomNoteDocument
                                    templateFields={template?.fields || []}
                                    values={s.custom_fields || {}}
                                    readOnly
                                  />
                                ) : (
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
                                )}
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



      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181b] text-white text-[13px] font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* PatientIntakeModal — crear o editar expediente */}
      <PatientIntakeModal
        open={isCreatingPatient || editingPatientId != null}
        mode={editingPatientId != null ? 'edit' : 'create'}
        initialPatient={editingPatientId != null ? { id: editingPatientId } : null}
        onClose={() => {
          setIsCreatingPatient(false);
          setEditingPatientId(null);
        }}
        onSaved={(patient) => {
          if (editingPatientId != null) {
            // EDIT — update conversation entry with fresh name
            setConversations((prev) => prev.map((c) =>
              c.patient_id === String(patient.id) ? { ...c, patient_name: patient.name } : c
            ));
            setEditingPatientId(null);
          } else {
            // CREATE
            handleModalPatientCreated(patient);
          }
        }}
      />

    </div>
  );
}

export default App
