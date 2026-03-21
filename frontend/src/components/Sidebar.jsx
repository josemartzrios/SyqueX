import { useState } from 'react';

export default function Sidebar({ open, onClose, conversations, onSelectConversation, onDeleteConversation }) {
  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-30"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`fixed left-0 top-0 h-full w-[85vw] max-w-sm bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-5 bg-cyan-500 rounded-full"></div>
            <h2 className="font-semibold text-slate-800 text-[15px] tracking-tight">Bandeja de conversaciones</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Count */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex-shrink-0">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">
            {conversations.length} {conversations.length === 1 ? 'conversación' : 'conversaciones'}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">No hay conversaciones aún</p>
            </div>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                onClick={() => { onSelectConversation(conv); onClose(); }}
                onDelete={() => onDeleteConversation(conv.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ConversationItem({ conv, onClick, onDelete }) {
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
      className="group px-4 py-3.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors relative"
      onClick={onClick}
    >
      {/* Patient name + date */}
      <div className="flex items-center justify-between mb-1 pr-8">
        <span className="text-cyan-500 text-[11px] font-bold uppercase tracking-wider truncate">
          {conv.patient_name}
        </span>
        <span className="text-slate-400 text-[11px] flex-shrink-0 ml-2">{formatDate(conv.session_date)}</span>
      </div>

      {/* Dictation preview */}
      <p className="text-slate-600 text-[13px] leading-snug line-clamp-2 pr-2">
        {conv.dictation_preview || <span className="italic text-slate-400">Sesión sin contenido</span>}
      </p>

      {/* Session badge + status + context indicator */}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-[10px] text-slate-400">Sesión #{conv.session_number}</span>
        {conv.status === 'confirmed' && (
          <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
            <span className="w-1 h-1 bg-emerald-400 rounded-full inline-block"></span>Confirmada
          </span>
        )}
        {conv.status === 'draft' && (
          <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
            <span className="w-1 h-1 bg-amber-400 rounded-full inline-block"></span>Borrador
          </span>
        )}
        {conv.message_count > 0 && (
          <span className="text-[10px] text-cyan-500 font-medium flex items-center gap-1" title="Turnos de conversación almacenados">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {conv.message_count} {conv.message_count === 1 ? 'turno' : 'turnos'}
          </span>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        title={confirmDelete ? 'Confirmar eliminación' : 'Eliminar conversación'}
        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100
          ${confirmDelete
            ? 'bg-red-50 text-red-500 !opacity-100'
            : 'text-slate-300 hover:bg-red-50 hover:text-red-400'
          }`}
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
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}
