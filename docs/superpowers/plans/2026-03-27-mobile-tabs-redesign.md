# Mobile Tabs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la UI mobile chat-first con una interfaz de 3 tabs: Dictar (con historial de chips), Nota (SOAP note viewer), y Evolución (chat con agente clínico).

**Architecture:** El layout mobile se bifurca del desktop en el nivel de `<main>`. Desktop mantiene el flujo actual sin cambios. Mobile muestra un patient strip + tab nav + contenido según el tab activo. Tres componentes nuevos encapsulan cada vista móvil; App.jsx orquesta el estado.

**Tech Stack:** React 18, Tailwind CSS via CDN (colores custom en `index.html`), FastAPI backend (sin cambios).

> **Nota de alcance:** El spec original limitaba los cambios al mockup HTML (`docs/mockups/syquex-v2-mobile.html`), que ya fue actualizado. Este plan implementa el diseño aprobado en el código de producción (`frontend/src/`). El mockup es la referencia visual — no requiere más cambios.

---

## File Map

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear | `frontend/src/components/MobileTabNav.jsx` | Barra de 3 tabs (Dictar/Nota/Evolución) |
| Crear | `frontend/src/components/MobileHistoryChips.jsx` | Strip horizontal de chips de sesiones anteriores |
| Crear | `frontend/src/components/MobileEvolucion.jsx` | Tab Evolución: resumen + chips rápidos + chat |
| Modificar | `frontend/src/App.jsx` | Estado mobileTab, sessionHistory, layout mobile |

**Colores disponibles en el app (index.html tailwind.config):**
- `sage` (#5B7A6A), `sage-dark` (#3D5248), `sage-light` (#EBF2EE), `sage-50` (#F4F8F5)
- `parchment` (#F7F4EF), `parchment-dark` (#EDE8E0)
- `ink`, `ink-secondary`, `ink-tertiary`, `ink-muted`

**Sin tests automatizados** en este codebase — cada tarea incluye pasos de verificación manual en el browser.

---

## Task 1: MobileTabNav component

**Files:**
- Create: `frontend/src/components/MobileTabNav.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// frontend/src/components/MobileTabNav.jsx
export default function MobileTabNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'dictar',    label: 'Dictar' },
    { id: 'nota',      label: 'Nota' },
    { id: 'evolucion', label: 'Evolución' },
  ];

  return (
    <div className="flex border-b border-ink/[0.10] bg-white flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-[13px] font-medium border-b-2 transition-all ${
            activeTab === tab.id
              ? 'text-sage border-sage font-semibold'
              : 'text-ink-muted border-transparent'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que no hay errores de sintaxis**

```bash
cd frontend && node --input-type=module <<'EOF'
import('./src/components/MobileTabNav.jsx').then(() => console.log('OK')).catch(e => console.error(e))
EOF
```

Si el entorno no soporta ESM directo, saltar — se verificará en el browser en Task 5.

---

## Task 2: MobileHistoryChips component

**Files:**
- Create: `frontend/src/components/MobileHistoryChips.jsx`

Los chips muestran sesiones **anteriores** del paciente (excluye la sesión en curso). La data viene del array `sessionHistory` que se añade en Task 4 — son los objetos raw de `getPatientSessions()`.

- [ ] **Step 1: Crear el componente**

```jsx
// frontend/src/components/MobileHistoryChips.jsx
function formatChipDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function MobileHistoryChips({ sessions }) {
  // Solo sesiones confirmadas con nota
  const confirmed = sessions.filter(s => s.status === 'confirmed' && s.structured_note);

  if (confirmed.length === 0) return null;

  return (
    <div className="flex gap-2 px-5 py-3 overflow-x-auto border-b border-ink/[0.06] bg-white scrollbar-hide flex-shrink-0"
         style={{ WebkitOverflowScrolling: 'touch' }}>
      {confirmed.map(session => (
        <div
          key={session.id}
          className="flex flex-col flex-shrink-0 min-w-[120px] px-3 py-2 bg-parchment border border-ink/[0.06] rounded-[10px] cursor-pointer active:bg-parchment-dark transition-colors"
        >
          <span className="text-[11px] font-semibold text-ink-secondary">
            {formatChipDate(session.session_date || session.created_at)}
          </span>
          <span className="text-[11px] text-ink-muted mt-0.5 truncate max-w-[130px]">
            {session.raw_dictation
              ? session.raw_dictation.slice(0, 40) + (session.raw_dictation.length > 40 ? '…' : '')
              : 'Nota confirmada'}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Añadir `scrollbar-hide` al CSS global de `index.html`**

En `frontend/index.html`, dentro del bloque `<style>`, añadir al final:

```css
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

---

## Task 3: MobileEvolucion component

**Files:**
- Create: `frontend/src/components/MobileEvolucion.jsx`

Recibe los `messages` del paciente, filtra los de tipo `chat` para el historial de conversación, y extrae el resumen del último `evolution_report` de las notas confirmadas.

- [ ] **Step 1: Crear el componente**

```jsx
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
      return m.noteData.clinical_note.detected_patterns.join(' · ');
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
```

---

## Task 4: Agregar estado a App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:148-157` (estado) y `frontend/src/App.jsx:168-225` (loadPatientChat)

- [ ] **Step 1: Agregar `mobileTab` y `sessionHistory` al estado**

En App.jsx, después de la línea `const [conversations, setConversations] = useState([]);` (línea 156), añadir:

```jsx
  const [mobileTab, setMobileTab] = useState('dictar');
  const [sessionHistory, setSessionHistory] = useState([]);
```

- [ ] **Step 2: Guardar el historial raw en `loadPatientChat`**

En `loadPatientChat` (línea 168), al inicio de la función, después de `setSelectedPatientId(patientId)`:

```jsx
  setMobileTab('dictar');        // reset al cambiar de paciente
  setSessionHistory(history);    // guardar para los chips
```

La firma completa queda:
```jsx
const loadPatientChat = (patientId, patientName, history = []) => {
  setSelectedPatientId(patientId);
  setSelectedPatientName(patientName);
  setMobileTab('dictar');
  setSessionHistory(history);
  // ... resto del código sin cambios
```

- [ ] **Step 3: Auto-switch a 'nota' al enviar dictado**

En `handleSendDictation` (línea 275), después de `setMessages(prev => [...])`, añadir:

```jsx
    setMobileTab('nota');  // mostrar tab Nota mientras genera
```

El bloque queda:
```jsx
  const handleSendDictation = async (dictation, format) => {
    setMessages(prev => [
      ...markPendingNotesReadOnly(prev),
      { role: 'user', text: dictation },
      { role: 'assistant', type: 'loading' }
    ]);
    if (format === 'SOAP') setMobileTab('nota');   // ← añadir esta línea
    try {
      // ... resto sin cambios
```

- [ ] **Step 4: Handler para chat de Evolución**

Añadir después de `handleSendDictation`:

```jsx
  const handleSendEvolucionChat = (text) => {
    handleSendDictation(text, 'chat');
    setMobileTab('evolucion');  // mantener en Evolución tras enviar
  };
```

---

## Task 5: Restructurar el layout mobile en App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:429-504` (sección `<main>`)

El objetivo: el `<main>` actual muestra mensaje feed + input siempre. Lo bifurcamos: desktop mantiene el layout actual (con `hidden md:block`), mobile muestra el nuevo layout de tabs.

- [ ] **Step 1: Agregar imports al top de App.jsx**

Añadir después de los imports existentes de componentes:

```jsx
import MobileTabNav from './components/MobileTabNav.jsx';
import MobileHistoryChips from './components/MobileHistoryChips.jsx';
import MobileEvolucion from './components/MobileEvolucion.jsx';
```

- [ ] **Step 2: Reemplazar la sección `<main>` (líneas 430-505)**

```jsx
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
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
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
```

- [ ] **Step 3: Verificar visualmente en el browser**

```bash
cd frontend && npm run dev
```

Abrir `http://localhost:5173` en Chrome DevTools con modo mobile (iPhone 14 / 390px):
1. Seleccionar un paciente — debe mostrar patient strip + tabs Dictar/Nota/Evolución
2. Tab Dictar: si hay sesiones confirmadas, chips aparecen arriba; textarea debajo
3. Escribir dictado y pulsar "Generar nota →" — debe auto-cambiar a tab Nota y mostrar loading
4. Cuando termina de generar: NoteReview visible en tab Nota
5. Tab Evolución: resumen (o mensaje vacío si no hay), chips de preguntas, chat input
6. Click en una pregunta rápida: envía al agente, respuesta aparece en chat

Verificar en desktop (viewport > 768px):
- Layout anterior sin cambios (message feed + ChatInput)
- Tabs no aparecen

---

## Task 6: Commit

- [ ] **Step 1: Commit los nuevos componentes**

```bash
cd /c/Users/josma/OneDrive/Escritorio/SyqueX
git add frontend/src/components/MobileTabNav.jsx \
        frontend/src/components/MobileHistoryChips.jsx \
        frontend/src/components/MobileEvolucion.jsx \
        frontend/index.html \
        frontend/src/App.jsx
git commit -m "feat: mobile tabs — Dictar+historial, Nota, Evolución con chat clínico"
```

---

## Notas de implementación

**Textarea no controlada:** El textarea en el tab Dictar usa `document.getElementById` para leer el valor. Esto es intencional para evitar re-renders en cada keystroke en un componente que ya maneja estado complejo. Si en el futuro se necesita validación reactiva, convertir a estado controlado con `useState`.

**`messages` en Evolución:** El tab Evolución filtra `messages` para mostrar solo tipo `chat`. Esto significa que si el psicólogo dictó notas SOAP en la misma sesión, esos mensajes no aparecen en el chat de Evolución — solo las conversaciones de chat. Este comportamiento es intencional.

**handleSendEvolucionChat:** Llama a `handleSendDictation` con formato `'chat'` y luego llama a `setMobileTab('evolucion')` para corregir el auto-switch que `handleSendDictation` hace a 'nota'. El orden importa: `handleSendDictation` llama `setMobileTab('nota')` sincrónicamente, luego `handleSendEvolucionChat` lo corrige a 'evolucion'. React agrupa estos setState en el mismo tick.

**Desktop sin cambios:** Todo el bloque `hidden md:flex` replica exactamente el JSX original de las líneas 436-504. No hay diferencias funcionales.
