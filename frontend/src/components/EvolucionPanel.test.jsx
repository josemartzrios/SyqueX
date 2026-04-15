import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import EvolucionPanel from './EvolucionPanel'

// Mock DOM method not implemented by jsdom
window.HTMLElement.prototype.scrollIntoView = function() {}

const patient = { id: 'p1', name: 'María González' }
const noop = () => {}

describe('EvolucionPanel — empty state', () => {
  it('muestra mensaje vacío cuando messages=[] y loading=false', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText(/Inicia una conversación sobre María González/)).toBeInTheDocument()
  })

  it('muestra spinner cuando loading=true', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={true} onSend={noop} sending={false} error={null} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('EvolucionPanel — chat bubbles', () => {
  const messages = [
    { role: 'user', content: 'Hola agente' },
    { role: 'agent', content: 'Hola doctor' },
  ]

  it('renderiza burbuja de usuario', () => {
    render(<EvolucionPanel patient={patient} messages={messages} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('Hola agente')).toBeInTheDocument()
  })

  it('renderiza burbuja del agente', () => {
    render(<EvolucionPanel patient={patient} messages={messages} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('Hola doctor')).toBeInTheDocument()
  })
})

describe('EvolucionPanel — chips', () => {
  it('muestra chips de fallback cuando profile=null', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Qué patrones destacan en las últimas sesiones?')).toBeInTheDocument()
  })

  it('muestra chips contextuales desde recurring_themes', () => {
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Cómo ha evolucionado Ansiedad social?')).toBeInTheDocument()
  })

  it('usa fallback si recurring_themes y risk_factors están vacíos', () => {
    const profile = { profile: { recurring_themes: [], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    expect(screen.getByText('¿Qué patrones destacan en las últimas sesiones?')).toBeInTheDocument()
  })

  it('llama onSend con el texto del chip al hacer click', async () => {
    const onSend = vi.fn()
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={onSend} sending={false} error={null} />)
    await userEvent.click(screen.getByText('¿Cómo ha evolucionado Ansiedad social?'))
    expect(onSend).toHaveBeenCalledWith('¿Cómo ha evolucionado Ansiedad social?')
  })

  it('el chip desaparece después de ser tocado', async () => {
    const profile = { profile: { recurring_themes: ['ansiedad social'], risk_factors: [] } }
    render(<EvolucionPanel patient={patient} messages={[]} profile={profile} loading={false} onSend={noop} sending={false} error={null} />)
    const chip = screen.getByText('¿Cómo ha evolucionado Ansiedad social?')
    await userEvent.click(chip)
    expect(screen.queryByText('¿Cómo ha evolucionado Ansiedad social?')).not.toBeInTheDocument()
  })
})

describe('EvolucionPanel — input', () => {
  it('llama onSend al enviar el formulario con texto', async () => {
    const onSend = vi.fn()
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={onSend} sending={false} error={null} />)
    const input = screen.getByPlaceholderText(/Pregunta al agente/)
    await userEvent.type(input, 'mi pregunta')
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))
    expect(onSend).toHaveBeenCalledWith('mi pregunta')
  })

  it('deshabilita input y botón cuando sending=true', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={true} error={null} />)
    expect(screen.getByPlaceholderText(/Pregunta al agente/)).toBeDisabled()
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
  })

  it('muestra mensaje de error cuando error no es null', () => {
    render(<EvolucionPanel patient={patient} messages={[]} profile={null} loading={false} onSend={noop} sending={false} error="No se pudo enviar. Intenta de nuevo." />)
    expect(screen.getByText('No se pudo enviar. Intenta de nuevo.')).toBeInTheDocument()
  })
})
