import { useState, useRef } from 'react';

function ScaleField({ value, max = 10, onChange, readOnly = false }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => !readOnly && onChange?.(n)}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
            n === value
              ? 'bg-[#5a9e8a] text-white'
              : 'bg-[#f4f4f2] text-[#9ca3af]'
          } ${!readOnly ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function CheckboxField({ options, selected = [], onChange, readOnly = false }) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label key={opt} className={`flex items-center gap-2 text-[13px] text-ink ${!readOnly ? 'cursor-pointer' : ''}`}>
          <input
            type="checkbox"
            checked={selectedSet.has(opt)}
            onChange={() => {
              if (readOnly) return;
              const next = selectedSet.has(opt)
                ? selected.filter(o => o !== opt)
                : [...selected, opt];
              onChange?.(next);
            }}
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
  const [editedValues, setEditedValues] = useState({ ...values });
  const [activeField, setActiveField] = useState(null);
  // Ref to active textarea so handleConfirm captures its value even if blur fires
  // concurrently with the click (React 18 batching may not flush blur before confirm reads state).
  const activeTextareaRef = useRef(null);

  const sorted = [...templateFields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleConfirm = async () => {
    // Capture any in-progress textarea value that hasn't been flushed via onBlur yet.
    let finalValues = { ...editedValues };
    if (activeField && activeTextareaRef.current) {
      finalValues = { ...finalValues, [activeField]: activeTextareaRef.current.value };
    }
    setSaving(true);
    try {
      await onConfirm?.(finalValues);
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
        {!readOnly && !confirmed && (
          <span className="border border-dashed border-ink/20 text-ink/35 text-[10px] tracking-[0.1em] font-medium rounded px-2 py-0.5">
            BORRADOR
          </span>
        )}
      </div>

      <div className="space-y-5 mb-4">
        {sorted.map((field) => {
          const value = editedValues[field.id];
          return (
            <div key={field.id}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#9ca3af] mb-2">
                {field.label}
              </p>
              {field.type === 'text' && (
                activeField === field.id ? (
                  <textarea
                    autoFocus
                    defaultValue={value ?? ''}
                    className="font-serif text-[14px] leading-relaxed w-full resize-none rounded-md p-2 outline-none"
                    style={{ border: '1.5px solid #5a9e8a', background: '#fffef9', color: '#18181b', overflow: 'hidden' }}
                    ref={(el) => {
                      activeTextareaRef.current = el;
                      if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
                    }}
                    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                    onBlur={(e) => {
                      setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))
                      setActiveField(null)
                      activeTextareaRef.current = null;
                    }}
                  />
                ) : (
                  <p
                    className="font-serif text-[14px] leading-relaxed rounded-md p-2 whitespace-pre-wrap"
                    style={{
                      cursor: readOnly ? 'default' : 'text',
                      border: readOnly ? 'none' : '1.5px dashed #d1d5db',
                    }}
                    onClick={() => !readOnly && setActiveField(field.id)}
                  >
                    {value || <span className="italic text-ink-tertiary">Sin información</span>}
                  </p>
                )
              )}
              {field.type === 'scale' && (
                <ScaleField
                  value={value}
                  readOnly={readOnly}
                  onChange={(n) => setEditedValues(prev => ({ ...prev, [field.id]: n }))}
                />
              )}
              {(field.type === 'checkbox' || field.type === 'options') && (
                <CheckboxField
                  options={field.options || []}
                  selected={value || []}
                  readOnly={readOnly}
                  onChange={(next) => setEditedValues(prev => ({ ...prev, [field.id]: next }))}
                />
              )}
              {field.type === 'list' && (
                readOnly ? (
                  <span className="inline-block bg-[#f4f4f2] text-[#18181b] text-[13px] px-3 py-1 rounded-full">
                    {value || '—'}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="text-[13px] text-[#18181b] border border-dashed border-gray-300 rounded-md px-3 py-1.5 outline-none focus:border-[#5a9e8a] focus:border-solid w-full"
                  />
                )
              )}
              {field.type === 'date' && (
                readOnly ? (
                  <span className="text-[13px] text-[#6b7280]">{value || '—'}</span>
                ) : (
                  <input
                    type="date"
                    value={value || ''}
                    onChange={(e) => setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="text-[13px] text-[#18181b] border border-dashed border-gray-300 rounded-md px-3 py-1.5 outline-none focus:border-[#5a9e8a]"
                  />
                )
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t border-ink/[0.06] pt-4 mt-4">
          {!confirmed && (
            <>
              {showDeleteConfirm ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-[12px] text-red-600 font-medium">¿Eliminar nota permanentemente?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 sm:flex-none text-[13px] font-medium text-ink-secondary border border-ink/15 rounded-xl px-4 py-2 hover:bg-parchment-dark transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 sm:flex-none text-[13px] font-medium text-white bg-[#DC2626] rounded-xl px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full sm:w-auto text-[13px] font-medium text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors"
                >
                  Borrar nota
                </button>
              )}

              <button
                onClick={handleConfirm}
                disabled={saving || showDeleteConfirm}
                className={`w-full sm:w-auto sm:ml-auto bg-[#5a9e8a] text-white text-[13px] font-medium rounded-xl px-4 py-2.5 transition-colors ${
                  saving || showDeleteConfirm ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#4a8a78]'
                }`}
              >
                {saving ? 'Registrando...' : '✓ Confirmar en Expediente'}
              </button>
            </>
          )}
          {confirmed && (
            <span className="text-emerald-600 text-[13px] font-medium flex items-center justify-center gap-1 py-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Guardado en expediente
            </span>
          )}
        </div>
      )}
    </div>
  );
}
