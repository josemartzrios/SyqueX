// frontend/src/components/AvailabilityPanel.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AvailabilityPanel from './AvailabilityPanel';

const mockSlots = [
  { slot_date: '2026-05-18', start_time: '09:00', duration_minutes: 60 },
  { slot_date: '2026-05-18', start_time: '10:00', duration_minutes: 60 },
];

describe('AvailabilityPanel', () => {
  it('renders input state by default', () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn()} onConfirmSlots={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Describe cuándo estás disponible/)).toBeInTheDocument();
    expect(screen.getByText('Interpretar disponibilidad →')).toBeInTheDocument();
  });

  it('shows loading state while parsing', async () => {
    const slowParse = () => new Promise(resolve => setTimeout(() => resolve(mockSlots), 100));
    render(<AvailabilityPanel onParseAvailability={slowParse} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText('Interpretando…')).toBeInTheDocument();
  });

  it('shows preview with parsed slots', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText('INTERPRETADO')).toBeInTheDocument();
    expect(screen.getByText('Confirmar 2 →')).toBeInTheDocument();
  });

  it('allows removing a slot from preview', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    await screen.findByText('INTERPRETADO');
    const removeButtons = screen.getAllByTitle('Eliminar slot');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText('Confirmar 1 →')).toBeInTheDocument();
  });

  it('shows error state when parse returns empty', async () => {
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.reject(new Error('422')))} onConfirmSlots={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'texto sin sentido' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    expect(await screen.findByText(/No pude identificar/)).toBeInTheDocument();
  });

  it('calls onConfirmSlots with remaining slots on confirm', async () => {
    const onConfirm = vi.fn(() => Promise.resolve({ created: 2, skipped: 0 }));
    render(<AvailabilityPanel onParseAvailability={vi.fn(() => Promise.resolve(mockSlots))} onConfirmSlots={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe cuándo estás disponible/), {
      target: { value: 'Lunes de 9 a 10' }
    });
    fireEvent.click(screen.getByText('Interpretar disponibilidad →'));
    await screen.findByText('INTERPRETADO');
    fireEvent.click(screen.getByText('Confirmar 2 →'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(mockSlots));
  });
});
