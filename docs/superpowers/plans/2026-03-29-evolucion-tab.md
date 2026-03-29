# Evolución Tab — 4-Tab Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir el tab Evolución con chat persistido + chips contextuales, y reestructurar la navegación mobile de 3 a 4 tabs (Dictar / Nota / Historial / Evolución).

**Architecture:** Se añade `EvolucionPanel.jsx` como componente presentacional. `App.jsx` orquesta los 4 nuevos estados de Evolución (`evolutionMessages`, `evolutionLoading`, `evolutionSending`, `evolutionError`) y los callbacks (`loadEvolutionChat`, `loadPatientProfile`, `handleEvolutionSend`). La carga es lazy: se dispara con un `useEffect` cuando el tab Evolución se abre por primera vez para un paciente. El historial del chat se reconstruye filtrando sesiones con `format=chat` desde el backend.

**Tech Stack:** React 18, Vitest + React Testing Library, Tailwind CSS via CDN, api.js (fetch), FastAPI backend (sin cambios).

---

## File Map

| Acción | Archivo | Qué hace |
|--------|---------|----------|
| Modify | `frontend/src/api.js` | Añadir `getPatientProfile` + `page_size` a `getPatientSessions` |
| Modify | `frontend/src/App.jsx` | Añadir 4 estados, 3 callbacks, useEffect lazy-load, filtro Historial, render EvolucionPanel |
| Create | `frontend/src/components/EvolucionPanel.jsx` | Chat bubbles, chips contextuales, input, estados de carga/error |
| Create | `frontend/src/components/EvolucionPanel.test.jsx` | Tests del componente |

---

## Task 1: Actualizar api.js — `getPatientProfile` + `page_size`

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Añadir `page_size` opcional a `getPatientSessions`**

En `frontend/src/api.js`, reemplazar la función existente:

```js
// Antes (línea 44-48)
export async function getPatientSessions(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/sessions`);
  const data = await _handleResponse(res);
  return data.items;
}

// Después
export async function getPatientSessions(patientId, pageSize = 50) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/sessions?page_size=${pageSize}`);
  const data = await _handleResponse(res);
  return data.items;
}
```

- [ ] **Step 2: Añadir `getPatientProfile` al final de api.js**

```js
export async function getPatientProfile(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/profile`);
  return _handleResponse(res);
}
```

La respuesta tiene forma `{ profile: { recurring_themes, risk_factors, protective_factors, progress_indicators, patient_summary }, recent_sessions }`.

- [ ] **Step 3: Verificar que los cambios no rompen llamadas existentes**

`getPatientSessions` tiene un default `pageSize=50` — todas las llamadas actuales sin segundo argumento siguen funcionando igual.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add getPatientProfile + page_size param to getPatientSessions"
```

---

## Task 2: Añadir estado y callbacks de Evolución a App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Añadir imports necesarios**

Añadir `getPatientProfile` al import de `api.js` (línea 8):

```js
// Antes
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions } from './api'

// Después
import { processSession, createPatient, getPatientSessions, listConversations, archivePatientSessions, getPatientProfile } from './api'
```

- [ ] **Step 2: Añadir los 4 estados de Evolución**

Después de `const [sessionHistory, setSessionHistory] = useState([]);` (línea 115), añadir:

```js
// Evolución tab state
const [evolutionMessages, setEvolutionMessages] = useState(new Map()); // Map<patientId, Message[]>
const [evolutionLoading, setEvolutionLoading] = useState(false);
const [evolutionSending, setEvolutionSending] = useState(false);
const [evolutionError, setEvolutionError] = useState(null);
const [patientProfile, setPatientProfile] = useState(null);
```

- [ ] **Step 3: Añadir `loadEvolutionChat` callback**

Después de `loadPatientChat` (tras línea 187), añadir:

```js
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
```

- [ ] **Step 4: Añadir `loadPatientProfile` callback**

Inmediatamente después:

```js
const loadPatientProfile = async (patientId) => {
  try {
    const profile = await getPatientProfile(patientId);
    setPatientProfile(profile);
  } catch (err) {
    console.error('Error loading patient profile:', err);
    setPatientProfile(null);
  }
};
```

- [ ] **Step 5: Añadir `handleEvolutionSend` callback**

```js
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
```

- [ ] **Step 6: Limpiar estado de Evolución al cambiar de paciente**

`loadPatientChat` vive en línea 128. Reemplazar el bloque completo de la función (líneas 128–187) con:

```js
const loadPatientChat = (patientId, patientName, history = []) => {
  setSelectedPatientId(patientId);
  setSelectedPatientName(patientName);
  setMobileTab('dictar');
  setSessionHistory(history);
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
```

Los únicos cambios respecto al original son las 3 líneas de reset (`setPatientProfile`, `setEvolutionError`, `setEvolutionSending`) insertadas después de `setSessionHistory`.

- [ ] **Step 7: Añadir useEffect para lazy-load al abrir el tab**

`evolutionMessages` es un Map que no se puede incluir en deps de useEffect sin causar bucles (se recrea en cada render). Para leer su valor actual sin capturarlo en el closure, usar un ref que lo siga:

Añadir el ref justo después de los estados de Evolución (tras `useState(null)` del patientProfile):

```js
const evolutionMessagesRef = useRef(evolutionMessages);
useEffect(() => { evolutionMessagesRef.current = evolutionMessages; }, [evolutionMessages]);
```

Después del `useEffect` de scroll mobile (línea ~252), añadir:

```js
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
```

Usar `evolutionMessagesRef.current` (en lugar del state directamente) evita que el Map desactualizado cause una doble carga al cambiar de paciente.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add evolution state, loadEvolutionChat, loadPatientProfile, handleEvolutionSend to App.jsx"
```

---

## Task 3: Crear EvolucionPanel.jsx + tests

**Files:**
- Create: `frontend/src/components/EvolucionPanel.jsx`
- Create: `frontend/src/components/EvolucionPanel.test.jsx`

- [ ] **Step 1: Escribir los tests primero**

Crear `frontend/src/components/EvolucionPanel.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import EvolucionPanel from './EvolucionPanel'

const patient = { id: 'p1', name: 'María González' }
const noop = () => {}

describe('EvolucionPanel — empty state', () => {
  it('muestra mensaje vacío cuando messages=[] y loading=false', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText(/Inicia una conversación sobre María González/)).toBeInTheDocument()
  })

  it('muestra spinner cuando loading=true', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={true} onSend={noop} sending={false} error={null} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('EvolucionPanel — chat bubbles', () => {
  const messages = [
    { role: 'user', content: 'Hola agente' },
    { role: 'agent', content: 'Hola doctor' },
  ]

  it('renderiza burbuja de usuario', () => {
    render(<EvolucionPanel patient={patient} messages={messages} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('Hola agente')).toBeInTheDocument()
  })

  it('renderiza burbuja del agente', () => {
    render(<EvolucionPanel patient={patient} messages={messages} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('Hola doctor')).toBeInTheDocument()
  })
})

describe('EvolucionPanel — chips', () => {
  it('muestra chips de fallback cuando profile=null', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Qué patrones destacan en las últimas sesiones?')).toBeInTheDocument()
  })

  it('muestra chips contextuales desde recurring_themes', () => {
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Cómo ha evolucionado ansiedad social?')).toBeInTheDocument()
  })

  it('usa fallback si recurring_themes y risk_factors están vacíos', () => {
    const profile = { profile: { recurring_themes: [], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Qué patrones destacan en las últimas sesiones?')).toBeInTheDocument()
  })

  it('llama onSend con el texto del chip al hacer click', async () => {
    const onSend = vi.fn()
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={onSend} sending={false} error={null} />)
    await userEvent.click(screen.getByText('¿Cómo ha evolucionado ansiedad social?'))
    expect(onSend).toHaveBeenCalledWith('¿Cómo ha evolucionado ansiedad social?')
  })

  it('el chip desaparece después de ser tocado', async () => {
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    const chip = screen.getByText('¿Cómo ha evolucionado ansiedad social?')
    await userEvent.click(chip)
    expect(screen.queryByText('¿Cómo ha evolucionado ansiedad social?')).not.toBeInTheDocument()
  })
})

describe('EvolucionPanel — input', () => {
  it('llama onSend al enviar el formulario con texto', async () => {
    const onSend = vi.fn()
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={onSend} sending={false} error={null} />)
    const input = screen.getByPlaceholderText(/Pregunta al agente/)
    await userEvent.type(input, 'mi pregunta')
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))
    expect(onSend).toHaveBeenCalledWith('mi pregunta')
  })

  it('deshabilita input y botón cuando sending=true', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={true} error={null} />)
    expect(screen.getByPlaceholderText(/Pregunta al agente/)).toBeDisabled()
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
  })

  it('muestra mensaje de error cuando error no es null', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error="No se pudo enviar. Intenta de nuevo." />)
    expect(screen.getByText('No se pudo enviar. Intenta de nuevo.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
cd frontend
npm run test -- EvolucionPanel.test.jsx
```

Esperado: errores de módulo no encontrado ("Cannot find module './EvolucionPanel'").

- [ ] **Step 3: Crear EvolucionPanel.jsx**

Crear `frontend/src/components/EvolucionPanel.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'

// Genera chips de preguntas sugeridas a partir del perfil del paciente.
// Usa fallback estático si el perfil está vacío o es null.
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
  themes.slice(0, 2).forEach(t => chips.push(`¿Cómo ha evolucionado ${t}?`))
  risks.slice(0, 1).forEach(f => chips.push(`¿Persiste el factor de riesgo: ${f}?`))
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
```

- [ ] **Step 4: Correr tests y verificar que pasan**

```bash
cd frontend
npm run test -- EvolucionPanel.test.jsx
```

Esperado: todos los tests pasan (✓).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EvolucionPanel.jsx frontend/src/components/EvolucionPanel.test.jsx
git commit -m "feat: add EvolucionPanel component with chat bubbles, contextual chips, and persistence"
```

---

## Task 4: Actualizar App.jsx render — 4 tabs + filtro Historial + EvolucionPanel

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Añadir import de EvolucionPanel y eliminar dead code**

En el bloque de imports (líneas 1–8), añadir:

```js
import EvolucionPanel from './components/EvolucionPanel'
```

Eliminar la función `handleSendEvolucionChat` (líneas ~277–280 del archivo original):
```js
// ELIMINAR este bloque completo — ya no se usa tras añadir handleEvolutionSend
const handleSendEvolucionChat = (text) => {
  handleSendDictation(text, 'chat');
  setMobileTab('evolucion');
};
```
Esta función enviaba mensajes de chat al array `messages` (flujo SOAP) en vez de `evolutionMessages`. Con `handleEvolutionSend` ya en su lugar, esta función es dead code.

- [ ] **Step 2: Actualizar el array de tabs mobile y sus labels**

Localizar el bloque del tab nav mobile (línea ~459):

```jsx
// Antes
{['dictar', 'nota', 'historial'].map((tab) => (
  <button ...>
    {tab === 'dictar' ? 'Dictar' : tab === 'nota' ? 'Nota' : 'Historial'}
  </button>
))}

// Después
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
```

Nota: reducir font-size de `text-[13px]` a `text-[12px]` para que quepan 4 tabs.

- [ ] **Step 3: Filtrar el tab Historial para mostrar solo sesiones SOAP**

Localizar el bloque `{mobileTab === 'historial' && ...}` (línea ~519).

Primero, añadir esta línea **antes del `return` del componente** (junto a las otras variables derivadas, cerca de `const isLoading = ...`):

```js
const soapSessions = sessionHistory.filter(s => s.format !== 'chat');
```

Luego reemplazar el bloque `{mobileTab === 'historial' && ...}` completo:

```jsx
{mobileTab === 'historial' && (
  <div className="flex-1 overflow-y-auto px-4 py-4">
    {soapSessions.length === 0 ? (
        <p className="text-ink-tertiary text-[14px] text-center mt-10">Sin sesiones registradas aún.</p>
      ) : (
        <div className="space-y-2">
          {soapSessions.map((s, i) => (
            <div key={s.id || i} className="bg-[#f4f4f2] rounded-xl px-4 py-3 flex items-start gap-3">
              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'confirmed' ? 'bg-[#5a9e8a]' : 'bg-[#c4935a]'}`} />
              <div className="min-w-0">
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
            </div>
          ))}
        </div>
      )}
  </div>
)}
```

- [ ] **Step 4: Añadir el tab Evolución al render**

Inmediatamente después del bloque `{mobileTab === 'historial' && ...}` (antes del cierre de `</div>` del paciente activo), añadir:

```jsx
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
```

- [ ] **Step 5: Correr todos los tests existentes**

```bash
cd frontend
npm run test
```

Esperado: todos los tests existentes siguen pasando (sin regresiones).

- [ ] **Step 6: Verificar manualmente el happy path en local**

Con el backend y frontend corriendo:
1. Seleccionar un paciente existente
2. Verificar que Dictar / Nota / Historial / Evolución aparecen en el tab bar
3. Tab Dictar: solo textarea + botones, sin historial
4. Tab Historial: sin sesiones con `format=chat`
5. Tab Evolución: muestra spinner → luego historial de chat (o empty state si no hay) + chips

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: 4-tab mobile layout — add Evolución tab, filter Historial to SOAP only"
```

---

## Verificación final

- [ ] Correr suite de tests completa:
  ```bash
  cd frontend && npm run test
  ```
  Esperado: todos los tests pasan.

- [ ] Verificar criterios de éxito del spec:
  - [ ] 4 tabs visibles en mobile
  - [ ] Dictar: limpio
  - [ ] Historial: solo `format !== 'chat'`
  - [ ] Evolución: carga chat desde DB, chips funcionales, onSend persiste
  - [ ] Desktop: sin cambios
  - [ ] Happy path SOAP intacto
