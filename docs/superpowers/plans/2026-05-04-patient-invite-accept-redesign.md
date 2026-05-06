# PatientInviteAccept — Rediseño UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el diseño beige/experimental de `PatientInviteAccept` por un layout mobile-first con header sage + formulario blanco; en desktop un split screen sage/blanco.

**Architecture:** Un solo archivo JSX reescrito. Toda la lógica (validación, API call, redirección) permanece igual — solo cambia el JSX/Tailwind. Mobile-first con breakpoint `md:` para el split screen.

**Tech Stack:** React 18, Tailwind CSS (CDN), diseño system SyqueX (sage `#5a9e8a`, ink `#18181b`, surface `#f4f4f2`).

---

## File Map

| Archivo | Acción |
|---------|--------|
| `frontend/src/pages/PatientInviteAccept.jsx` | Reescritura completa del JSX — lógica intacta |

---

### Task 1: Reescribir PatientInviteAccept.jsx con el nuevo diseño

**Files:**
- Modify: `frontend/src/pages/PatientInviteAccept.jsx`

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

Conserva las importaciones y toda la lógica del componente (`useState`, `handleSubmit`, validaciones, API call). Solo reescribe el JSX retornado:

```jsx
import { useState } from 'react';
import { navigateTo } from '../auth';
import { acceptPatientInvite } from '../patientApi';

export default function PatientInviteAccept({ inviteToken, setScreen }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await acceptPatientInvite(inviteToken, password);
      setSuccess(true);
      setTimeout(() => {
        navigateTo('/portal');
        setScreen('patient-portal');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#5a9e8a] px-5 py-4 max-w-sm w-full flex items-center gap-4">
          <svg className="w-5 h-5 text-[#5a9e8a] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-[14px] font-semibold text-[#5a9e8a] font-serif">¡Cuenta activada!</p>
            <p className="text-[12px] text-[#9ca3af] mt-0.5">Redirigiendo a tu portal…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex flex-col md:flex-row font-sans">

      {/* Sage panel — header en móvil, columna izquierda en desktop */}
      <div className="bg-[#5a9e8a] px-6 py-8 md:w-[42%] md:min-h-screen md:flex md:flex-col md:justify-between">
        <div>
          {/* Logo mark */}
          <div className="flex items-center gap-2.5 mb-6">
            <span className="text-white text-[15px] font-bold tracking-tight">SyqueX</span>
          </div>
          <h1 className="text-white text-[22px] font-bold font-serif leading-snug mb-2">
            Tu psicólogo te invitó
          </h1>
          <p className="text-white/70 text-[13px] leading-relaxed">
            Aquí verás los resúmenes de tus sesiones en un espacio privado.
          </p>
        </div>
        {/* Privacy badge — solo desktop */}
        <div className="hidden md:flex items-center gap-2 mt-8 pt-6 border-t border-white/[0.18]">
          <svg className="w-3.5 h-3.5 text-white/55 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-white/55 text-[11px]">Datos encriptados</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 bg-white px-6 py-8 md:flex md:items-center md:justify-center">
        <div className="w-full max-w-sm">
          <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-6">
            Crea tu contraseña
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
              />
              <p className="text-[11px] text-[#9ca3af] mt-1.5 pl-0.5">Mínimo 8 caracteres</p>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                Confirmar contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[9px] font-bold">!</span>
                </div>
                <p className="text-[12px] text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creando cuenta…' : 'Activar cuenta →'}
            </button>
          </form>

          {/* Privacy note — solo móvil */}
          <div className="flex items-center justify-center gap-1.5 mt-6 md:hidden">
            <svg className="w-3 h-3 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[11px] text-[#9ca3af]">Datos encriptados · Solo tú los ves</span>
          </div>
        </div>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Verificar visualmente en móvil**

Con el dev server corriendo (`.\start-frontend.ps1`), navega a:
```
http://localhost:5173/portal/invite?token=test
```
Abre DevTools → Toggle Device Toolbar (Ctrl+Shift+M) → selecciona iPhone 12 Pro (390px).

Verificar:
- Fondo `#f4f4f2` (gris neutro, sin beige)
- Header sage visible con logo + título serif + subtítulo
- Formulario blanco debajo con labels sage uppercase
- Nota de privacidad al fondo del formulario
- Sin sombras ni tarjetas flotantes sobre fondo beige

- [ ] **Step 3: Verificar visualmente en desktop**

En el mismo DevTools, cambia a vista desktop (≥768px).

Verificar:
- Split screen: panel sage a la izquierda (≈42%), formulario blanco a la derecha
- Badge de privacidad visible al fondo del panel sage
- Privacy note del móvil NO visible en desktop
- Formulario centrado verticalmente en el panel derecho

- [ ] **Step 4: Verificar estados interactivos**

En la misma URL de prueba:
1. Escribe contraseñas distintas → clic "Activar cuenta" → banner rojo `bg-[#fef2f2]` con `!` circular y mensaje de error
2. Contraseñas menores a 8 chars → banner rojo con "La contraseña debe tener al menos 8 caracteres"
3. (Opcional, con token válido) Activar cuenta correctamente → banner sage `bg-white border-[#5a9e8a]` con checkmark y "¡Cuenta activada!"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PatientInviteAccept.jsx
git commit -m "feat: redesign PatientInviteAccept — sage header, mobile-first split screen"
```
