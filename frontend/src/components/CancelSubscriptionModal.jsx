export default function CancelSubscriptionModal({
  open,
  periodEnd,
  loading,
  error,
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  const formattedDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div
      className="fixed inset-0 bg-ink/30 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg border border-ink-muted p-6 w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold text-ink">¿Cancelar suscripción?</h3>

        {formattedDate && (
          <p className="text-sm text-ink-secondary">
            Tu acceso se mantiene activo hasta el{' '}
            <strong>{formattedDate}</strong>. Después no se realizarán más cobros.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={onClose}
            className="w-full py-2 bg-sage text-white rounded text-sm font-medium hover:bg-sage-dark transition-colors"
          >
            Conservar mi plan
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full py-2 bg-white border border-red-200 text-red-700 rounded text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cancelando…' : 'Sí, cancelar'}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}
