import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock navigateTo before importing patientApi
vi.mock('./auth', () => ({ navigateTo: vi.fn() }))

import { navigateTo } from './auth'
import { getPatientSummaries, setPatientToken, getPatientToken } from './patientApi'

const API_BASE = 'http://localhost:8000/api/v1'

beforeEach(() => {
  vi.clearAllMocks()
  // Provide a token so the request is actually sent
  setPatientToken('test-token')
  // Reset location mock
  delete window.location
  window.location = { reload: vi.fn(), href: '' }
})

afterEach(() => {
  setPatientToken(null)
})

describe('patientFetch — 401 handling', () => {
  it('clears token, redirects to /portal/login, and reloads on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Token inválido' }),
    })

    await expect(getPatientSummaries()).rejects.toThrow()

    expect(getPatientToken()).toBeNull()
    expect(navigateTo).toHaveBeenCalledWith('/portal/login')
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('does NOT redirect on non-401 errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    })

    await expect(getPatientSummaries()).rejects.toThrow()

    expect(navigateTo).not.toHaveBeenCalled()
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
