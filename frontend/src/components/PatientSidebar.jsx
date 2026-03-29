import { useState } from 'react';

/**
 * PatientSidebar
 *
 * Desktop sidebar showing:
 * 1. Brand header "SyqueX v2"
 * 2. Patient list (conversations)
 * 3. "+ Nuevo paciente" button (pinned to bottom)
 *
 * Design tokens:
 * - Sidebar bg: #f4f4f2
 * - Active item: white bg
 * - Sage (accent): #5a9e8a
 * - Ink (text): #18181b
 */

function PatientConversationItem({ conv, active, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group px-3 py-2.5 mx-2 mb-0.5 rounded-lg cursor-pointer transition-colors relative
        ${active ? 'bg-white' : 'hover:bg-white/60'}`}
    >
      <div className="pr-6">
        <p
          className={`text-[14px] font-medium truncate leading-snug ${
            active ? 'text-[#18181b]' : 'text-gray-600'
          }`}
        >
          {conv.patient_name}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Sesión #{conv.session_number} · {formatDate(conv.session_date)}
        </p>
        {conv.dictation_preview && (
          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
            {conv.dictation_preview}
          </p>
        )}
      </div>
      <button
        onClick={handleDelete}
        title={confirmDelete ? 'Confirmar' : 'Archivar'}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100
          ${
            confirmDelete
              ? 'bg-red-50 text-red-400 !opacity-100'
              : 'text-gray-400 hover:text-red-400 hover:bg-red-50'
          }`}
      >
        {confirmDelete ? (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

export default function PatientSidebar({
  conversations,
  selectedPatientId,
  onSelectConversation,
  onDeleteConversation,
  onNewPatient,
  isCreatingPatient,
  newPatientName,
  onNewPatientNameChange,
  onSavePatient,
  onCancelNewPatient,
}) {
  return (
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-black/[0.07] bg-[#f4f4f2]">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-black/[0.07] flex items-center justify-between flex-shrink-0">
        <span className="font-semibold text-[#18181b] text-[15px] tracking-tight">
          SyqueX
        </span>
        <span className="text-[10px] text-gray-400 font-mono">v2.0</span>
      </div>

      {/* Section Label: Pacientes */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-bold px-2">
          Pacientes
        </span>
      </div>

      {/* Patient List — Scrollable */}
      <div className="flex-1 overflow-y-auto pb-2">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-500 text-[13px]">Sin pacientes aún.</p>
            <p className="text-gray-400 text-xs mt-1">Crea uno para comenzar.</p>
          </div>
        ) : (
          conversations.map(conv => (
            <PatientConversationItem
              key={conv.patient_id}
              conv={conv}
              active={conv.patient_id === selectedPatientId}
              onClick={() => onSelectConversation(conv)}
              onDelete={() => onDeleteConversation(conv.id, conv.patient_id)}
            />
          ))
        )}
      </div>

      {/* "+ Nuevo paciente" Button / Input — Pinned to Bottom */}
      <div className="px-3 py-3 border-t border-black/[0.07] flex-shrink-0">
        {isCreatingPatient ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Nombre del paciente..."
              className="w-full bg-white border border-black/[0.1] rounded-lg px-3 py-2 text-sm text-[#18181b] placeholder-gray-400 focus:outline-none focus:border-[#5a9e8a]/60 transition-all"
              value={newPatientName}
              onChange={onNewPatientNameChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSavePatient();
                if (e.key === 'Escape') onCancelNewPatient();
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={onSavePatient}
                className="flex-1 bg-[#5a9e8a] hover:bg-[#4d8a78] text-white text-[13px] font-medium rounded-lg py-1.5 transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={onCancelNewPatient}
                className="px-3 text-gray-500 hover:text-gray-700 text-[13px] rounded-lg py-1.5 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onNewPatient}
            className="w-full flex items-center justify-center gap-1.5 bg-[#5a9e8a] hover:bg-[#4d8a78] text-white rounded-lg px-3 py-2 transition-all text-[13px] font-medium"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nuevo paciente
          </button>
        )}
      </div>
    </aside>
  );
}
