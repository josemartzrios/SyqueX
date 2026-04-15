import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DictationPanel from './DictationPanel'

describe('DictationPanel', () => {
  it('does not render the disabled voice button', () => {
    render(<DictationPanel onGenerate={vi.fn()} loading={false} />)
    expect(screen.queryByText(/voz/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument()
  })
  it('renders the Generar nota button', () => {
    render(<DictationPanel onGenerate={vi.fn()} loading={false} />)
    expect(screen.getByRole('button', { name: /generar nota/i })).toBeInTheDocument()
  })
})
