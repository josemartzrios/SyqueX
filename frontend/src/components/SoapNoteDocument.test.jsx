import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SoapNoteDocument from './SoapNoteDocument'

// Mock the api module
vi.mock('../api', () => ({
  confirmNote: vi.fn(),
}))

import { confirmNote } from '../api'

const STRUCTURED_NOTE_DATA = {
  clinical_note: {
    structured_note: {
      subjective: 'Paciente refiere ansiedad laboral',
      objective: 'Afecto ansioso, sin ideación suicida',
      assessment: 'TAG leve',
      plan: 'TCC semanal, seguimiento en 2 semanas',
    },
    detected_patterns: ['ansiedad recurrente'],
    alerts: ['Riesgo de burnout'],
    session_id: 'sess-123',
  },
  text_fallback: null,
}

const TEXT_ONLY_NOTE_DATA = {
  clinical_note: null,
  text_fallback: 'Subjetivo: Ansiedad laboral Objetivo: Afecto ansioso Análisis: TAG Plan: TCC semanal',
}

const EMPTY_NOTE_DATA = {
  clinical_note: null,
  text_fallback: null,
}

describe('SoapNoteDocument', () => {
  // ── Rendering SOAP sections ──────────────
  it('renderiza las 4 secciones SOAP con nota estructurada', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
    expect(screen.getByText('Subjetivo')).toBeInTheDocument()
    expect(screen.getByText('Objetivo')).toBeInTheDocument()
    expect(screen.getByText('Análisis')).toBeInTheDocument()
    expect(screen.getByText('Plan')).toBeInTheDocument()
  })

  it('muestra el contenido de cada sección', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
    expect(screen.getByText('Paciente refiere ansiedad laboral')).toBeInTheDocument()
    expect(screen.getByText('TCC semanal, seguimiento en 2 semanas')).toBeInTheDocument()
  })

  it('muestra header label "Nota Clínica · SOAP"', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
    expect(screen.getByText('Nota Clínica · SOAP')).toBeInTheDocument()
  })

  // ── Alerts and patterns ──────────────────
  it('muestra alertas cuando existen', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
    expect(screen.getByText('Alertas detectadas')).toBeInTheDocument()
    expect(screen.getByText('Riesgo de burnout')).toBeInTheDocument()
  })

  it('muestra patrones evolutivos cuando existen', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} />)
    expect(screen.getByText('Patrones evolutivos')).toBeInTheDocument()
    expect(screen.getByText('ansiedad recurrente')).toBeInTheDocument()
  })

  it('no muestra alertas cuando array está vacío', () => {
    const noteData = {
      ...STRUCTURED_NOTE_DATA,
      clinical_note: { ...STRUCTURED_NOTE_DATA.clinical_note, alerts: [] },
    }
    render(<SoapNoteDocument noteData={noteData} />)
    expect(screen.queryByText('Alertas detectadas')).not.toBeInTheDocument()
  })

  // ── Fallback text ────────────────────────
  it('usa text_fallback y parsea SOAP cuando no hay clinical_note', () => {
    render(<SoapNoteDocument noteData={TEXT_ONLY_NOTE_DATA} />)
    // parseSoapText debería encontrar al menos "Subjetivo"
    expect(screen.getByText('Subjetivo')).toBeInTheDocument()
  })

  // ── readOnly behavior ────────────────────
  it('oculta botón Confirmar cuando readOnly=true', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={true} />)
    expect(screen.queryByRole('button', { name: /Confirmar/i })).not.toBeInTheDocument()
  })

  it('muestra botón "Confirmar y guardar" cuando readOnly=false', () => {
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} />)
    expect(screen.getByRole('button', { name: /Confirmar y guardar/i })).toBeInTheDocument()
  })

  // ── Confirm flow ─────────────────────────
  it('click en Confirmar llama confirmNote con session_id', async () => {
    const user = userEvent.setup()
    confirmNote.mockResolvedValueOnce({})

    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Confirmar y guardar/i }))

    await waitFor(() => {
      expect(confirmNote).toHaveBeenCalledWith('sess-123', expect.objectContaining({
        format: 'SOAP',
        structured_note: STRUCTURED_NOTE_DATA.clinical_note.structured_note,
      }))
    })
  })

  it('muestra "Guardada ✓" después de confirmar exitosamente', async () => {
    const user = userEvent.setup()
    confirmNote.mockResolvedValueOnce({})

    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Confirmar y guardar/i }))

    await waitFor(() => {
      expect(screen.getByText('Guardada ✓')).toBeInTheDocument()
    })
  })

  it('muestra error cuando confirmNote falla', async () => {
    const user = userEvent.setup()
    confirmNote.mockRejectedValueOnce(new Error('Error de servidor'))

    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Confirmar y guardar/i }))

    await waitFor(() => {
      expect(screen.getByText('Error de servidor')).toBeInTheDocument()
    })
  })

  it('muestra "Guardando…" durante el proceso de confirmación', async () => {
    // Make confirmNote hang
    confirmNote.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    render(<SoapNoteDocument noteData={STRUCTURED_NOTE_DATA} readOnly={false} onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Confirmar y guardar/i }))

    expect(screen.getByText('Guardando…')).toBeInTheDocument()
  })
})
