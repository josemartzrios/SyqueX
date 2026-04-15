import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import NewPatientModal from './NewPatientModal'

// Mock the api module
vi.mock('../api', () => ({
  createPatient: vi.fn(),
}))

import { createPatient } from '../api'

const noop = () => {}

describe('NewPatientModal', () => {
  // ── Visibility ───────────────────────────
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(<NewPatientModal open={false} onClose={noop} onCreated={noop} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza el modal cuando open=true', () => {
    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    expect(screen.getByText('Registrar paciente')).toBeInTheDocument()
  })

  // ── Form elements ────────────────────────
  it('muestra input de nombre con placeholder', () => {
    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    expect(screen.getByPlaceholderText(/María García/)).toBeInTheDocument()
  })

  it('muestra campos aspiracionales deshabilitados', () => {
    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    expect(screen.getByText('Edad')).toBeInTheDocument()
    expect(screen.getByText('Motivo de consulta')).toBeInTheDocument()
    // Verificar que están deshabilitados (buscar "próximamente")
    const badges = screen.getAllByText('próximamente')
    expect(badges).toHaveLength(2)
  })

  it('botón Crear paciente está deshabilitado sin nombre', () => {
    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    const submitBtn = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submitBtn).toBeDisabled()
  })

  it('botón Crear paciente se habilita al escribir nombre', async () => {
    const user = userEvent.setup()
    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Test')
    const submitBtn = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submitBtn).not.toBeDisabled()
  })

  // ── Close behavior ───────────────────────
  it('click en Cancelar llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NewPatientModal open={true} onClose={onClose} onCreated={noop} />)
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('click en X llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NewPatientModal open={true} onClose={onClose} onCreated={noop} />)
    await user.click(screen.getByRole('button', { name: /Cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('click en backdrop llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NewPatientModal open={true} onClose={onClose} onCreated={noop} />)
    await user.click(screen.getByTestId
      ? document.getElementById('new-patient-modal-backdrop')
      : screen.getByRole('button', { name: /Cancelar/i }) // fallback
    )
    expect(onClose).toHaveBeenCalled()
  })

  // ── Submit success ───────────────────────
  it('submit exitoso llama onCreated con id y nombre', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()

    createPatient.mockResolvedValueOnce({ id: 42 })

    render(<NewPatientModal open={true} onClose={noop} onCreated={onCreated} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Juan Pérez')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(createPatient).toHaveBeenCalledWith('Juan Pérez')
      expect(onCreated).toHaveBeenCalledWith({ id: 42, name: 'Juan Pérez' })
    })
  })

  it('limpia el input después de submit exitoso', async () => {
    const user = userEvent.setup()
    createPatient.mockResolvedValueOnce({ id: 43 })

    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    const input = screen.getByPlaceholderText(/María García/)
    await user.type(input, 'Test')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(input.value).toBe('')
    })
  })

  // ── Submit error ─────────────────────────
  it('muestra error inline cuando createPatient falla', async () => {
    const user = userEvent.setup()
    createPatient.mockRejectedValueOnce(new Error('Nombre duplicado'))

    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Duplicado')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(screen.getByText('Nombre duplicado')).toBeInTheDocument()
    })
  })

  it('no llama onCreated cuando hay error', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    createPatient.mockRejectedValueOnce(new Error('Error de red'))

    render(<NewPatientModal open={true} onClose={noop} onCreated={onCreated} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Test')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(screen.getByText('Error de red')).toBeInTheDocument()
    })
    expect(onCreated).not.toHaveBeenCalled()
  })

  // ── Edge cases ───────────────────────────
  it('no envía formulario con solo espacios', async () => {
    const user = userEvent.setup()
    createPatient.mockClear()

    render(<NewPatientModal open={true} onClose={noop} onCreated={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), '   ')
    // Button should be disabled because trimmed value is empty
    const submitBtn = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submitBtn).toBeDisabled()
  })
})
