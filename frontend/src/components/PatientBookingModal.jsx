import React, { useState, useEffect, useMemo } from 'react';
import { getPatientAvailability, bookPatientSlot } from '../patientApi';

export default function PatientBookingModal({ open, onClose, onBookingSuccess }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookingSlot, setBookingSlot] = useState(null);
  const [error, setError] = useState(null);

  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (open) {
      loadSlots();
      setSelectedDate(null);
      setError(null);
    }
  }, [open, currentMonthStr]);

  const loadSlots = async () => {
    setLoading(true);
    try {
      const data = await getPatientAvailability(currentMonthStr);
      setSlots(data.slots || []);
    } catch (e) {
      console.error(e);
      setError('Error al cargar la disponibilidad.');
    } finally {
      setLoading(false);
    }
  };

  const slotsByDate = useMemo(() => {
    const map = {};
    slots.forEach(s => {
      if (!map[s.slot_date]) map[s.slot_date] = [];
      map[s.slot_date].push(s);
    });
    return map;
  }, [slots]);

  if (!open) return null;

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleBookSlot = async (slotId) => {
    setBookingSlot(slotId);
    setError(null);
    try {
      await bookPatientSlot(slotId);
      if (onBookingSuccess) onBookingSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al reservar el horario.');
    } finally {
      setBookingSlot(null);
    }
  };

  const renderCalendar = () => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="aspect-square" />);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const iterDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      iterDate.setHours(0, 0, 0, 0);
      const isPast = iterDate < today;

      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const daySlots = slotsByDate[dateStr] || [];
      const isSelected = selectedDate === dateStr;
      const hasAvailable = !isPast && daySlots.length > 0;

      days.push(
        <button
          key={i}
          disabled={isPast || !hasAvailable}
          onClick={() => setSelectedDate(dateStr)}
          className={[
            'aspect-square rounded-lg transition-colors flex flex-col items-center justify-center gap-0.5',
            isPast ? 'opacity-25 cursor-not-allowed' : '',
            !isPast && !hasAvailable ? 'text-[#9ca3af] cursor-not-allowed' : '',
            hasAvailable && !isSelected ? 'border border-[#5a9e8a]/25 bg-white hover:bg-[#5a9e8a]/10 text-[#18181b] cursor-pointer' : '',
            isSelected ? 'bg-[#5a9e8a] text-white shadow-sm' : '',
          ].join(' ')}
        >
          <span className="text-sm font-semibold leading-none">{i}</span>
          {hasAvailable && (
            <>
              {/* Mobile: dot indicator */}
              <span className={`sm:hidden w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-[#5a9e8a]'}`} />
              {/* Desktop: slot count */}
              <span className={`hidden sm:block text-[9px] leading-none ${isSelected ? 'text-white/75' : 'text-[#5a9e8a]'}`}>
                {daySlots.length}h
              </span>
            </>
          )}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#18181b]/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer — full width mobile, 440px desktop */}
      <div className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl flex flex-col">

        {/* Drawer header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#18181b]/[0.05] flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-serif text-[#18181b]">Agendar Sesión</h2>
            <p className="text-xs sm:text-sm text-[#9ca3af] mt-0.5">Elige una fecha disponible</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-[#18181b]/[0.05] flex items-center justify-center text-[#9ca3af] transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 space-y-4 sm:space-y-6 bg-[#fefaf6]">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-100 text-sm">
              {error}
            </div>
          )}

          {/* Calendar card */}
          <div className="bg-white p-3 sm:p-5 rounded-2xl border border-[#18181b]/[0.05] shadow-sm">

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm sm:text-base font-semibold text-[#18181b] capitalize">
                {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={handlePrevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#18181b]/[0.05] text-[#9ca3af] hover:text-[#18181b] transition-colors"
                  aria-label="Mes anterior"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleNextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#18181b]/[0.05] text-[#9ca3af] hover:text-[#18181b] transition-colors"
                  aria-label="Mes siguiente"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 mb-1.5">
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-semibold text-[#9ca3af] text-center uppercase py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            {loading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-[#5a9e8a] border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {renderCalendar()}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#18181b]/[0.04]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-[#5a9e8a]/40 bg-white inline-block" />
                <span className="text-[10px] text-[#9ca3af]">Disponible</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#5a9e8a] inline-block" />
                <span className="text-[10px] text-[#9ca3af]">Seleccionado</span>
              </div>
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="bg-white p-3 sm:p-5 rounded-2xl border border-[#18181b]/[0.05] shadow-sm">
              <h3 className="text-sm font-semibold text-[#18181b] mb-3">
                Horarios — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(slotsByDate[selectedDate] || []).map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleBookSlot(s.id)}
                    disabled={bookingSlot !== null}
                    className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border border-[#5a9e8a]/25 bg-[#5a9e8a]/[0.04] hover:bg-[#5a9e8a] hover:text-white hover:border-[#5a9e8a] active:scale-95 transition-all text-[#18181b] disabled:opacity-50"
                  >
                    <span className="text-base font-semibold leading-none">{s.start_time.substring(0, 5)}</span>
                    <span className="text-[10px] text-[#9ca3af] leading-none mt-1 group-hover:text-white/70">
                      {bookingSlot === s.id ? 'Reservando…' : `${s.duration_minutes ?? 60} min`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
