export default function PatientCard({ patientId, profileData }) {
  if (!profileData) return <div className="text-slate-400 animate-pulse">Cargando perfil...</div>;

  const { profile } = profileData;
  const { recurring_themes, protective_factors, risk_factors } = profile;

  // Mocking simple SVG evolution graph logic
  const mockPoints = [2, 3, 5, 4, 6, 8, 7, 9]; // e.g. wellbeing scale 1-10

  const width = 300;
  const height = 80;
  const padding = 10;
  
  const stepX = (width - padding * 2) / (mockPoints.length - 1);
  const stepY = (height - padding * 2) / 10;

  const pathD = mockPoints.reduce((acc, val, i) => {
    const x = padding + i * stepX;
    const y = height - padding - val * stepY;
    if (i === 0) return `M ${x} ${y}`;
    return `${acc} L ${x} ${y}`;
  }, "");

  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-md border border-slate-700">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Juan Martínez
            <span className="text-xs font-semibold px-2 py-1 bg-emerald-900 text-emerald-300 rounded-full border border-emerald-700">Riesgo Bajo</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">34 años • Ansiedad generalizada, Duelo</p>
        </div>
        <button className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 py-1.5 px-3 rounded border border-slate-600 transition-colors">
          Ver informe trimestral
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Temas Recurrentes</h3>
          <div className="flex flex-wrap gap-2">
            {(recurring_themes || []).map((t, i) => (
              <span key={i} className="bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1 rounded-full text-xs hover:border-teal-500 cursor-pointer transition-colors">
                {t}
              </span>
            ))}
            {(!recurring_themes || recurring_themes.length === 0) && <span className="text-slate-500 text-sm">Sin temas detectados</span>}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Factores Protectores</h3>
          <ul className="list-disc pl-5 text-sm text-slate-300">
            {(protective_factors || []).map((f, i) => <li key={i}>{f}</li>)}
            {(!protective_factors || protective_factors.length === 0) && <li className="text-slate-500 list-none -ml-5">Sin factores protectores registrados</li>}
          </ul>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-700 pt-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Evolución (Últimas 8 sesiones)</h3>
        <div className="bg-slate-900 rounded p-4 border border-slate-800">
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <polyline
              points={mockPoints.map((val, i) => `${padding + i * stepX},${height - padding - val * stepY}`).join(' ')}
              fill="none"
              stroke="#0d9488"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {mockPoints.map((val, i) => (
              <circle
                key={i}
                cx={padding + i * stepX}
                cy={height - padding - val * stepY}
                r="4"
                fill="#1e293b"
                stroke="#0d9488"
                strokeWidth="2"
              />
            ))}
          </svg>
          <div className="flex justify-between text-xs text-slate-500 mt-2 px-2">
            <span>S-7</span>
            <span>S-6</span>
            <span>S-5</span>
            <span>S-4</span>
            <span>S-3</span>
            <span>S-2</span>
            <span>S-1</span>
            <span>Actual</span>
          </div>
        </div>
      </div>
    </div>
  )
}
