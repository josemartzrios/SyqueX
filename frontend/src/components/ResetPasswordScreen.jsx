import { useState } from 'react';
import { resetPassword } from '../api.js';
import { setAccessToken } from '../auth.js';
import PasswordStrength from './PasswordStrength.jsx';

export default function ResetPasswordScreen({ resetToken, onSuccess, onInvalidToken }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password && password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await resetPassword(resetToken, password);
      setAccessToken(data.access_token);
      // Limpiar token de la URL
      window.history.replaceState({}, '', '/');
      onSuccess();
    } catch (err) {
      if (err.status === 400) {
        setError('El enlace es inválido o ya expiró.');
        onInvalidToken?.();
      } else {
        setError(err.message || 'Error al cambiar la contraseña');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Nueva contraseña</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required />
            <PasswordStrength password={password} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={!passwordsMatch || loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
