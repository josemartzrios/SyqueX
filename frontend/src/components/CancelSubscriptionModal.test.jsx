import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CancelSubscriptionModal from './CancelSubscriptionModal'

const defaultProps = {
  open: true,
  periodEnd: '2026-06-07T12:00:00Z',
  loading: false,
  error: '',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

describe('CancelSubscriptionModal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<CancelSubscriptionModal {...defaultProps} open={false} />)
    expect(screen.queryByText(/cancelar suscripción/i)).not.toBeInTheDocument()
  })

  it('muestra el título cuando open=true', () => {
    render(<CancelSubscriptionModal {...defaultProps} />)
    expect(screen.getByText('¿Cancelar suscripción?')).toBeInTheDocument()
  })

  it('muestra la fecha formateada del período', () => {
    render(<CancelSubscriptionModal {...defaultProps} />)
    expect(screen.getByText(/7 de junio de 2026/i)).toBeInTheDocument()
  })

  it('botón "Conservar mi plan" llama onClose', async () => {
    const onClose = vi.fn()
    render(<CancelSubscriptionModal {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /conservar mi plan/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('botón "Sí, cancelar" llama onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<CancelSubscriptionModal {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('muestra "Cancelando…" y deshabilita botón cuando loading=true', () => {
    render(<CancelSubscriptionModal {...defaultProps} loading={true} />)
    const btn = screen.getByRole('button', { name: /cancelando/i })
    expect(btn).toBeDisabled()
  })

  it('muestra mensaje de error si error no está vacío', () => {
    render(<CancelSubscriptionModal {...defaultProps} error="Error de red" />)
    expect(screen.getByText('Error de red')).toBeInTheDocument()
  })
})
