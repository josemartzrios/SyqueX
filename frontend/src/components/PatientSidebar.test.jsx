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
  onLogout: vi.fn(),
}

describe('PatientSidebar — logout button', () => {
  it('renders "Cerrar sesión" button', () => {
    render(<PatientSidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  })

  it('calls onLogout when the button is clicked', async () => {
    const onLogout = vi.fn()
    render(<PatientSidebar {...defaultProps} onLogout={onLogout} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('does not crash when onLogout is not provided', () => {
    const props = { ...defaultProps }
    delete props.onLogout
    expect(() => render(<PatientSidebar {...props} />)).not.toThrow()
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
