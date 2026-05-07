# PatientInviteAccept — Rediseño UI

**Fecha:** 2026-05-04
**Archivo a modificar:** `frontend/src/pages/PatientInviteAccept.jsx`

## Problema

La pantalla actual usa `bg-[#fefaf6]` (beige/parchment) como fondo y una tarjeta blanca con sombra. Se ve experimental y no sigue el principio del design system: "la calidez viene de los acentos, no de los fondos".

## Diseño aprobado

### Estructura (mobile-first)

**Móvil (default):** layout en columna completa
1. Header sage (`bg-[#5a9e8a]`) con logo + mensaje de bienvenida
2. Cuerpo blanco con el formulario

**Desktop (`md:` breakpoint, ≥768px):** split screen horizontal
- Panel izquierdo fijo (`md:w-[42%]`): sage, logo + mensaje + badge de privacidad al fondo
- Panel derecho (flex-1): blanco, solo el formulario centrado

### Header sage (móvil) / Panel izquierdo (desktop)

- Fondo `#5a9e8a`
- Logo mark: cuadrado `rgba(255,255,255,0.22)` con borde interior blanco
- Título serif: `"Tu psicólogo te invitó"` — `text-white font-bold font-serif`
- Subtítulo: `"Aquí verás los resúmenes de tus sesiones en un espacio privado."` — `text-white/70`
- Badge de privacidad (solo desktop `md:`, fijado al fondo del panel): ícono candado + `"Datos encriptados"` en `text-white/55`

### Formulario

- Título: `"Crea tu contraseña"` — serif, `text-[#18181b]`
- Labels: `text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em]`
- Inputs: `bg-[#f4f4f2] border border-black/[0.08] rounded-xl` — igual al resto de SyqueX
- Hint bajo el primer campo: `"Mínimo 8 caracteres"` en `text-[#9ca3af] text-[11px]`
- CTA: `bg-[#5a9e8a] hover:bg-[#4a8a78] text-white rounded-xl font-semibold` — `"Activar cuenta →"`
- Nota de privacidad (móvil, fondo del formulario): ícono candado + `"Datos encriptados · Solo tú los ves"` en `text-[#9ca3af] text-[11px]`

### Estado de error

Banner `bg-[#fef2f2] border border-red-300 rounded-xl` con ícono rojo y mensaje de error. Reemplaza el `<p className="text-red-600 text-sm">` actual.

### Estado de éxito

Banner `bg-[#f4faf8] border border-[#5a9e8a] rounded-xl` con checkmark sage y `"¡Listo! Redirigiendo a tu portal…"`. Reemplaza la tarjeta blanca con sombra actual.

### Fondo de la pantalla

`bg-[#f4f4f2]` (gris neutro del design system) — elimina por completo el `bg-[#fefaf6]` beige.

## Paleta de colores usada

| Token | Hex | Uso |
|-------|-----|-----|
| sage | `#5a9e8a` | Header, labels, CTA, botón |
| sage-dark | `#4a8a78` | CTA hover |
| ink | `#18181b` | Títulos |
| surface | `#f4f4f2` | Fondo de pantalla, inputs |
| white | `#ffffff` | Cuerpo del formulario |

## Comportamiento (sin cambios)

- Props: `inviteToken`, `setScreen` — sin cambios
- Validación: contraseñas coinciden + mínimo 8 chars — sin cambios
- On success: `navigateTo('/portal')` + `setScreen('patient-portal')` después de 2s — sin cambios
- API call: `acceptPatientInvite(inviteToken, password)` — sin cambios

## Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `frontend/src/pages/PatientInviteAccept.jsx` | Reescritura completa del JSX/Tailwind |
