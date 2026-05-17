import { useState } from 'react';

export default function UpcomingBookingCard({ booking, onCancel, canceling, error }) {
  const [confirming, setConfirming] = useState(false);

  if (!booking) return null;

  const formattedDate = new Date(booking.slot_date + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const [h, m] = booking.start_time.split(':');
  const formattedTime = `${h}:${m} ${parseInt(h, 10) < 12 ? 'am' : 'pm'}`;

  const handleCancelClick = () => setConfirming(true);
  const handleConfirm = () => { setConfirming(false); onCancel(booking.id); };
  const handleAbort = () => setConfirming(false);

  return (
    <div className={`bg-white rounded-2xl border border-[#18181b]/[0.08] p-4 mb-3 transition-opacity${canceling ? ' opacity-50' : ''}`}>

      {/* Header: ícono + datos */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#c4935a]/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="#c4935a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest text-[#c4935a] uppercase">
            Cita confirmada
          </span>
          <span className="text-sm font-semibold font-serif text-[#18181b] mt-0.5">
            {formattedDate}
          </span>
          <span className="text-xs text-[#9ca3af] mt-0.5">
            {formattedTime} · {booking.duration_minutes} min
          </span>
        </div>
      </div>

      {/* Acción */}
      {!confirming ? (
        <>
          <button
            onClick={handleCancelClick}
            disabled={canceling}
            aria-label={`Cancelar cita del ${formattedDate}`}
            className="w-full min-h-[44px] rounded-xl py-2.5 border border-red-200 text-red-400 hover:bg-red-50 transition-colors text-sm disabled:cursor-not-allowed"
          >
            {canceling ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full inline-block" />
                Cancelando…
              </span>
            ) : 'Cancelar cita'}
          </button>
          {error && (
            <p aria-live="polite" className="text-xs text-red-500 mt-2 text-center">
              ⚠ {error}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#18181b] text-center">¿Confirmar cancelación?</p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 rounded-xl py-2 border border-red-200 text-red-400 text-sm hover:bg-red-50 transition-colors"
            >
              Sí, cancelar
            </button>
            <button
              onClick={handleAbort}
              autoFocus
              className="flex-1 rounded-xl py-2 border border-[#18181b]/10 text-[#9ca3af] text-sm hover:bg-[#18181b]/[0.03] transition-colors"
            >
              No, regresar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
