// PasswordStrength.jsx — Indicador visual de reglas de contraseña
export default function PasswordStrength({ password }) {
  const rules = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Al menos 1 mayúscula', ok: /[A-Z]/.test(password) },
    { label: 'Al menos 1 número', ok: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <ul className="mt-1 space-y-1">
      {rules.map(({ label, ok }) => (
        <li key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-sage' : 'text-ink-tertiary'}`}>
          <span>{ok ? '✓' : '✗'}</span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
