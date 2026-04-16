# Spec: Landing Page pública — syquex.mx

**Fecha:** 2026-04-14
**Estado:** Aprobado para implementación
**Rama:** `feature/landing-page` desde `dev`

---

## Contexto

SyqueX necesita un sitio web público en `syquex.mx` por dos razones concretas:

1. **Requisito de Stripe** — Stripe México exige un sitio web de empresa para activar la cuenta y procesar pagos reales.
2. **Adquisición** — Los primeros 30 usuarios necesitan un lugar donde entender el producto y registrarse.

El frontend existente (React + Vite) se mantiene intacto y se reubica en `app.syquex.mx`.

---

## Alcance

### En scope
- Landing principal en `/` con hero, beneficios, precio y CTA
- Página `/privacidad` — Aviso de Privacidad (obligatorio LFPDPPP Art. 8 + Stripe)
- Página `/terminos` — Términos y Condiciones (obligatorio Stripe)
- Deploy en Vercel como proyecto separado apuntando a `syquex.mx`
- Configuración DNS en Cloudflare para `syquex.mx` y `app.syquex.mx`

### Fuera de scope
- Blog, FAQs, página de equipo
- Formulario de contacto o chat
- Animaciones de entrada o scroll effects
- Analytics (se agrega post-lanzamiento)
- Versión en inglés

---

## Arquitectura

### Dos proyectos Vercel, dos subdominios

| URL | Stack | Proyecto Vercel |
|-----|-------|-----------------|
| `syquex.mx` | Next.js 14 (App Router, SSG) | `syquex-landing` — nuevo |
| `app.syquex.mx` | React + Vite (existente) | `syquex-app` — existente |

La landing usa **Static Site Generation** — todas las páginas se pre-renderizan en build time. Sin servidor, sin costos de función, carga instantánea, SEO completo.

### Estructura del proyecto Next.js

```
landing/
├── app/
│   ├── layout.tsx          # Fuentes, metadata global
│   ├── page.tsx            # Landing principal (/)
│   ├── privacidad/
│   │   └── page.tsx        # Aviso de Privacidad
│   └── terminos/
│       └── page.tsx        # Términos y Condiciones
├── components/
│   ├── Nav.tsx             # Logo + link Iniciar sesión
│   ├── Hero.tsx            # Headline + CTA principal
│   ├── Benefits.tsx        # 3 beneficios en línea
│   ├── Pricing.tsx         # Precio + nota de cancelación
│   └── Footer.tsx          # Links legales + email
├── public/
│   └── og-image.png        # Open Graph 1200×630px — fondo blanco, logo SyqueX centrado, tagline en Inter
├── tailwind.config.ts
└── next.config.ts
```

### Repositorio

La landing vive en el mismo repo que la app, en el subfolder `/landing`. Vercel soporta monorepos con múltiples proyectos por subfolder (Root Directory setting). Un solo repo, dos proyectos Vercel independientes.

---

## Diseño visual

### Paleta
Coherente con la app para que la transición landing → producto no rompa la identidad visual.

| Token | Hex | Uso |
|-------|-----|-----|
| ink | `#18181b` | Texto principal |
| sage | `#5a9e8a` | CTA, acentos |
| amber | `#c4935a` | Detalles de calidez |
| background | `#ffffff` | Fondo — blanco puro, no parchment |
| surface | `#f4f4f2` | Fondo nav / footer |

### Tipografía
- **Headline hero:** Lora 600 — serif, transmite autoridad clínica
- **Cuerpo y UI:** Inter 400/500 — limpio, legible en pantalla
- Fuentes vía `next/font/google` — sin layout shift, óptimo para Core Web Vitals

### Principios UX
- Mobile-first: diseño base en 375px, breakpoints sm/md/lg
- Un solo CTA primario en todo el hero — sin competencia de atención
- Sin animaciones de entrada — audiencia de psicólogos ocupados, prioridad en velocidad y claridad
- Contraste WCAG AA en todos los textos sobre fondo

---

## Contenido por sección

### Nav
```
[SyqueX]                              [Iniciar sesión →]
```
- "Iniciar sesión" → `https://app.syquex.mx/login`
- Sticky en scroll, fondo `#f4f4f2`, sin sombra (surface color shift)

### Hero
```
El asistente de documentación clínica
para psicólogos

Dicta tu sesión. SyqueX genera la nota SOAP
al instante — estructurada, lista para el expediente.

[Empieza gratis — 14 días]
```
- CTA → `https://app.syquex.mx/registro`
- Subtítulo máx 2 líneas en móvil
- Sin imagen de fondo — tipografía como protagonista

### Beneficios (3 ítems, layout horizontal en desktop)
1. **Notas SOAP en segundos** — La IA estructura el dictado en Subjetivo, Objetivo, Análisis y Plan.
2. **Historial con búsqueda semántica** — Encuentra patrones clínicos en sesiones anteriores al instante.
3. **Datos protegidos bajo LFPDPPP** — Tu información y la de tus pacientes bajo la ley mexicana de privacidad.

### Precio
```
$499 MXN / mes
Incluye todos los pacientes · Cancela cuando quieras
```
- Sin tabla de comparación — un solo plan en MVP
- Agregar bloque de política de cancelación visible (no solo en Términos):
  > "Puedes cancelar en cualquier momento escribiendo a hola@syquex.mx. Al cancelar, tu acceso continúa hasta el fin del período pagado. No se emiten reembolsos por períodos parciales."
- Este texto es requerido por Stripe como política de reembolso explícita y accesible

### Footer
```
© 2026 SyqueX · Aviso de Privacidad · Términos y Condiciones · hola@syquex.mx
Culiacán, Sinaloa, México
```
- Links internos `/privacidad` y `/terminos`
- Incluir dirección física y RFC en el footer — requerido por Stripe para verificar la empresa
- Formato: `Culiacán, Sinaloa, México · RFC: MARF9712139DA`

---

## Páginas legales

### `/privacidad` — Aviso de Privacidad
Contenido mínimo LFPDPPP Art. 8:
- Identidad y domicilio del responsable (incluir RFC)
- Finalidades del tratamiento de datos
- Datos recabados
- Opciones y medios para limitar el uso
- Derechos ARCO y cómo ejercerlos
- Transferencias de datos (Stripe, Anthropic)
- Vigencia y cambios al aviso

### `/terminos` — Términos y Condiciones
Contenido mínimo para Stripe + uso del producto:
- Descripción del servicio
- Condiciones de la prueba gratuita (14 días)
- Precios, facturación y cancelación
- **Política de reembolso explícita** — sin reembolsos por períodos parciales; acceso hasta fin de período pagado
- Uso aceptable (datos clínicos, confidencialidad)
- Limitación de responsabilidad
- Ley aplicable (México)

> **Nota:** El contenido de ambas páginas requiere revisión legal antes del lanzamiento.

### Consentimiento en registro (app.syquex.mx)

La página `/registro` en la app ya incluye dos checkboxes obligatorios que linkan a `syquex.mx/privacidad` y `syquex.mx/terminos` (spec `2026-03-30-auth-billing-launch-design.md`). Este vínculo cumple el requisito de consentimiento LFPDPPP Art. 8 y el requisito de Stripe de que los usuarios acepten la política de privacidad antes de ingresar datos de pago.

**Acción requerida en implementación:** Verificar que los links en `RegisterScreen.jsx` apunten a `https://syquex.mx/privacidad` y `https://syquex.mx/terminos` (no a rutas relativas).

---

## DNS en Cloudflare

| Tipo | Nombre | Valor | Proxy |
|------|--------|-------|-------|
| A | `@` (syquex.mx) | `76.76.21.21` | DNS only (naranja OFF) |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only (naranja OFF) |
| CNAME | `app` | `cname.vercel-dns.com` | DNS only (naranja OFF) |

**Notas importantes:**
- Cloudflare **no permite CNAME en el apex** (`@`) — usar registro `A` con la IP de Vercel (`76.76.21.21`) para el dominio raíz.
- Agregar `www` como CNAME para que `www.syquex.mx` no dé error DNS — Vercel lo redirige automáticamente a `syquex.mx`.
- Proxy debe estar **desactivado** (ícono gris) en todos los registros — Vercel gestiona SSL y el proxy de Cloudflare interfiere con la emisión de certificados.

---

## Deploy

1. En Vercel → Add New Project → importar repo `SyqueX` → **Root Directory: `landing`** → crear proyecto `syquex-landing`
2. En Vercel (proyecto `syquex-landing`) → Settings → Domains → agregar `syquex.mx`
3. En Cloudflare → DNS → configurar registros según tabla arriba
4. En Vercel (proyecto app existente) → Settings → Domains → agregar `app.syquex.mx`
5. Verificar que `https://syquex.mx` carga la landing y `https://app.syquex.mx` carga la app

---

## Orden de implementación

1. Crear repo y proyecto Next.js con Tailwind
2. Implementar componentes: `Nav`, `Hero`, `Benefits`, `Pricing`, `Footer`
3. Ensamblar `app/page.tsx` (landing principal)
4. Crear `app/privacidad/page.tsx` y `app/terminos/page.tsx` con contenido placeholder
5. Configurar `next/font`, metadata y Open Graph
6. Deploy a Vercel + configurar dominios en Cloudflare
7. Verificar en móvil y desktop
8. Presentar URL a Stripe para activación de cuenta
