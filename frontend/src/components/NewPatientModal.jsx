import { useState } from 'react';
import { createPatient } from '../api';

/**
 * NewPatientModal
 *
 * Overlay modal to create a new patient.
 * MVP captures only `name` (backend only accepts name + risk_level).
 * Age, reason and background fields are shown but disabled — aspirational UI
 * for when the backend adds support.
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - onCreated: (patient: { id, name }) => void
 */

export default function NewPatientModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      const resp = await createPatient(name.trim());
      setName('');
      onCreated?.({ id: resp.id, name: name.trim() });
    } catch (err) {
      setError(err.message || 'No se pudo crear el paciente');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  const handleClose = () => {
    if (saving) return;
    setName('');
    setError(null);
    onClose();
  };

  return (
    <div
      id="new-patient-modal-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4"
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-sm w-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Nuevo expediente</span>
            <h2 className="text-[#18181b] text-lg font-semibold leading-snug">Registrar paciente</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#18181b] hover:bg-black/[0.04] transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 flex flex-col gap-4">

          {/* Name — functional */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="patient-name" className="text-[12px] font-medium text-[#18181b]">
              Nombre completo <span className="text-red-400">*</span>
            </label>
            <input
              id="patient-name"
              autoFocus
              type="text"
              placeholder="Ej. María García López"
              className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              disabled={saving}
            />
          </div>

          {/* Age — aspirational (disabled) */}
          <div className="flex flex-col gap-1.5 opacity-40">
            <label className="text-[12px] font-medium text-[#18181b]">
              Edad
              <span className="text-[10px] text-[#9ca3af] ml-1.5 font-normal">próximamente</span>
            </label>
            <input
              type="text"
              disabled
              placeholder="—"
              className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#9ca3af] cursor-not-allowed"
            />
          </div>

          {/* Reason — aspirational (disabled) */}
          <div className="flex flex-col gap-1.5 opacity-40">
            <label className="text-[12px] font-medium text-[#18181b]">
              Motivo de consulta
              <span className="text-[10px] text-[#9ca3af] ml-1.5 font-normal">próximamente</span>
            </label>
            <input
              type="text"
              disabled
              placeholder="—"
              className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#9ca3af] cursor-not-allowed"
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-600 text-[13px] bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all ${
                saving || !name.trim()
                  ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed'
                  : 'bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98]'
              }`}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando…
                </span>
              ) : (
                'Crear paciente'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
