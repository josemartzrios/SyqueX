import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
})
