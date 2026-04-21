import { useState } from 'react';
import { register } from '../api.js';
import { setAccessToken } from '../auth.js';
import PasswordStrength from './PasswordStrength.jsx';
const PRIVACY_URL = 'https://syquex.mx/privacidad';
const TERMS_URL = 'https://syquex.mx/terminos';

export default function RegisterScreen({ onSuccess, onLogin }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', cedula: '',
    acceptPrivacy: false, acceptTerms: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = form.name && form.email && form.password &&
                    form.acceptPrivacy && form.acceptTerms;

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(form.name, form.email, form.password, form.cedula);
      setAccessToken(data.access_token);
      onSuccess();
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') {
        setError('EMAIL_TAKEN');
      } else {
        setError(err.message || 'Error al crear la cuenta');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">SyqueX</h1>
        <p className="text-ink-secondary text-sm mb-6">Crea tu cuenta</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">Nombre completo</label>
            <input id="name" type="text" value={form.name} onChange={e => update('name', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">Email</label>
            <input id="email" type="email" value={form.email} onChange={e => update('email', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">Contraseña</label>
            <input id="password" type="password" value={form.password} onChange={e => update('password', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" required />
            <PasswordStrength password={form.password} />
          </div>
          <div>
            <label htmlFor="cedula" className="block text-sm font-medium text-ink mb-1">
              Cédula profesional <span className="text-ink-tertiary">(opcional)</span>
            </label>
            <input id="cedula" type="text" value={form.cedula} onChange={e => update('cedula', e.target.value)}
              className="w-full border border-ink-muted rounded px-3 py-2 text-sm focus:outline-none focus:border-sage" />
          </div>

          <div className="space-y-2">
            <label htmlFor="privacy" className="flex items-start gap-2 cursor-pointer">
              <input id="privacy" type="checkbox" checked={form.acceptPrivacy}
                onChange={e => update('acceptPrivacy', e.target.checked)}
                className="mt-0.5 accent-sage" />
              <span className="text-sm text-ink-secondary">
                He leído el{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="underline text-sage">
                  Aviso de Privacidad
                </a>
              </span>
            </label>
            <label htmlFor="terms" className="flex items-start gap-2 cursor-pointer">
              <input id="terms" type="checkbox" checked={form.acceptTerms}
                onChange={e => update('acceptTerms', e.target.checked)}
                className="mt-0.5 accent-sage" />
              <span className="text-sm text-ink-secondary">
                Acepto los{' '}
                <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline text-sage">
                  Términos y Condiciones
                </a>
              </span>
            </label>
          </div>

          {error === 'EMAIL_TAKEN' ? (
            <p className="text-red-600 text-sm">
              Este email ya tiene una cuenta.{' '}
              <button onClick={onLogin} className="underline font-medium">
                Iniciar sesión
              </button>
            </p>
          ) : error ? (
            <p className="text-red-600 text-sm">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta — 14 días gratis'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={onLogin} className="text-sm text-ink-secondary underline">
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      </div>
    </div>
  );
}
