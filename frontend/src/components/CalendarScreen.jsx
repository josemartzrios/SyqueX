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

    // Duplicate check
    const existingTimes = (slotsByDate[selectedDate] || []).map(s => s.start_time.substring(0, 5));
    if (existingTimes.includes(newTime)) {
      setError(`Ya existe un horario a las ${newTime} para este día.`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createCalendarSlot({
        slot_date: selectedDate,
        start_time: newTime,
        duration_minutes: 50
      });
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

  const renderCalendar = () => {
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="p-2 border border-transparent"></div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const daySlots = slotsByDate[dateStr] || [];
      const isSelected = selectedDate === dateStr;
      
      const isDatePast = dateStr < todayStr;

      days.push(
        <div 
          key={i} 
          onClick={() => setSelectedDate(dateStr)}
          className={`min-h-[80px] p-2 border border-ink/[0.05] bg-white rounded-lg cursor-pointer transition-colors ${isSelected ? 'ring-2 ring-sage bg-sage/5' : 'hover:bg-black/[0.02]'} ${isDatePast ? 'opacity-60 bg-gray-50' : ''}`}
        >
          <div className="font-medium text-sm text-ink-secondary mb-1">{i}</div>
          <div className="space-y-1">
            {daySlots.slice(0, 3).map(s => (
              <div key={s.id} className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === 'booked' ? 'bg-orange-100 text-orange-800' : 'bg-sage/20 text-sage-dark'} truncate`}>
                {s.start_time.substring(0, 5)} {s.status === 'booked' ? `· ${s.patient_name}` : ''}
              </div>
            ))}
            {daySlots.length > 3 && <div className="text-[10px] text-ink-tertiary">+{daySlots.length - 3} más</div>}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className={mode === 'modal' ? "fixed inset-0 z-50 bg-[#f4f4f2] flex flex-col md:flex-row overflow-hidden font-sans" : "flex flex-col md:flex-row h-full overflow-hidden font-sans bg-[#f4f4f2]"}>
      {/* Sidebar Configuration */}
      <div className="w-full md:w-80 bg-white border-r border-ink/[0.07] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-ink/[0.07] flex items-center justify-between">
          <h2 className="font-semibold text-lg text-ink">Mi Agenda</h2>
          {mode === 'modal' && (
            <button aria-label="Cerrar agenda" onClick={onClose} className="p-2 bg-ink/[0.05] hover:bg-ink/[0.1] rounded-full text-ink-secondary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        
        <div className="p-6 flex-1">
          {selectedDate ? (
            <div>
              <h3 className="font-medium text-ink mb-4">
                Horarios para el {selectedDate.split('-').reverse().join('/')}
              </h3>
              
              {!isPastSelected && (
                <form onSubmit={handleCreateSlot} className="mb-6 bg-[#f4f4f2] p-4 rounded-xl border border-ink/[0.05]">
                  <label className="block text-[13px] font-medium text-ink-secondary mb-2">Nuevo horario (50 min)</label>
                  <div className="flex gap-2">
                    <input 
                      type="time" 
                      value={newTime} 
                      onChange={e => setNewTime(e.target.value)} 
                      className="flex-1 bg-white border border-ink/[0.1] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage"
                      required
                    />
                    <button disabled={creating} type="submit" className="bg-sage hover:bg-sage-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      Añadir
                    </button>
                  </div>
                </form>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-xs text-red-700 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-ink-tertiary uppercase tracking-wider mb-3">Horarios registrados</h4>
                {(slotsByDate[selectedDate] || []).length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No hay horarios en este día.</p>
                ) : (
                  (slotsByDate[selectedDate] || []).map(s => (
                    <SlotItem 
                      key={s.id} 
                      slot={s} 
                      onDelete={() => handleDeleteSlot(s.id)} 
                      isPast={isPastSelected}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-ink-tertiary text-sm mt-10">
              Selecciona un día en el calendario para gestionar tus horarios.
            </div>
          )}
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col bg-[#fafaf9]">
        <div className="p-6 flex items-center justify-between border-b border-ink/[0.05]">
          <h1 className="text-2xl font-semibold text-ink capitalize">
            {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-ink/[0.05] transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-ink/[0.05] transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
              <div key={d} className="text-xs font-semibold text-ink-tertiary text-center uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {renderCalendar()}
          </div>
        </div>
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
    <div className="flex items-center justify-between bg-white border border-ink/[0.07] p-3 rounded-xl shadow-sm animate-in fade-in slide-in-from-right-2 duration-300">
      <div>
        <div className="font-medium text-ink text-sm flex items-center gap-2">
          {slot.start_time.substring(0, 5)}
          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${slot.status === 'available' ? 'bg-sage/10 text-sage-dark' : 'bg-orange-100 text-orange-800'}`}>
            {slot.status === 'available' ? 'Disponible' : 'Reservado'}
          </span>
        </div>
        {slot.status === 'booked' && <div className="text-xs text-ink-secondary mt-1">Cita con: {slot.patient_name}</div>}
      </div>
      {!isPast && slot.status === 'available' && (
        <button 
          onClick={handleDeleteClick}
          className={`p-1.5 rounded-lg transition-all duration-200 ${confirmDelete ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
          title={confirmDelete ? "Confirmar eliminación" : "Eliminar horario"}
        >
          {confirmDelete ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
