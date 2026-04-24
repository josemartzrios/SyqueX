import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NoteConfigurator from './NoteConfigurator';

describe('NoteConfigurator', () => {
  // ── Render básico ──────────────────────────────────────────────────────────

  it('renders title and empty state', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Configura tu nota')).toBeInTheDocument();
    expect(screen.getByText('Agrega secciones abajo para comenzar')).toBeInTheDocument();
  });

  it('does NOT render Diseñar / Vista previa tabs', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Diseñar')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows ✕ Cerrar button in topbar when isFirstTime=false', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={false} />);
    expect(screen.getByText('✕ Cerrar')).toBeInTheDocument();
  });

  it('does NOT show ✕ Cerrar button when isFirstTime=true', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={true} />);
    expect(screen.queryByText('✕ Cerrar')).not.toBeInTheDocument();
    expect(screen.queryByText('Saltar')).not.toBeInTheDocument();
  });

  it('shows "Guardar y entrar →" when isFirstTime=true', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={true} />);
    const saveBtn = screen.getByText('Guardar y entrar →');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });

  it('shows "Guardar cambios" when isFirstTime=false', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} isFirstTime={false} />);
    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
  });

  // ── Añadir secciones ───────────────────────────────────────────────────────

  it('adds a section when a suggested chip is clicked', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.getByText('Motivo de consulta', { selector: 'p' })).toBeInTheDocument();
  });

  it('adds a custom section when typed and submitted via button', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Nombre personalizado…'), {
      target: { value: 'Mi Sección Custom' },
    });
    fireEvent.click(screen.getByText('+ Agregar'));
    expect(screen.getByText('Mi Sección Custom', { selector: 'p' })).toBeInTheDocument();
  });

  it('adds a custom section when Enter is pressed in input', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('Nombre personalizado…');
    fireEvent.change(input, { target: { value: 'Sección Enter' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByText('Sección Enter', { selector: 'p' })).toBeInTheDocument();
  });

  it('chip becomes unavailable after its section is added', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.queryByText('+ Motivo de consulta')).not.toBeInTheDocument();
  });

  // ── Acordeón ───────────────────────────────────────────────────────────────

  it('adding a section opens its accordion automatically', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    // TemplateFieldEditor shows field type buttons — "Texto libre" is one of them
    expect(screen.getByText('Texto libre')).toBeInTheDocument();
  });

  it('clicking the active row closes the accordion', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    expect(screen.getByText('Texto libre')).toBeInTheDocument();
    // Click on the label text inside the row (bubbles to row onClick)
    fireEvent.click(screen.getByText('Motivo de consulta', { selector: 'p' }));
    expect(screen.queryByText('Texto libre')).not.toBeInTheDocument();
  });

  it('opening a second section closes the first', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    // Estado de ánimo chip adds and opens accordion for Estado
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // TemplateFieldEditor label shows the active field name
    expect(screen.getByText('Tipo de campo — Estado de ánimo')).toBeInTheDocument();
    // Now click on Motivo row to switch
    fireEvent.click(screen.getByText('Motivo de consulta', { selector: 'p' }));
    expect(screen.getByText('Tipo de campo — Motivo de consulta')).toBeInTheDocument();
    expect(screen.queryByText('Tipo de campo — Estado de ánimo')).not.toBeInTheDocument();
  });

  // ── Reorden ↑↓ ────────────────────────────────────────────────────────────

  it('↑ button moves a field upward', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // Fields are [Motivo(0), Estado(1)]. Click ↑ on Estado (index 1).
    const upButtons = screen.getAllByRole('button', { name: 'Mover arriba' });
    fireEvent.click(upButtons[1]); // Estado's ↑ button
    const labels = screen.getAllByText(/Motivo de consulta|Estado de ánimo/, { selector: 'p' });
    expect(labels[0].textContent).toBe('Estado de ánimo');
    expect(labels[1].textContent).toBe('Motivo de consulta');
  });

  it('↓ button moves a field downward', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('+ Estado de ánimo'));
    // Fields are [Motivo(0), Estado(1)]. Click ↓ on Motivo (index 0).
    const downButtons = screen.getAllByRole('button', { name: 'Mover abajo' });
    fireEvent.click(downButtons[0]); // Motivo's ↓ button
    const labels = screen.getAllByText(/Motivo de consulta|Estado de ánimo/, { selector: 'p' });
    expect(labels[0].textContent).toBe('Estado de ánimo');
    expect(labels[1].textContent).toBe('Motivo de consulta');
  });

  // ── Preview inline ─────────────────────────────────────────────────────────

  it('preview section is expanded by default (shows ∧ chevron)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('∧')).toBeInTheDocument();
  });

  it('clicking the preview header collapses the preview (∧ → ∨)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('∧'));
    expect(screen.getByText('∨')).toBeInTheDocument();
    expect(screen.queryByText('∧')).not.toBeInTheDocument();
  });

  it('clicking the preview header again expands the preview (∨ → ∧)', () => {
    render(<NoteConfigurator onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('∧'));
    fireEvent.click(screen.getByText('∨'));
    expect(screen.getByText('∧')).toBeInTheDocument();
  });

  // ── Cancelar / Guardar ─────────────────────────────────────────────────────

  it('calls onCancel when ← Volver is clicked', () => {
    const handleCancel = vi.fn();
    render(<NoteConfigurator onSave={vi.fn()} onCancel={handleCancel} />);
    fireEvent.click(screen.getByText('← Volver'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with correct fields when save button is clicked', async () => {
    const handleSave = vi.fn();
    render(<NoteConfigurator onSave={handleSave} onCancel={vi.fn()} isFirstTime={true} />);
    fireEvent.click(screen.getByText('+ Motivo de consulta'));
    fireEvent.click(screen.getByText('Guardar y entrar →'));
    expect(handleSave).toHaveBeenCalledTimes(1);
    const fields = handleSave.mock.calls[0][0];
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Motivo de consulta');
  });
});
