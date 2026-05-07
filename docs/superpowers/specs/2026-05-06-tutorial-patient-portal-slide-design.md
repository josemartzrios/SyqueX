# Tutorial — Slide Portal del Paciente

**Fecha:** 2026-05-06
**Feature:** Nuevo slide en TutorialModal sobre seguimiento del paciente
**Estado:** Spec aprobado, listo para implementación

---

## 1. Resumen

Añadir un slide al tutorial existente (`TutorialModal.jsx`) que introduce la funcionalidad del portal del paciente: generar, revisar y enviar un resumen post-sesión desde la nota clínica confirmada.

---

## 2. Contenido del Slide

| Campo  | Valor |
|--------|-------|
| `icon` | `📨` |
| `title` | `Comparte el seguimiento con tu paciente` |
| `body` | `Después de confirmar la nota, genera un resumen en lenguaje simple. Lo revisas, lo editas y lo envías — el paciente lo ve en su propio portal.` |

No requiere componente especial (`flow`, `pwa` u otro flag). Es un slide estándar del mismo tipo que los slides 2–4 existentes.

---

## 3. Posición y Conteo de Slides

El slide se agrega como el **quinto elemento** de `SLIDES_DESKTOP`.

| Plataforma | Antes | Después |
|------------|-------|---------|
| Desktop | 4 slides | 5 slides — el nuevo es el último ("Finalizar") |
| Mobile | 5 slides (4 + PWA) | 6 slides — el nuevo es el 5, PWA sigue siendo el 6 |

La lógica existente de `slides = isMobile ? [...SLIDES_DESKTOP, { pwa: true }] : SLIDES_DESKTOP` no cambia.

---

## 4. Cambio de Código

### `frontend/src/components/TutorialModal.jsx`

Agregar un objeto al final del array `SLIDES_DESKTOP`, antes del cierre `]`:

```js
{
  icon: '📨',
  title: 'Comparte el seguimiento con tu paciente',
  body: 'Después de confirmar la nota, genera un resumen en lenguaje simple. Lo revisas, lo editas y lo envías — el paciente lo ve en su propio portal.',
},
```

No se modifica ningún otro archivo del componente.

---

## 5. Tests a Actualizar

### `frontend/src/components/TutorialModal.test.jsx`

Actualizar cualquier assertion que dependa del conteo total de slides:

- Desktop: `total = 5` (antes 4)
- Mobile: `total = 6` (antes 5)

Agregar un test que verifique que el nuevo slide aparece en la posición correcta (índice 4) con el título y body esperados.

---

## 6. Fuera de Alcance

- No se modifica el `FlowDiagram` del slide 1.
- No se añade ningún componente visual especial al nuevo slide.
- No se toca lógica de `localStorage`, navegación ni `App.jsx`.
