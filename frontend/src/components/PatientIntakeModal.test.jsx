import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import PatientIntakeModal from './PatientIntakeModal'

vi.mock('../api', () => ({
  createPatient: vi.fn(),
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
}))

import { createPatient, getPatient, updatePatient } from '../api'

const noop = () => {}

describe('PatientIntakeModal', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  beforeEach(() => {
    createPatient.mockReset()
    getPatient.mockReset()
    updatePatient.mockReset()
  })

  it('no renderiza cuando open=false', () => {
    const { container } = render(<PatientIntakeModal open={false} onClose={noop} onSaved={noop} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza título "Registrar paciente" en modo create', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    expect(screen.getByText('Registrar paciente')).toBeInTheDocument()
  })

  it('renderiza título "Editar expediente" en modo edit y hace GET', async () => {
    getPatient.mockResolvedValueOnce({
      id: 42, name: 'Ana', date_of_birth: '1990-01-01', reason_for_consultation: 'Ansiedad',
      emergency_contact: null,
    })
    render(
      <PatientIntakeModal open={true} mode="edit" initialPatient={{ id: 42 }} onClose={noop} onSaved={noop} />
    )
    await waitFor(() => expect(getPatient).toHaveBeenCalledWith(42))
    expect(screen.getByText('Editar expediente')).toBeInTheDocument()
  })

  it('muestra aviso LFPDPPP', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    expect(screen.getByText(/Art\. 8 LFPDPPP/)).toBeInTheDocument()
  })

  it('submit deshabilitado hasta llenar los 3 obligatorios', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    const submit = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    expect(submit).toBeDisabled()

    const dob = screen.getByLabelText(/Fecha de nacimiento/)
    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    expect(submit).toBeDisabled()

    const reason = screen.getByPlaceholderText(/Qué trae al paciente/)
    await user.type(reason, 'Ansiedad')
    expect(submit).not.toBeDisabled()
  })

  it('muestra edad calculada al elegir fecha', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    expect(screen.getByText(/Edad: 36/)).toBeInTheDocument()
  })

  it('contacto emergencia: parcial → submit deshabilitado + mensaje', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    // Llenar los 3 obligatorios
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')

    // Escribir solo el nombre del contacto → inválido
    await user.type(screen.getByLabelText(/Contacto de emergencia — nombre/), 'Pedro')

    const submit = screen.getByRole('button', { name: /Crear paciente/i })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/Completa nombre, parentesco y teléfono/)).toBeInTheDocument()
  })

  it('mode=create llama createPatient con payload limpio', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onSaved = vi.fn()
    createPatient.mockResolvedValueOnce({ id: 7, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => {
      expect(createPatient).toHaveBeenCalledTimes(1)
    })
    const payload = createPatient.mock.calls[0][0]
    expect(payload.name).toBe('Ana')
    expect(payload.date_of_birth).toBe('1990-01-01')
    expect(payload.reason_for_consultation).toBe('Ansiedad')
    // Campos vacíos NO deben estar en el payload de create
    expect(payload).not.toHaveProperty('occupation')
    expect(payload).not.toHaveProperty('emergency_contact')
    expect(onSaved).toHaveBeenCalledWith({ id: 7, name: 'Ana' })
  })

  it('mode=edit llama updatePatient con patch incluyendo nulls explícitos', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onSaved = vi.fn()
    getPatient.mockResolvedValueOnce({
      id: 9,
      name: 'Ana',
      date_of_birth: '1990-01-01',
      reason_for_consultation: 'Orig',
      occupation: 'Antigua',
      emergency_contact: null,
    })
    updatePatient.mockResolvedValueOnce({ id: 9, name: 'Ana', occupation: '' })

    render(<PatientIntakeModal open={true} mode="edit" initialPatient={{ id: 9 }} onClose={noop} onSaved={onSaved} />)

    await waitFor(() => expect(getPatient).toHaveBeenCalled())

    // Borrar la ocupación
    const occInput = screen.getByPlaceholderText(/Ej\. Docente/)
    await user.clear(occInput)

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => expect(updatePatient).toHaveBeenCalledTimes(1))
    const [id, patch] = updatePatient.mock.calls[0]
    expect(id).toBe(9)
    expect(patch.occupation).toBeNull()  // PATCH sí incluye null explícito
  })

  it('muestra error inline si el API falla', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockRejectedValueOnce(new Error('Nombre duplicado'))

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(screen.getByText('Nombre duplicado')).toBeInTheDocument())
  })

  it('click en Cancelar llama onClose', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    render(<PatientIntakeModal open={true} mode="create" onClose={onClose} onSaved={noop} />)
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('click en X llama onClose', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    render(<PatientIntakeModal open={true} mode="create" onClose={onClose} onSaved={noop} />)
    await user.click(screen.getByRole('button', { name: /Cerrar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('permite elegir género y teléfono, y se envían en el payload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockResolvedValueOnce({ id: 8 })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)

    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByPlaceholderText('DD'), '01')
    await user.selectOptions(screen.getByRole('combobox', { name: /Mes/i }), '01')
    await user.type(screen.getByPlaceholderText('AAAA'), '1990')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')

    // Nuevo campo: Género
    await user.selectOptions(screen.getByLabelText(/Género/), 'mujer')
    // Nuevo campo: Teléfono
    await user.type(screen.getByPlaceholderText(/Ej\. 5512345678/), '5512345678')

    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(createPatient).toHaveBeenCalled())
    const payload = createPatient.mock.calls[0][0]
    expect(payload.gender_identity).toBe('mujer')
    expect(payload.phone).toBe('5512345678')
  })
})
