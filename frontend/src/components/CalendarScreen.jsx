import React, { useState, useEffect, useMemo } from 'react';
import { getCalendarSlots, createCalendarSlot, deleteCalendarSlot } from '../api';

export default function CalendarScreen({ onClose, mode = 'modal' }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [newTime, setNewTime] = useState('10:00');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isPastSelected = selectedDate && selectedDate < todayStr;

  useEffect(() => {
    loadSlots();
    setError(null);
  }, [currentMonthStr]);

  useEffect(() => {
    setError(null);
  }, [selectedDate, newTime]);

  const loadSlots = async () => {
    setLoading(true);
    try {
      const data = await getCalendarSlots(currentMonthStr);
      setSlots(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const slotsByDate = useMemo(() => {
    const map = {};
    slots.forEach(s => {
      if (!map[s.slot_date]) map[s.slot_date] = [];
      map[s.slot_date].push(s);
    });
    return map;
  }, [slots]);

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    if (!selectedDate) return;

    const existingTimes = (slotsByDate[selectedDate] || []).map(s => s.start_time.substring(0, 5));
    if (existingTimes.includes(newTime)) {
      setError(`Ya existe un horario a las ${newTime} para este día.`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createCalendarSlot({ slot_date: selectedDate, start_time: newTime, duration_minutes: 60 });
      await loadSlots();
    } catch (err) {
      setError(err.message || 'Error al crear horario');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSlot = async (id) => {
    try {
      await deleteCalendarSlot(id);
      await loadSlots();
    } catch (err) {
      setError(err.message || 'Error al eliminar el horario');
    }
  };

  const formatSelectedDate = () => {
    if (!selectedDate) return '';
    const [y, m, d] = selectedDate.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const renderCalendar = () => {
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="border border-transparent" />);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const daySlots = slotsByDate[dateStr] || [];
      const isSelected = selectedDate === dateStr;
      const isDatePast = dateStr < todayStr;
      const bookedCount = daySlots.filter(s => s.status === 'booked').length;
      const availableCount = daySlots.filter(s => s.status === 'available').length;

      days.push(
        <div
          key={i}
          onClick={() => setSelectedDate(dateStr)}
          className={`min-h-[44px] md:min-h-[80px] p-1 md:p-2 border border-ink/[0.05] bg-white rounded-lg cursor-pointer transition-colors ${isSelected ? 'ring-2 ring-[#5a9e8a] bg-[#5a9e8a]/5' : 'hover:bg-black/[0.02]'} ${isDatePast ? 'opacity-50 bg-gray-50' : ''}`}
        >
          <div className={`font-medium text-[11px] md:text-sm mb-0.5 md:mb-1 ${isSelected ? 'text-[#5a9e8a]' : 'text-ink-secondary'}`}>{i}</div>

          {/* Mobile: colored dots (compact) */}
          {daySlots.length > 0 && (
            <div className="flex flex-wrap gap-[2px] md:hidden">
              {availableCount > 0 && (
                <div className="flex gap-[2px]">
                  {Array.from({ length: Math.min(availableCount, 3) }).map((_, idx) => (
                    <div key={idx} className="w-[5px] h-[5px] rounded-full bg-[#5a9e8a]" />
                  ))}
                </div>
              )}
              {bookedCount > 0 && (
                <div className="flex gap-[2px]">
                  {Array.from({ length: Math.min(bookedCount, 2) }).map((_, idx) => (
                    <div key={idx} className="w-[5px] h-[5px] rounded-full bg-orange-400" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Desktop: text badges */}
          <div className="hidden md:block space-y-1">
            {daySlots.slice(0, 3).map(s => (
              <div key={s.id} className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === 'booked' ? 'bg-orange-100 text-orange-800' : 'bg-[#5a9e8a]/20 text-[#3d7a68]'} truncate`}>
                {s.start_time.substring(0, 5)}{s.status === 'booked' ? ` · ${s.patient_name}` : ''}
              </div>
            ))}
            {daySlots.length > 3 && <div className="text-[10px] text-ink-tertiary">+{daySlots.length - 3} más</div>}
          </div>
        </div>
      );
    }
    return days;
  };

  const slotManagementContent = (compact = false) => (
    <>
      {!isPastSelected && (
        <form onSubmit={handleCreateSlot} className={`${compact ? 'mb-3' : 'mb-6'} bg-[#f4f4f2] ${compact ? 'p-3' : 'p-4'} rounded-xl border border-ink/[0.05]`}>
          <label className={`block ${compact ? 'text-[12px]' : 'text-[13px]'} font-medium text-ink-secondary mb-2`}>
            Nuevo horario · 60 min
          </label>
          <div className="flex gap-2">
            <input
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="flex-1 bg-white border border-ink/[0.1] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5a9e8a] focus:ring-1 focus:ring-[#5a9e8a]"
              required
            />
            <button
              disabled={creating}
              type="submit"
              className="bg-[#5a9e8a] hover:bg-[#4a8a78] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? '…' : 'Añadir'}
            </button>
          </div>
        </form>
      )}

      {isPastSelected && (
        <p className="text-[12px] text-ink-tertiary mb-3">Este día ya pasó — solo puedes ver los horarios registrados.</p>
      )}

      {error && (
        <div className={`${compact ? 'mb-3' : 'mb-4'} p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2`}>
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-700 leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted mb-2">Horarios registrados</p>
        {(slotsByDate[selectedDate] || []).length === 0 ? (
          <p className={`${compact ? 'text-[13px]' : 'text-sm'} text-ink-tertiary`}>No hay horarios en este día.</p>
        ) : (
          (slotsByDate[selectedDate] || []).map(s => (
            <SlotItem key={s.id} slot={s} onDelete={() => handleDeleteSlot(s.id)} isPast={isPastSelected} />
          ))
        )}
      </div>
    </>
  );

  return (
    <div className={
      mode === 'modal'
        ? 'fixed inset-0 z-50 bg-[#f4f4f2] flex flex-col md:flex-row overflow-hidden font-sans'
        : 'flex flex-col md:flex-row h-full overflow-hidden font-sans bg-[#f4f4f2]'
    }>

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex md:w-80 bg-white border-r border-ink/[0.07] flex-col overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b border-ink/[0.07] flex items-center justify-between">
          <h2 className="font-semibold text-lg text-ink">Mi Agenda</h2>
          {mode === 'modal' && (
            <button
              aria-label="Cerrar agenda"
              onClick={onClose}
              className="p-2 bg-ink/[0.05] hover:bg-ink/[0.1] rounded-full text-ink-secondary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="p-6 flex-1">
          {selectedDate ? (
            <div>
              <h3 className="font-medium text-ink mb-4">
                Horarios para el {selectedDate.split('-').reverse().join('/')}
              </h3>
              {slotManagementContent(false)}
            </div>
          ) : (
            <div className="text-center text-ink-tertiary text-sm mt-10">
              Selecciona un día en el calendario para gestionar tus horarios.
            </div>
          )}
        </div>
      </div>

      {/* ── Calendar area — full height on mobile, flex-1 on desktop ── */}
      <div className="flex-1 flex flex-col bg-[#fafaf9] min-h-0">

        {/* Navigation header — compact on mobile */}
        <div className="px-4 py-3 md:p-6 flex items-center justify-between border-b border-ink/[0.05] flex-shrink-0">
          <h1 className="text-[17px] md:text-2xl font-semibold text-ink capitalize">
            {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={handlePrevMonth} className="p-1.5 md:p-2 rounded-lg hover:bg-ink/[0.05] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={handleNextMonth} className="p-1.5 md:p-2 rounded-lg hover:bg-ink/[0.05] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar grid — scrollable, takes all available height */}
        <div className="flex-1 p-2 md:p-6 overflow-y-auto min-h-0">
          <div className="grid grid-cols-7 gap-1 md:gap-2 mb-1 md:mb-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
              <div key={d} className="text-[9px] md:text-xs font-semibold text-ink-tertiary text-center uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {renderCalendar()}
          </div>

          {loading && (
            <div className="flex justify-center mt-4">
              <div className="w-5 h-5 border-2 border-[#5a9e8a] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* ── Mobile bottom panel — slides in when date selected ── */}
        {selectedDate && (
          <div className="md:hidden flex-shrink-0 bg-white border-t border-ink/[0.07] overflow-y-auto" style={{ maxHeight: '48%' }}>
            <div className="px-4 py-3 border-b border-ink/[0.05] flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <p className="text-[13px] font-semibold text-ink">{formatSelectedDate()}</p>
                {(slotsByDate[selectedDate] || []).length > 0 && (
                  <p className="text-[11px] text-ink-tertiary mt-0.5">
                    {(slotsByDate[selectedDate] || []).length} horario{(slotsByDate[selectedDate] || []).length !== 1 ? 's' : ''}
                    {(slotsByDate[selectedDate] || []).some(s => s.status === 'booked') && ' · con cita'}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink hover:bg-ink/[0.05] transition-colors"
                aria-label="Cerrar panel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {slotManagementContent(true)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotItem({ slot, onDelete, isPast }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="flex items-center justify-between bg-white border border-ink/[0.07] p-3 rounded-xl shadow-sm">
      <div>
        <div className="font-medium text-ink text-sm flex items-center gap-2">
          {slot.start_time.substring(0, 5)}
          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${slot.status === 'available' ? 'bg-[#5a9e8a]/10 text-[#3d7a68]' : 'bg-orange-100 text-orange-800'}`}>
            {slot.status === 'available' ? 'Disponible' : 'Reservado'}
          </span>
        </div>
        {slot.status === 'booked' && (
          <div className="text-xs text-ink-secondary mt-1">Cita con: {slot.patient_name}</div>
        )}
      </div>
      {!isPast && slot.status === 'available' && (
        <button
          onClick={handleDeleteClick}
          className={`p-1.5 rounded-lg transition-all duration-200 ${confirmDelete ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
          title={confirmDelete ? 'Confirmar eliminación' : 'Eliminar horario'}
        >
          {confirmDelete ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
