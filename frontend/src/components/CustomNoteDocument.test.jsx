import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CustomNoteDocument from './CustomNoteDocument'

const TEMPLATE_FIELDS = [
  { id: 'motivo', label: 'Motivo de consulta', type: 'text', order: 0 },
  { id: 'estado', label: 'Estado de ánimo', type: 'scale', order: 1 },
  { id: 'tecnicas', label: 'Técnicas aplicadas', type: 'checkbox', options: ['TCC', 'Mindfulness'], order: 2 },
]

const VALUES = {
  motivo: 'Ansiedad laboral persistente',
  estado: 7,
  tecnicas: ['TCC'],
}

const TEMPLATE_FIELDS_ALL = [
  { id: 'motivo', label: 'Motivo de consulta', type: 'text', order: 0 },
  { id: 'estado', label: 'Estado de ánimo', type: 'scale', order: 1 },
  { id: 'tecnicas', label: 'Técnicas aplicadas', type: 'options', options: ['TCC', 'Mindfulness', 'EMDR'], order: 2 },
  { id: 'fecha_inicio', label: 'Fecha inicio tratamiento', type: 'date', order: 3 },
]

const VALUES_ALL = {
  motivo: 'Ansiedad laboral persistente',
  estado: 7,
  tecnicas: ['TCC'],
  fecha_inicio: '2026-01-15',
}

describe('CustomNoteDocument', () => {
  // ── Rendering ─────────────────────────────
  it('renderiza los campos del template', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('Motivo de consulta')).toBeInTheDocument()
    expect(screen.getByText('Estado de ánimo')).toBeInTheDocument()
    expect(screen.getByText('Técnicas aplicadas')).toBeInTheDocument()
  })

  it('muestra el valor de campo texto', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('Ansiedad laboral persistente')).toBeInTheDocument()
  })

  it('muestra badge BORRADOR en modo draft', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    expect(screen.getByText('BORRADOR')).toBeInTheDocument()
  })

  it('no muestra badge BORRADOR en modo readOnly', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} readOnly />)
    expect(screen.queryByText('BORRADOR')).not.toBeInTheDocument()
  })

  // ── Edit behavior ─────────────────────────
  it('campo texto tiene borde dashed en modo draft', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)
    const textDiv = screen.getByText('Ansiedad laboral persistente')
    expect(textDiv).toHaveStyle({ cursor: 'text' })
  })

  it('click en campo texto muestra textarea', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('blur en textarea guarda el valor editado', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'Estrés laboral crónico')
    await user.tab()

    expect(screen.getByText('Estrés laboral crónico')).toBeInTheDocument()
  })

  it('confirmar llama onConfirm con los valores editados', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} onConfirm={onConfirm} />)

    // Editar el campo motivo
    await user.click(screen.getByText('Ansiedad laboral persistente'))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'Estrés laboral crónico')
    await user.tab()

    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ motivo: 'Estrés laboral crónico' })
      )
    })
  })

  it('campo texto NO es clickeable en readOnly', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS} values={VALUES} readOnly />)

    await user.click(screen.getByText('Ansiedad laboral persistente'))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  // ── Escala editable ───────────────────────
  it('scale muestra el valor inicial seleccionado', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)
    const btn7 = screen.getByRole('button', { name: '7' })
    expect(btn7).toHaveClass('bg-[#5a9e8a]')
  })

  it('click en número de escala actualiza la selección', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)

    await user.click(screen.getByRole('button', { name: '3' }))

    expect(screen.getByRole('button', { name: '3' })).toHaveClass('bg-[#5a9e8a]')
    expect(screen.getByRole('button', { name: '7' })).not.toHaveClass('bg-[#5a9e8a]')
  })

  it('confirmar envía el valor de escala editado', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ estado: 3 }))
    })
  })

  it('scale NO es clickeable en readOnly', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} readOnly />)

    await user.click(screen.getByRole('button', { name: '3' }))

    expect(screen.getByRole('button', { name: '7' })).toHaveClass('bg-[#5a9e8a]')
  })

  // ── Opciones editables ────────────────────
  it('opciones muestra las seleccionadas correctamente', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)
    expect(screen.getByLabelText('TCC')).toBeChecked()
    expect(screen.getByLabelText('Mindfulness')).not.toBeChecked()
  })

  it('click en opción desmarcada la marca', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)

    await user.click(screen.getByLabelText('Mindfulness'))

    expect(screen.getByLabelText('Mindfulness')).toBeChecked()
  })

  it('click en opción marcada la desmarca', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)

    await user.click(screen.getByLabelText('TCC'))

    expect(screen.getByLabelText('TCC')).not.toBeChecked()
  })

  it('confirmar envía las opciones editadas', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} onConfirm={onConfirm} />)

    await user.click(screen.getByLabelText('Mindfulness'))
    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ tecnicas: expect.arrayContaining(['TCC', 'Mindfulness']) })
      )
    })
  })

  it('opciones NO son clickeables en readOnly', async () => {
    const user = userEvent.setup()
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} readOnly />)

    await user.click(screen.getByLabelText('Mindfulness'))

    expect(screen.getByLabelText('Mindfulness')).not.toBeChecked()
  })

  // ── Fecha editable ────────────────────────
  it('date muestra input editable en modo draft', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} />)
    const dateInput = screen.getByDisplayValue('2026-01-15')
    expect(dateInput).toBeInTheDocument()
  })

  it('date muestra span estático en readOnly', () => {
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} readOnly />)
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('2026-01-15')).not.toBeInTheDocument()
  })

  it('confirmar envía la fecha editada', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<CustomNoteDocument templateFields={TEMPLATE_FIELDS_ALL} values={VALUES_ALL} onConfirm={onConfirm} />)

    const dateInput = screen.getByDisplayValue('2026-01-15')
    await user.clear(dateInput)
    await user.type(dateInput, '2026-03-20')

    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ fecha_inicio: '2026-03-20' }))
    })
  })
})
