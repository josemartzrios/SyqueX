const FIELD_TYPES = [
  { value: 'text',     label: 'Texto libre' },
  { value: 'scale',    label: 'Escala 1–10' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'list',     label: 'Lista opciones' },
  { value: 'date',     label: 'Fecha' },
];

const inputCls = 'w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-[#18181b] placeholder-[#9ca3af] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all';

export default function TemplateFieldEditor({ field, onChange, onDelete }) {
  const needsOptions = field.type === 'checkbox' || field.type === 'list';

  const update = (key) => (e) => onChange({ ...field, [key]: e.target.value });

  const updateOptions = (e) => {
    const options = e.target.value.split('\n').filter(Boolean);
    onChange({ ...field, options });
  };

  return (
    <div className="border border-ink/[0.08] rounded-xl p-4 flex flex-col gap-3 bg-white">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={field.label}
          onChange={update('label')}
          placeholder="Nombre del campo…"
          className={inputCls}
          maxLength={120}
        />
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-2 rounded-lg text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Eliminar campo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FIELD_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange({ ...field, type: t.value, options: field.options })}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              field.type === t.value
                ? 'bg-[#5a9e8a] text-white'
                : 'bg-[#f4f4f2] text-[#555] hover:bg-[#e8e8e6]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {needsOptions && (
        <div>
          <p className="text-[11px] text-ink-muted mb-1">Opciones (una por línea)</p>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={updateOptions}
            placeholder={"Opción A\nOpción B\nOpción C"}
            rows={3}
            className={inputCls}
          />
        </div>
      )}

      <input
        type="text"
        value={field.guiding_question || ''}
        onChange={update('guiding_question')}
        placeholder="Pregunta guía para el agente (opcional)…"
        className={inputCls}
        maxLength={300}
      />
    </div>
  );
}
