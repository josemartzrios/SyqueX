export default function NotePreview({ fields, activeFieldIndex }) {
  if (!fields || fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <p className="text-ink-tertiary text-sm max-w-xs">
          Agrega secciones en el panel izquierdo para ver la vista previa de tu nota.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-black/[0.06] rounded-xl shadow-sm p-8 min-h-[500px] font-serif">
      <div className="space-y-6">
        {fields.map((field, idx) => {
          const isActive = activeFieldIndex === idx;
          const sectionTitleColor = isActive ? 'text-[#c4935a]' : 'text-[#5a9e8a]';
          const placeholderColor = isActive ? 'bg-[#c4935a]/10' : 'bg-[#f4f4f2]';
          
          return (
            <div key={field.id} className="transition-all">
              <span className={`font-sans text-[10px] font-bold tracking-[0.14em] uppercase ${sectionTitleColor}`}>
                {field.label || 'Sección sin nombre'}
              </span>
              <div className={`h-px mt-1.5 mb-3 ${isActive ? 'bg-[#c4935a]/20' : 'bg-[#5a9e8a]/20'}`} />
              
              <div className="opacity-70">
                {field.type === 'text' && (
                  <div className="space-y-2 mt-2">
                    <div className={`h-2.5 rounded ${placeholderColor} w-full`} />
                    <div className={`h-2.5 rounded ${placeholderColor} w-5/6`} />
                    <div className={`h-2.5 rounded ${placeholderColor} w-4/6`} />
                  </div>
                )}

                {field.type === 'scale' && (
                  <div className="flex gap-2 mt-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <div key={n} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'border border-[#c4935a]/30 text-[#c4935a]' : 'bg-[#f4f4f2] text-ink-muted'}`}>
                        {n}
                      </div>
                    ))}
                  </div>
                )}

                {field.type === 'options' && (
                  <div className="space-y-2 mt-2">
                    {(field.options && field.options.length > 0 ? field.options : ['Opción 1', 'Opción 2']).map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-sm ${isActive ? 'border border-[#c4935a]' : 'border border-black/[0.15]'}`} />
                        <span className={`text-[13px] font-sans ${isActive ? 'text-[#c4935a]' : 'text-ink-secondary'}`}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {field.type === 'date' && (
                  <div className={`mt-2 w-32 h-8 rounded-lg border flex items-center px-3 ${isActive ? 'border-[#c4935a]/30' : 'border-black/[0.1]'}`}>
                    <span className={`text-[12px] font-sans ${isActive ? 'text-[#c4935a]' : 'text-ink-muted'}`}>DD/MM/AAAA</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
