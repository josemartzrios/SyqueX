import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Sidebar from './Sidebar'

const ONE_CONV = [{
  id: 'sess-1', patient_id: 'p1', patient_name: 'María López',
  session_date: '2026-01-15', session_number: 1,
  status: 'confirmed', dictation_preview: 'Texto de prueba'
}]

const THREE_CONVS = [
  { id: 'sess-1', patient_id: 'p1', patient_name: 'María López',   session_date: '2026-01-15', session_number: 1, status: 'confirmed', dictation_preview: 'A' },
  { id: 'sess-2', patient_id: 'p2', patient_name: 'Carlos Ruiz',   session_date: '2026-01-22', session_number: 2, status: 'draft',     dictation_preview: 'B' },
  { id: 'sess-3', patient_id: 'p3', patient_name: 'Ana Gómez',     session_date: '2026-01-29', session_number: 3, status: 'confirmed', dictation_preview: 'C' },
]

const noop = () => {}

describe('Sidebar', () => {
  it('open=false: panel tiene clase -translate-x-full', () => {
    render(<Sidebar open={false} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    const panel = screen.getByTestId('sidebar-panel')
    expect(panel.classList.contains('-translate-x-full')).toBe(true)
  })

  it('open=true: panel tiene clase translate-x-0', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    const panel = screen.getByTestId('sidebar-panel')
    expect(panel.classList.contains('translate-x-0')).toBe(true)
  })

  it('click en backdrop llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    await user.click(screen.getByTestId('sidebar-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('click en botón X llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('estado vacío: muestra "Sin sesiones registradas"', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText(/Sin sesiones registradas/i)).toBeInTheDocument()
  })

  it('muestra conteo correcto: "3 sesiones" y "1 sesión"', () => {
    const { rerender } = render(<Sidebar open={true} onClose={noop} conversations={THREE_CONVS} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText('3 sesiones')).toBeInTheDocument()
    rerender(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByText('1 sesión')).toBeInTheDocument()
  })

  it('click en conversación llama onSelectConversation antes que onClose', async () => {
    const user = userEvent.setup()
    const onSelectConversation = vi.fn()
    const onClose = vi.fn()
    render(<Sidebar open={true} onClose={onClose} conversations={THREE_CONVS} onSelectConversation={onSelectConversation} onDeleteConversation={noop} />)
    await user.click(screen.getByText('María López'))
    expect(onSelectConversation).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSelectConversation.mock.invocationCallOrder[0])
      .toBeLessThan(onClose.mock.invocationCallOrder[0])
  })

  it('primer click en eliminar muestra estado de confirmación, NO llama onDeleteConversation', async () => {
    const user = userEvent.setup()
    const onDeleteConversation = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={onDeleteConversation} />)
    await user.click(screen.getByTitle('Archivar sesión'))
    expect(screen.getByTitle('Confirmar')).toBeInTheDocument()
    expect(onDeleteConversation).not.toHaveBeenCalled()
  })

  it('segundo click en eliminar llama onDeleteConversation', async () => {
    const user = userEvent.setup()
    const onDeleteConversation = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={ONE_CONV} onSelectConversation={noop} onDeleteConversation={onDeleteConversation} />)
    await user.click(screen.getByTitle('Archivar sesión'))
    await user.click(screen.getByTitle('Confirmar'))
    expect(onDeleteConversation).toHaveBeenCalledOnce()
  })
})
