import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingScreen from './OnboardingScreen';

describe('OnboardingScreen', () => {
  it('renders heading and both cards', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.getByText('¿Cómo quieres documentar tus sesiones?')).toBeInTheDocument();
    expect(screen.getByText('Formato SOAP')).toBeInTheDocument();
    expect(screen.getByText('Nota personalizada')).toBeInTheDocument();
  });

  it('does not render "Decidir después" link', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.queryByText(/Decidir después/i)).not.toBeInTheDocument();
  });

  it('does not accept onSkip prop (no "Decidir después" button)', () => {
    // Component should render without errors when onSkip is not passed
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Decidir después/i })).not.toBeInTheDocument();
  });

  it('calls onSelectSoap when SOAP card is clicked', () => {
    const handleSoap = vi.fn();
    render(<OnboardingScreen onSelectSoap={handleSoap} onSelectCustom={vi.fn()} />);
    fireEvent.click(screen.getByText('Formato SOAP'));
    expect(handleSoap).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectCustom when custom card is clicked', () => {
    const handleCustom = vi.fn();
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={handleCustom} />);
    fireEvent.click(screen.getByText('Nota personalizada'));
    expect(handleCustom).toHaveBeenCalledTimes(1);
  });

  it('renders SOAP pills (S, O, A, P)', () => {
    render(<OnboardingScreen onSelectSoap={vi.fn()} onSelectCustom={vi.fn()} />);
    expect(screen.getByText('Subjetivo')).toBeInTheDocument();
    expect(screen.getByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText('Análisis')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });
});
