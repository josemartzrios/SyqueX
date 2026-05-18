export default function CancelledBookingCard({ booking, onAcknowledge, acknowledging }) {
  if (!booking) return null;

  const formattedDate = new Date(booking.slot_date + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const [h = '00', m = '00'] = (booking.start_time ?? '00:00').split(':');
  const formattedTime = `${h}:${m} ${parseInt(h, 10) < 12 ? 'am' : 'pm'}`;

  return (
    <div className="bg-white rounded-2xl border border-[#18181b]/[0.08] p-4 mb-3">
      {/* Header: ícono + datos */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#c4935a]/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="#c4935a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest text-[#c4935a] uppercase">
            Cita cancelada
          </span>
          <span className="text-sm font-semibold font-serif text-[#18181b] mt-0.5">
            {formattedDate}
          </span>
          <span className="text-xs text-[#9ca3af] mt-0.5">
            {formattedTime} · {booking.duration_minutes} min
          </span>
        </div>
      </div>

      {/* Mensaje informativo */}
      <p className="text-xs text-[#9ca3af] mb-3">Tu psicólogo canceló esta cita.</p>

      {/* Acción: Enterado */}
      <button
        onClick={() => onAcknowledge(booking.id)}
        disabled={acknowledging}
        aria-label="Marcar como enterado de la cancelación"
        className="w-full min-h-[44px] rounded-xl py-2.5 bg-[#5a9e8a] hover:bg-[#4a8271] text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {acknowledging ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block" />
            Procesando…
          </span>
        ) : 'Enterado'}
      </button>
    </div>
  );
}
