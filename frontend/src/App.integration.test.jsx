import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import * as api from './api'

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
  createCheckout: vi.fn()
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
