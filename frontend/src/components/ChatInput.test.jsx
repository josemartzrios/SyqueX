import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ChatInput from './ChatInput'

describe('ChatInput', () => {
  it('renderiza textarea y ambos botones', () => {
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText(/Generar nota clínica/i)).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
  })

  it('muestra contador de palabras al escribir', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'uno dos tres')
    expect(screen.getByText('3 palabras')).toBeInTheDocument()
    // singular
    await user.clear(textarea)
    await user.type(textarea, 'hola')
    expect(screen.getByText('1 palabra')).toBeInTheDocument()
  })

  it('muestra hint y botones deshabilitados cuando el textarea está vacío', () => {
    render(<ChatInput onSend={vi.fn()} loading={false} />)
    expect(screen.getByText('Enter para chat · Shift+Enter nueva línea')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('Enter llama onSend con formato "chat" y limpia el textarea', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'dictado de prueba')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('dictado de prueba', 'chat')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter NO llama onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'texto')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('click en "Generar nota clínica" llama onSend con formato "SOAP" y limpia el textarea', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} loading={false} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'sesión clínica')
    await user.click(screen.getByText(/Generar nota clínica/i))
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('sesión clínica', 'SOAP')
    expect(textarea.value).toBe('')
  })

  it('loading=true: textarea y botones quedan deshabilitados', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput onSend={onSend} loading={false} />)
    await user.type(screen.getByRole('textbox'), 'texto')
    rerender(<ChatInput onSend={onSend} loading={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('loading=true: Enter NO llama onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput onSend={onSend} loading={false} />)
    await user.type(screen.getByRole('textbox'), 'texto')
    rerender(<ChatInput onSend={onSend} loading={true} />)
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })
})
