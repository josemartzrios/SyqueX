# Tutorial Onboarding + PWA Install — Spec

**Fecha:** 2026-04-30  
**Estado:** Aprobado para implementación

---

## Objetivo

Guiar al psicólogo recién registrado a través del flujo principal de SyqueX inmediatamente después de configurar su formato de nota (SOAP o personalizada), y ofrecer al usuario mobile la opción de instalar la app como PWA en su pantalla de inicio.

---

## Decisiones de diseño

| Pregunta | Decisión |
|---|---|
| ¿Cuándo aparece? | Post-onboarding + botón "?" siempre disponible |
| ¿Formato? | Modal con slides (overlay centrado, barra de progreso) |
| ¿PWA integration? | Slide final dentro del tutorial, solo mobile |
| ¿Detección de navegador? | Auto-detect (Safari/iOS vs Chrome/Android) |
| ¿Estado persistido? | localStorage únicamente, sin cambios de backend |
| ¿Botón "?" en mobile? | Topbar, a la derecha del botón "+ Nuevo" |
| ¿Botón "?" en desktop? | PatientHeader, extremo derecho después del control Sesión/Revisión |

---

## Slides del tutorial

**Desktop:** 4 slides  
**Mobile:** 5 slides (incluye slide PWA)

| # | Título | Contenido | Plataforma |
|---|---|---|---|
| 1 | Bienvenido a SyqueX | Diagrama simple del flujo: Paciente → Dictar → Nota IA → Confirmar | Ambas |
| 2 | Crea tu primer paciente | Señala el botón "+" junto a "Pacientes" en el sidebar. Cada paciente tiene su propio historial de sesiones y notas. | Ambas |
| 3 | Dicta o escribe tus apuntes | Muestra el panel de dictado. El usuario escribe libremente — sin estructura — y la IA organiza la nota. | Ambas |
| 4 | Revisa y confirma la nota | Muestra la nota generada (SOAP o custom). Se puede editar inline antes de confirmar. Queda guardada en el expediente. | Ambas |
| 5 | Instala la app en tu celular | Instrucciones PWA auto-detectadas por navegador. | **Solo mobile** |

---

## Slide 5 — PWA Install (mobile only)

### Detección de navegador

```js
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const isChrome = /CriOS|Chrome/.test(navigator.userAgent) && !isIOS
```

### Safari / iOS
Instrucciones manuales en 3 pasos:
1. Toca el ícono **Compartir** ⎙ en la barra inferior
2. Selecciona **"Agregar a inicio"**
3. Toca **"Agregar"** ✓

### Chrome / Android
Usa el evento nativo `beforeinstallprompt` capturado por `usePWAInstall`:
- Muestra botón "Instalar" que dispara `prompt()`
- Si el evento no está disponible (ya instalada o no soportado), muestra instrucciones manuales

### Fallback
Si no se detecta ni Safari ni Chrome, muestra ambos flujos como dos bloques compactos.

### Acciones del slide
- **"Agregar a inicio"** / **"Instalar"** — ejecuta el prompt o muestra pasos
- **"Ya la instalé ✓"** — avanza al siguiente paso (fin del tutorial)
- **"Omitir"** — cierra el tutorial normalmente

---

## Componentes

### `TutorialModal.jsx` (nuevo)

```
Props:
  visible: boolean
  onClose: () => void
  isMobile: boolean        // determina si muestra slide 5
  noteFormat: 'soap' | 'custom'

Estado interno:
  currentStep: number (0-indexed)
  
Comportamiento:
  - Renderiza overlay z-50 con backdrop rgba(24,24,27,0.55)
  - Muestra barra de progreso (5 segmentos en mobile, 4 en desktop)
  - Navega con "← Anterior" / "Siguiente →"
  - Último paso: botón "Finalizar" en lugar de "Siguiente"
  - Botón ✕ cierra y persiste syquex_tutorial_done
```

### `usePWAInstall.js` (nuevo)

```
Returns:
  deferredPrompt: BeforeInstallPromptEvent | null
  isInstallable: boolean
  triggerInstall: () => Promise<void>
  browser: 'safari' | 'chrome' | 'other'
  isMobile: boolean

Comportamiento:
  - Escucha beforeinstallprompt, guarda el evento
  - Detecta navegador via userAgent
  - triggerInstall() llama prompt() y espera userChoice
```

### `manifest.json` (nuevo en `/frontend/public/`)

```json
{
  "name": "SyqueX",
  "short_name": "SyqueX",
  "description": "Asistente clínico para psicólogos",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#5a9e8a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Íconos requeridos:** `/frontend/public/icons/icon-192.png` y `icon-512.png`  
Fondo blanco `#ffffff`, logo SyqueX centrado sobre sage `#5a9e8a`.

---

## Cambios en archivos existentes

### `App.jsx`

```js
// Estado nuevo
const [tutorialVisible, setTutorialVisible] = useState(false)

// Activación post-onboarding (donde ya se setea onboardingCompleted)
// Después de localStorage.setItem('syquex_onboarding_done', 'true'):
setTutorialVisible(true)

// Render — junto a los demás overlays/modals
<TutorialModal
  visible={tutorialVisible}
  onClose={() => setTutorialVisible(false)}
  isMobile={window.innerWidth < 768}
  noteFormat={noteFormat}
/>

// Botón "?" en topbar mobile (dentro del header existente, después del botón Nuevo)
<button onClick={() => setTutorialVisible(true)} ...>?</button>
```

### `PatientHeader.jsx`

```js
// Prop nueva
onOpenTutorial: (() => void) | null  // default: null

// En el header desktop, después del segmented control:
{onOpenTutorial && (
  <button onClick={onOpenTutorial} className="w-6 h-6 rounded-full bg-[#5a9e8a] text-white ...">
    ?
  </button>
)}
```

### `index.html`

```html
<!-- PWA -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#5a9e8a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="SyqueX" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

---

## Estado en localStorage

| Clave | Valor | Cuándo se setea |
|---|---|---|
| `syquex_tutorial_done` | `"true"` | Al cerrar (✕) o completar (Finalizar) el tutorial |
| `syquex_pwa_prompted` | `"true"` | Al llegar al slide 5 (independiente de si instala) |

**Botón "?":** llama directamente `setTutorialVisible(true)` sin leer ni modificar `syquex_tutorial_done`. La flag solo controla el auto-open post-onboarding, no el acceso manual.

---

## Comportamiento del botón "?"

| Estado | Acción |
|---|---|
| Tutorial no visto (`syquex_tutorial_done` ausente) | Auto-abre al terminar onboarding |
| Botón "?" presionado | Siempre abre el tutorial desde el paso 1, sin importar el valor de `syquex_tutorial_done` |
| Cerrar con ✕ | Persiste `syquex_tutorial_done`, no vuelve a abrir automáticamente |

---

## Ubicación del botón "?"

| Plataforma | Ubicación |
|---|---|
| **Mobile** | Topbar (`<header>` en `App.jsx`), a la derecha del botón "+ Nuevo" |
| **Desktop** | `PatientHeader`, extremo derecho después del control Sesión/Revisión |

---

## Archivos a crear / modificar

```
CREAR:
  frontend/src/components/TutorialModal.jsx
  frontend/src/hooks/usePWAInstall.js
  frontend/public/manifest.json
  frontend/public/icons/icon-192.png
  frontend/public/icons/icon-512.png

MODIFICAR:
  frontend/index.html          — meta tags PWA + link manifest
  frontend/src/App.jsx         — estado tutorialVisible, botón "?" mobile, render TutorialModal
  frontend/src/components/PatientHeader.jsx  — prop onOpenTutorial, botón "?" desktop

TESTS:
  frontend/src/components/TutorialModal.test.jsx
  frontend/src/hooks/usePWAInstall.test.js
```

---

## Fuera de scope

- Service worker / funcionamiento offline (solo manifest para install prompt)
- Notificaciones push
- Analytics de completion del tutorial
- Backend changes de cualquier tipo
