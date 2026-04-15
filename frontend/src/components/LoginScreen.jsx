import { useState } from 'react';
import { login } from '../api.js';
import { setAccessToken } from '../auth.js';

export default function LoginScreen({ onSuccess, onRegister, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      setAccessToken(data.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Inicia sesión</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button onClick={onForgotPassword} className="text-sm text-ink-secondary underline block w-full">
            ¿Olvidaste tu contraseña?
          </button>
          <button onClick={onRegister} className="text-sm text-ink-secondary underline block w-full">
            ¿No tienes cuenta? Regístrate
          </button>
        </div>
      </div>
    </div>
  );
}
