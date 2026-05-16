// frontend/src/components/CalendarScreen.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CalendarScreen from './CalendarScreen';

vi.mock('../api', () => ({
  getCalendarSlots: vi.fn(() => Promise.resolve([])),
  createCalendarSlot: vi.fn(),
  deleteCalendarSlot: vi.fn(),
}));

describe('CalendarScreen', () => {
  it('renders close button in modal mode (default)', () => {
    render(<CalendarScreen onClose={() => {}} />);
    expect(screen.getByLabelText('Cerrar agenda')).toBeInTheDocument();
  });

  it('does not render close button in inline mode', () => {
    render(<CalendarScreen onClose={() => {}} mode="inline" />);
    expect(screen.queryByLabelText('Cerrar agenda')).not.toBeInTheDocument();
  });

  it('applies fixed positioning in modal mode', () => {
    const { container } = render(<CalendarScreen onClose={() => {}} />);
    expect(container.firstChild.className).toContain('fixed');
  });

  it('does not apply fixed positioning in inline mode', () => {
    const { container } = render(<CalendarScreen onClose={() => {}} mode="inline" />);
    expect(container.firstChild.className).not.toContain('fixed');
  });
});
