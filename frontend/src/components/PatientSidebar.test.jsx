import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import PatientSidebar from './PatientSidebar'

const defaultProps = {
  conversations: [],
  selectedPatientId: null,
  onSelectConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onNewPatient: vi.fn(),
  isCreatingPatient: false,
  newPatientName: '',
  onNewPatientNameChange: vi.fn(),
  onSavePatient: vi.fn(),
  onCancelNewPatient: vi.fn(),
}

describe('PatientSidebar — logout button', () => {
  it('does not render "Cerrar sesión" (moved to App.jsx desktop sidebar bottom strip)', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).not.toBeInTheDocument()
  })
})

describe('PatientSidebar — nuevo paciente button', () => {
  it('does not render visible "Nuevo paciente" text (wide button is gone)', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.queryByText('Nuevo paciente')).not.toBeInTheDocument()
  })
  it('renders a + icon button next to the PACIENTES label', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.getByTitle('Nuevo paciente')).toBeInTheDocument()
  })
  it('calls onNewPatient when the + icon button is clicked', async () => {
    const onNewPatient = vi.fn()
    render(<PatientSidebar {...defaultProps} onNewPatient={onNewPatient} />)
    await userEvent.click(screen.getByTitle('Nuevo paciente'))
    expect(onNewPatient).toHaveBeenCalledOnce()
  })
  it('shows inline creation form when isCreatingPatient is true', () => {
    render(<PatientSidebar {...defaultProps} isCreatingPatient={true} />)
    expect(screen.getByPlaceholderText(/nombre del paciente/i)).toBeInTheDocument()
  })
})

describe('PatientSidebar — draft badge', () => {
  const conv = {
    patient_id: '42',
    patient_name: 'Juan García',
    session_number: 3,
    session_date: '2026-04-18',
    dictation_preview: null,
    status: 'confirmed',
  }

  it('shows Borrador badge when patient has draft', () => {
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[conv]}
        draftPatientIds={new Set(['42'])}
      />
    )
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.queryByText('Confirmada')).not.toBeInTheDocument()
  })

  it('shows Confirmada badge when patient has no draft', () => {
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[conv]}
        draftPatientIds={new Set()}
      />
    )
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
  })

  it('shows no badge when patient has no sessions', () => {
    const noSessions = { ...conv, session_number: null }
    render(
      <PatientSidebar
        {...defaultProps}
        conversations={[noSessions]}
        draftPatientIds={new Set()}
      />
    )
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmada')).not.toBeInTheDocument()
    expect(screen.getByText('Sin sesiones')).toBeInTheDocument()
  })
})

describe('PatientSidebar — cancel subscription button', () => {
  it('no muestra "Cancelar suscripción" cuando canCancelSubscription=false', () => {
    render(<PatientSidebar {...defaultProps} canCancelSubscription={false} />)
    expect(screen.queryByRole('button', { name: /cancelar suscripción/i })).not.toBeInTheDocument()
  })

  it('muestra "Cancelar suscripción" cuando canCancelSubscription=true', () => {
    render(<PatientSidebar {...defaultProps} canCancelSubscription={true} onCancelSubscription={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cancelar suscripción/i })).toBeInTheDocument()
  })

  it('click en "Cancelar suscripción" llama onCancelSubscription', async () => {
    const onCancelSubscription = vi.fn()
    render(<PatientSidebar {...defaultProps} canCancelSubscription={true} onCancelSubscription={onCancelSubscription} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar suscripción/i }))
    expect(onCancelSubscription).toHaveBeenCalledOnce()
  })
})
