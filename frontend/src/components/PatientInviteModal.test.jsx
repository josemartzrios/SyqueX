import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PatientInviteModal from './PatientInviteModal'

vi.mock('../api', () => ({
  invitePatient: vi.fn(),
  resendPatientInvite: vi.fn(),
}))

import { invitePatient, resendPatientInvite } from '../api'

const noop = () => {}

const makePatient = (portalStatus = null) => ({
  id: 'patient-123',
  name: 'Ana García',
  portal_status: portalStatus,
})

describe('PatientInviteModal', () => {
  beforeEach(() => {
    invitePatient.mockReset()
    resendPatientInvite.mockReset()
  })

  it('no renderiza cuando open=false', () => {
    const { container } = render(
      <PatientInviteModal open={false} patient={makePatient()} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('muestra "Enviar invitación" cuando portal_status es null', () => {
    render(<PatientInviteModal open={true} patient={makePatient(null)} onClose={noop} />)
    expect(screen.getByRole('button', { name: /Enviar invitación/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/i })).not.toBeInTheDocument()
  })

  it('muestra "Reenviar invitación" cuando portal_status es "invited"', () => {
    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    expect(screen.getByRole('button', { name: /Reenviar invitación/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Enviar invitación$/i })).not.toBeInTheDocument()
  })

  it('llama resendPatientInvite al hacer click en Reenviar', async () => {
    const user = userEvent.setup()
    resendPatientInvite.mockResolvedValueOnce({ message: 'Invitación reenviada', expires_in_days: 7 })

    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    await user.click(screen.getByRole('button', { name: /Reenviar invitación/i }))

    await waitFor(() => expect(resendPatientInvite).toHaveBeenCalledWith('patient-123'))
  })

  it('muestra confirmación de éxito tras reenvío', async () => {
    const user = userEvent.setup()
    resendPatientInvite.mockResolvedValueOnce({ message: 'Invitación reenviada', expires_in_days: 7 })

    render(<PatientInviteModal open={true} patient={makePatient('invited')} onClose={noop} />)
    await user.click(screen.getByRole('button', { name: /Reenviar invitación/i }))

    await waitFor(() => expect(screen.getByText(/reenviada/i)).toBeInTheDocument())
  })
})
