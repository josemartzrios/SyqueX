import React, { useState, useEffect, useMemo } from 'react';
import { getPatientAvailability, bookPatientSlot } from '../patientApi';

export default function PatientBookingModal({ open, onClose, onBookingSuccess }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookingSlot, setBookingSlot] = useState(null); // The slot being booked
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
      setSlots(data);
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
      // Show success briefly or just close and notify
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
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
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
          className={`
            min-h-[60px] p-2 rounded-lg transition-colors flex flex-col items-center justify-center
            ${isPast ? 'opacity-30 cursor-not-allowed' : ''}
            ${!isPast && !hasAvailable ? 'text-ink-tertiary cursor-not-allowed' : ''}
            ${hasAvailable && !isSelected ? 'hover:bg-sage/10 text-ink-secondary cursor-pointer border border-sage/20 bg-white' : ''}
            ${isSelected ? 'bg-sage text-white shadow-md' : ''}
          `}
        >
          <span className="font-semibold">{i}</span>
          {hasAvailable && (
            <span className={`text-[10px] mt-1 ${isSelected ? 'text-white/80' : 'text-sage-dark'}`}>
              {daySlots.length} horarios
            </span>
          )}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative w-full md:w-[480px] bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-6 py-5 border-b border-ink/[0.05] flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-serif text-ink">Agendar Sesión</h2>
            <p className="text-sm text-ink-tertiary">Elige una fecha disponible</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-ink/[0.05] flex items-center justify-center text-ink-secondary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#fefaf6]">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm">
              {error}
            </div>
          )}

          {/* Calendar */}
          <div className="bg-white p-5 rounded-2xl border border-ink/[0.05] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink capitalize">
                {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex gap-1">
                <button onClick={handlePrevMonth} className="p-1.5 rounded-md hover:bg-ink/[0.05]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={handleNextMonth} className="p-1.5 rounded-md hover:bg-ink/[0.05]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(d => (
                <div key={d} className="text-[11px] font-semibold text-ink-tertiary text-center uppercase">{d}</div>
              ))}
            </div>
            
            {loading ? (
              <div className="py-12 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-sage border-t-transparent rounded-full"></div></div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {renderCalendar()}
              </div>
            )}
          </div>

          {/* Time Slots */}
          {selectedDate && (
            <div className="bg-white p-5 rounded-2xl border border-ink/[0.05] shadow-sm animate-fade-in">
              <h3 className="font-semibold text-ink mb-4">
                Horarios el {selectedDate.split('-').reverse().join('/')}
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                {(slotsByDate[selectedDate] || []).map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleBookSlot(s.id)}
                    disabled={bookingSlot !== null}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-sage/30 bg-sage/5 hover:bg-sage hover:text-white hover:border-sage transition-colors text-sage-dark group"
                  >
                    <span className="font-semibold text-lg">{s.start_time.substring(0, 5)}</span>
                    {bookingSlot === s.id ? (
                      <span className="text-xs opacity-80 mt-0.5">Reservando...</span>
                    ) : (
                      <span className="text-xs opacity-80 mt-0.5">Confirmar cita</span>
                    )}
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
