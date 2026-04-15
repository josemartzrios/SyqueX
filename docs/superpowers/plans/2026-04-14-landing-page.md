# Landing Page syquex.mx — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la landing pública de SyqueX en `/landing` (subfolder del monorepo), desplegarla en `syquex.mx`, y actualizar los links de privacidad/términos en el registro para apuntar al dominio real.

**Architecture:** Proyecto Next.js 14 (App Router, SSG) en `landing/` dentro del repo existente. Vercel lo despliega como proyecto independiente con Root Directory `landing`. La app React/Vite existente se configura en `app.syquex.mx`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, `next/font/google` (Inter + Lora), Vercel (SSG deploy), Cloudflare DNS.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `landing/package.json` | Crear | Dependencias Next.js |
| `landing/next.config.ts` | Crear | Config SSG (`output: 'export'`) |
| `landing/tailwind.config.ts` | Crear | Tokens de diseño (sage, amber, ink) |
| `landing/postcss.config.js` | Crear | PostCSS para Tailwind |
| `landing/app/layout.tsx` | Crear | Fuentes, metadata global, estructura HTML |
| `landing/app/page.tsx` | Crear | Landing principal — ensambla componentes |
| `landing/app/privacidad/page.tsx` | Crear | Aviso de Privacidad |
| `landing/app/terminos/page.tsx` | Crear | Términos y Condiciones |
| `landing/components/Nav.tsx` | Crear | Logo + link "Iniciar sesión" |
| `landing/components/Hero.tsx` | Crear | Headline + CTA principal |
| `landing/components/Benefits.tsx` | Crear | 3 beneficios en grid |
| `landing/components/Pricing.tsx` | Crear | Precio + política de cancelación |
| `landing/components/Footer.tsx` | Crear | Links legales + dirección + RFC |
| `landing/public/og-image.png` | Crear | Open Graph 1200×630px |
| `frontend/src/components/RegisterScreen.jsx` | Modificar | Actualizar URLs de privacidad y términos |

---

## Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: `landing/package.json`
- Create: `landing/next.config.ts`
- Create: `landing/tsconfig.json`
- Create: `landing/.gitignore`

- [ ] **Step 1: Crear directorio e inicializar package.json**

```bash
mkdir landing && cd landing
```

Crear `landing/package.json`:

```json
{
  "name": "syquex-landing",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.29",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Crear next.config.ts**

```typescript
// landing/next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',   // SSG — genera HTML estático, sin servidor
  trailingSlash: true,
}

export default nextConfig
```

- [ ] **Step 3: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Crear .gitignore**

```
node_modules/
.next/
out/
.env*.local
```

- [ ] **Step 5: Instalar dependencias**

```bash
cd landing && npm install
```

Expected: `node_modules/` creado, sin errores.

- [ ] **Step 6: Commit**

```bash
git add landing/package.json landing/next.config.ts landing/tsconfig.json landing/.gitignore
git commit -m "feat(landing): scaffold Next.js 14 project"
```

---

## Task 2: Configurar Tailwind con tokens de diseño

**Files:**
- Create: `landing/tailwind.config.ts`
- Create: `landing/postcss.config.js`
- Create: `landing/app/globals.css`

- [ ] **Step 1: Crear tailwind.config.ts**

```typescript
// landing/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#18181b',
          secondary: '#52525b',
          tertiary: '#a1a1aa',
          muted: '#e4e4e7',
        },
        sage: {
          DEFAULT: '#5a9e8a',
          dark: '#3d7a68',
          light: '#e8f4f1',
        },
        amber: {
          DEFAULT: '#c4935a',
          light: '#fdf3e7',
        },
        surface: '#f4f4f2',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Crear postcss.config.js**

```javascript
// landing/postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Crear globals.css**

```css
/* landing/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

- [ ] **Step 4: Verificar que `next build` no falla aún**

```bash
cd landing && npm run build
```

Expected: puede fallar por falta de `app/layout.tsx` — está bien por ahora, se crea en Task 3.

- [ ] **Step 5: Commit**

```bash
git add landing/tailwind.config.ts landing/postcss.config.js landing/app/globals.css
git commit -m "feat(landing): configure Tailwind with design tokens"
```

---

## Task 3: Layout global y fuentes

**Files:**
- Create: `landing/app/layout.tsx`

- [ ] **Step 1: Crear layout.tsx**

**Nota:** `next/font/google` NO es compatible con `output: 'export'` (requiere servidor en build). Usar `<link>` de Google Fonts directamente en el `<head>`.

```typescript
// landing/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SyqueX — Documentación clínica con IA para psicólogos',
  description:
    'Dicta tu sesión. SyqueX genera la nota SOAP al instante — estructurada, lista para el expediente.',
  metadataBase: new URL('https://syquex.mx'),
  openGraph: {
    title: 'SyqueX — Documentación clínica con IA para psicólogos',
    description:
      'Dicta tu sesión. SyqueX genera la nota SOAP al instante.',
    url: 'https://syquex.mx',
    siteName: 'SyqueX',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    locale: 'es_MX',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SyqueX — Documentación clínica con IA',
    description: 'Notas SOAP generadas con IA en segundos.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es-MX">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Crear página placeholder para verificar build**

Crear `landing/app/page.tsx` temporalmente:

```typescript
// landing/app/page.tsx
export default function Home() {
  return <main><h1>SyqueX</h1></main>
}
```

- [ ] **Step 3: Verificar que el proyecto compila**

```bash
cd landing && npm run build
```

Expected: `Build successful`, carpeta `out/` generada con `index.html`.

- [ ] **Step 4: Verificar en dev server**

```bash
cd landing && npm run dev
```

Abrir `http://localhost:3000` — debe mostrar "SyqueX" sin errores en consola.

- [ ] **Step 5: Commit**

```bash
git add landing/app/layout.tsx landing/app/page.tsx
git commit -m "feat(landing): add layout with Inter+Lora fonts and OG metadata"
```

---

## Task 4: Componente Nav

**Files:**
- Create: `landing/components/Nav.tsx`

- [ ] **Step 1: Crear Nav.tsx**

```typescript
// landing/components/Nav.tsx
export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-surface border-b border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-ink tracking-tight text-lg">
          SyqueX
        </span>
        <a
          href="https://app.syquex.mx/login"
          className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors"
        >
          Iniciar sesión →
        </a>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Agregar Nav a page.tsx para verificar visualmente**

Actualizar `landing/app/page.tsx`:

```typescript
import Nav from '../components/Nav'

export default function Home() {
  return (
    <main>
      <Nav />
      <h1 className="p-8">SyqueX</h1>
    </main>
  )
}
```

- [ ] **Step 3: Verificar en dev server**

```bash
cd landing && npm run dev
```

Verificar en `http://localhost:3000`: Nav sticky con logo a la izquierda y link a la derecha.

- [ ] **Step 4: Commit**

```bash
git add landing/components/Nav.tsx landing/app/page.tsx
git commit -m "feat(landing): add Nav component"
```

---

## Task 5: Componente Hero

**Files:**
- Create: `landing/components/Hero.tsx`

- [ ] **Step 1: Crear Hero.tsx**

```typescript
// landing/components/Hero.tsx
export default function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
      <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-ink leading-tight tracking-tight mb-6">
        El asistente de documentación clínica
        <br className="hidden sm:block" /> para psicólogos
      </h1>
      <p className="text-lg sm:text-xl text-ink-secondary max-w-xl mx-auto mb-10 leading-relaxed">
        Dicta tu sesión. SyqueX genera la nota SOAP al instante —
        estructurada, lista para el expediente.
      </p>
      <a
        href="https://app.syquex.mx/registro"
        className="inline-block bg-sage hover:bg-sage-dark text-white font-medium px-8 py-3 rounded-lg transition-colors text-base"
      >
        Empieza gratis — 14 días
      </a>
    </section>
  )
}
```

- [ ] **Step 2: Agregar Hero a page.tsx**

```typescript
import Nav from '../components/Nav'
import Hero from '../components/Hero'

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
    </main>
  )
}
```

- [ ] **Step 3: Verificar en dev server**

`http://localhost:3000`: headline serif grande, subtítulo, botón sage verde. Reducir ventana a 375px y verificar que el layout no se rompe.

- [ ] **Step 4: Commit**

```bash
git add landing/components/Hero.tsx landing/app/page.tsx
git commit -m "feat(landing): add Hero component"
```

---

## Task 6: Componente Benefits

**Files:**
- Create: `landing/components/Benefits.tsx`

- [ ] **Step 1: Crear Benefits.tsx**

```typescript
// landing/components/Benefits.tsx
const benefits = [
  {
    icon: '⚡',
    title: 'Notas SOAP en segundos',
    description:
      'La IA estructura el dictado en Subjetivo, Objetivo, Análisis y Plan.',
  },
  {
    icon: '🔍',
    title: 'Historial con búsqueda semántica',
    description:
      'Encuentra patrones clínicos en sesiones anteriores al instante.',
  },
  {
    icon: '🔒',
    title: 'Datos protegidos bajo LFPDPPP',
    description:
      'Tu información y la de tus pacientes bajo la ley mexicana de privacidad.',
  },
]

export default function Benefits() {
  return (
    <section className="bg-surface border-y border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {benefits.map((b) => (
            <div key={b.title} className="text-center sm:text-left">
              <div className="text-2xl mb-3">{b.icon}</div>
              <h3 className="font-semibold text-ink mb-2">{b.title}</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                {b.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Agregar Benefits a page.tsx**

```typescript
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Benefits />
    </main>
  )
}
```

- [ ] **Step 3: Verificar en dev server**

`http://localhost:3000`: 3 columnas en desktop, 1 columna en móvil (375px). Fondo surface con bordes.

- [ ] **Step 4: Commit**

```bash
git add landing/components/Benefits.tsx landing/app/page.tsx
git commit -m "feat(landing): add Benefits component"
```

---

## Task 7: Componente Pricing

**Files:**
- Create: `landing/components/Pricing.tsx`

- [ ] **Step 1: Crear Pricing.tsx**

```typescript
// landing/components/Pricing.tsx
export default function Pricing() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="inline-block border border-ink-muted rounded-xl px-8 py-8 max-w-sm w-full text-left">
        <p className="text-3xl font-semibold text-ink mb-1">$499 MXN</p>
        <p className="text-ink-secondary text-sm mb-6">
          por mes · Incluye todos los pacientes
        </p>

        <ul className="space-y-2 mb-6 text-sm text-ink-secondary">
          {[
            'Pacientes ilimitados',
            'Notas SOAP con IA',
            'Historial clínico completo',
            'Soporte por email',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-sage">✓</span> {f}
            </li>
          ))}
        </ul>

        <a
          href="https://app.syquex.mx/registro"
          className="block w-full text-center bg-sage hover:bg-sage-dark text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
        >
          Empieza gratis — 14 días
        </a>

        <p className="text-xs text-ink-tertiary mt-4 leading-relaxed">
          Puedes cancelar en cualquier momento escribiendo a hola@syquex.mx.
          Al cancelar, tu acceso continúa hasta el fin del período pagado.
          No se emiten reembolsos por períodos parciales.
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Agregar Pricing a page.tsx**

```typescript
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import Pricing from '../components/Pricing'

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Benefits />
      <Pricing />
    </main>
  )
}
```

- [ ] **Step 3: Verificar en dev server**

`http://localhost:3000`: card de precio centrada, lista de features con checkmarks sage, texto de política de cancelación en gris pequeño al fondo de la card.

- [ ] **Step 4: Commit**

```bash
git add landing/components/Pricing.tsx landing/app/page.tsx
git commit -m "feat(landing): add Pricing component with cancellation policy"
```

---

## Task 8: Componente Footer

**Files:**
- Create: `landing/components/Footer.tsx`

**Nota:** El RFC real del responsable debe sustituir `[RFC]` antes del deploy final.

- [ ] **Step 1: Crear Footer.tsx**

```typescript
// landing/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="bg-surface border-t border-ink-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-ink-secondary">
          <div className="space-y-1">
            <p>© 2026 SyqueX</p>
            <p>Ciudad de México, México · RFC: [RFC]</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href="/privacidad" className="hover:text-ink transition-colors">
              Aviso de Privacidad
            </a>
            <a href="/terminos" className="hover:text-ink transition-colors">
              Términos y Condiciones
            </a>
            <a
              href="mailto:hola@syquex.mx"
              className="hover:text-ink transition-colors"
            >
              hola@syquex.mx
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Ensamblar page.tsx completo**

```typescript
// landing/app/page.tsx
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <Pricing />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 3: Verificar landing completa en dev server**

`http://localhost:3000`: recorrer la página completa — Nav → Hero → Benefits → Pricing → Footer. Verificar en 375px (móvil) y 1280px (desktop).

- [ ] **Step 4: Verificar build estático**

```bash
cd landing && npm run build
```

Expected: `Build successful`. Carpeta `out/` con `index.html`, `privacidad/index.html`, etc.

- [ ] **Step 5: Commit**

```bash
git add landing/components/Footer.tsx landing/app/page.tsx
git commit -m "feat(landing): add Footer and assemble full landing page"
```

---

## Task 9: Páginas legales

**Files:**
- Create: `landing/app/privacidad/page.tsx`
- Create: `landing/app/terminos/page.tsx`

- [ ] **Step 1: Crear página de Aviso de Privacidad**

```typescript
// landing/app/privacidad/page.tsx
import type { Metadata } from 'next'
import Nav from '../../components/Nav'
import Footer from '../../components/Footer'

export const metadata: Metadata = {
  title: 'Aviso de Privacidad — SyqueX',
}

export default function Privacidad() {
  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-serif text-3xl font-semibold text-ink mb-8">
          Aviso de Privacidad
        </h1>
        <div className="space-y-6 text-sm text-ink-secondary leading-relaxed">

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">1. Identidad del responsable</h2>
            <p>
              [Nombre completo del responsable], con RFC [RFC], con domicilio en
              Ciudad de México, México, es el responsable del tratamiento de sus
              datos personales (en adelante "SyqueX").
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">2. Datos personales recabados</h2>
            <p>
              SyqueX recaba los siguientes datos personales: nombre completo,
              correo electrónico, contraseña (almacenada en forma de hash),
              cédula profesional (opcional), y datos de pago (procesados
              directamente por Stripe — SyqueX no almacena datos de tarjeta).
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">3. Finalidades del tratamiento</h2>
            <p>
              Sus datos se utilizan para: (a) proveer el servicio de
              documentación clínica con inteligencia artificial; (b) gestionar
              su cuenta y suscripción; (c) enviar comunicaciones relacionadas
              con el servicio (no publicidad).
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">4. Transferencias de datos</h2>
            <p>
              Para proveer el servicio, SyqueX comparte datos con: (a) Stripe
              Inc., para el procesamiento de pagos; (b) Anthropic PBC, para la
              generación de notas clínicas mediante inteligencia artificial.
              Ambos proveedores cuentan con políticas de privacidad propias.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">5. Derechos ARCO</h2>
            <p>
              Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al
              tratamiento de sus datos personales (derechos ARCO). Para
              ejercerlos, envíe un correo a{' '}
              <a href="mailto:hola@syquex.mx" className="text-sage underline">
                hola@syquex.mx
              </a>{' '}
              con el asunto "Derechos ARCO". Responderemos en un plazo máximo
              de 20 días hábiles.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">6. Limitación del uso</h2>
            <p>
              Para limitar el uso o divulgación de sus datos, puede enviarnos
              un correo a hola@syquex.mx en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">7. Cambios a este aviso</h2>
            <p>
              Cualquier modificación a este Aviso de Privacidad será notificada
              a través de la aplicación o por correo electrónico. La versión
              vigente siempre estará disponible en{' '}
              <a href="/privacidad" className="text-sage underline">
                syquex.mx/privacidad
              </a>
              .
            </p>
          </section>

          <p className="text-xs text-ink-tertiary pt-4 border-t border-ink-muted">
            Última actualización: abril 2026 · Versión 1.0
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Crear página de Términos y Condiciones**

```typescript
// landing/app/terminos/page.tsx
import type { Metadata } from 'next'
import Nav from '../../components/Nav'
import Footer from '../../components/Footer'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — SyqueX',
}

export default function Terminos() {
  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-serif text-3xl font-semibold text-ink mb-8">
          Términos y Condiciones
        </h1>
        <div className="space-y-6 text-sm text-ink-secondary leading-relaxed">

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">1. Descripción del servicio</h2>
            <p>
              SyqueX es una plataforma de documentación clínica asistida por
              inteligencia artificial, dirigida a psicólogos profesionales. El
              servicio permite generar notas SOAP a partir de dictados de
              sesión y mantener un historial clínico estructurado.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">2. Prueba gratuita</h2>
            <p>
              Al registrarse, los usuarios tienen acceso gratuito por 14 días
              calendario sin necesidad de proporcionar datos de pago. Al
              término del período de prueba, se requiere activar una
              suscripción para continuar usando el servicio.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">3. Precios y facturación</h2>
            <p>
              El servicio se ofrece por $499 MXN (pesos mexicanos) al mes,
              facturado mensualmente. El cobro se realiza a través de Stripe.
              Los precios pueden cambiar con previo aviso de 30 días.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">4. Cancelación y reembolsos</h2>
            <p>
              Puedes cancelar tu suscripción en cualquier momento enviando un
              correo a{' '}
              <a href="mailto:hola@syquex.mx" className="text-sage underline">
                hola@syquex.mx
              </a>
              . Al cancelar, tu acceso continúa hasta el fin del período pagado
              en curso. <strong className="text-ink">No se emiten reembolsos
              por períodos parciales.</strong>
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">5. Uso aceptable</h2>
            <p>
              El servicio está destinado exclusivamente a profesionales de la
              salud mental con cédula profesional vigente. El usuario es
              responsable de la confidencialidad de los datos de sus pacientes
              y de cumplir con las obligaciones legales aplicables en México
              respecto al manejo de datos clínicos.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">6. Limitación de responsabilidad</h2>
            <p>
              SyqueX proporciona una herramienta de apoyo a la documentación.
              Las notas generadas por IA deben ser revisadas y validadas por el
              profesional antes de incorporarse al expediente clínico. SyqueX
              no es responsable por decisiones clínicas tomadas con base en
              contenido generado por la plataforma.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-base mb-2">7. Ley aplicable</h2>
            <p>
              Estos términos se rigen por las leyes de los Estados Unidos
              Mexicanos. Cualquier controversia se resolverá ante los
              tribunales competentes de la Ciudad de México.
            </p>
          </section>

          <p className="text-xs text-ink-tertiary pt-4 border-t border-ink-muted">
            Última actualización: abril 2026 · Versión 1.0
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 3: Verificar ambas páginas**

```bash
cd landing && npm run dev
```

Abrir `http://localhost:3000/privacidad` y `http://localhost:3000/terminos`. Verificar que ambas cargan con Nav y Footer correctos.

- [ ] **Step 4: Build final**

```bash
cd landing && npm run build
```

Expected: `Build successful`. Verificar que `out/privacidad/index.html` y `out/terminos/index.html` existen.

- [ ] **Step 5: Commit**

```bash
git add landing/app/privacidad/page.tsx landing/app/terminos/page.tsx
git commit -m "feat(landing): add privacy policy and terms pages"
```

---

## Task 10: Open Graph image

**Files:**
- Create: `landing/public/og-image.png`

- [ ] **Step 1: Crear og-image.png**

Crear una imagen de 1200×630px con las siguientes características:
- Fondo blanco `#ffffff`
- Texto "SyqueX" en Inter 600, color ink `#18181b`, tamaño ~80px, centrado horizontalmente
- Subtítulo "Documentación clínica con IA para psicólogos" en Inter 400, color `#52525b`, tamaño ~32px, centrado
- Acento: línea o punto en sage `#5a9e8a`

Herramientas sugeridas: Canva, Figma, o cualquier editor de imagen. Exportar como PNG y guardar en `landing/public/og-image.png`.

- [ ] **Step 2: Verificar en build**

```bash
cd landing && npm run build
```

Verificar que `out/og-image.png` existe en la carpeta de salida.

- [ ] **Step 3: Commit**

```bash
git add landing/public/og-image.png
git commit -m "feat(landing): add Open Graph image"
```

---

## Task 11: Actualizar links en RegisterScreen.jsx

**Files:**
- Modify: `frontend/src/components/RegisterScreen.jsx` (líneas 6-7)

El archivo actual tiene:
```javascript
const PRIVACY_URL = '/aviso-privacidad.pdf';
const TERMS_URL = '/terminos-condiciones.pdf';
```

Estos deben apuntar a las páginas reales de la landing.

- [ ] **Step 1: Actualizar las URLs**

```javascript
// frontend/src/components/RegisterScreen.jsx — líneas 6-7
const PRIVACY_URL = 'https://syquex.mx/privacidad';
const TERMS_URL = 'https://syquex.mx/terminos';
```

- [ ] **Step 2: Verificar que los links abren en nueva pestaña**

Leer el JSX que usa `PRIVACY_URL` y `TERMS_URL` en `RegisterScreen.jsx`. Verificar que los `<a>` tienen `target="_blank"` para abrir en nueva pestaña sin cerrar la app. El archivo ya tiene `rel="noreferrer"` que es suficiente — no es necesario agregar `noopener` (están incluidos en `noreferrer` en browsers modernos).

- [ ] **Step 3: Correr los tests existentes**

```bash
cd frontend && npx vitest run RegisterScreen.test
```

Expected: PASS — los tests de `RegisterScreen.test.jsx` no deben romperse con el cambio de URL (testean comportamiento, no URLs específicas).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RegisterScreen.jsx
git commit -m "feat(app): update privacy/terms links to syquex.mx"
```

---

## Task 12: Deploy y configuración de dominios

**Pasos manuales — realizados por el desarrollador (no por agente).**

- [ ] **Step 1: Push de la rama a GitHub**

```bash
git push origin feature/landing-page
```

- [ ] **Step 2: Crear proyecto Vercel para la landing**

1. Ir a vercel.com → "Add New Project"
2. Importar el repo `SyqueX`
3. **Root Directory:** `landing`
4. Framework: Next.js (autodetectado)
5. Deploy

- [ ] **Step 3: Agregar dominio syquex.mx en Vercel**

En el proyecto `syquex-landing` en Vercel:
- Settings → Domains → Add → `syquex.mx`
- Vercel mostrará los valores DNS a configurar

- [ ] **Step 4: Configurar DNS en Cloudflare**

En Cloudflare → DNS de `syquex.mx`, agregar:

| Tipo | Nombre | Valor | Proxy |
|------|--------|-------|-------|
| A | `@` | `76.76.21.21` | **OFF (gris)** |
| CNAME | `www` | `cname.vercel-dns.com` | **OFF (gris)** |
| CNAME | `app` | `cname.vercel-dns.com` | **OFF (gris)** |

**Importante:** Proxy debe estar desactivado (ícono gris, no naranja).

- [ ] **Step 5: Agregar app.syquex.mx al proyecto de la app**

En Vercel, proyecto de la app existente:
- Settings → Domains → Add → `app.syquex.mx`

- [ ] **Step 6: Verificar propagación DNS (puede tomar 5-30 min)**

```bash
curl -I https://syquex.mx
curl -I https://app.syquex.mx
```

Expected: ambos responden `HTTP/2 200`.

- [ ] **Step 7: Verificar landing en producción**

Abrir `https://syquex.mx` en browser:
- Nav sticky visible
- Hero con headline serif
- Benefits en grid
- Pricing con política de cancelación
- Footer con RFC y links legales
- `https://syquex.mx/privacidad` carga
- `https://syquex.mx/terminos` carga

- [ ] **Step 8: Verificar en móvil**

Abrir `https://syquex.mx` en un teléfono o DevTools a 375px. Verificar que no hay scroll horizontal y que el layout es legible.

---

## Task 13: Merge y cierre

- [ ] **Step 1: Abrir PR feature/landing-page → dev**

```bash
gh pr create --title "feat: landing page syquex.mx" \
  --body "Landing pública en Next.js SSG en /landing subfolder.
  
- Nav, Hero, Benefits, Pricing, Footer
- /privacidad y /terminos con contenido LFPDPPP + Stripe
- Deploy en syquex.mx vía Vercel
- RegisterScreen.jsx apunta a URLs reales

Desbloquea activación de cuenta Stripe."
```

- [ ] **Step 2: Merge PR dev → main cuando Stripe apruebe la cuenta**

Una vez que Stripe valide el sitio y active la cuenta, mergear a `main` para producción oficial.

- [ ] **Step 3: Reemplazar RFC placeholder en Footer.tsx y páginas legales**

Buscar `[RFC]` en `landing/` y reemplazar con el RFC real antes del merge a `main`.

```bash
grep -r "\[RFC\]" landing/
```
