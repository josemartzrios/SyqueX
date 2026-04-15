// frontend/src/components/MobileHistoryChips.jsx
function formatChipDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function MobileHistoryChips({ sessions }) {
  // Solo sesiones confirmadas con nota
  const confirmed = sessions.filter(s => s.status === 'confirmed' && s.structured_note);

  if (confirmed.length === 0) return null;

  return (
    <div className="flex gap-2 px-5 py-3 overflow-x-auto border-b border-ink/[0.06] bg-white scrollbar-hide flex-shrink-0"
         style={{ WebkitOverflowScrolling: 'touch' }}>
      {confirmed.map(session => (
        <div
          key={session.id}
          className="flex flex-col flex-shrink-0 min-w-[120px] px-3 py-2 bg-parchment border border-ink/[0.06] rounded-[10px] cursor-pointer active:bg-parchment-dark transition-colors"
        >
          <span className="text-[11px] font-semibold text-ink-secondary">
            {formatChipDate(session.session_date || session.created_at)}
          </span>
          <span className="text-[11px] text-ink-muted mt-0.5 truncate max-w-[130px]">
            {session.raw_dictation
              ? session.raw_dictation.slice(0, 40) + (session.raw_dictation.length > 40 ? '…' : '')
              : 'Nota confirmada'}
          </span>
        </div>
      ))}
    </div>
  );
}
