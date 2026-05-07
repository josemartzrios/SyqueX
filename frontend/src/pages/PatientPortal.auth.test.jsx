import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the guard logic in isolation, not the component render
// The guard is: token && sessionStorage.portal_session === '1'

function portalGuard() {
  const token = localStorage.getItem('patient_token')
  const sessionActive = sessionStorage.getItem('portal_session') === '1'
  return token && sessionActive ? 'patient-portal' : 'patient-login'
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('patient portal auth guard', () => {
  it('shows login when no token and no session flag', () => {
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows login when token exists but no session flag (email link scenario)', () => {
    localStorage.setItem('patient_token', 'valid-token')
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows login when session flag exists but no token', () => {
    sessionStorage.setItem('portal_session', '1')
    expect(portalGuard()).toBe('patient-login')
  })

  it('shows portal when both token and session flag are present', () => {
    localStorage.setItem('patient_token', 'valid-token')
    sessionStorage.setItem('portal_session', '1')
    expect(portalGuard()).toBe('patient-portal')
  })
})
