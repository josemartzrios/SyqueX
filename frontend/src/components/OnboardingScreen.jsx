export default function OnboardingScreen({ onSelectSoap, onSelectCustom }) {
  return (
    <div className="min-h-screen bg-[#f4f4f2] font-sans">
      <div className="p-4 md:p-8 flex flex-col min-h-screen">

        {/* Logo inline */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 bg-white border border-[#18181b]/[0.08] shadow-sm rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-[#5a9e8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-serif font-bold text-base text-[#18181b]">SyqueX</span>
        </div>

        <h1 className="text-[20px] md:text-[26px] font-bold text-[#18181b] leading-tight mb-1">
          ¿Cómo quieres documentar tus sesiones?
        </h1>
        <p className="text-[12px] text-[#6b7280] mb-5">
          Solo te preguntamos una vez.
        </p>

        <div className="space-y-3">
          {/* Card SOAP */}
          <div
            onClick={onSelectSoap}
            className="border border-black/[0.08] rounded-xl p-4 md:p-5 cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>📄</span>
                <h3 className="font-semibold text-[#18181b]">Formato SOAP</h3>
              </div>
              <span className="text-[10px] font-medium bg-[#f4f4f2] text-[#6b7280] px-2 py-0.5 rounded">
                Estándar ›
              </span>
            </div>
            <p className="hidden md:block text-[13px] text-[#6b7280] mt-2 mb-3">
              Estructura clásica de documentación usada en psicología y medicina. El agente organiza tu dictado en cuatro secciones automáticamente.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { letter: 'S', label: 'Subjetivo' },
                { letter: 'O', label: 'Objetivo' },
                { letter: 'A', label: 'Análisis' },
                { letter: 'P', label: 'Plan' },
              ].map(({ letter, label }) => (
                <span
                  key={letter}
                  className="text-[10px] md:text-[11px] bg-[#f4f4f2] text-[#18181b] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md font-medium"
                >
                  <span className="text-[#5a9e8a] font-bold">{letter}</span> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Card Personalizada */}
          <div
            onClick={onSelectCustom}
            className="border-2 border-[#5a9e8a] bg-[#f0f8f5]/50 rounded-xl p-4 md:p-5 cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>✏️</span>
                <h3 className="font-semibold text-[#18181b]">Nota personalizada</h3>
              </div>
              <span className="text-[10px] font-medium bg-[#5a9e8a] text-white px-2 py-0.5 rounded">
                Recomendado ›
              </span>
            </div>
            <p className="hidden md:block text-[13px] text-[#6b7280] mt-2 mb-3">
              Diseña los campos que tú ya usas en tu práctica. El agente aprende tu formato y lo llena desde el dictado.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['Motivo', 'Estado', 'Intervenciones'].map((label) => (
                <span
                  key={label}
                  className="text-[10px] md:text-[11px] bg-white border border-black/[0.06] text-[#6b7280] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md"
                >
                  {label}
                </span>
              ))}
              <span className="text-[10px] md:text-[11px] bg-[#f4f4f2] text-[#6b7280] px-2 py-0.5 md:px-2.5 md:py-1 rounded-md">
                + campos…
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
