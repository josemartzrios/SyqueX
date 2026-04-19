import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onGenerate: vi.fn(),
  loading: false,
}

describe('DictationPanel', () => {
  it('does not render the disabled voice button', () => {
    render(<DictationPanel {...defaultProps} />)
    expect(screen.queryByText(/voz/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument()
  })

  it('renders the Generar nota button', () => {
    render(<DictationPanel {...defaultProps} />)
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeInTheDocument()
  })

  it('does not show draft label when value is empty', () => {
    render(<DictationPanel {...defaultProps} value="" />)
    expect(screen.queryByText(/borrador guardado/i)).not.toBeInTheDocument()
  })

  it('shows draft label when value has text', () => {
    render(<DictationPanel {...defaultProps} value="el paciente reporta" />)
    expect(screen.getByText(/borrador guardado/i)).toBeInTheDocument()
  })

  it('calls onChange when user types', async () => {
    const onChange = vi.fn()
    render(<DictationPanel {...defaultProps} onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onGenerate with trimmed value on button click', async () => {
    const onGenerate = vi.fn()
    render(<DictationPanel {...defaultProps} value="  hola  " onGenerate={onGenerate} />)
    await userEvent.click(screen.getByRole('button', { name: /generar nota/i }))
    expect(onGenerate).toHaveBeenCalledWith('hola')
  })
})
