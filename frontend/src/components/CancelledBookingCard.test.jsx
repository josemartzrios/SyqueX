import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CancelledBookingCard from './CancelledBookingCard';

const mockBooking = {
  id: 'slot-999',
  slot_date: '2026-06-01',
  start_time: '10:00:00',
  duration_minutes: 60,
};

describe('CancelledBookingCard', () => {
  it('no renderiza nada cuando booking es null', () => {
    const { container } = render(
      <CancelledBookingCard booking={null} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra label "Cita cancelada"', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/cita cancelada/i)).toBeInTheDocument();
  });

  it('muestra fecha, hora y duración formateadas', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/1 de junio/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00 am · 60 min/i)).toBeInTheDocument();
  });

  it('muestra mensaje de cancelación por psicólogo', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={false} />
    );
    expect(screen.getByText(/tu psicólogo canceló esta cita/i)).toBeInTheDocument();
  });

  it('llama onAcknowledge con el id correcto al presionar Enterado', () => {
    const onAcknowledge = vi.fn();
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={onAcknowledge} acknowledging={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: /enterado/i }));
    expect(onAcknowledge).toHaveBeenCalledWith('slot-999');
  });

  it('muestra spinner y deshabilita botón cuando acknowledging es true', () => {
    render(
      <CancelledBookingCard booking={mockBooking} onAcknowledge={vi.fn()} acknowledging={true} />
    );
    expect(screen.getByText(/procesando/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enterado/i })).toBeDisabled();
  });
});
