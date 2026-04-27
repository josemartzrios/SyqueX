import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DictationPanel from './DictationPanel';

describe('DictationPanel', () => {
  const mockOrphans = [
    { id: '1', raw_dictation: 'Dictado huérfano 1', session_date: '2026-04-20T10:00:00Z' },
    { id: '2', raw_dictation: 'Dictado huérfano 2', session_date: '2026-04-19T10:00:00Z' },
  ];

  it('renders orphaned sessions banner when present', () => {
    render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false} 
        orphanedSessions={mockOrphans} 
      />
    );

    expect(screen.getByText('Sesiones sin confirmar')).toBeInTheDocument();
    expect(screen.getByText(/"Dictado huérfano 1"/)).toBeInTheDocument();
    expect(screen.getByText(/"Dictado huérfano 2"/)).toBeInTheDocument();
  });

  it('calls onResumeOrphan when Continuar is clicked', () => {
    const onResume = vi.fn();
    render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false} 
        orphanedSessions={mockOrphans} 
        onResumeOrphan={onResume} 
      />
    );

    const resumeButtons = screen.getAllByText('Continuar');
    fireEvent.click(resumeButtons[0]);

    expect(onResume).toHaveBeenCalledWith(mockOrphans[0]);
  });

  it('calls onDiscardOrphan when discard button is clicked', () => {
    const onDiscard = vi.fn();
    render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false} 
        orphanedSessions={mockOrphans} 
        onDiscardOrphan={onDiscard} 
      />
    );

    const discardButtons = screen.getAllByTitle('Descartar');
    fireEvent.click(discardButtons[1]);

    expect(onDiscard).toHaveBeenCalledWith('2');
  });

  it('does not render banner when loading is true', () => {
    render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={true} 
        orphanedSessions={mockOrphans} 
      />
    );

    expect(screen.queryByText('Sesiones sin confirmar')).not.toBeInTheDocument();
  });

  it('calls onFormatChange when format toggles are clicked', () => {
    const onFormatChange = vi.fn();
    render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false}
        noteFormat="soap"
        onFormatChange={onFormatChange}
      />
    );

    fireEvent.click(screen.getByText('Personalizada'));
    expect(onFormatChange).toHaveBeenCalledWith('custom');
  });

  it('renders "Editar plantilla" only when noteFormat is custom', () => {
    const onEditTemplate = vi.fn();
    const { rerender } = render(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false}
        noteFormat="soap"
        onEditTemplate={onEditTemplate}
      />
    );

    expect(screen.queryByText('Editar plantilla')).not.toBeInTheDocument();

    rerender(
      <DictationPanel 
        value="" 
        onChange={() => {}} 
        onGenerate={() => {}} 
        loading={false}
        noteFormat="custom"
        onEditTemplate={onEditTemplate}
      />
    );

    const editBtn = screen.getByText('Editar plantilla');
    expect(editBtn).toBeInTheDocument();
    
    fireEvent.click(editBtn);
    expect(onEditTemplate).toHaveBeenCalledTimes(1);
  });
});
