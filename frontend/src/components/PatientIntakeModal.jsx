import { useState, useEffect } from 'react';
import { createPatient, getPatient, updatePatient } from '../api';
import { calculateAge } from '../utils/age';

/**
 * PatientIntakeModal
 *
 * Reusable modal for creating OR editing a patient expediente.
 *
 * Props:
 *   - open: boolean
 *   - mode: "create" | "edit"
 *   - initialPatient: null | { id } — in edit mode, id used to GET full record
 *   - onClose: () => void
 *   - onSaved: (patient) => void
 */

const MARITAL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'soltero', label: 'Soltero/a' },
  { value: 'casado', label: 'Casado/a' },
  { value: 'divorciado', label: 'Divorciado/a' },
  { value: 'viudo', label: 'Viudo/a' },
  { value: 'union_libre', label: 'Unión libre' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_FORM = {
  name: '',
  date_of_birth: '',
  reason_for_consultation: '',
  marital_status: '',
  occupation: '',
  address: '',
  ec_name: '',
  ec_relationship: '',
  ec_phone: '',
  medical_history: '',
  psychological_history: '',
};

function toForm(patient) {
  if (!patient) return EMPTY_FORM;
  const ec = patient.emergency_contact || {};
  return {
    name: patient.name || '',
    date_of_birth: patient.date_of_birth || '',
    reason_for_consultation: patient.reason_for_consultation || '',
    marital_status: patient.marital_status || '',
    occupation: patient.occupation || '',
    address: patient.address || '',
    ec_name: ec.name || '',
    ec_relationship: ec.relationship || '',
    ec_phone: ec.phone || '',
    medical_history: patient.medical_history || '',
    psychological_history: patient.psychological_history || '',
  };
}

function buildPayload(form, { patchMode }) {
  const ec_any = form.ec_name || form.ec_relationship || form.ec_phone;
  const emergency_contact = ec_any
    ? { name: form.ec_name.trim(), relationship: form.ec_relationship.trim(), phone: form.ec_phone.trim() }
    : null;

  const base = {
    name: form.name.trim(),
    date_of_birth: form.date_of_birth || null,
    reason_for_consultation: form.reason_for_consultation.trim(),
    marital_status: form.marital_status || null,
    occupation: form.occupation.trim() || null,
    address: form.address.trim() || null,
    emergency_contact,
    medical_history: form.medical_history.trim() || null,
    psychological_history: form.psychological_history.trim() || null,
  };

  if (patchMode) return base; // PATCH acepta null explícitos para limpiar

  // CREATE: omitir nulls — Pydantic usa default
  const clean = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== null && v !== '') clean[k] = v;
  }
  return clean;
}

export default function PatientIntakeModal({ open, mode = 'create', initialPatient = null, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!open) return;
    if (isEdit && initialPatient?.id) {
      setLoading(true);
      getPatient(initialPatient.id)
        .then((p) => { setForm(toForm(p)); setError(null); })
        .catch((e) => setError(e.message || 'No se pudo cargar el expediente'))
        .finally(() => setLoading(false));
    } else {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open, isEdit, initialPatient?.id]);

  if (!open) return null;

  const age = calculateAge(form.date_of_birth);
  const ageInvalid = form.date_of_birth && (age === null || age > 120 || age < 0);

  // Contacto emergencia: si uno está, los tres son obligatorios
  const ecAny = form.ec_name || form.ec_relationship || form.ec_phone;
  const ecAll = form.ec_name && form.ec_relationship && form.ec_phone;
  const ecInvalid = ecAny && !ecAll;

  const canSubmit =
    form.name.trim() &&
    form.date_of_birth &&
    !ageInvalid &&
    form.reason_for_consultation.trim() &&
    !ecInvalid &&
    !saving &&
    !loading;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload(form, { patchMode: isEdit });
      const saved = isEdit
        ? await updatePatient(initialPatient.id, payload)
        : await createPatient(payload);
      onSaved?.(saved);
      if (!isEdit) setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el expediente');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving || loading) return;
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div
      id="patient-intake-modal-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-3 sm:px-4"
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-6 pb-3 flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">
              {isEdit ? 'Expediente clínico' : 'Nuevo expediente'}
            </span>
            <h2 className="text-[#18181b] text-lg font-semibold leading-snug">
              {isEdit ? 'Editar expediente' : 'Registrar paciente'}
            </h2>
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

        {/* Aviso LFPDPPP */}
        <div className="mx-4 sm:mx-6 mb-4 bg-[#f4f4f2] rounded-lg px-3 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-[#5a9e8a] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[12px] text-ink-secondary leading-snug">
            Estos datos se guardan cifrados y solo tú los ves. Art. 8 LFPDPPP.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-6 flex flex-col gap-6">
          {loading && (
            <p className="text-ink-tertiary text-[13px]">Cargando expediente…</p>
          )}

          {/* IDENTIDAD */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Identidad</h3>

            <Field label="Nombre completo" required>
              <input
                type="text"
                value={form.name}
                onChange={setField('name')}
                autoFocus
                maxLength={255}
                disabled={saving || loading}
                placeholder="Ej. María García López"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Fecha de nacimiento"
                required
                hint={age != null && !ageInvalid ? `Edad: ${age}` : null}
                error={ageInvalid ? 'Fecha de nacimiento no válida (máx. 120 años)' : null}
              >
                <DobInput
                  key={`dob-${isEdit ? initialPatient?.id : 'new'}`}
                  value={form.date_of_birth}
                  onChange={(v) => setForm((f) => ({ ...f, date_of_birth: v }))}
                  disabled={saving || loading}
                />
              </Field>
              <Field label="Estado civil">
                <select
                  value={form.marital_status}
                  onChange={setField('marital_status')}
                  disabled={saving || loading}
                  className={inputClass}
                >
                  {MARITAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Ocupación">
              <input
                type="text"
                value={form.occupation}
                onChange={setField('occupation')}
                maxLength={120}
                disabled={saving || loading}
                placeholder="Ej. Docente, ingeniera, estudiante"
                className={inputClass}
              />
            </Field>
          </section>

          {/* CONTACTO */}
          <section className="flex flex-col gap-3 pt-4 border-t border-ink/[0.06]">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Contacto</h3>

            <Field label="Domicilio">
              <textarea
                value={form.address}
                onChange={setField('address')}
                maxLength={500}
                disabled={saving || loading}
                rows={2}
                placeholder="Calle, número, colonia, ciudad"
                className={inputClass}
              />
            </Field>

            <div>
              <p className="text-[12px] font-medium text-[#18181b] mb-2">Contacto de emergencia</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={form.ec_name}
                  onChange={setField('ec_name')}
                  maxLength={120}
                  disabled={saving || loading}
                  placeholder="Nombre"
                  className={inputClass}
                  aria-label="Contacto de emergencia — nombre"
                />
                <input
                  type="text"
                  value={form.ec_relationship}
                  onChange={setField('ec_relationship')}
                  maxLength={60}
                  disabled={saving || loading}
                  placeholder="Parentesco"
                  className={inputClass}
                  aria-label="Contacto de emergencia — parentesco"
                />
                <input
                  type="tel"
                  value={form.ec_phone}
                  onChange={setField('ec_phone')}
                  maxLength={20}
                  disabled={saving || loading}
                  placeholder="Teléfono"
                  className={inputClass}
                  aria-label="Contacto de emergencia — teléfono"
                />
              </div>
              {ecInvalid && (
                <p className="text-red-600 text-[12px] mt-1.5">
                  Completa nombre, parentesco y teléfono, o deja los tres vacíos.
                </p>
              )}
            </div>
          </section>

          {/* CLÍNICO */}
          <section className="flex flex-col gap-3 pt-4 border-t border-ink/[0.06]">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold">Clínico</h3>

            <Field label="Motivo de consulta" required>
              <textarea
                value={form.reason_for_consultation}
                onChange={setField('reason_for_consultation')}
                maxLength={2000}
                disabled={saving || loading}
                rows={3}
                placeholder="¿Qué trae al paciente a consulta?"
                className={inputClass}
              />
            </Field>

            <Field label="Historial médico relevante">
              <textarea
                value={form.medical_history}
                onChange={setField('medical_history')}
                maxLength={5000}
                disabled={saving || loading}
                rows={3}
                placeholder="Enfermedades crónicas, medicación actual, cirugías"
                className={inputClass}
              />
            </Field>

            <Field label="Historial psicológico">
              <textarea
                value={form.psychological_history}
                onChange={setField('psychological_history')}
                maxLength={5000}
                disabled={saving || loading}
                rows={3}
                placeholder="Tratamientos previos, diagnósticos, hospitalizaciones"
                className={inputClass}
              />
            </Field>
          </section>

          {error && (
            <p className="text-red-600 text-[13px] bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 sticky bottom-0 bg-white pt-4 pb-6 -mx-4 sm:-mx-6 px-4 sm:px-6 border-t border-ink/[0.06]">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving || loading}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all ${
                !canSubmit ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed' : 'bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98]'
              }`}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all disabled:opacity-60';

const MONTHS_ES = [
  'Ene','Feb','Mar','Abr','May','Jun',
  'Jul','Ago','Sep','Oct','Nov','Dic',
];

function parseDob(iso) {
  if (!iso) return { day: '', month: '', year: '' };
  const [y, m, d] = iso.split('-');
  return { day: d || '', month: m || '', year: y || '' };
}

function DobInput({ value, onChange, disabled }) {
  const [parts, setParts] = useState(() => parseDob(value));

  // Sync when edit-mode loads patient data asynchronously
  useEffect(() => {
    if (!value) return;
    const assembled = parts.year && parts.month && parts.day
      ? `${parts.year}-${parts.month}-${parts.day}` : '';
    if (value !== assembled) setParts(parseDob(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next) => {
    setParts(next);
    const { day, month, year } = next;
    if (day && month && year && String(year).length === 4) {
      onChange(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="DD"
        value={parts.day}
        disabled={disabled}
        onChange={(e) => update({ ...parts, day: e.target.value })}
        className={`${inputClass} min-w-0 !text-xs sm:!text-[14px]`}
      />
      <select
        value={parts.month}
        disabled={disabled}
        onChange={(e) => update({ ...parts, month: e.target.value })}
        className={`${inputClass} min-w-0 !text-xs sm:!text-[14px]`}
        style={{ paddingRight: '8px' }}
      >
        <option value="">Mes</option>
        {MONTHS_ES.map((name, i) => {
          const v = String(i + 1).padStart(2, '0');
          return <option key={v} value={v}>{name}</option>;
        })}
      </select>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="AAAA"
        value={parts.year}
        disabled={disabled}
        onChange={(e) => update({ ...parts, year: e.target.value })}
        className={`${inputClass} min-w-0 !text-xs sm:!text-[14px]`}
      />
    </div>
  );
}

function Field({ label, required, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#18181b] flex items-center gap-2">
        <span>
          {label} {required && <span className="text-red-400">*</span>}
        </span>
        {hint && <span className="text-[11px] text-ink-tertiary font-normal">({hint})</span>}
      </span>
      {children}
      {error && <span className="text-red-600 text-[12px]">{error}</span>}
    </label>
  );
}
