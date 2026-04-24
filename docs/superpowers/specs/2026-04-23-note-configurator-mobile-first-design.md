# NoteConfigurator — Rediseño Mobile-First

**Fecha:** 2026-04-23  
**Contexto:** El `NoteConfigurator` fue diseñado como split-panel de desktop. En pantallas de 300–375px, el chrome consumía 192px (topbar 64px + tabs 48px + bottombar 80px), dejando solo ~108px de área útil. Se eliminan los tabs Diseñar/Vista previa y se adopta un scroll único compacto.

---

## Principio guía

**Mobile-first:** diseñar desde 300px hacia arriba. Desktop hereda el layout mobile y agrega el split-panel solo en `md+`.

---

## Chrome (topbar + bottombar)

| Elemento | Antes | Después |
|----------|-------|---------|
| Topbar height | `h-16` (64px) | `h-10` (40px) |
| Bottombar height | `h-20` (80px) | `h-[52px]` |
| Mobile tabs | 48px (eliminados) | — |
| **Total chrome** | **192px** | **92px** |
| **Área útil en 300px** | **108px** | **208px** |

- Topbar: logo (icono, sin texto en mobile), título `text-[13px]`, botón "Saltar" `text-[12px]`
- Bottombar: `← Volver` + `Guardar y entrar →` / `Guardar cambios`, botones `py-2 text-[13px]`
- **Sin tabs Diseñar/Vista previa** — eliminados en mobile

---

## Layout mobile (< md): scroll único

```
[topbar 40px — fixed]
scroll-area {
  Sección A: Lista de secciones (acordeón)
  Sección B: Agregar sección (chips + input)
  Sección C: Vista previa inline (expandible)
}
[bottombar 52px — fixed]
```

Todo en una sola columna. Sin tabs. El usuario hace scroll natural hacia abajo.

---

## Sección A: Lista de secciones

### Fila de sección (vacía)

```
┌──────────────────────────────────────────────┐
│ ⠿  📝  Motivo de consulta         ↑  ↓   ✕ │  44px
└──────────────────────────────────────────────┘
```

- `py-2.5 px-3`, `gap-1.5` entre filas
- Handle `⠿`: drag en desktop, decorativo en mobile
- **Botones ↑↓**: mecanismo de reordenado en mobile — siempre visibles, `p-1.5`, tocan `setFields` con swap de índices
- Botón ✕: elimina la sección
- Tap en la fila → abre editor de tipo (acordeón)

### Fila activa (editor inline expandido)

```
┌──────────────────────────────────────────────┐
│ ⠿  📝  Motivo de consulta         ↑  ↓   ✕ │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  [📝 Texto libre] [📊 Escala 1-10]           │
│  [☑️  Opciones]   [📅 Fecha]                 │
└──────────────────────────────────────────────┘
```

- `border-[#5a9e8a] bg-[#f0f8f5]` cuando activa
- Grid 2×2 del `TemplateFieldEditor`: botones `py-2 px-3 text-[11px]`
- Solo una sección abierta a la vez (cerrar la activa al abrir otra)
- `TemplateFieldEditor` existente se reutiliza, solo se ajusta padding

### Empty state

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  Agrega secciones abajo para comenzar
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- `border-dashed p-4 text-[12px] text-center`

---

## Sección B: Agregar sección

```
AGREGAR SECCIÓN (label uppercase 10px)

[+ Motivo de consulta][+ Estado de ánimo][+ Intervenciones]
[+ Acuerdos y tareas][+ Escala de malestar][+ Objetivos]
[+ Riesgos][+ Observaciones][+ Recursos]

┌─────────────────────┐  ┌──────────┐
│ Nombre personalizado│  │ + Agregar│
└─────────────────────┘  └──────────┘
```

- Chips: `text-[11px] px-2.5 py-1 rounded-full` (reducidos vs `text-[12px] px-3 py-1.5` actual)
- Chip usada → `opacity-40 cursor-not-allowed`
- Input + botón en misma fila: `py-2 text-[13px]`
- Enter en input = agregar

---

## Sección C: Vista previa inline

```
──────────────────────────────────────────
VISTA PREVIA                            ∨

┌──────────────────────────────────────┐
│ MOTIVO DE CONSULTA                   │  ← sage uppercase
│ ▬▬▬▬▬▬▬▬▬▬ ▬▬▬▬▬▬▬                 │
│                                      │
│ ESTADO DE ÁNIMO                      │  ← campo activo en ámbar
│ ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩             │
└──────────────────────────────────────┘
```

- Header "VISTA PREVIA" `text-[10px] uppercase tracking-wide` + chevron toggle
- **Por defecto: expandida**
- Colapsada: solo el header (40px), sin la card
- `NotePreview` existente reutilizado sin cambios
- Campo activo (sección seleccionada en lista) → resaltado en ámbar dentro del preview

---

## Layout desktop (md+): split-panel sin cambios

En `md+` se mantiene el split-panel actual:
- Panel izquierdo `w-[450px]`: lista + agregar sección
- Panel derecho `flex-1`: vista previa
- Topbar y bottombar recuperan sus alturas originales: `h-16` y `h-20`

Los mobile tabs desaparecen porque la lógica de "una columna / dos columnas" se maneja exclusivamente con clases responsive.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `NoteConfigurator.jsx` | Reescribir layout: eliminar tabs, chrome compacto, acordeón, ↑↓, preview inline |
| `TemplateFieldEditor.jsx` | Reducir padding de botones tipo: `p-4` → `py-2 px-3`, `text-xl` emoji → `text-base` |

`NotePreview.jsx` no cambia.

---

## Tests a actualizar

`NoteConfigurator.test.jsx`:
- Eliminar tests que referencian tabs "Diseñar" / "Vista previa"
- Agregar test: botones ↑↓ reordenan campos correctamente
- Agregar test: tap en sección abre editor, tap en otra sección cierra la anterior
