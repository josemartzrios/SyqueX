# Cancel Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar botón "Cancelar suscripción" encima de "Cerrar sesión" en ambos sidebars (mobile y desktop), con modal de confirmación y endpoint `POST /billing/cancel` que llama a Stripe con `cancel_at_period_end=True`.

**Architecture:** Nuevo endpoint en `billing.py` que modifica la suscripción en Stripe y actualiza la DB. El frontend muestra el botón solo cuando `status === 'active' && !cancel_at_period_end`; al confirmar, actualiza el estado local y el botón desaparece sin recarga.

**Tech Stack:** Python 3.11 / FastAPI / Stripe SDK (backend) · React 18 / Vitest / @testing-library/react (frontend)

---

## Mapa de archivos

| Archivo | Acción |
|---------|--------|
| `backend/api/billing.py` | Modificar `GET /status` (añadir campo) + nuevo `POST /cancel` |
| `backend/tests/test_billing.py` | Nuevo archivo de tests |
| `frontend/src/api.js` | Añadir `cancelSubscription()` |
| `frontend/src/components/CancelSubscriptionModal.jsx` | Componente nuevo |
| `frontend/src/components/CancelSubscriptionModal.test.jsx` | Tests del modal |
| `frontend/src/components/Sidebar.jsx` | Props nuevas + botón condicional |
| `frontend/src/components/Sidebar.test.jsx` | Tests del botón cancelar |
| `frontend/src/components/PatientSidebar.jsx` | Props nuevas + botón condicional (desktop) |
| `frontend/src/components/PatientSidebar.test.jsx` | Tests del botón cancelar |
| `frontend/src/App.jsx` | Estado + handler + props a sidebars + modal |
| `frontend/src/components/BillingScreen.jsx` | Estado post-cancelación |

---

## Task 1: Backend — `GET /billing/status` incluye `cancel_at_period_end`

**Files:**
- Modify: `backend/api/billing.py:38-41`
- Create: `backend/tests/test_billing.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/test_billing.py`:

```python
"""Tests for billing endpoints: GET /status and POST /cancel."""
import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


def _result(sub=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = sub
    return r


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute.return_value = _result()
    return db


@pytest.fixture
def app(mock_db, monkeypatch):
    from cryptography.fernet import Fernet
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())
    with patch("database.init_db", new=AsyncMock()):
        from main import app as _app
        from database import get_db
        from api.auth import get_current_psychologist

        fake_psy = MagicMock()
        fake_psy.id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        fake_psy.is_active = True
        fake_psy.trial_ends_at = None
        fake_psy.stripe_customer_id = "cus_test"

        async def override_get_db():
            yield mock_db

        async def override_current_user():
            return fake_psy

        _app.dependency_overrides[get_db] = override_get_db
        _app.dependency_overrides[get_current_psychologist] = override_current_user
        yield _app
        _app.dependency_overrides.clear()


@pytest.fixture
def active_sub():
    sub = MagicMock()
    sub.status = "active"
    sub.stripe_subscription_id = "sub_test123"
    sub.cancel_at_period_end = False
    sub.canceled_at = None
    sub.current_period_end = datetime(2026, 6, 7, tzinfo=timezone.utc)
    return sub


class TestBillingStatusCancelAtPeriodEnd:
    @pytest.mark.asyncio
    async def test_active_status_includes_cancel_at_period_end_false(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/billing/status")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is False

    @pytest.mark.asyncio
    async def test_active_status_includes_cancel_at_period_end_true(self, app, mock_db, active_sub):
        active_sub.cancel_at_period_end = True
        mock_db.execute.return_value = _result(sub=active_sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/billing/status")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is True
```

- [ ] **Step 2: Correr el test — debe fallar**

```bash
cd backend && pytest tests/test_billing.py::TestBillingStatusCancelAtPeriodEnd -v
```

Resultado esperado: `FAILED — KeyError: 'cancel_at_period_end'`

- [ ] **Step 3: Modificar `GET /status` en `billing.py`**

Reemplazar las líneas 38-41 de `backend/api/billing.py`:

```python
    # ANTES:
    return {
        "status": sub.status,
        "current_period_end": sub.current_period_end
    }
```

```python
    # DESPUÉS:
    if sub.status == "active":
        return {
            "status": "active",
            "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end,
        }
    return {
        "status": sub.status,
        "current_period_end": sub.current_period_end,
    }
```

- [ ] **Step 4: Correr el test — debe pasar**

```bash
cd backend && pytest tests/test_billing.py::TestBillingStatusCancelAtPeriodEnd -v
```

Resultado esperado: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/api/billing.py backend/tests/test_billing.py
git commit -m "feat(billing): add cancel_at_period_end to GET /billing/status response"
```

---

## Task 2: Backend — endpoint `POST /billing/cancel`

**Files:**
- Modify: `backend/api/billing.py` (añadir endpoint al final)
- Modify: `backend/tests/test_billing.py` (añadir clase de tests)

- [ ] **Step 1: Añadir tests al archivo existente**

Añadir al final de `backend/tests/test_billing.py`:

```python
class TestCancelSubscription:
    @pytest.mark.asyncio
    async def test_cancel_active_returns_200(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        with patch("api.billing.stripe") as mock_stripe:
            mock_stripe.Subscription.modify.return_value = MagicMock()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is True

    @pytest.mark.asyncio
    async def test_cancel_sets_cancel_at_period_end_in_db(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        with patch("api.billing.stripe") as mock_stripe:
            mock_stripe.Subscription.modify.return_value = MagicMock()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post("/api/v1/billing/cancel")
        assert active_sub.cancel_at_period_end is True
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_calls_stripe_with_correct_args(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        with patch("api.billing.stripe") as mock_stripe:
            mock_stripe.Subscription.modify.return_value = MagicMock()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post("/api/v1/billing/cancel")
        mock_stripe.Subscription.modify.assert_called_once_with(
            "sub_test123", cancel_at_period_end=True
        )

    @pytest.mark.asyncio
    async def test_cancel_idempotent_already_marked(self, app, mock_db, active_sub):
        active_sub.cancel_at_period_end = True
        mock_db.execute.return_value = _result(sub=active_sub)
        with patch("api.billing.stripe") as mock_stripe:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 200
        assert res.json()["cancel_at_period_end"] is True
        mock_stripe.Subscription.modify.assert_not_called()

    @pytest.mark.asyncio
    async def test_cancel_trialing_returns_400(self, app, mock_db):
        sub = MagicMock()
        sub.status = "trialing"
        mock_db.execute.return_value = _result(sub=sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_no_subscription_returns_400(self, app, mock_db):
        mock_db.execute.return_value = _result(sub=None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_already_canceled_status_returns_400(self, app, mock_db):
        sub = MagicMock()
        sub.status = "canceled"
        mock_db.execute.return_value = _result(sub=sub)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_stripe_error_returns_502(self, app, mock_db, active_sub):
        mock_db.execute.return_value = _result(sub=active_sub)
        with patch("api.billing.stripe") as mock_stripe:
            mock_stripe.Subscription.modify.side_effect = Exception("Stripe down")
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/api/v1/billing/cancel")
        assert res.status_code == 502
```

- [ ] **Step 2: Correr los tests — deben fallar con 404 (endpoint no existe)**

```bash
cd backend && pytest tests/test_billing.py::TestCancelSubscription -v
```

Resultado esperado: `7 failed — assert 404 == 200 / 400 / 502`

- [ ] **Step 3: Implementar `POST /cancel` en `billing.py`**

Añadir al final de `backend/api/billing.py` (antes del cierre del archivo):

```python
@router.post("/cancel")
async def cancel_subscription(
    psychologist=Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist.id)
    )
    sub = result.scalar_one_or_none()

    if not sub or sub.status != "active" or not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No tienes una suscripción activa")

    if sub.cancel_at_period_end:
        return {
            "cancel_at_period_end": True,
            "current_period_end": sub.current_period_end,
        }

    try:
        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            cancel_at_period_end=True,
        )
    except Exception as e:
        logger.error("Stripe cancel error: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail="Error al comunicarse con Stripe")

    sub.cancel_at_period_end = True
    sub.canceled_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "cancel_at_period_end": True,
        "current_period_end": sub.current_period_end,
    }
```

- [ ] **Step 4: Correr todos los tests de billing**

```bash
cd backend && pytest tests/test_billing.py -v
```

Resultado esperado: `10 passed`

- [ ] **Step 5: Correr suite completa para verificar no hay regresiones**

```bash
cd backend && pytest tests/ -v --tb=short
```

Resultado esperado: todos los tests existentes siguen en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/api/billing.py backend/tests/test_billing.py
git commit -m "feat(billing): add POST /billing/cancel endpoint"
```

---

## Task 3: Frontend — `api.js` + `CancelSubscriptionModal.jsx`

**Files:**
- Modify: `frontend/src/api.js:236` (después de `createCheckout`)
- Create: `frontend/src/components/CancelSubscriptionModal.jsx`
- Create: `frontend/src/components/CancelSubscriptionModal.test.jsx`

- [ ] **Step 1: Añadir `cancelSubscription` en `api.js`**

En `frontend/src/api.js`, después de la función `createCheckout` (línea 238), añadir:

```js
export async function cancelSubscription() {
  return _authFetch(`${API_BASE}/billing/cancel`, { method: 'POST' });
}
```

- [ ] **Step 2: Escribir los tests del modal**

Crear `frontend/src/components/CancelSubscriptionModal.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CancelSubscriptionModal from './CancelSubscriptionModal'

const defaultProps = {
  open: true,
  periodEnd: '2026-06-07T00:00:00Z',
  loading: false,
  error: '',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

describe('CancelSubscriptionModal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<CancelSubscriptionModal {...defaultProps} open={false} />)
    expect(screen.queryByText(/cancelar suscripción/i)).not.toBeInTheDocument()
  })

  it('muestra el título cuando open=true', () => {
    render(<CancelSubscriptionModal {...defaultProps} />)
    expect(screen.getByText('¿Cancelar suscripción?')).toBeInTheDocument()
  })

  it('muestra la fecha formateada del período', () => {
    render(<CancelSubscriptionModal {...defaultProps} />)
    expect(screen.getByText(/7 de junio de 2026/i)).toBeInTheDocument()
  })

  it('botón "Conservar mi plan" llama onClose', async () => {
    const onClose = vi.fn()
    render(<CancelSubscriptionModal {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /conservar mi plan/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('botón "Sí, cancelar" llama onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<CancelSubscriptionModal {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('muestra "Cancelando…" y deshabilita botón cuando loading=true', () => {
    render(<CancelSubscriptionModal {...defaultProps} loading={true} />)
    const btn = screen.getByRole('button', { name: /cancelando/i })
    expect(btn).toBeDisabled()
  })

  it('muestra mensaje de error si error no está vacío', () => {
    render(<CancelSubscriptionModal {...defaultProps} error="Error de red" />)
    expect(screen.getByText('Error de red')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr los tests — deben fallar**

```bash
cd frontend && npx vitest run src/components/CancelSubscriptionModal.test.jsx
```

Resultado esperado: `FAIL — Cannot find module './CancelSubscriptionModal'`

- [ ] **Step 4: Crear `CancelSubscriptionModal.jsx`**

Crear `frontend/src/components/CancelSubscriptionModal.jsx`:

```jsx
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
```

- [ ] **Step 5: Correr los tests — deben pasar**

```bash
cd frontend && npx vitest run src/components/CancelSubscriptionModal.test.jsx
```

Resultado esperado: `7 passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js frontend/src/components/CancelSubscriptionModal.jsx frontend/src/components/CancelSubscriptionModal.test.jsx
git commit -m "feat(billing): add CancelSubscriptionModal component and cancelSubscription API function"
```

---

## Task 4: Frontend — botón cancelar en `Sidebar.jsx` y `PatientSidebar.jsx`

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx:2-3,62-69`
- Modify: `frontend/src/components/Sidebar.test.jsx` (añadir tests)
- Modify: `frontend/src/components/PatientSidebar.jsx:122-134,219-227`
- Modify: `frontend/src/components/PatientSidebar.test.jsx` (añadir tests)

- [ ] **Step 1: Añadir tests al `Sidebar.test.jsx` existente**

Añadir al final del `describe('Sidebar', ...)` en `frontend/src/components/Sidebar.test.jsx`:

```jsx
  it('no muestra "Cancelar suscripción" cuando canCancelSubscription=false', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} canCancelSubscription={false} />)
    expect(screen.queryByRole('button', { name: /cancelar suscripción/i })).not.toBeInTheDocument()
  })

  it('muestra "Cancelar suscripción" cuando canCancelSubscription=true', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} canCancelSubscription={true} onCancelSubscription={noop} />)
    expect(screen.getByRole('button', { name: /cancelar suscripción/i })).toBeInTheDocument()
  })

  it('click en "Cancelar suscripción" llama onCancelSubscription', async () => {
    const user = userEvent.setup()
    const onCancelSubscription = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} canCancelSubscription={true} onCancelSubscription={onCancelSubscription} />)
    await user.click(screen.getByRole('button', { name: /cancelar suscripción/i }))
    expect(onCancelSubscription).toHaveBeenCalledOnce()
  })

  it('"Cancelar suscripción" aparece antes de "Cerrar sesión" en el DOM', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} canCancelSubscription={true} onCancelSubscription={noop} onLogout={noop} />)
    const buttons = screen.getAllByRole('button')
    const cancelIdx = buttons.findIndex(b => /cancelar suscripción/i.test(b.textContent))
    const logoutIdx = buttons.findIndex(b => /cerrar sesión/i.test(b.textContent))
    expect(cancelIdx).toBeLessThan(logoutIdx)
  })
```

- [ ] **Step 2: Correr tests de Sidebar — nuevos tests deben fallar**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```

Resultado esperado: los 4 tests nuevos fallan, los existentes pasan.

- [ ] **Step 3: Actualizar `Sidebar.jsx`**

Cambiar la firma del componente (línea 3) y el footer (líneas 62-69) en `frontend/src/components/Sidebar.jsx`:

```jsx
// Línea 3 — actualizar destructuring de props:
export default function Sidebar({ open, onClose, conversations, onSelectConversation, onDeleteConversation, onLogout, draftPatientIds = new Set(), canCancelSubscription = false, onCancelSubscription }) {
```

```jsx
  // Reemplazar el bloque del footer (líneas 62-69):
  {/* Logout — pinned to bottom of drawer */}
  <div className="border-t border-ink/[0.07] flex-shrink-0">
    {canCancelSubscription && (
      <button
        onClick={onCancelSubscription}
        className="w-full text-left px-5 py-[10px] text-[12px] text-ink-tertiary hover:text-ink-secondary hover:bg-parchment transition-colors border-b border-ink/[0.04]"
      >
        Cancelar suscripción
      </button>
    )}
    <button
      onClick={onLogout}
      className="w-full text-left px-5 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
    >
      Cerrar sesión
    </button>
  </div>
```

- [ ] **Step 4: Correr tests de Sidebar — todos deben pasar**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```

Resultado esperado: `13 passed` (9 anteriores + 4 nuevos)

- [ ] **Step 5: Añadir tests a `PatientSidebar.test.jsx`**

Añadir al final de `frontend/src/components/PatientSidebar.test.jsx`:

```jsx
describe('PatientSidebar — cancel subscription button', () => {
  it('no muestra "Cancelar suscripción" cuando canCancelSubscription=false', () => {
    render(<PatientSidebar {...defaultProps} canCancelSubscription={false} />)
    expect(screen.queryByRole('button', { name: /cancelar suscripción/i })).not.toBeInTheDocument()
  })

  it('muestra "Cancelar suscripción" cuando canCancelSubscription=true', () => {
    render(<PatientSidebar {...defaultProps} canCancelSubscription={true} onCancelSubscription={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cancelar suscripción/i })).toBeInTheDocument()
  })

  it('click en "Cancelar suscripción" llama onCancelSubscription', async () => {
    const onCancelSubscription = vi.fn()
    render(<PatientSidebar {...defaultProps} canCancelSubscription={true} onCancelSubscription={onCancelSubscription} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar suscripción/i }))
    expect(onCancelSubscription).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 6: Correr tests de PatientSidebar — nuevos tests deben fallar**

```bash
cd frontend && npx vitest run src/components/PatientSidebar.test.jsx
```

Resultado esperado: los 3 tests nuevos fallan, los existentes pasan.

- [ ] **Step 7: Actualizar `PatientSidebar.jsx`**

Cambiar la firma y el footer en `frontend/src/components/PatientSidebar.jsx`:

```jsx
// Actualizar destructuring de props (líneas 122-134):
export default function PatientSidebar({
  conversations,
  selectedPatientId,
  onSelectConversation,
  onDeleteConversation,
  onNewPatient,
  isCreatingPatient,
  newPatientName,
  onNewPatientNameChange,
  onSavePatient,
  onCancelNewPatient,
  onLogout,
  draftPatientIds = new Set(),
  canCancelSubscription = false,
  onCancelSubscription,
}) {
```

```jsx
  // Reemplazar el footer (líneas 219-227):
  {/* Logout — pinned to very bottom */}
  <div className="border-t border-black/[0.07] flex-shrink-0">
    {canCancelSubscription && (
      <button
        onClick={onCancelSubscription}
        className="w-full text-left px-4 py-[10px] text-[12px] text-gray-400 hover:text-gray-600 hover:bg-parchment transition-colors border-b border-black/[0.04]"
      >
        Cancelar suscripción
      </button>
    )}
    <button
      onClick={onLogout}
      className="w-full text-left px-4 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
    >
      Cerrar sesión
    </button>
  </div>
```

- [ ] **Step 8: Correr todos los tests de los sidebars**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx src/components/PatientSidebar.test.jsx
```

Resultado esperado: todos en verde.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.test.jsx frontend/src/components/PatientSidebar.jsx frontend/src/components/PatientSidebar.test.jsx
git commit -m "feat(billing): add cancel subscription button to mobile and desktop sidebars"
```

---

## Task 5: Frontend — `App.jsx` + `BillingScreen.jsx`

**Files:**
- Modify: `frontend/src/App.jsx` (estado, handler, imports, props, modal)
- Modify: `frontend/src/components/BillingScreen.jsx` (estado post-cancelación)

- [ ] **Step 1: Añadir import en `App.jsx`**

En el bloque de imports de `frontend/src/App.jsx`, añadir junto a los otros imports de componentes:

```jsx
import CancelSubscriptionModal from './components/CancelSubscriptionModal.jsx';
```

Y en los imports de `api`:

```jsx
// Añadir cancelSubscription a la línea que importa de './api'
import { ..., cancelSubscription } from './api'
```

- [ ] **Step 2: Añadir estado en `App.jsx`**

Después de `const [billingStatus, setBillingStatus] = useState(null);` (línea 147), añadir:

```jsx
const [showCancelModal, setShowCancelModal] = useState(false);
const [cancelLoading, setCancelLoading] = useState(false);
const [cancelError, setCancelError] = useState('');
```

- [ ] **Step 3: Añadir handler `handleCancelSubscription` en `App.jsx`**

Después de la función `handleLogout` (alrededor de línea 251), añadir:

```jsx
async function handleCancelSubscription() {
  setCancelLoading(true);
  setCancelError('');
  try {
    await cancelSubscription();
    setShowCancelModal(false);
    setBillingStatus(prev => ({ ...prev, cancel_at_period_end: true }));
  } catch (err) {
    setCancelError(err.message || 'Error al cancelar. Intenta de nuevo.');
  } finally {
    setCancelLoading(false);
  }
}
```

- [ ] **Step 4: Añadir prop `canCancelSubscription` y conectar sidebars en `App.jsx`**

Añadir esta variable derivada junto a otras variables computadas en el render (busca el bloque donde se usa `billingStatus`):

```jsx
const canCancelSubscription =
  billingStatus?.status === 'active' && !billingStatus?.cancel_at_period_end;
```

En el componente `<Sidebar ...>` (alrededor de línea 749-757), añadir las dos nuevas props:

```jsx
<Sidebar
  open={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  conversations={conversations}
  onSelectConversation={handleSelectConversation}
  onDeleteConversation={handleDeleteConversation}
  onLogout={handleLogout}
  draftPatientIds={draftPatientIds}
  canCancelSubscription={canCancelSubscription}
  onCancelSubscription={() => setShowCancelModal(true)}
/>
```

En el componente `<PatientSidebar ...>` (alrededor de línea 763-776), añadir:

```jsx
<PatientSidebar
  conversations={conversations}
  selectedPatientId={selectedPatientId}
  onSelectConversation={handleSelectConversation}
  onDeleteConversation={handleDeleteConversation}
  onNewPatient={() => setIsCreatingPatient(true)}
  isCreatingPatient={isCreatingPatient}
  newPatientName={newPatientName}
  onNewPatientNameChange={(e) => setNewPatientName(e.target.value)}
  onSavePatient={handleSavePatient}
  onCancelNewPatient={() => { setIsCreatingPatient(false); setNewPatientName(''); }}
  onLogout={handleLogout}
  draftPatientIds={draftPatientIds}
  canCancelSubscription={canCancelSubscription}
  onCancelSubscription={() => setShowCancelModal(true)}
/>
```

- [ ] **Step 5: Añadir el modal en el JSX de `App.jsx`**

Cerca del `<PatientInviteModal ...>` (alrededor de línea 731), añadir:

```jsx
<CancelSubscriptionModal
  open={showCancelModal}
  periodEnd={billingStatus?.current_period_end}
  loading={cancelLoading}
  error={cancelError}
  onConfirm={handleCancelSubscription}
  onClose={() => { setShowCancelModal(false); setCancelError(''); }}
/>
```

- [ ] **Step 6: Actualizar `BillingScreen.jsx` — estado post-cancelación**

En `frontend/src/components/BillingScreen.jsx`, reemplazar el bloque `{status?.status === 'active' && (...)}` (líneas 74-86):

```jsx
{status?.status === 'active' && (
  <>
    {status.cancel_at_period_end ? (
      <>
        <p className="text-sm font-medium text-ink-secondary">
          Plan Pro — Activo hasta{' '}
          {status.current_period_end &&
            new Date(status.current_period_end).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
        </p>
        <p className="text-sm text-ink-tertiary">
          Tu suscripción no se renovará al término del período.
        </p>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-sage">Plan Pro — Activo</p>
        {status.current_period_end && (
          <p className="text-sm text-ink-secondary">
            Próximo cobro:{' '}
            {new Date(status.current_period_end).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
        <p className="text-sm text-ink-tertiary">
          Para cancelar tu plan, usa el menú lateral.
        </p>
      </>
    )}
  </>
)}
```

- [ ] **Step 7: Correr suite completa de tests del frontend**

```bash
cd frontend && npx vitest run
```

Resultado esperado: todos los tests existentes siguen en verde, sin errores nuevos.

- [ ] **Step 8: Commit final**

```bash
git add frontend/src/App.jsx frontend/src/components/BillingScreen.jsx
git commit -m "feat(billing): wire cancel subscription modal into App and update BillingScreen post-cancel state"
```

---

## Verificación manual

Después de completar todos los tasks, verificar en el navegador:

1. Iniciar sesión con cuenta en estado `active`
2. Abrir sidebar (mobile) → debe aparecer "Cancelar suscripción" encima de "Cerrar sesión"
3. En desktop → igual en el sidebar izquierdo
4. Hacer clic → modal aparece con la fecha del período actual
5. Click "Conservar mi plan" → modal se cierra, nada cambia
6. Click "Sí, cancelar" → spinner → modal se cierra → botón desaparece de ambos sidebars
7. Abrir BillingScreen → muestra "Activo hasta [fecha]" + "Tu suscripción no se renovará…"
8. Recargar página → el estado persiste (viene del backend via `GET /billing/status`)
