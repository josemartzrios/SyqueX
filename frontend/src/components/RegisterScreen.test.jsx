import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import RegisterScreen from './RegisterScreen'
import * as api from '../api'
import { ApiError } from '../api'


vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    register: vi.fn(),
  }
})


vi.mock('../auth.js', () => ({
  setAccessToken: vi.fn()
}))

describe('RegisterScreen', () => {
  it('renders all fields with proper labels', () => {
    render(<RegisterScreen onSuccess={() => {}} onLogin={() => {}} />)
    
    expect(screen.getByLabelText(/Nombre completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Aviso de Privacidad/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Términos y Condiciones/i)).toBeInTheDocument()
  })

  it('calls register API and onSuccess when form is submitted', async () => {
    const onSuccess = vi.fn()
    api.register.mockResolvedValue({ access_token: 'fake-token' })

    render(<RegisterScreen onSuccess={onSuccess} onLogin={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')
    await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
    await user.click(screen.getByLabelText(/Términos y Condiciones/i))
    
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledWith('Test User', 'test@example.com', 'Password123!', '')
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error message if registration fails', async () => {
    api.register.mockRejectedValue(new Error('Email already exists'))

    render(<RegisterScreen onSuccess={() => {}} onLogin={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')
    await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
    await user.click(screen.getByLabelText(/Términos y Condiciones/i))
    
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Email already exists/i)).toBeInTheDocument()
    })
  })

  it('shows inline login link when email is already registered', async () => {
    const onLogin = vi.fn()
    api.register.mockRejectedValue(
      new ApiError('El email ya está registrado.', 409, 'EMAIL_TAKEN')
    )

    render(<RegisterScreen onSuccess={() => {}} onLogin={onLogin} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Nombre completo/i), 'Test User')
    await user.type(screen.getByLabelText(/Email/i), 'existing@example.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!')
    await user.click(screen.getByLabelText(/Aviso de Privacidad/i))
    await user.click(screen.getByLabelText(/Términos y Condiciones/i))

    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Este email ya tiene una cuenta/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Iniciar sesión/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Iniciar sesión/i }))
    expect(onLogin).toHaveBeenCalledOnce()
  })
})

