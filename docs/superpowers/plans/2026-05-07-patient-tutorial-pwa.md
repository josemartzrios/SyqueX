# Patient Portal — Tutorial PWA "Añadir a pantalla de inicio"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón `?` al portal del paciente que abre un tutorial de un solo slide guiando al paciente a añadir `https://app.syquex.mx/portal` a su pantalla de inicio. El tutorial aparece automáticamente en la primera visita.

**Architecture:** Extendemos `TutorialModal` con un prop `patientMode` que reemplaza los 5 slides del psicólogo por un único slide PWA con instrucciones siempre manuales (no se usa el prompt nativo de Chrome para evitar instalar la app en `/` en vez de `/portal`). `PatientPortal` importa `TutorialModal`, gestiona el estado `tutorialVisible`, y lo auto-muestra si `patient_tutorial_done` no está en localStorage.

**Tech Stack:** React 18, Tailwind CSS (CDN), localStorage, `usePWAInstall` hook existente.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/components/TutorialModal.jsx` | Nuevo prop `patientMode`; `PWASlide` muestra URL y fuerza instrucciones manuales |
| `frontend/src/pages/PatientPortal.jsx` | Estado tutorial, auto-show, botón `?`, render del modal |

---

## Task 1: Extender `TutorialModal` con `patientMode`

**Files:**
- Modify: `frontend/src/components/TutorialModal.jsx`

- [ ] **Step 1: Añadir `patientMode` prop a `PWASlide` y mostrar la URL del portal**

Localiza `function PWASlide({ forceBrowser, forceInstallable, onTriggerInstall, onDone })` (línea 140) y reemplaza por:

```jsx
function PWASlide({ forceBrowser, forceInstallable, onTriggerInstall, onDone, patientMode }) {
  const pwa = usePWAInstall()
  const browser = forceBrowser ?? pwa.browser
  // En patientMode nunca activamos el prompt nativo: instalaría la app en "/" no en "/portal"
  const isInstallable = patientMode ? false : (forceInstallable ?? pwa.isInstallable)
  const triggerInstall = onTriggerInstall ?? pwa.triggerInstall

  useEffect(() => {
    localStorage.setItem('syquex_pwa_prompted', 'true')
  }, [])

  const handleInstall = async () => {
    await triggerInstall()
    onDone()
  }

  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">📲</div>
        <p className="text-[15px] font-semibold text-[#18181b] mb-1">
          {patientMode ? 'Accede siempre desde tu celular' : 'Instala la app en tu celular'}
        </p>
        <p className="text-[12px] text-[#9ca3af]">Acceso directo desde tu pantalla de inicio</p>
      </div>

      {patientMode && (
        <div className="bg-[#f4f4f2] rounded-xl px-3 py-2.5 mb-4 text-center">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide mb-0.5">Tu portal</p>
          <p className="text-[13px] font-mono font-semibold text-[#5a9e8a] break-all select-all">
            app.syquex.mx/portal
          </p>
        </div>
      )}

      {browser === 'safari' && <SafariInstructions onDone={onDone} />}
      {browser === 'chrome' && <ChromeInstructions isInstallable={isInstallable} onInstall={handleInstall} onDone={onDone} />}
      {browser === 'other' && <FallbackInstructions onDone={onDone} />}
    </div>
  )
}
```

- [ ] **Step 2: Añadir `patientMode` al componente principal `TutorialModal`**

Localiza `export default function TutorialModal({` (línea 169) y reemplaza el bloque de props y lógica de slides/handleClose:

```jsx
export default function TutorialModal({
  visible,
  onClose,
  isMobile,
  noteFormat,
  patientMode,
  // test-only escape hatches
  forceBrowser,
  forceInstallable,
  onTriggerInstall,
}) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (visible) setStep(0)
  }, [visible])

  if (!visible) return null

  const slides = patientMode
    ? [{ pwa: true }]
    : isMobile ? [...SLIDES_DESKTOP, { pwa: true }] : SLIDES_DESKTOP

  const total = slides.length
  const current = slides[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  const handleClose = () => {
    const key = patientMode ? 'patient_tutorial_done' : 'syquex_tutorial_done'
    localStorage.setItem(key, 'true')
    onClose()
  }

  const handleNext = () => {
    if (isLast) { handleClose(); return }
    setStep((s) => s + 1)
  }

  const handlePrev = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,24,27,0.55)' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">

        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[#9ca3af] uppercase tracking-wide font-medium">
            {step + 1} de {total}
          </span>
          <button
            onClick={handleClose}
            aria-label="Cerrar tutorial"
            className="text-[#d1d5db] hover:text-[#9ca3af] transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <ProgressBar current={step} total={total} />

        {!current.pwa && (
          <div className="text-center">
            <div className="text-3xl mb-2">{current.icon}</div>
            <p className="text-[15px] font-semibold text-[#18181b] mb-2">{current.title}</p>
            <p className="text-[13px] text-[#6b7280] leading-relaxed">{current.body}</p>
            {current.flow && <FlowDiagram />}
          </div>
        )}

        {current.pwa && (
          <PWASlide
            forceBrowser={forceBrowser}
            forceInstallable={forceInstallable}
            onTriggerInstall={onTriggerInstall}
            onDone={handleClose}
            patientMode={patientMode}
          />
        )}

        <div className="flex items-center justify-between mt-5">
          {!isFirst ? (
            <button onClick={handlePrev} className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
              ← Anterior
            </button>
          ) : <div />}
          <button
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-[#5a9e8a] text-white text-[13px] font-medium hover:bg-[#4e8c7a] transition-colors"
          >
            {isLast ? 'Finalizar' : 'Siguiente →'}
          </button>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que el tutorial del psicólogo sigue funcionando**

Arranca el frontend:
```powershell
.\start-frontend.ps1
```
Abre `http://localhost:5173`, borra `syquex_tutorial_done` de localStorage (DevTools → Application → Local Storage), recarga y comprueba que el tutorial del psicólogo sigue mostrando 5 slides normalmente.

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\josma\OneDrive\Escritorio\SyqueX"
git add frontend/src/components/TutorialModal.jsx
git commit -m "feat: add patientMode prop to TutorialModal for single PWA slide"
```

---

## Task 2: Integrar el tutorial en `PatientPortal`

**Files:**
- Modify: `frontend/src/pages/PatientPortal.jsx`

- [ ] **Step 1: Añadir import de `TutorialModal` y estado `tutorialVisible`**

Reemplaza las dos primeras líneas del archivo:

```jsx
import { useState, useEffect } from 'react';
import { clearPatientToken, getPatientSummaries, getPatientSummaryDetail } from '../patientApi';
import { navigateTo } from '../auth';
import TutorialModal from '../components/TutorialModal';
```

Dentro de `export default function PatientPortal()`, añade el estado justo después de la declaración de estados existentes (después de `detailError`):

```jsx
const [tutorialVisible, setTutorialVisible] = useState(false);
```

- [ ] **Step 2: Añadir `useEffect` de auto-show en primera visita**

Añade este `useEffect` justo después del que maneja el `overflow` del body (tras el `useEffect` de línea 13):

```jsx
useEffect(() => {
  if (localStorage.getItem('patient_tutorial_done') !== 'true') {
    setTutorialVisible(true);
  }
}, []);
```

- [ ] **Step 3: Añadir botón `?` en el header**

Localiza el botón de cerrar sesión en el header:

```jsx
<button
  onClick={handleLogout}
  className="text-sm font-medium text-[#9ca3af] hover:text-[#18181b] transition-colors"
>
  Cerrar sesión
</button>
```

Reemplázalo por:

```jsx
<div className="flex items-center gap-3">
  <button
    onClick={() => setTutorialVisible(true)}
    className="w-8 h-8 rounded-full border border-[#18181b]/[0.07] text-[#9ca3af] hover:text-[#18181b] hover:bg-[#18181b]/[0.05] transition-colors flex items-center justify-center flex-shrink-0"
    aria-label="Abrir tutorial"
  >
    ?
  </button>
  <button
    onClick={handleLogout}
    className="text-sm font-medium text-[#9ca3af] hover:text-[#18181b] transition-colors"
  >
    Cerrar sesión
  </button>
</div>
```

- [ ] **Step 4: Añadir `<TutorialModal>` al render**

Añade el modal justo antes del `</div>` final que cierra el componente (antes del `);` final, después del `</main>`):

```jsx
      <TutorialModal
        visible={tutorialVisible}
        onClose={() => setTutorialVisible(false)}
        isMobile={false}
        patientMode
      />
```

El archivo completo de `PatientPortal.jsx` al final debe tener esta estructura al final:

```jsx
    </main>

    <TutorialModal
      visible={tutorialVisible}
      onClose={() => setTutorialVisible(false)}
      isMobile={false}
      patientMode
    />
  </div>
);
```

- [ ] **Step 5: Verificar comportamiento completo**

Con el frontend corriendo (`http://localhost:5173`):

1. **Auto-show en primera visita:** Abre DevTools → Application → Local Storage → borra `patient_tutorial_done` si existe → navega a `/portal` (o simúlalo con `navigateTo('/portal')`) → el tutorial debe abrirse automáticamente.

2. **Contenido del slide:** El tutorial muestra `📲 Accede siempre desde tu celular`, la caja con `app.syquex.mx/portal`, e instrucciones según tu navegador (Safari: pasos con compartir; Chrome: pasos manuales; otro: fallback).

3. **No se repite:** Cierra el tutorial con "Finalizar" → recarga la página → el tutorial NO debe abrirse (verifica que `patient_tutorial_done = "true"` aparece en localStorage).

4. **Botón `?`:** El tutorial se abre al hacer clic en el botón `?` del header aunque `patient_tutorial_done` ya exista.

5. **Tutorial del psicólogo intacto:** Navega a `http://localhost:5173` (app del psicólogo) → borra `syquex_tutorial_done` → verifica que el tutorial del psicólogo muestra 5 slides normalmente.

- [ ] **Step 6: Commit**

```powershell
cd "C:\Users\josma\OneDrive\Escritorio\SyqueX"
git add frontend/src/pages/PatientPortal.jsx
git commit -m "feat: add PWA add-to-homescreen tutorial to patient portal"
```
