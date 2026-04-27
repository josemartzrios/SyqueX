import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TemplateFieldEditor from './TemplateFieldEditor';

function emptyField(order) {
  return { id: uuidv4(), label: '', type: 'text', options: [], guiding_question: '', order };
}

export default function TemplateWizard({ onSave, onCancel }) {
  const [fields, setFields] = useState([emptyField(1)]);
  const [saving, setSaving] = useState(false);

  const addField = () =>
    setFields((prev) => [...prev, emptyField(prev.length + 1)]);

  const updateField = (idx, updated) =>
    setFields((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeField = (idx) =>
    setFields((prev) => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 })));

  const canSave = fields.length > 0 && fields.every((f) => f.label.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-secondary">
        Define los campos de tu nota. El agente los llenará automáticamente desde el dictado.
      </p>

      <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
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
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`flex-2 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all ${
            !canSave || saving ? 'bg-[#5a9e8a] opacity-40 cursor-not-allowed' : 'bg-[#5a9e8a] hover:bg-[#4a8a78]'
          }`}
          style={{ flex: 2 }}
        >
          {saving ? 'Guardando…' : 'Guardar template'}
        </button>
      </div>
    </div>
  );
}
