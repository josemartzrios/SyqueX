# Upcoming Booking Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar la próxima cita agendada del paciente en su portal, con la capacidad de cancelarla mediante confirmación inline.

**Architecture:** Nuevo componente presentacional `UpcomingBookingCard` que recibe `booking`, `onCancel`, `canceling` y `error` como props. `PatientPortal` carga el `upcoming_booking` del endpoint existente al montar, gestiona el estado de cancelación y renderiza la tarjeta encima del CTA "Agendar cita".

**Tech Stack:** React 18, Tailwind CSS (CDN), Vitest + @testing-library/react, Vite.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `frontend/src/components/UpcomingBookingCard.jsx` | Crear | Componente presentacional: muestra cita, maneja confirmación inline |
| `frontend/src/components/UpcomingBookingCard.test.jsx` | Crear | Tests unitarios del componente |
| `frontend/src/pages/PatientPortal.jsx` | Modificar | Añadir estados, useEffect, handler, renderizado de la tarjeta |

---

## Task 1: Crear UpcomingBookingCard con tests (TDD)

**Files:**
- Create: `frontend/src/components/UpcomingBookingCard.test.jsx`
- Create: `frontend/src/components/UpcomingBookingCard.jsx`

---

- [ ] **Step 1.1: Escribir el archivo de tests completo**

Crear `frontend/src/components/UpcomingBookingCard.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UpcomingBookingCard from './UpcomingBookingCard';

const mockBooking = {
  id: 'slot-123',
  slot_date: '2026-05-22',
  start_time: '10:00:00',
  duration_minutes: 60,
};

describe('UpcomingBookingCard', () => {
  it('no renderiza nada cuando booking es null', () => {
    const { container } = render(
      <UpcomingBookingCard booking={null} onCancel={vi.fn()} canceling={false} error={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra fecha, hora y duración formateadas', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error={null} />
    );
    expect(screen.getByText(/22 de mayo/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00 am · 60 min/i)).toBeInTheDocument();
  });

  it('muestra confirmación inline al presionar Cancelar cita', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    expect(screen.getByText(/¿Confirmar cancelación\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sí, cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no, regresar/i })).toBeInTheDocument();
  });

  it('llama onCancel con el id correcto al confirmar', () => {
    const onCancel = vi.fn();
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={onCancel} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }));
    expect(onCancel).toHaveBeenCalledWith('slot-123');
  });

  it('no llama onCancel al abortar la confirmación', () => {
    const onCancel = vi.fn();
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={onCancel} canceling={false} error={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar cita del/i }));
    fireEvent.click(screen.getByRole('button', { name: /no, regresar/i }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cancelar cita del/i })).toBeInTheDocument();
  });

  it('muestra spinner y deshabilita botón cuando canceling es true', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={true} error={null} />
    );
    expect(screen.getByText(/cancelando…/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar cita del/i })).toBeDisabled();
  });

  it('muestra el error cuando se recibe el prop error', () => {
    render(
      <UpcomingBookingCard booking={mockBooking} onCancel={vi.fn()} canceling={false} error="No se pudo cancelar." />
    );
    expect(screen.getByText(/No se pudo cancelar\./i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.2: Verificar que los tests fallan (componente no existe)**

```bash
cd frontend && npx vitest run src/components/UpcomingBookingCard.test.jsx
```

Salida esperada: `FAIL` — `Cannot find module './UpcomingBookingCard'`

---

- [ ] **Step 1.3: Crear el componente UpcomingBookingCard**

Crear `frontend/src/components/UpcomingBookingCard.jsx`:

```jsx
import { useState } from 'react';

export default function UpcomingBookingCard({ booking, onCancel, canceling, error }) {
  const [confirming, setConfirming] = useState(false);

  if (!booking) return null;

  const formattedDate = new Date(booking.slot_date + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const [h, m] = booking.start_time.split(':');
  const formattedTime = `${h}:${m} ${parseInt(h, 10) < 12 ? 'am' : 'pm'}`;

  const handleCancelClick = () => setConfirming(true);
  const handleConfirm = () => { setConfirming(false); onCancel(booking.id); };
  const handleAbort = () => setConfirming(false);

  return (
    <div className={`bg-white rounded-2xl border border-[#18181b]/[0.08] p-4 mb-3 transition-opacity${canceling ? ' opacity-50' : ''}`}>

      {/* Header: ícono + datos */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#c4935a]/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="#c4935a" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest text-[#c4935a] uppercase">
            Cita confirmada
          </span>
          <span className="text-sm font-semibold font-serif text-[#18181b] mt-0.5">
            {formattedDate}
          </span>
          <span className="text-xs text-[#9ca3af] mt-0.5">
            {formattedTime} · {booking.duration_minutes} min
          </span>
        </div>
      </div>

      {/* Acción */}
      {!confirming ? (
        <>
          <button
            onClick={handleCancelClick}
            disabled={canceling}
            aria-label={`Cancelar cita del ${formattedDate}`}
            className="w-full rounded-xl py-2.5 border border-red-200 text-red-400 hover:bg-red-50 transition-colors text-sm disabled:cursor-not-allowed"
          >
            {canceling ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full inline-block" />
                Cancelando…
              </span>
            ) : 'Cancelar cita'}
          </button>
          {error && (
            <p aria-live="polite" className="text-xs text-red-500 mt-2 text-center">
              ⚠ {error}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#18181b] text-center">¿Confirmar cancelación?</p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 rounded-xl py-2 border border-red-200 text-red-400 text-sm hover:bg-red-50 transition-colors"
            >
              Sí, cancelar
            </button>
            <button
              onClick={handleAbort}
              autoFocus
              className="flex-1 rounded-xl py-2 border border-[#18181b]/10 text-[#9ca3af] text-sm hover:bg-[#18181b]/[0.03] transition-colors"
            >
              No, regresar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 1.4: Verificar que todos los tests pasan**

```bash
cd frontend && npx vitest run src/components/UpcomingBookingCard.test.jsx
```

Salida esperada: `7 passed` — todos en verde.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/components/UpcomingBookingCard.jsx frontend/src/components/UpcomingBookingCard.test.jsx
git commit -m "feat: add UpcomingBookingCard component with tests"
```

---

## Task 2: Integrar UpcomingBookingCard en PatientPortal

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

---

- [ ] **Step 2.1: Actualizar los imports en PatientPortal.jsx**

Reemplazar la línea 2 actual:
```jsx
import { clearPatientToken, getPatientSummaries, getPatientSummaryDetail } from '../patientApi';
```

Por:
```jsx
import { clearPatientToken, getPatientSummaries, getPatientSummaryDetail, getPatientAvailability, cancelPatientBooking } from '../patientApi';
```

Y añadir en la línea 3 (después del import de patientApi):
```jsx
import UpcomingBookingCard from '../components/UpcomingBookingCard';
```

- [ ] **Step 2.2: Añadir los tres estados nuevos**

Después de la línea con `const [bookingSuccess, setBookingSuccess] = useState(false);` (actualmente la última declaración de estado), añadir:

```jsx
const [upcomingBooking, setUpcomingBooking]   = useState(null);
const [cancelingBooking, setCancelingBooking] = useState(false);
const [cancelError, setCancelError]           = useState(null);
```

- [ ] **Step 2.3: Añadir useEffect para cargar upcoming_booking al montar**

Después del `useEffect` que llama `loadSummaries()`, añadir:

```jsx
useEffect(() => {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  getPatientAvailability(month)
    .then(data => setUpcomingBooking(data.upcoming_booking ?? null))
    .catch(() => {});
}, []);
```

- [ ] **Step 2.4: Añadir el handler de cancelación**

Después de la función `loadSummaries`, añadir:

```jsx
const handleCancelBooking = async (slotId) => {
  setCancelingBooking(true);
  setCancelError(null);
  try {
    await cancelPatientBooking(slotId);
    setUpcomingBooking(null);
  } catch (err) {
    setCancelError(err.message || 'No se pudo cancelar. Intenta de nuevo.');
  } finally {
    setCancelingBooking(false);
  }
};
```

- [ ] **Step 2.5: Insertar UpcomingBookingCard y actualizar el CTA**

Localizar el comentario `{/* Booking CTA — explicit, always visible */}` y reemplazar el bloque completo del botón CTA (desde ese comentario hasta su `</button>` de cierre) con:

```jsx
{/* Próxima cita del paciente */}
<UpcomingBookingCard
  booking={upcomingBooking}
  onCancel={handleCancelBooking}
  canceling={cancelingBooking}
  error={cancelError}
/>

{/* Booking CTA — explicit, always visible */}
<button
  onClick={() => setBookingModalOpen(true)}
  className="w-full mb-5 flex items-center gap-3 bg-[#5a9e8a] hover:bg-[#4a8271] active:scale-[0.98] text-white rounded-xl px-4 py-3 transition-all"
>
  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  </div>
  <div className="text-left">
    <div className="text-sm font-semibold leading-tight">
      {upcomingBooking ? 'Agendar otra cita' : 'Agendar cita'}
    </div>
    <div className="text-[11px] text-white/70 leading-tight mt-0.5">
      Ver disponibilidad
    </div>
  </div>
  <svg className="w-4 h-4 ml-auto text-white/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
  </svg>
</button>
```

- [ ] **Step 2.6: Verificar que los tests existentes siguen pasando**

```bash
cd frontend && npx vitest run
```

Salida esperada: todos los tests en verde, sin regresiones.

- [ ] **Step 2.7: Commit final**

```bash
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat: show upcoming booking in patient portal with cancel action"
```

---

## Verificación manual post-implementación

1. Iniciar backend: `.\start-backend.ps1`
2. Iniciar frontend: `.\start-frontend.ps1`
3. Abrir `http://localhost:5173/portal` con un paciente que tenga una cita agendada
4. Verificar que la tarjeta aparece encima del CTA con fecha, hora y duración
5. Verificar que el CTA dice "Agendar otra cita"
6. Presionar "Cancelar cita" → debe aparecer confirmación inline
7. Presionar "No, regresar" → debe volver al botón original sin llamar a la API
8. Presionar "Cancelar cita" → "Sí, cancelar" → tarjeta desaparece, CTA vuelve a "Agendar cita"
9. Abrir portal sin cita agendada → tarjeta no debe renderizarse
