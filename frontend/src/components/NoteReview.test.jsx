import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NoteReview from './NoteReview'

const NOTE_DATA_CONFIRMED = {
  clinical_note: {
    structured_note: {
      subjective: 'Ansiedad laboral',
      objective: 'Afecto ansioso',
      assessment: 'TAG leve',
      plan: 'TCC semanal',
    },
    detected_patterns: [],
    alerts: [],
    session_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  },
  text_fallback: null,
}

describe('NoteReview — prop readOnly', () => {
  it('oculta el botón Confirmar cuando readOnly=true', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.queryByText(/Confirmar/i)).not.toBeInTheDocument()
  })

  it('oculta el badge BORRADOR cuando readOnly=true', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.queryByText('BORRADOR')).not.toBeInTheDocument()
  })

  it('muestra el botón Confirmar cuando readOnly=false', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={false} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeInTheDocument()
  })

  it('renderiza las secciones SOAP correctamente', () => {
    render(<NoteReview noteData={NOTE_DATA_CONFIRMED} readOnly={true} />)
    expect(screen.getByText('Ansiedad laboral')).toBeInTheDocument()
    expect(screen.getByText('TCC semanal')).toBeInTheDocument()
  })
})
