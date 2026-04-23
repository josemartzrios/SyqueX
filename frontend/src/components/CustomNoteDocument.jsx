import { useState } from 'react';

function ScaleField({ value, max = 10 }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
            n === value
              ? 'bg-[#5a9e8a] text-white'
              : 'bg-[#f4f4f2] text-[#9ca3af]'
          }`}
        >
          {n}
        </div>
      ))}
    </div>
  );
}

function CheckboxField({ options, selected = [] }) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={selectedSet.has(opt)}
            readOnly
            className="accent-[#5a9e8a] w-4 h-4"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

export default function CustomNoteDocument({ templateFields = [], values = {}, onConfirm, onDelete, readOnly = false }) {
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sorted = [...templateFields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm?.();
      setConfirmed(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6 font-sans">

      <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink/[0.06]">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#5a9e8a] font-bold">
          Nota Clínica · Personalizada
        </span>
      </div>

      <div className="space-y-5 mb-4">
        {sorted.map((field) => {
          const value = values[field.id];
          return (
            <div key={field.id}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#9ca3af] mb-2">
                {field.label}
              </p>
              {field.type === 'text' && (
                <p className="font-serif text-[14px] leading-relaxed text-ink-secondary whitespace-pre-wrap">
                  {value || <span className="italic text-ink-tertiary">Sin información</span>}
                </p>
              )}
              {field.type === 'scale' && (
                <ScaleField value={value} />
              )}
              {field.type === 'checkbox' && (
                <CheckboxField options={field.options || []} selected={value || []} />
              )}
              {field.type === 'list' && (
                <span className="inline-block bg-[#f4f4f2] text-[#18181b] text-[13px] px-3 py-1 rounded-full">
                  {value || '—'}
                </span>
              )}
              {field.type === 'date' && (
                <span className="text-[13px] text-ink-secondary">{value || '—'}</span>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 border-t border-ink/[0.06] pt-4 mt-4">
          {!confirmed && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2 mr-auto">
                  <span className="text-[12px] text-red-600">¿Eliminar nota?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[12px] text-red-600 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-[12px] text-ink-muted px-2 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="mr-auto text-[13px] font-medium text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors"
                >
                  Borrar nota
                </button>
              )}

              <span className="bg-parchment-dark text-ink-tertiary text-[11px] font-semibold tracking-[0.06em] rounded-full px-3 py-1">
                BORRADOR
              </span>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className={`bg-[#5a9e8a] text-white text-[13px] font-medium rounded-xl px-4 py-2 transition-colors ${
                  saving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4a8a78]'
                }`}
              >
                {saving ? 'Registrando...' : '✓ Confirmar en Expediente'}
              </button>
            </>
          )}
          {confirmed && (
            <span className="text-emerald-600 text-[13px] font-medium flex items-center gap-1 px-4 py-2 ml-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Guardado
            </span>
          )}
        </div>
      )}
    </div>
  );
}
