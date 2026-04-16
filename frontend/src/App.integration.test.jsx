import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import * as api from './api'
import * as auth from './auth.js'

// Mock entire API module
vi.mock('./api', () => ({
  listConversations: vi.fn(),
  getPatientSessions: vi.fn(),
  getPatientProfile: vi.fn(),
  processSession: vi.fn(),
  archivePatientSessions: vi.fn(),
  createPatient: vi.fn(),
  setAuthCallbacks: vi.fn(),
  getBillingStatus: vi.fn().mockResolvedValue({ status: 'active' }),
  createCheckout: vi.fn(),
  register: vi.fn().mockResolvedValue({ access_token: 'fake-token' })
}))

// Mock auth.js
vi.mock('./auth.js', () => ({
  getScreenFromUrl: vi.fn(() => ({ screen: 'app' })),
  navigateTo: vi.fn(),
  refreshAccessToken: vi.fn().mockResolvedValue('fake-token'),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn()
}))

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = function() {}

describe('App - Evolución Tab Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listConversations.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'Juan Perez' }
    ])
    // The regular call gets an array of sessions
    api.getPatientSessions.mockResolvedValue([
      { id: '1', format: 'SOAP', session_number: 1, status: 'confirmed', raw_dictation: 'Dictado inicial' }
    ])
    api.getPatientProfile.mockResolvedValue({
      profile: { recurring_themes: ['Theme A'], risk_factors: [] }
    })
    api.processSession.mockResolvedValue({ text_fallback: 'Respuesta simulada', session_id: 'new-id' })
  })

  it('lazy loads evolution chat and profile only when Evolución tab is clicked', async () => {
    render(<App />)
    const user = userEvent.setup()

    // It should load conversations
    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())

    // Find patient in sidebar and click it
    // Use getAllByText because PatientSidebar (desktop) and Sidebar (mobile) both render the name
    const patients = await screen.findAllByText('Juan Perez')
    await user.click(patients[0])

    // Wait for the history load (the SOAP fetch uses default page_size)
    await waitFor(() => {
      expect(api.getPatientSessions).toHaveBeenCalledWith('p1')
    })

    // Profile and Evolution history shouldn't be loaded yet
    expect(api.getPatientProfile).not.toHaveBeenCalled()
    // getPatientSessions shouldn't have been called a second time
    expect(api.getPatientSessions).toHaveBeenCalledTimes(1)

    // Now click the "Evolución" tab
    const tabEvolucion = screen.getByRole('button', { name: /evolución/i })
    await user.click(tabEvolucion)

    // It should now trigger the API requests
    await waitFor(() => {
      expect(api.getPatientSessions).toHaveBeenCalledWith('p1', 200)
      expect(api.getPatientProfile).toHaveBeenCalledWith('p1')
    })
  })

  it('optimistic UI handling when sending message in Evolución', async () => {
    render(<App />)
    const user = userEvent.setup()
    
    // Setup and select patient
    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Juan Perez')
    await user.click(patients[0])
    
    // Open Tab
    const tabEvolucion = screen.getByRole('button', { name: /evolución/i })
    await user.click(tabEvolucion)

    // Wait for initial evolution messages to finish loading
    await waitFor(() => expect(api.getPatientProfile).toHaveBeenCalled())

    // Send a message via input
    const input = await screen.findByPlaceholderText(/Pregunta al agente…/i)
    await user.type(input, '¿Cómo ves la evolución de Juan?')
    
    const sendBtn = screen.getByRole('button', { name: /enviar/i })
    await user.click(sendBtn)
    
    // Verify optimistic message is on screen
    expect(screen.getByText('¿Cómo ves la evolución de Juan?')).toBeInTheDocument()

    // Verify API called
    expect(api.processSession).toHaveBeenCalledWith('p1', '¿Cómo ves la evolución de Juan?', 'chat')

    // Verify response text matches
    await waitFor(() => {
      expect(screen.getByText('Respuesta simulada')).toBeInTheDocument()
    })
  })
})

describe('App - Registration routing', () => {
  it('after successful registration, calls getBillingStatus and shows app', async () => {
    auth.getScreenFromUrl.mockReturnValue({ screen: 'register' })
    auth.refreshAccessToken.mockResolvedValue(null)

    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')
    await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
    await user.click(screen.getByLabelText(/Términos y Condiciones/i))
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(api.getBillingStatus).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    })
  })
})

describe('App - Nota panel empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getScreenFromUrl.mockReturnValue({ screen: 'app' })
    auth.refreshAccessToken.mockResolvedValue('fake-token')
    api.getBillingStatus.mockResolvedValue({ status: 'active' })
    api.listConversations.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'Ana López' }
    ])
    // Patient has a confirmed SOAP session in history
    api.getPatientSessions.mockResolvedValue([
      {
        id: 's1',
        format: 'SOAP',
        session_number: 1,
        status: 'confirmed',
        raw_dictation: 'Dictado previo',
        ai_response: '**S — Sesión previa**',
        structured_note: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
        detected_patterns: [],
        alerts: [],
      }
    ])
    api.getPatientProfile.mockResolvedValue({ profile: { recurring_themes: [], risk_factors: [] } })
    api.processSession.mockResolvedValue({
      session_id: 'new-sess',
      clinical_note: {
        structured_note: { subjective: 'Nueva S', objective: 'O', assessment: 'A', plan: 'P' },
        detected_patterns: [],
        alerts: [],
        session_id: 'new-sess',
      },
      text_fallback: '**S — Nueva sesión**',
    })
  })

  it('shows empty state in Nota tab when patient with history is selected', async () => {
    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    // Switch to Nota tab (use exact:false in case tab has minor whitespace)
    const notaTab = (await screen.findAllByRole('button', { name: /nota/i, exact: false }))[0]
    await user.click(notaTab)

    expect((await screen.findAllByText('Aún no hay nota generada'))[0]).toBeInTheDocument()
    expect((await screen.findAllByText(/Dicta los puntos de la sesión/))[0]).toBeInTheDocument()
  })

  it('shows loading state while generating note', async () => {
    // Delay the API response so we can assert on the loading state
    api.processSession.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        session_id: 'new-sess',
        clinical_note: { structured_note: {}, detected_patterns: [], alerts: [], session_id: 'new-sess' },
        text_fallback: '',
      }), 200))
    )

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    // Type in Dictar tab and click generate
    const dictarTab = (await screen.findAllByRole('button', { name: /dictar/i }))[0]
    await user.click(dictarTab)
    const textarea = (await screen.findAllByPlaceholderText(/Dicta los puntos clave/i))[0]
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click((await screen.findAllByRole('button', { name: /generar nota/i }))[0])

    // handleSendDictation auto-switches to Nota tab — loading indicator must appear
    expect((await screen.findAllByText(/Generando nota/i))[0]).toBeInTheDocument()
    expect(screen.queryAllByText('Aún no hay nota generada').length).toBe(0)
  })

  it('shows note after generation completes', async () => {
    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    const dictarTab = (await screen.findAllByRole('button', { name: /dictar/i }))[0]
    await user.click(dictarTab)
    const textarea = (await screen.findAllByPlaceholderText(/Dicta los puntos clave/i))[0]
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click((await screen.findAllByRole('button', { name: /generar nota/i }))[0])

    // Wait for loading to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Generando nota/i)).not.toBeInTheDocument()
    })
    // Empty state gone, note content visible
    expect(screen.queryAllByText('Aún no hay nota generada').length).toBe(0)
    // SoapNoteDocument should render (it receives structured_note with subjective: 'Nueva S')
    expect((await screen.findAllByText(/Nueva S/i))[0]).toBeInTheDocument()
  })

  it('shows error state when generation fails', async () => {
    api.processSession.mockRejectedValue(new Error('Server unreachable'))

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())
    const patients = await screen.findAllByText('Ana López')
    await user.click(patients[0])

    const dictarTab = (await screen.findAllByRole('button', { name: /dictar/i }))[0]
    await user.click(dictarTab)
    const textarea = (await screen.findAllByPlaceholderText(/Dicta los puntos clave/i))[0]
    await user.type(textarea, 'Paciente presenta mejoría.')
    await user.click((await screen.findAllByRole('button', { name: /generar nota/i }))[0])

    await waitFor(() => {
      expect(screen.queryAllByText(/Anomalía de conexión: Server unreachable/).length).toBeGreaterThan(0)
    })
  })

  it('resets to empty state when switching to a different patient', async () => {
    api.listConversations.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'Ana López' },
      { patient_id: 'p2', patient_name: 'Carlos Ruiz' },
    ])
    api.getPatientSessions
      .mockResolvedValueOnce([
        { id: 's1', format: 'SOAP', session_number: 1, status: 'confirmed',
          raw_dictation: 'Dictado', ai_response: '**S**',
          structured_note: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
          detected_patterns: [], alerts: [] }
      ])
      .mockResolvedValueOnce([]) // p2 has no history

    render(<App />)
    const user = userEvent.setup()

    await waitFor(() => expect(api.listConversations).toHaveBeenCalled())

    // Select Ana and generate a note
    const anas = await screen.findAllByText('Ana López')
    await user.click(anas[0])
    const dictarTab = (await screen.findAllByRole('button', { name: /dictar/i }))[0]
    await user.click(dictarTab)
    const textarea = (await screen.findAllByPlaceholderText(/Dicta los puntos clave/i))[0]
    await user.type(textarea, 'Sesión de Ana.')
    await user.click((await screen.findAllByRole('button', { name: /generar nota/i }))[0])
    await waitFor(() => expect(api.processSession).toHaveBeenCalled())

    // Switch to Carlos
    const carloss = await screen.findAllByText('Carlos Ruiz')
    await user.click(carloss[0])

    // Nota tab must reset to empty state
    const notaTab = (await screen.findAllByRole('button', { name: /nota/i, exact: false }))[0]
    await user.click(notaTab)
    expect((await screen.findAllByText('Aún no hay nota generada'))[0]).toBeInTheDocument()
  })
})
