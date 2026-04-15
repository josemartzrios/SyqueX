import { useState, useEffect } from 'react';
import { getBillingStatus, createCheckout } from '../api.js';

export default function BillingScreen({ onActivated }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBillingStatus()
      .then(s => {
        setStatus(s);
        // Si viene de Stripe con ?success=true y ya está activo
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true' && s.status === 'active') {
          window.history.replaceState({}, '', '/');
          onActivated?.();
        }
      })
      .catch(() => setError('No se pudo cargar el estado de suscripción'))
      .finally(() => setLoading(false));
  }, [onActivated]);

  async function handleActivate() {
    setCheckoutLoading(true);
    setError('');
    try {
      const { checkout_url } = await createCheckout();
      window.location.href = checkout_url;
    } catch (err) {
      setError(err.message || 'Error al iniciar el pago');
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <p className="text-ink-tertiary text-sm">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-ink-muted p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Tu plan actual</h2>

        {status?.status === 'trialing' && (
          <>
            <div>
              <p className="text-sm text-ink-secondary">Período de prueba</p>
              <p className="text-sm text-ink font-medium">
                Te quedan {status.days_remaining} {status.days_remaining === 1 ? 'día' : 'días'}
              </p>
            </div>
            <PlanFeatures />
            <ActivateButton onClick={handleActivate} loading={checkoutLoading} />
          </>
        )}

        {(status?.status === 'past_due' || status?.status === 'canceled' || status?.status === 'unpaid' ||
          (status?.status === 'trialing' && status?.days_remaining === 0)) && (
          <>
            <p className="text-sm text-ink">
              Tu período de prueba terminó. Activa tu suscripción para continuar.
              Tus datos están guardados.
            </p>
            <ActivateButton onClick={handleActivate} loading={checkoutLoading} />
          </>
        )}

        {status?.status === 'active' && (
          <>
            <p className="text-sm font-medium text-sage">Plan Pro — Activo</p>
            {status.current_period_end && (
              <p className="text-sm text-ink-secondary">
                Próximo cobro: {new Date(status.current_period_end).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            <p className="text-sm text-ink-tertiary">
              Para cancelar o cambiar tu plan, escríbenos a hola@syquex.mx
            </p>
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}

function PlanFeatures() {
  return (
    <ul className="text-sm text-ink-secondary space-y-1">
      {['Pacientes ilimitados', 'Notas SOAP con IA', 'Historial clínico completo', 'Soporte por email'].map(f => (
        <li key={f} className="flex items-center gap-2">
          <span className="text-sage">✓</span> {f}
        </li>
      ))}
    </ul>
  );
}

function ActivateButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full bg-sage text-white py-2 rounded text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
      {loading ? 'Redirigiendo a pago…' : 'Activar suscripción — $499/mes'}
    </button>
  );
}
