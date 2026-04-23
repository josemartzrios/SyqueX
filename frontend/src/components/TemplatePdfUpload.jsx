import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { analyzePdf } from '../api';
import TemplateFieldEditor from './TemplateFieldEditor';

export default function TemplatePdfUpload({ onSave, onCancel }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'review'
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El PDF no puede superar 5 MB.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const proposed = await analyzePdf(file);
      const normalized = proposed.map((f, i) => ({
        ...f,
        id: f.id || uuidv4(),
        order: f.order ?? i + 1,
        options: f.options || [],
        guiding_question: f.guiding_question || '',
      }));
      setFields(normalized);
      setStep('review');
    } catch (err) {
      setError(err.message || 'No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateField = (idx, updated) =>
    setFields((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeField = (idx) =>
    setFields((prev) => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 })));

  const addField = () =>
    setFields((prev) => [...prev, { id: uuidv4(), label: '', type: 'text', options: [], guiding_question: '', order: prev.length + 1 }]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  if (step === 'upload') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-ink-muted">
          El agente solo aprende la estructura, no guarda el contenido de la nota.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[#5a9e8a]/40 rounded-xl p-10 text-center cursor-pointer hover:border-[#5a9e8a] hover:bg-[#f0f8f5] transition-colors"
        >
          <p className="text-[14px] font-medium text-ink">Arrastra tu PDF aquí</p>
          <p className="text-[12px] text-ink-muted mt-1">o haz clic para seleccionar · Máx 5 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {analyzing && (
          <p className="text-[13px] text-[#5a9e8a] text-center animate-pulse">
            Analizando nota con agente…
          </p>
        )}

        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button onClick={onCancel} className="text-[13px] text-ink-muted underline text-center">
          Cancelar
        </button>
      </div>
    );
  }

  // Step: review
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#f0f8f5] border border-[#b3d9ce] rounded-lg px-3 py-2 text-[12px] text-[#3d7a65]">
        ✓ El agente detectó {fields.length} campos. Revisa, ajusta o agrega más.
      </div>

      <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-1">
        {fields.map((field, idx) => (
          <TemplateFieldEditor
            key={field.id}
            field={field}
            onChange={(updated) => updateField(idx, updated)}
            onDelete={() => removeField(idx)}
          />
        ))}
      </div>

      <button
        onClick={addField}
        className="w-full border border-dashed border-ink/20 rounded-xl py-3 text-[13px] text-ink-muted hover:border-[#5a9e8a]/50 hover:text-[#5a9e8a] transition-colors"
      >
        + Agregar campo
      </button>

      <div className="flex gap-3">
        <button
          onClick={() => setStep('upload')}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={handleSave}
          disabled={saving || fields.length === 0}
          className="py-2.5 rounded-xl text-[14px] font-medium text-white bg-[#5a9e8a] hover:bg-[#4a8a78] disabled:opacity-40 transition-colors"
          style={{ flex: 2 }}
        >
          {saving ? 'Guardando…' : 'Guardar template'}
        </button>
      </div>
    </div>
  );
}
