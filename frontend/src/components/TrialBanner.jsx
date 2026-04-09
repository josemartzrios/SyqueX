// TrialBanner.jsx — Banner de días restantes de trial
export default function TrialBanner({ daysRemaining, onActivate }) {
  if (daysRemaining === null || daysRemaining === undefined) return null;

  const isUrgent = daysRemaining <= 3;
  const bgClass = isUrgent ? 'bg-amber-100 border-amber-300' : 'bg-sage-50 border-sage-200';
  const textClass = isUrgent ? 'text-amber-800' : 'text-sage-dark';

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b text-sm ${bgClass}`}>
      <span className={textClass}>
        Prueba gratuita — te quedan <strong>{daysRemaining}</strong> {daysRemaining === 1 ? 'día' : 'días'}
      </span>
      <button
        onClick={onActivate}
        className="text-xs font-medium underline ml-4 text-sage-dark hover:text-sage"
      >
        Activar
      </button>
    </div>
  );
}
