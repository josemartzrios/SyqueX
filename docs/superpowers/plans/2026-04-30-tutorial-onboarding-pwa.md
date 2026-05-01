# Tutorial Onboarding + PWA Install — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-step modal tutorial that auto-launches after onboarding and a 5th mobile-only slide that guides the user to install SyqueX as a PWA, plus a persistent "?" button to relaunch it.

**Architecture:** `TutorialModal.jsx` is a self-contained modal with internal step state; `usePWAInstall.js` isolates all `beforeinstallprompt` and browser-detection logic; `App.jsx` owns `tutorialVisible` state and triggers it after onboarding. PWA metadata lives in `manifest.json` + `index.html` meta tags.

**Tech Stack:** React 18, Vite, Tailwind (CDN), Vitest + @testing-library/react, jsdom, sharp (icon generation only)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `frontend/public/manifest.json` | Web App Manifest — branding, icons, display mode |
| Create | `frontend/public/icons/icon-192.png` | PWA icon 192×192 |
| Create | `frontend/public/icons/icon-512.png` | PWA icon 512×512 |
| Create | `scripts/make-icons.mjs` | One-time script to generate PNG icons from SVG |
| Modify | `frontend/index.html` | Add manifest link + Apple PWA meta tags |
| Create | `frontend/src/hooks/usePWAInstall.js` | `beforeinstallprompt` listener + browser detection |
| Create | `frontend/src/hooks/usePWAInstall.test.js` | Tests for hook |
| Create | `frontend/src/components/TutorialModal.jsx` | Modal with 5 slides, progress bar, PWA install UI |
| Create | `frontend/src/components/TutorialModal.test.jsx` | Tests for modal |
| Modify | `frontend/src/App.jsx` | `tutorialVisible` state, post-onboarding trigger, mobile "?" button, render modal |
| Modify | `frontend/src/components/PatientHeader.jsx` | `onOpenTutorial` prop, desktop "?" button |

---

## Task 1: PWA assets — manifest, icons, index.html

**Files:**
- Create: `scripts/make-icons.mjs`
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icons/icon-192.png` (generated)
- Create: `frontend/public/icons/icon-512.png` (generated)
- Modify: `frontend/index.html`

- [ ] **Step 1: Create the icon generation script**

Create `scripts/make-icons.mjs` (run from repo root):

```js
import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('frontend/public/icons', { recursive: true })

// Sage green background + white lightning bolt (matches OnboardingScreen logo)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#5a9e8a" rx="80"/>
  <path d="M288 80L160 288h112l-32 144 160-208H288L320 80z" fill="white"/>
</svg>`

const buf = Buffer.from(svg)
await sharp(buf).resize(192, 192).png().toFile('frontend/public/icons/icon-192.png')
await sharp(buf).resize(512, 512).png().toFile('frontend/public/icons/icon-512.png')
console.log('✓ Icons generated: icon-192.png, icon-512.png')
```

- [ ] **Step 2: Install sharp temporarily and generate icons**

```bash
cd frontend && npm install sharp --no-save && cd ..
node scripts/make-icons.mjs
```

Expected output:
```
✓ Icons generated: icon-192.png, icon-512.png
```

Verify: `ls frontend/public/icons/` shows `icon-192.png` and `icon-512.png`.

- [ ] **Step 3: Create manifest.json**

Create `frontend/public/manifest.json`:

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

- [ ] **Step 4: Add PWA meta tags to index.html**

Open `frontend/index.html`. Find the `<head>` block. Add after the existing `<meta name="viewport">` tag:

```html
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#5a9e8a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="SyqueX" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

- [ ] **Step 5: Verify manifest loads**

```bash
cd frontend && npm run dev
```

Open browser DevTools → Application → Manifest. Confirm it shows name "SyqueX", theme color `#5a9e8a`, and both icons.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/manifest.json frontend/public/icons/ frontend/index.html scripts/make-icons.mjs
git commit -m "feat: PWA manifest, icons, and meta tags"
```

---

## Task 2: usePWAInstall hook (TDD)

**Files:**
- Create: `frontend/src/hooks/usePWAInstall.js`
- Create: `frontend/src/hooks/usePWAInstall.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/usePWAInstall.test.js`:

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import usePWAInstall from './usePWAInstall'

describe('usePWAInstall', () => {
  const setUA = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

  afterEach(() => {
    setUA('')
    vi.restoreAllMocks()
  })

  describe('browser detection', () => {
    it('detects Safari on iOS', () => {
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('safari')
      expect(result.current.isMobile).toBe(true)
    })

    it('detects Chrome on Android', () => {
      setUA('Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('chrome')
      expect(result.current.isMobile).toBe(true)
    })

    it('detects Chrome on desktop and isMobile=false', () => {
      setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('chrome')
      expect(result.current.isMobile).toBe(false)
    })

    it('returns "other" for Firefox', () => {
      setUA('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('other')
    })
  })

  describe('beforeinstallprompt', () => {
    it('isInstallable is false initially', () => {
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.isInstallable).toBe(false)
    })

    it('isInstallable becomes true when beforeinstallprompt fires', () => {
      const { result } = renderHook(() => usePWAInstall())
      const fakePrompt = { preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue({ outcome: 'accepted' }) }
      act(() => {
        window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePrompt))
      })
      expect(result.current.isInstallable).toBe(true)
    })

    it('triggerInstall calls prompt() on deferred event', async () => {
      const { result } = renderHook(() => usePWAInstall())
      const fakePrompt = { preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue({ outcome: 'accepted' }) }
      act(() => {
        window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePrompt))
      })
      await act(async () => { await result.current.triggerInstall() })
      expect(fakePrompt.prompt).toHaveBeenCalledTimes(1)
    })

    it('triggerInstall is no-op when no deferred prompt', async () => {
      const { result } = renderHook(() => usePWAInstall())
      await expect(result.current.triggerInstall()).resolves.toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/hooks/usePWAInstall.test.js
```

Expected: All tests fail with "Cannot find module './usePWAInstall'".

- [ ] **Step 3: Implement usePWAInstall.js**

Create `frontend/src/hooks/usePWAInstall.js`:

```js
import { useState, useEffect } from 'react'

function detectBrowser() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isChromeiOS = /CriOS/.test(ua)           // Chrome on iOS
  const isChrome = /Chrome/.test(ua) || isChromeiOS
  const isSafari = isIOS && /Safari/.test(ua) && !isChromeiOS

  if (isSafari) return 'safari'
  if (isChrome) return 'chrome'
  return 'other'
}

function detectMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const browser = detectBrowser()
  const isMobile = detectMobile()

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const triggerInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setDeferredPrompt(null)
  }

  return {
    deferredPrompt,
    isInstallable: deferredPrompt !== null,
    triggerInstall,
    browser,
    isMobile,
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npx vitest run src/hooks/usePWAInstall.test.js
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePWAInstall.js frontend/src/hooks/usePWAInstall.test.js
git commit -m "feat: usePWAInstall hook — browser detection and beforeinstallprompt"
```

---

## Task 3: TutorialModal — slides 1-4, navigation, localStorage (TDD)

**Files:**
- Create: `frontend/src/components/TutorialModal.jsx`
- Create: `frontend/src/components/TutorialModal.test.jsx`

- [ ] **Step 1: Write failing tests for core modal**

Create `frontend/src/components/TutorialModal.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import TutorialModal from './TutorialModal'

const defaultProps = {
  visible: true,
  onClose: vi.fn(),
  isMobile: false,
  noteFormat: 'soap',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('TutorialModal', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(<TutorialModal {...defaultProps} visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders slide 1 content on open', () => {
    render(<TutorialModal {...defaultProps} />)
    expect(screen.getByText(/Bienvenido a SyqueX/i)).toBeInTheDocument()
    expect(screen.getByText('1 de 4')).toBeInTheDocument()
  })

  it('"Siguiente" advances to slide 2', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Crea tu primer paciente/i)).toBeInTheDocument()
    expect(screen.getByText('2 de 4')).toBeInTheDocument()
  })

  it('"Anterior" on slide 2 goes back to slide 1', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('← Anterior'))
    expect(screen.getByText(/Bienvenido a SyqueX/i)).toBeInTheDocument()
  })

  it('"Anterior" is hidden on slide 1', () => {
    render(<TutorialModal {...defaultProps} />)
    expect(screen.queryByText('← Anterior')).not.toBeInTheDocument()
  })

  it('shows "Finalizar" instead of "Siguiente" on last slide (desktop = slide 4)', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    // advance to slide 4
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
    expect(screen.queryByText('Siguiente →')).not.toBeInTheDocument()
  })

  it('closes and sets syquex_tutorial_done when ✕ is clicked', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Cerrar tutorial'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('closes and sets syquex_tutorial_done when "Finalizar" is clicked', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Finalizar'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('renders slide 3 — dictation content', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Dicta o escribe/i)).toBeInTheDocument()
  })

  it('renders slide 4 — note review content', () => {
    render(<TutorialModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Revisa y confirma/i)).toBeInTheDocument()
  })

  it('desktop: does NOT render slide 5 (only 4 slides)', () => {
    render(<TutorialModal {...defaultProps} isMobile={false} />)
    // On last slide (slide 4), "Finalizar" appears — not "Siguiente"
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
    expect(screen.getByText('4 de 4')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected: All tests fail with "Cannot find module './TutorialModal'".

- [ ] **Step 3: Implement TutorialModal.jsx (slides 1-4, no slide 5 yet)**

Create `frontend/src/components/TutorialModal.jsx`:

```jsx
import { useState } from 'react'

const SLIDES_DESKTOP = [
  {
    icon: '👋',
    title: 'Bienvenido a SyqueX',
    body: 'Tu flujo de trabajo: agrega un paciente → dicta tus apuntes → la IA genera la nota → confirma y guarda.',
    flow: true,
  },
  {
    icon: '👤',
    title: 'Crea tu primer paciente',
    body: 'Haz clic en el botón + junto a "Pacientes" en el sidebar. Cada paciente tiene su propio historial de sesiones y notas clínicas.',
  },
  {
    icon: '🎙️',
    title: 'Dicta o escribe tus apuntes',
    body: 'Escribe libremente en el panel de dictado — sin estructura. La IA organiza automáticamente tu nota clínica.',
  },
  {
    icon: '📄',
    title: 'Revisa y confirma la nota',
    body: 'La nota generada aparece a la derecha. Edita cualquier campo directo en la nota antes de confirmar. Queda guardada en el expediente.',
  },
]

function FlowDiagram() {
  const steps = ['Paciente', 'Dictar', 'Nota IA', 'Confirmar']
  return (
    <div className="flex items-center justify-center gap-1 mt-3 flex-wrap">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className="text-[11px] font-medium bg-[#f4f4f2] text-[#18181b] px-2 py-1 rounded-md">{s}</span>
          {i < steps.length - 1 && <span className="text-[#5a9e8a] text-[10px]">→</span>}
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ current, total }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-[3px] flex-1 rounded-full transition-colors ${
            i < current ? 'bg-[#5a9e8a]' : i === current ? 'bg-[#c4935a]' : 'bg-[#e5e7eb]'
          }`}
        />
      ))}
    </div>
  )
}

export default function TutorialModal({ visible, onClose, isMobile, noteFormat }) {
  const [step, setStep] = useState(0)

  if (!visible) return null

  const slides = isMobile ? [...SLIDES_DESKTOP, { pwa: true }] : SLIDES_DESKTOP
  const total = slides.length
  const current = slides[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  const handleClose = () => {
    localStorage.setItem('syquex_tutorial_done', 'true')
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

        {/* Header */}
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

        {/* Slide content */}
        {!current.pwa && (
          <div className="text-center">
            <div className="text-3xl mb-2">{current.icon}</div>
            <p className="text-[15px] font-semibold text-[#18181b] mb-2">{current.title}</p>
            <p className="text-[13px] text-[#6b7280] leading-relaxed">{current.body}</p>
            {current.flow && <FlowDiagram />}
          </div>
        )}

        {/* Placeholder for PWA slide — Task 4 */}
        {current.pwa && (
          <div className="text-center">
            <div className="text-3xl mb-2">📱</div>
            <p className="text-[15px] font-semibold text-[#18181b] mb-2">Instala la app en tu celular</p>
            <p className="text-[13px] text-[#6b7280]">Cargando instrucciones...</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {!isFirst ? (
            <button
              onClick={handlePrev}
              className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors"
            >
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

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TutorialModal.jsx frontend/src/components/TutorialModal.test.jsx
git commit -m "feat: TutorialModal — slides 1-4 with navigation and localStorage"
```

---

## Task 4: TutorialModal — slide 5 PWA install

**Files:**
- Modify: `frontend/src/components/TutorialModal.jsx`
- Modify: `frontend/src/components/TutorialModal.test.jsx`

- [ ] **Step 1: Add failing tests for slide 5**

Append these tests inside the `describe('TutorialModal')` block in `TutorialModal.test.jsx`:

```jsx
describe('slide 5 — PWA install (mobile only)', () => {
  beforeEach(() => {
    // jsdom has no userAgent match for mobile, so isMobile=true via prop
  })

  it('mobile: renders slide 5 after slide 4', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} />)
    // advance to slide 5
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Instala la app/i)).toBeInTheDocument()
    expect(screen.getByText('5 de 5')).toBeInTheDocument()
  })

  it('mobile: "Finalizar" appears on slide 5', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
  })

  it('renders Safari instructions when browser is safari', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Compartir/i)).toBeInTheDocument()
    expect(screen.getByText(/Agregar a inicio/i)).toBeInTheDocument()
  })

  it('renders Chrome install button when browser is chrome and isInstallable', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="chrome" forceInstallable={true} onTriggerInstall={vi.fn()} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Instalar app')).toBeInTheDocument()
  })

  it('renders fallback when browser is "other"', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="other" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Safari/i)).toBeInTheDocument()
    expect(screen.getByText(/Chrome/i)).toBeInTheDocument()
  })

  it('"Ya la instalé ✓" closes and sets tutorial_done', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Ya la instalé ✓'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('sets syquex_pwa_prompted when slide 5 mounts', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(localStorage.getItem('syquex_pwa_prompted')).toBe('true')
  })
})
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected: The 11 existing tests pass; the 7 new PWA tests fail.

- [ ] **Step 3: Implement PWA slide in TutorialModal.jsx**

Replace the entire `TutorialModal.jsx` with this updated version (includes `usePWAInstall` integration and `forceBrowser`/`forceInstallable` test props):

```jsx
import { useState, useEffect } from 'react'
import usePWAInstall from '../hooks/usePWAInstall'

const SLIDES_DESKTOP = [
  {
    icon: '👋',
    title: 'Bienvenido a SyqueX',
    body: 'Tu flujo de trabajo: agrega un paciente → dicta tus apuntes → la IA genera la nota → confirma y guarda.',
    flow: true,
  },
  {
    icon: '👤',
    title: 'Crea tu primer paciente',
    body: 'Haz clic en el botón + junto a "Pacientes" en el sidebar. Cada paciente tiene su propio historial de sesiones y notas clínicas.',
  },
  {
    icon: '🎙️',
    title: 'Dicta o escribe tus apuntes',
    body: 'Escribe libremente en el panel de dictado — sin estructura. La IA organiza automáticamente tu nota clínica.',
  },
  {
    icon: '📄',
    title: 'Revisa y confirma la nota',
    body: 'La nota generada aparece a la derecha. Edita cualquier campo directo en la nota antes de confirmar. Queda guardada en el expediente.',
  },
]

function FlowDiagram() {
  const steps = ['Paciente', 'Dictar', 'Nota IA', 'Confirmar']
  return (
    <div className="flex items-center justify-center gap-1 mt-3 flex-wrap">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className="text-[11px] font-medium bg-[#f4f4f2] text-[#18181b] px-2 py-1 rounded-md">{s}</span>
          {i < steps.length - 1 && <span className="text-[#5a9e8a] text-[10px]">→</span>}
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ current, total }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-[3px] flex-1 rounded-full transition-colors ${
            i < current ? 'bg-[#5a9e8a]' : i === current ? 'bg-[#c4935a]' : 'bg-[#e5e7eb]'
          }`}
        />
      ))}
    </div>
  )
}

function SafariInstructions({ onDone }) {
  return (
    <div>
      <div className="flex flex-col gap-2 mb-4">
        {[
          { n: 1, text: <>Toca el ícono <strong>Compartir</strong> ⎙ en la barra inferior</> },
          { n: 2, text: <>Selecciona <strong>"Agregar a inicio"</strong></> },
          { n: 3, text: <>Toca <strong>"Agregar"</strong> ✓</> },
        ].map(({ n, text }) => (
          <div key={n} className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#5a9e8a] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {n}
            </span>
            <p className="text-[13px] text-[#6b7280]">{text}</p>
          </div>
        ))}
      </div>
      <button
        onClick={onDone}
        className="w-full py-2 rounded-lg border border-[#5a9e8a] text-[#5a9e8a] text-[13px] font-medium hover:bg-[#f0f8f5] transition-colors"
      >
        Ya la instalé ✓
      </button>
    </div>
  )
}

function ChromeInstructions({ isInstallable, onInstall, onDone }) {
  return (
    <div>
      {isInstallable ? (
        <button
          onClick={onInstall}
          className="w-full py-2 rounded-lg bg-[#5a9e8a] text-white text-[13px] font-medium hover:bg-[#4e8c7a] transition-colors mb-2"
        >
          Instalar app
        </button>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {[
            { n: 1, text: <>Toca el menú <strong>⋮</strong> arriba a la derecha</> },
            { n: 2, text: <>Selecciona <strong>"Agregar a pantalla de inicio"</strong></> },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#5a9e8a] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {n}
              </span>
              <p className="text-[13px] text-[#6b7280]">{text}</p>
            </div>
          ))}
        </div>
      )}
      <button onClick={onDone} className="w-full py-2 text-[12px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
        Ya la instalé ✓
      </button>
    </div>
  )
}

function FallbackInstructions({ onDone }) {
  return (
    <div>
      <div className="flex flex-col gap-2 mb-4">
        <div className="border border-[#e5e7eb] rounded-lg p-3">
          <p className="text-[11px] font-semibold text-[#18181b] mb-1">🧭 Safari (iPhone)</p>
          <p className="text-[11px] text-[#6b7280]">Compartir ⎙ → Agregar a inicio → Agregar</p>
        </div>
        <div className="border border-[#e5e7eb] rounded-lg p-3">
          <p className="text-[11px] font-semibold text-[#18181b] mb-1">🌐 Chrome (Android)</p>
          <p className="text-[11px] text-[#6b7280]">Menú ⋮ → Agregar a pantalla de inicio</p>
        </div>
      </div>
      <button onClick={onDone} className="w-full py-2 text-[12px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
        Ya la instalé ✓
      </button>
    </div>
  )
}

function PWASlide({ forceBrowser, forceInstallable, onTriggerInstall, onDone }) {
  const pwa = usePWAInstall()
  const browser = forceBrowser ?? pwa.browser
  const isInstallable = forceInstallable ?? pwa.isInstallable
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
        <div className="text-3xl mb-2">📱</div>
        <p className="text-[15px] font-semibold text-[#18181b] mb-1">Instala la app en tu celular</p>
        <p className="text-[12px] text-[#9ca3af]">Acceso directo desde tu pantalla de inicio</p>
      </div>
      {browser === 'safari' && <SafariInstructions onDone={onDone} />}
      {browser === 'chrome' && <ChromeInstructions isInstallable={isInstallable} onInstall={handleInstall} onDone={onDone} />}
      {browser === 'other' && <FallbackInstructions onDone={onDone} />}
    </div>
  )
}

export default function TutorialModal({
  visible,
  onClose,
  isMobile,
  noteFormat,
  // test-only escape hatches
  forceBrowser,
  forceInstallable,
  onTriggerInstall,
}) {
  const [step, setStep] = useState(0)

  if (!visible) return null

  const slides = isMobile ? [...SLIDES_DESKTOP, { pwa: true }] : SLIDES_DESKTOP
  const total = slides.length
  const current = slides[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  const handleClose = () => {
    localStorage.setItem('syquex_tutorial_done', 'true')
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
          />
        )}

        {!current.pwa && (
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
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all TutorialModal tests**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected: All 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TutorialModal.jsx frontend/src/components/TutorialModal.test.jsx
git commit -m "feat: TutorialModal slide 5 — PWA install with Safari/Chrome/fallback"
```

---

## Task 5: Wire TutorialModal in App.jsx + mobile "?" button

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add import at top of App.jsx**

Find the imports block (around line 1-15). Add:

```js
import TutorialModal from './components/TutorialModal'
```

- [ ] **Step 2: Add tutorialVisible state**

Find the line (around line 162):
```js
const [onboardingCompleted, setOnboardingCompleted] = useState(...)
```

Add immediately after:
```js
const [tutorialVisible, setTutorialVisible] = useState(false)
```

- [ ] **Step 3: Trigger tutorial after onboarding — SOAP path**

Find (around line 647-649):
```js
onSelectSoap={() => {
  setNoteFormat('soap');
  localStorage.setItem('syquex_onboarding_done', 'true');
  setOnboardingCompleted(true);
}}
```

Change to:
```js
onSelectSoap={() => {
  setNoteFormat('soap');
  localStorage.setItem('syquex_onboarding_done', 'true');
  setOnboardingCompleted(true);
  setTutorialVisible(true);
}}
```

- [ ] **Step 4: Trigger tutorial after onboarding — custom/NoteConfigurator path**

Find (around line 630-636) the `onSave` handler inside the NoteConfigurator that's rendered during onboarding:
```js
onSave={async (fields) => {
  await saveTemplate(fields);
  setTemplate({ fields });
  setNoteFormat('custom');
  localStorage.setItem('syquex_onboarding_done', 'true');
  setOnboardingCompleted(true);
  setShowNoteConfigurator(false);
}}
```

Change to:
```js
onSave={async (fields) => {
  await saveTemplate(fields);
  setTemplate({ fields });
  setNoteFormat('custom');
  localStorage.setItem('syquex_onboarding_done', 'true');
  setOnboardingCompleted(true);
  setShowNoteConfigurator(false);
  setTutorialVisible(true);
}}
```

- [ ] **Step 5: Add "?" button to mobile topbar**

Find (around line 958-966) the `<button onClick={() => setIsCreatingPatient(true)} ...>` block in the mobile header. Add the "?" button immediately after it, inside the same `<header>`:

```jsx
<button
  onClick={() => setTutorialVisible(true)}
  className="w-8 h-8 rounded-full bg-[#5a9e8a] text-white text-[13px] font-bold flex items-center justify-center flex-shrink-0 shadow-sm hover:bg-[#4e8c7a] transition-colors"
  aria-label="Abrir tutorial"
>
  ?
</button>
```

- [ ] **Step 6: Render TutorialModal**

Find the section in the return where other modals/overlays are rendered (e.g., near `PatientIntakeModal`). Add:

```jsx
<TutorialModal
  visible={tutorialVisible}
  onClose={() => setTutorialVisible(false)}
  isMobile={typeof window !== 'undefined' && window.innerWidth < 768}
  noteFormat={noteFormat}
/>
```

- [ ] **Step 7: Verify manually**

```bash
cd frontend && npm run dev
```

1. Clear localStorage (`syquex_onboarding_done`).
2. Reload — onboarding appears.
3. Select SOAP — tutorial modal appears with slide 1.
4. Navigate through slides 1-4 with Siguiente/Anterior.
5. Click Finalizar — modal closes, `syquex_tutorial_done = "true"` in localStorage.
6. Click "?" in mobile topbar — tutorial reopens from slide 1.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire TutorialModal in App.jsx — post-onboarding trigger and mobile ? button"
```

---

## Task 6: PatientHeader desktop "?" button

**Files:**
- Modify: `frontend/src/components/PatientHeader.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add onOpenTutorial prop to PatientHeader**

Open `frontend/src/components/PatientHeader.jsx`.

Find the destructured props (around line 15-23):
```js
export default function PatientHeader({
  patientName,
  sessionCount = 0,
  compact = false,
  mode = 'session',
  onModeChange,
  patientId = null,
  onEditPatient = null,
})
```

Add `onOpenTutorial = null` to the list:
```js
export default function PatientHeader({
  patientName,
  sessionCount = 0,
  compact = false,
  mode = 'session',
  onModeChange,
  patientId = null,
  onEditPatient = null,
  onOpenTutorial = null,
})
```

- [ ] **Step 2: Add "?" button to the desktop header**

In the desktop header return (around line 65-114), find the closing of the segmented control block:
```jsx
      )}
    </header>
```

Add the "?" button right after the segmented control closing tag `</div>`, before `</header>`:

```jsx
      {onOpenTutorial && (
        <button
          onClick={onOpenTutorial}
          className="ml-2 w-6 h-6 rounded-full bg-[#5a9e8a] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 shadow-sm hover:bg-[#4e8c7a] transition-colors"
          aria-label="Abrir tutorial"
        >
          ?
        </button>
      )}
```

- [ ] **Step 3: Pass onOpenTutorial from App.jsx**

In `frontend/src/App.jsx`, find the `<PatientHeader` usage inside the desktop layout (around line 720):

```jsx
<PatientHeader
  patientName={hasActivePatient ? selectedPatientName : null}
  sessionCount={soapSessions.filter(s => s.status === 'confirmed').length}
  mode={desktopMode}
  onModeChange={hasActivePatient ? setDesktopMode : undefined}
  patientId={selectedPatientId}
  onEditPatient={(id) => setEditingPatientId(id)}
/>
```

Add the new prop:
```jsx
<PatientHeader
  patientName={hasActivePatient ? selectedPatientName : null}
  sessionCount={soapSessions.filter(s => s.status === 'confirmed').length}
  mode={desktopMode}
  onModeChange={hasActivePatient ? setDesktopMode : undefined}
  patientId={selectedPatientId}
  onEditPatient={(id) => setEditingPatientId(id)}
  onOpenTutorial={() => setTutorialVisible(true)}
/>
```

- [ ] **Step 4: Verify manually**

```bash
cd frontend && npm run dev
```

Open in desktop viewport (≥768px). Confirm the sage-green "?" circle appears at the far right of the PatientHeader. Click it — tutorial opens from slide 1.

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass. No regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PatientHeader.jsx frontend/src/App.jsx
git commit -m "feat: PatientHeader desktop ? button — onOpenTutorial prop wired in App.jsx"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run complete test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass (no failures, no skips related to this feature).

- [ ] **Step 2: Test full onboarding flow on mobile viewport**

In browser DevTools, switch to mobile device (e.g., iPhone 12). Clear localStorage. Reload.

Verify:
- [ ] Onboarding screen appears
- [ ] Select SOAP → tutorial opens, shows 5 slides (slide 5 is PWA install)
- [ ] Slide 5 shows Safari instructions (on iOS Safari) or Chrome button (on Android Chrome)
- [ ] "Ya la instalé ✓" closes tutorial, sets `syquex_tutorial_done = "true"`
- [ ] "?" button appears in topbar next to "+ Nuevo"
- [ ] Clicking "?" reopens tutorial from slide 1

- [ ] **Step 3: Test full onboarding flow on desktop viewport**

Switch to desktop viewport. Clear localStorage. Reload.

Verify:
- [ ] Onboarding → tutorial opens with 4 slides (no slide 5)
- [ ] "Finalizar" appears on slide 4
- [ ] "?" button appears at far right of PatientHeader
- [ ] manifest.json loads in DevTools → Application → Manifest

- [ ] **Step 4: Final commit and push to dev**

```bash
git push origin dev
```
