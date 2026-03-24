import { describe, it, expect } from 'vitest'

// Lógica pura extraída de loadPatientChat para testear sin montar componente
function buildChatMessages(sessions) {
  const msgs = []
  sessions.forEach(session => {
    if (session.raw_dictation) {
      msgs.push({ role: 'user', text: session.raw_dictation })
    }

    const hasStructuredNote = session.status === 'confirmed' && session.structured_note

    if (hasStructuredNote) {
      msgs.push({
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
      })
    } else if (session.ai_response) {
      msgs.push({
        role: 'assistant',
        type: 'bot',
        noteData: {
          clinical_note: null,
          text_fallback: session.ai_response,
        },
        sessionId: String(session.id),
        readOnly: false,
      })
    }
  })
  return msgs
}

describe('buildChatMessages', () => {
  it('genera par user+bot para sesión confirmada con structured_note', () => {
    const sessions = [{
      id: 'sess-1',
      raw_dictation: 'El paciente refiere ansiedad.',
      ai_response: '**S — ...**',
      status: 'confirmed',
      structured_note: { subjective: 'Ansiedad', objective: 'Afecto ansioso', assessment: 'TAG', plan: 'TCC' },
      detected_patterns: ['ansiedad'],
      alerts: [],
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'user', text: 'El paciente refiere ansiedad.' })
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].readOnly).toBe(true)
    expect(msgs[1].noteData.clinical_note.structured_note.subjective).toBe('Ansiedad')
  })

  it('genera par user+bot para sesión draft sin structured_note', () => {
    const sessions = [{
      id: 'sess-2',
      raw_dictation: 'Dictado de prueba.',
      ai_response: '**S — borrador**',
      status: 'draft',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(2)
    expect(msgs[1].readOnly).toBe(false)
    expect(msgs[1].noteData.clinical_note).toBeNull()
  })

  it('omite mensaje de agente si no hay ai_response y no hay structured_note', () => {
    const sessions = [{
      id: 'sess-3',
      raw_dictation: 'Dictado sin respuesta.',
      ai_response: null,
      status: 'draft',
      structured_note: null,
      detected_patterns: null,
      alerts: null,
    }]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('procesa múltiples sesiones en orden cronológico', () => {
    const sessions = [
      { id: 's1', raw_dictation: 'Sesión 1', ai_response: 'Resp 1', status: 'confirmed',
        structured_note: { subjective: 'S1', objective: null, assessment: null, plan: null },
        detected_patterns: [], alerts: [] },
      { id: 's2', raw_dictation: 'Sesión 2', ai_response: 'Resp 2', status: 'draft',
        structured_note: null, detected_patterns: null, alerts: null },
    ]

    const msgs = buildChatMessages(sessions)
    expect(msgs).toHaveLength(4)
    expect(msgs[0].text).toBe('Sesión 1')
    expect(msgs[2].text).toBe('Sesión 2')
  })
})

// Inline temporal — se moverá a App.jsx en Task 2
function markPendingNotesReadOnly(messages) {
  return messages.map(msg =>
    msg.type === 'bot' && msg.noteData
      ? { ...msg, readOnly: true }
      : msg
  )
}

describe('markPendingNotesReadOnly', () => {
  it('pone readOnly:true en mensajes bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Dictado' },
      { role: 'assistant', type: 'bot', noteData: { clinical_note: null, text_fallback: 'S — ...' }, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0]).toEqual(messages[0])          // user msg sin cambios
    expect(result[1].readOnly).toBe(true)
  })

  it('no modifica mensajes que no son bot con noteData', () => {
    const messages = [
      { role: 'user', text: 'Hola' },
      { role: 'assistant', type: 'chat', text: 'Respuesta libre' },
      { role: 'assistant', type: 'error', text: 'Error' },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result).toEqual(messages)
  })

  it('marca múltiples notas SOAP pendientes en el mismo chat', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
      { role: 'user', text: 'Segundo dictado' },
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: false },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
    expect(result[2].readOnly).toBe(true)
  })

  it('no rompe notas ya confirmadas (readOnly:true)', () => {
    const messages = [
      { role: 'assistant', type: 'bot', noteData: {}, readOnly: true },
    ]
    const result = markPendingNotesReadOnly(messages)
    expect(result[0].readOnly).toBe(true)
  })
})
