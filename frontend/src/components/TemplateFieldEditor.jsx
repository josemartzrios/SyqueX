import { useState } from 'react';

// Icons for field types
const FieldIcons = {
  text: () => <span className="text-base">📝</span>,
  scale: () => <span className="text-base">📊</span>,
  options: () => <span className="text-base">☑️</span>,
  date: () => <span className="text-base">📅</span>,
};

export default function TemplateFieldEditor({ field, onChange }) {
  const needsOptions = field.type === 'options';

  const update = (key) => (e) => onChange({ ...field, [key]: e.target.value });

  const updateOptions = (e) => {
    // Preserve empty lines so the cursor can move to a new line while typing
    onChange({ ...field, options: e.target.value.split('\n') });
  };

  const handleOptionsBlur = (e) => {
    // Only filter empty lines when the user leaves the field
    onChange({ ...field, options: e.target.value.split('\n').filter(Boolean) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide">
          Tipo de campo — {field.label || 'Nueva sección'}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { type: 'text', label: 'Texto libre', icon: FieldIcons.text },
          { type: 'scale', label: 'Escala 1–10', icon: FieldIcons.scale },
          { type: 'options', label: 'Opciones', icon: FieldIcons.options },
          { type: 'date', label: 'Fecha', icon: FieldIcons.date },
        ].map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onChange({ ...field, type })}
            className={`flex flex-col items-center justify-center py-2 px-3 rounded-xl border transition-all ${
              field.type === type
                ? 'border-[#5a9e8a] bg-[#f0f8f5]'
                : 'border-black/[0.06] bg-white hover:border-black/[0.15]'
            }`}
          >
            <Icon />
            <span className={`text-[11px] font-medium mt-1 ${field.type === type ? 'text-[#5a9e8a]' : 'text-ink-secondary'}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {needsOptions && (
        <div className="mt-2">
          <label className="text-[11px] text-ink-muted mb-1 block">Opciones (una por línea)</label>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={updateOptions}
            onBlur={handleOptionsBlur}
            placeholder={"Opción A\nOpción B\nOpción C"}
            rows={4}
            className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-3 text-[13px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all resize-none"
          />
        </div>
      )}
    </div>
  );
}
