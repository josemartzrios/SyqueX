import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UpcomingBookingCard from './UpcomingBookingCard';

const mockBooking = {
  id: 'slot-123',
  slot_date: '2026-05-22',
  start_time: '10:00:00',
  duration_minutes: 60,
};

describe('UpcomingBookingCard', () => {
  it('no renderiza nada cuando booking es null', () => {
    const { container } = render(
      <UpcomingBookingCard booking={null} onCancel={vi.fn()} canceling={false} error={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra fecha, hora y duración formateadas', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error={null} />
    );
    expect(screen.getByText(/22 de mayo/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00 am · 60 min/i)).toBeInTheDocument();
  });

  it('muestra confirmación inline al presionar Cancelar cita', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    expect(screen.getByText(/¿Confirmar cancelación\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sí, cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no, regresar/i })).toBeInTheDocument();
  });

  it('llama onCancel con el id correcto al confirmar', () => {
    const onCancel = vi.fn();
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={onCancel} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }));
    expect(onCancel).toHaveBeenCalledWith('slot-123');
  });

  it('no llama onCancel al abortar la confirmación', () => {
    const onCancel = vi.fn();
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={onCancel} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    fireEvent.click(screen.getByRole('button', { name: /no, regresar/i }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cancelar cita del/i })).toBeInTheDocument();
  });

  it('muestra spinner y deshabilita botón cuando canceling es true', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={true} error={null} />
    );
    expect(screen.getByText(/cancelando…/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar cita del/i })).toBeDisabled();
  });

  it('muestra el error cuando se recibe el prop error', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error="No se pudo cancelar." />
    );
    expect(screen.getByText(/No se pudo cancelar\./i)).toBeInTheDocument();
  });
});
