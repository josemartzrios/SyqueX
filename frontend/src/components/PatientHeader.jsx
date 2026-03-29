/**
 * PatientHeader
 *
 * Shows patient info: avatar initials, name, confirmed session count.
 * Used in desktop header bar and mobile patient strip.
 *
 * Props:
 *   - patientName: string | null
 *   - sessionCount: number  (confirmed sessions)
 *   - compact: boolean      (mobile strip uses smaller sizing)
 */

export default function PatientHeader({ patientName, sessionCount = 0, compact = false }) {
  if (!patientName) {
    return (
      <header className="px-6 py-3.5 border-b border-black/[0.07] bg-white flex items-center gap-3 flex-shrink-0 min-h-[52px]">
        <span className="text-ink-tertiary text-[14px]">Selecciona un paciente</span>
      </header>
    );
  }

  const initials = patientName.slice(0, 2).toUpperCase();

  /* Compact = mobile patient strip style */
  if (compact) {
    return (
      <div className="px-5 py-3 bg-[#f4f4f2] border-b border-ink/[0.06] flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[#18181b] leading-tight">{patientName}</p>
          <p className="text-[11px] text-ink-tertiary">
            {sessionCount} {sessionCount === 1 ? 'sesión confirmada' : 'sesiones confirmadas'}
          </p>
        </div>
      </div>
    );
  }

  /* Desktop header bar */
  return (
    <header className="px-6 py-3.5 border-b border-black/[0.07] bg-white flex items-center gap-3 flex-shrink-0 min-h-[52px]">
      <div className="w-7 h-7 rounded-full bg-[#5a9e8a] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
        {initials}
      </div>
      <span className="text-[#18181b] text-[15px] font-semibold">{patientName}</span>
      <span className="text-ink-muted text-[12px] ml-1">
        · {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}
      </span>
    </header>
  );
}
