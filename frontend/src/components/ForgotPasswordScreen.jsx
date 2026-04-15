import { useState } from 'react';
import { forgotPassword } from '../api.js';

export default function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch (_) { /* ignorar — la respuesta es siempre la misma */ }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">¿Olvidaste tu contraseña?</p>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Si el email existe, recibirás un enlace en los próximos minutos.
            </p>
            <button onClick={onBack} className="text-sm text-ink-secondary underline">
              ← Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-ink-secondary">
              Ingresa tu email y te enviamos un enlace para reestablecerla.
            </p>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <button type="button" onClick={onBack} className="text-sm text-ink-secondary underline w-full text-center block">
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
