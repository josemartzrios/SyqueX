# Spec: Cancelar suscripción

**Fecha:** 2026-05-07
**Feature:** feature/tutorial-patient
**Alcance:** Backend endpoint + frontend sidebar + modal de confirmación

---

## Contexto

Actualmente la `BillingScreen` le dice al usuario que escriba a `hola@syquex.mx` para cancelar. La infraestructura ya tiene todo lo necesario:

- Campo `cancel_at_period_end` (BOOLEAN) en la tabla `subscriptions`
- Webhook `customer.subscription.updated` ya actualiza ese campo
- Webhook `customer.subscription.deleted` ya transiciona a `status = 'canceled'`

Solo falta el endpoint y el flujo de UI.

---

## Comportamiento

### Regla de negocio

- La cancelación es **al final del período** (`cancel_at_period_end = true`), nunca inmediata.
- El psicólogo conserva acceso completo hasta `current_period_end`.
- Después de esa fecha Stripe no renueva y el webhook `customer.subscription.deleted` pone `status = 'canceled'` — acceso bloqueado con 402.
- El botón solo aparece cuando `status === 'active'`. No aplica a `trialing` (no hay `stripe_subscription_id` todavía).

---

## Backend

### Modificación a `GET /api/v1/billing/status`

Agregar `cancel_at_period_end` (bool) a la respuesta cuando `status == 'active'`:

```json
{
  "status": "active",
  "current_period_end": "2026-06-07T00:00:00Z",
  "cancel_at_period_end": false
}
```

El frontend lo usa para: (a) ocultar el botón cancelar si ya está marcada, y (b) mostrar el estado `"Activo hasta [fecha]"` en `BillingScreen`.

---

### Endpoint `POST /api/v1/billing/cancel`

**Archivo:** `backend/api/billing.py`

**Auth:** Bearer token (misma dependencia `get_current_psychologist` que el resto de rutas de billing).

**Validaciones:**
1. La suscripción existe y `status == 'active'`
2. `stripe_subscription_id` no es null
3. `cancel_at_period_end` ya es `false` (idempotencia: si ya está marcada, retornar 200 sin llamar a Stripe de nuevo)

**Lógica:**
```python
stripe.Subscription.modify(
    subscription.stripe_subscription_id,
    cancel_at_period_end=True
)
# Actualizar DB optimistamente
subscription.cancel_at_period_end = True
subscription.canceled_at = datetime.now(UTC)
```

**Respuesta 200:**
```json
{
  "cancel_at_period_end": true,
  "current_period_end": "2026-06-07T00:00:00Z"
}
```

**Errores:**
- `400` si `status != 'active'`
- `200` si ya está marcada (idempotente — no rellamar a Stripe, retornar el estado actual)
- `502` si Stripe falla (propagar mensaje)

> El webhook `customer.subscription.updated` recibirá la confirmación de Stripe y sincronizará el estado — no hay que duplicar lógica allí.

---

## Frontend

### `api.js` — función nueva

```js
export async function cancelSubscription() {
  return apiFetch('/billing/cancel', { method: 'POST' });
}
```

### `Sidebar.jsx` — botón arriba de logout

Nueva prop: `subscriptionStatus` (string). El botón solo se renderiza cuando `subscriptionStatus === 'active'`.

```jsx
{/* Bottom footer del drawer */}
<div className="border-t border-ink/[0.07] flex-shrink-0">
  {subscriptionStatus === 'active' && (
    <button
      onClick={onCancelSubscription}
      className="w-full text-left px-5 py-[10px] text-[12px] text-ink-tertiary hover:text-ink-secondary hover:bg-parchment transition-colors border-b border-ink/[0.04]"
    >
      Cancelar suscripción
    </button>
  )}
  <button onClick={onLogout} className="w-full text-left px-5 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
    Cerrar sesión
  </button>
</div>
```

### `CancelSubscriptionModal.jsx` — componente nuevo

Componente presentacional puro. Props:

| Prop | Tipo | Descripción |
|------|------|-------------|
| `open` | bool | Muestra/oculta el modal |
| `periodEnd` | string \| null | Fecha ISO del último día de acceso |
| `loading` | bool | Spinner en el botón de confirmar |
| `error` | string | Mensaje de error inline |
| `onConfirm` | fn | Llama al endpoint de cancelación |
| `onClose` | fn | Cierra el modal sin cancelar |

**Estructura visual:**
- Overlay semitransparente sobre toda la pantalla (`fixed inset-0 bg-ink/30 z-50`)
- Card centrada `max-w-sm`, fondo blanco, `rounded-lg border border-ink-muted p-6`
- Título: `"¿Cancelar suscripción?"`
- Texto: `"Tu acceso se mantiene activo hasta el [fecha formateada]. Después no se realizarán más cobros."` — `text-sm text-ink-secondary`
- Botón sage (primario): `"Conservar mi plan"` → `onClose()`
- Botón borde rojo suave (secundario): `"Sí, cancelar"` → `onConfirm()` — muestra spinner si `loading`
- Error inline debajo de los botones si `error` no está vacío

### `App.jsx` — estado y handlers

**Estado nuevo:**
```js
const [showCancelModal, setShowCancelModal] = useState(false);
const [cancelLoading, setCancelLoading]     = useState(false);
const [cancelError, setCancelError]         = useState('');
```

**Handler `handleCancelSubscription`:**
```js
async function handleCancelSubscription() {
  setCancelLoading(true);
  setCancelError('');
  try {
    await cancelSubscription();
    setShowCancelModal(false);
    // Actualizar billing status localmente para que desaparezca el botón
    setBillingStatus(prev => ({ ...prev, cancel_at_period_end: true }));
  } catch (err) {
    setCancelError(err.message || 'Error al cancelar. Intenta de nuevo.');
  } finally {
    setCancelLoading(false);
  }
}
```

**Prop `subscriptionStatus` al Sidebar:** se pasa `billingStatus?.status` — ya existe `billingStatus` en `App.jsx`.

### `BillingScreen.jsx` — estado post-cancelación

Cuando `status === 'active'` y `cancel_at_period_end === true`, mostrar:

```
Plan Pro — Activo hasta [fecha]
Tu suscripción no se renovará al término del período.
```

En lugar del texto actual `"Para cancelar… escríbenos a hola@syquex.mx"`.

---

## Flujo completo

```
Psicólogo abre sidebar
  → ve "Cancelar suscripción" encima de "Cerrar sesión"
  → hace clic
  → modal muestra fecha de último acceso
  → confirma con "Sí, cancelar"
  → POST /billing/cancel → Stripe marca cancel_at_period_end=true
  → modal se cierra, botón desaparece del sidebar
  → BillingScreen actualizada con "Activo hasta [fecha]"
  → (días después) webhook customer.subscription.deleted → status=canceled → 402
```

---

## Tests

### Backend
- `test_cancel_active_subscription` — responde 200, `cancel_at_period_end=true` en DB
- `test_cancel_idempotent` — segunda llamada también responde 200 sin llamar a Stripe
- `test_cancel_trialing_fails` — responde 400
- `test_cancel_already_canceled_fails` — responde 400
- `test_cancel_requires_auth` — sin token responde 401

### Frontend
- `CancelSubscriptionModal` renderiza con `open=true` y muestra fecha
- Botón "Conservar mi plan" llama `onClose`
- Botón "Sí, cancelar" llama `onConfirm` y muestra spinner si `loading=true`
- Error inline aparece si `error` no está vacío
- `Sidebar` no muestra el botón si `subscriptionStatus !== 'active'`

---

## Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `backend/api/billing.py` | Agregar `POST /cancel` + `cancel_at_period_end` en `GET /status` |
| `frontend/src/api.js` | Agregar `cancelSubscription()` |
| `frontend/src/components/Sidebar.jsx` | Prop `subscriptionStatus` + botón condicional + prop `onCancelSubscription` |
| `frontend/src/components/CancelSubscriptionModal.jsx` | Componente nuevo |
| `frontend/src/App.jsx` | Estado + handler + pasar props al Sidebar y modal |
| `frontend/src/components/BillingScreen.jsx` | Mostrar estado `cancel_at_period_end` |
