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
})
