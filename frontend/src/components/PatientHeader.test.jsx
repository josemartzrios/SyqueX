import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import PatientHeader from './PatientHeader'

describe('PatientHeader', () => {
  // ── Empty state ──────────────────────────
  it('muestra "Selecciona un paciente" cuando patientName es null', () => {
    render(<PatientHeader patientName={null} />)
    expect(screen.getByText('Selecciona un paciente')).toBeInTheDocument()
  })

  it('no muestra avatar cuando no hay paciente', () => {
    const { container } = render(<PatientHeader patientName={null} />)
    expect(container.querySelector('.rounded-full')).toBeNull()
  })

  // ── Desktop (default) ──────────────────────
  it('muestra nombre del paciente en modo desktop', () => {
    render(<PatientHeader patientName="María López" sessionCount={3} />)
    expect(screen.getByText('María López')).toBeInTheDocument()
  })

  it('muestra iniciales correctas en avatar', () => {
    render(<PatientHeader patientName="Carlos Ruiz" sessionCount={0} />)
    expect(screen.getByText('CA')).toBeInTheDocument()
  })

  it('muestra conteo de sesiones en formato plural', () => {
    render(<PatientHeader patientName="Ana Gómez" sessionCount={5} />)
    expect(screen.getByText(/5 sesiones/)).toBeInTheDocument()
  })

  it('muestra conteo de sesiones en formato singular', () => {
    render(<PatientHeader patientName="Ana Gómez" sessionCount={1} />)
    expect(screen.getByText(/1 sesión$/)).toBeInTheDocument()
  })

  it('sessionCount default es 0', () => {
    render(<PatientHeader patientName="Test" />)
    expect(screen.getByText(/0 sesiones/)).toBeInTheDocument()
  })

  // ── Compact (mobile) ──────────────────────
  it('modo compact muestra nombre del paciente', () => {
    render(<PatientHeader patientName="Pedro Martínez" sessionCount={2} compact />)
    expect(screen.getByText('Pedro Martínez')).toBeInTheDocument()
  })

  it('modo compact muestra "sesiones confirmadas"', () => {
    render(<PatientHeader patientName="Pedro Martínez" sessionCount={2} compact />)
    expect(screen.getByText('2 sesiones confirmadas')).toBeInTheDocument()
  })

  it('modo compact muestra singular "sesión confirmada"', () => {
    render(<PatientHeader patientName="Pedro Martínez" sessionCount={1} compact />)
    expect(screen.getByText('1 sesión confirmada')).toBeInTheDocument()
  })

  it('modo compact tiene fondo sidebar color', () => {
    const { container } = render(<PatientHeader patientName="Test" compact />)
    const wrapper = container.firstChild
    expect(wrapper.classList.contains('bg-[#f4f4f2]')).toBe(true)
  })

  // ── Segmented control (desktop mode toggle) ──────────────
  it('no renderiza segmented control si onModeChange no se pasa', () => {
    render(<PatientHeader patientName="Ana García" sessionCount={2} />)
    expect(screen.queryByRole('button', { name: /Sesión/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Revisión/i })).toBeNull()
  })

  it('renderiza segmented control en desktop cuando onModeChange está presente', () => {
    render(
      <PatientHeader
        patientName="Ana García"
        sessionCount={2}
        mode="session"
        onModeChange={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Sesión/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revisión/i })).toBeInTheDocument()
  })

  it('no renderiza segmented control en modo compact aunque onModeChange esté presente', () => {
    render(
      <PatientHeader
        patientName="Ana García"
        sessionCount={2}
        compact
        mode="session"
        onModeChange={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: /Sesión/i })).toBeNull()
  })

  it('llama onModeChange("review") al hacer clic en "Revisión"', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(
      <PatientHeader
        patientName="Ana García"
        sessionCount={2}
        mode="session"
        onModeChange={onModeChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /Revisión/i }))
    expect(onModeChange).toHaveBeenCalledWith('review')
  })

  it('llama onModeChange("session") al hacer clic en "Sesión"', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(
      <PatientHeader
        patientName="Ana García"
        sessionCount={2}
        mode="review"
        onModeChange={onModeChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /Sesión/i }))
    expect(onModeChange).toHaveBeenCalledWith('session')
  })
})
