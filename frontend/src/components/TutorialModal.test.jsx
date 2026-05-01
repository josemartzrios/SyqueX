import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import TutorialModal from './TutorialModal'

const defaultProps = {
  visible: true,
  onClose: vi.fn(),
  isMobile: false,
  noteFormat: 'soap',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('TutorialModal', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(<TutorialModal {...defaultProps} visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders slide 1 content on open', () => {
    render(<TutorialModal {...defaultProps} />)
    expect(screen.getByText(/Bienvenido a SyqueX/i)).toBeInTheDocument()
    expect(screen.getByText('1 de 4')).toBeInTheDocument()
  })

  it('"Siguiente" advances to slide 2', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Crea tu primer paciente/i)).toBeInTheDocument()
    expect(screen.getByText('2 de 4')).toBeInTheDocument()
  })

  it('"Anterior" on slide 2 goes back to slide 1', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('← Anterior'))
    expect(screen.getByText(/Bienvenido a SyqueX/i)).toBeInTheDocument()
  })

  it('"Anterior" is hidden on slide 1', () => {
    render(<TutorialModal {...defaultProps} />)
    expect(screen.queryByText('← Anterior')).not.toBeInTheDocument()
  })

  it('shows "Finalizar" instead of "Siguiente" on last slide (desktop = slide 4)', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    // advance to slide 4
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
    expect(screen.queryByText('Siguiente →')).not.toBeInTheDocument()
  })

  it('closes and sets syquex_tutorial_done when ✕ is clicked', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Cerrar tutorial'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('closes and sets syquex_tutorial_done when "Finalizar" is clicked', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Finalizar'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('renders slide 3 — dictation content', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Dicta o escribe/i)).toBeInTheDocument()
  })

  it('renders slide 4 — note review content', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Revisa y confirma/i)).toBeInTheDocument()
  })

  it('desktop: does NOT render slide 5 (only 4 slides)', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    // On last slide (slide 4), "Finalizar" appears — not "Siguiente"
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
    expect(screen.getByText('4 de 4')).toBeInTheDocument()
  })
})
