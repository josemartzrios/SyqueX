# Spec: Jerarquía Visual SOAP + Migración Tema Claro

**Fecha:** 2026-03-22
**Feature:** MVP #1 — Jerarquía visual SOAP
**Branch:** `feature/soap-visual-hierarchy` (desde `dev`)
**Componente afectado:** `frontend/src/components/NoteReview.jsx`

---

## Contexto

`NoteReview.jsx` actualmente usa dark mode (bg-slate-800, text-cyan-400) que no corresponde al sistema de diseño "Clinical Notebook" documentado en `docs/.interface-design/system.md`. Las cuatro secciones SOAP se renderizan con el mismo estilo de label, sin diferenciación visual entre S/O/A/P.

Este spec cubre:
1. Migración completa del componente al tema claro (parchment/white/sage)
2. Cards SOAP con jerarquía visual por sección
3. Estado "Borrador" explícito antes de confirmar
4. Botón CTA responsivo para mobile

---

## Diseño

### Estructura del documento clínico

El componente renderiza como un documento clínico, no como un mensaje de chat. Contenedor externo:

```
bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6
```

Header del documento (siempre visible cuando hay nota clínica):
```
flex justify-between items-center mb-4 pb-3 border-b border-ink/[0.06]
  ├── "Nota Clínica · SOAP"  →  text-[10px] uppercase tracking-[0.14em] text-sage font-bold
  └── fecha de sesión        →  text-[11px] text-ink-tertiary font-mono
```

### Cards SOAP

Una card por sección (S / O / A / P). Solo se renderiza si la sección tiene contenido. Orden fijo: S → O → A → P. Gap entre cards: `space-y-2`.

Estructura de cada card:
```
rounded-xl overflow-hidden border {color-border}
  ├── header: {color-bg} px-3.5 py-1.5 flex items-center gap-2
  │     ├── letra:  text-[13px] font-black font-mono {color-label}
  │     └── label:  text-[10px] uppercase tracking-[0.14em] font-bold {color-label}
  └── body:   bg-white px-3.5 py-2.5
              text-[14px] leading-relaxed text-ink-secondary
```

**Colores por sección:**

| Sección | Border | Header bg | Label color |
|---------|--------|-----------|-------------|
| S · Subjetivo | `border-sage/20` | `bg-sage-light` | `text-sage-dark` |
| O · Objetivo | `border-sky-200/60` | `bg-sky-50` | `text-sky-700` |
| A · Análisis | `border-amber-200/60` | `bg-amber-50` | `text-amber-800` |
| P · Plan | `border-emerald-200/60` | `bg-emerald-50` | `text-emerald-800` |

> **Nota:** sky-50, amber-50, emerald-50 son clases Tailwind estándar. sage-light y sage-dark son tokens del design system (`#EBF2EE` y `#3D5248`).

### Alertas detectadas

Sin cambio de posición (debajo de cards SOAP). Migración a light mode:

```
bg-red-50 border border-red-200/60 rounded-xl p-3
  ├── label: text-[10px] uppercase tracking-[0.12em] font-bold text-red-700
  └── lista: text-[13px] text-red-800
```

### Patrones evolutivos

```
bg-amber-50 border border-amber-200/60 rounded-xl p-3
  ├── label: text-[10px] uppercase tracking-[0.12em] font-bold text-amber-700
  └── lista: text-[13px] text-amber-800
```

### CTA bar (Borrador + Confirmar)

Siempre al fondo del documento, separada por `border-t border-ink/[0.06] pt-4 mt-4`.

**Layout — mismo en desktop y mobile (`flex justify-between items-center gap-3`):**

```
├── Pill "BORRADOR"
│     bg-parchment-dark text-ink-tertiary text-[11px] font-semibold
│     tracking-[0.06em] rounded-full px-3 py-1
│     (desaparece al confirmar, reemplazado por check verde)
│
└── Botón Confirmar / estado Guardado
      Desktop:  "✓ Confirmar en Expediente"
      Mobile (< sm): "✓ Confirmar"
      Clases: bg-sage hover:bg-sage-dark text-white text-[13px]
              font-medium rounded-xl px-4 py-2
      Estado guardado: text-emerald-600 text-[13px] font-medium
                       flex items-center gap-1 (ícono check + "Guardado")
```

### Texto conversacional (fallback)

Cuando Claude responde en texto libre sin tools, se renderiza con:
```
text-[14px] leading-relaxed text-ink-secondary whitespace-pre-wrap
```
Sin cambios de comportamiento, solo migración de color.

---

## Responsividad

| Breakpoint | Comportamiento |
|------------|----------------|
| `< sm` (< 640px) | Botón muestra "✓ Confirmar" (texto corto) |
| `sm+` | Botón muestra "✓ Confirmar en Expediente" |
| Ambos | CTA bar siempre en una sola fila (`flex`) |

---

## Fuera de alcance

- Otros componentes (`ChatInput`, `SessionHistory`, `PatientCard`, `Sidebar`) — migración de tema se hará en features separadas
- Lógica de guardado / `confirmNote` — sin cambios
- Backend / API — sin cambios
- PDF export — feature separada del MVP

---

## Criterios de aceptación

1. `NoteReview` no contiene ninguna clase `slate-*`, `cyan-*` o dark-mode
2. Las 4 secciones SOAP renderizan con card y color de header diferenciado
3. El estado "BORRADOR" es visible antes de confirmar
4. El botón CTA muestra texto corto en mobile y largo en desktop
5. Alertas y patrones usan colores light mode
6. El componente se ve correctamente en viewport 375px y 1280px
