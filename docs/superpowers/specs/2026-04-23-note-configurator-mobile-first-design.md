# Onboarding + NoteConfigurator — Rediseño Mobile-First

**Fecha:** 2026-04-23  
**Contexto:** El `OnboardingScreen` y el `NoteConfigurator` fueron diseñados para desktop. En pantallas de 300–375px el chrome del configurador consumía 192px dejando solo 108px útiles, y la pantalla de onboarding era imposible de scrollear. Además hay un bug de navegación que atrapa al usuario en `OnboardingScreen` al elegir "Personalizar".

**Principio guía — Mobile-first:** diseñar desde 300px hacia arriba. Desktop hereda y expande.

**Flujo post-onboarding:** una vez completado el onboarding, el usuario usa el **toggle SOAP/Personalizada** del `DictationPanel` para cambiar de formato en cualquier momento, y el link **"Editar plantilla"** (visible cuando el toggle está en Personalizada) para reconfigurar sus campos. Ambos ya están implementados y funcionan en desktop y mobile.

---

## Parte 1 — OnboardingScreen

### Bug de navegación (root cause)

`onSelectCustom` llama `setShowNoteConfigurator(true)` pero no cambia `onboardingCompleted`. En el siguiente render el bloque de early-return `if (!onboardingCompleted && template !== null)` vuelve a ejecutarse y retorna `<OnboardingScreen>` porque el `<NoteConfigurator>` vive dentro del `return (` principal que nunca se alcanza.

**Fix:** añadir `else if (showNoteConfigurator)` dentro del bloque de onboarding en App.jsx:

```jsx
if (!onboardingCompleted && template !== null) {
  if (template.fields?.length > 0) {
    localStorage.setItem('syquex_onboarding_done', 'true');
    setOnboardingCompleted(true);
  } else if (showNoteConfigurator) {
    return (
      <NoteConfigurator
        initialFields={[]}
        isFirstTime={true}
        onSave={async (fields) => { /* guardar + marcar onboarding completo */ }}
        onCancel={() => { /* marcar onboarding como soap + cerrar */ }}
      />
    );
  } else {
    return <OnboardingScreen ... />;
  }
}
```

### Diseño mobile-first — Cards tappables

La card completa es el botón. Sin fila de botones separada debajo. El texto descriptivo largo se oculta en mobile con `hidden md:block`.

**"Decidir después" eliminado.** El onboarding es obligatorio — el usuario debe elegir SOAP o Personalizada antes de entrar a la app. No hay prop `onSkip` en `OnboardingScreen`.

**Layout mobile:**

```
┌──────────────────────────────────┐
│ ⚡ SyqueX            p-4 top     │  logo inline (no absolute)
│                                  │
│ ¿Cómo quieres documentar         │  text-[20px] md:text-[26px] font-bold
│ tus sesiones?                    │
│ Solo te preguntamos una vez.     │  text-[12px] text-muted mb-5
│                                  │
│ ┌──────────────────────────────┐ │  ← onClick = onSelectSoap
│ │ 📄  Formato SOAP             │ │  p-4, border rounded-xl
│ │              [Estándar ›]    │ │  badge alineado a la derecha
│ │ [S Subjetivo][O][A][P]       │ │  pills compactos
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │  ← onClick = onSelectCustom
│ │ ✏️  Nota personalizada       │ │  border-[#5a9e8a] bg-[#f0f8f5]
│ │              [Recomendado ›] │ │
│ │ [Motivo][Estado][+ campos…]  │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

Sin link "Decidir después". Sin botones separados debajo de las cards.

**Desktop (md+):** mismas cards, agregan párrafo descriptivo con `hidden md:block`. Sin botones separados.

**Especificaciones de las cards:**

| Elemento | Valor |
|----------|-------|
| Card padding | `p-4 md:p-5` |
| Card border radius | `rounded-xl` |
| Card SOAP border | `border border-black/[0.08]` |
| Card Custom border | `border-2 border-[#5a9e8a]` + `bg-[#f0f8f5]/50` |
| Card hover | `hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer` |
| Texto descriptivo | `<p className="hidden md:block text-[13px] text-[#6b7280] mt-2 mb-3">` |
| h1 | `text-[20px] md:text-[26px] font-bold` |
| Wrapper externo | `p-4 md:p-8`, sin card blanca contenedora en mobile |

**Pills SOAP:** `text-[10px] md:text-[11px] px-2 py-0.5 md:px-2.5 md:py-1`

**Chips Custom:** `text-[10px] md:text-[11px]`, mismo patrón

### Props de OnboardingScreen

```jsx
// Antes
OnboardingScreen({ onSelectSoap, onSelectCustom, onSkip })

// Después — onSkip eliminado
OnboardingScreen({ onSelectSoap, onSelectCustom })
```

App.jsx deja de pasar `onSkip`. El bloque de onboarding en App.jsx también elimina el handler `onSkip` de `setOnboardingCompleted` que existía para "Decidir después".

### NoteConfigurator "← Volver" desde onboarding

Cuando `isFirstTime=true` (flujo desde onboarding), el botón "← Volver" en el bottombar regresa a `OnboardingScreen` — no completa el onboarding con SOAP por defecto. El `onCancel` cuando `isFirstTime=true` simplemente hace `setShowNoteConfigurator(false)`, lo que devuelve el render al bloque `else` del onboarding que muestra `<OnboardingScreen>`.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/OnboardingScreen.jsx` | Reescribir con cards tappables, mobile-first, eliminar `onSkip` |
| `frontend/src/App.jsx` | Añadir `else if (showNoteConfigurator)` en bloque onboarding; eliminar `onSkip` handler |

### Tests a actualizar

`OnboardingScreen.test.jsx`:
- Eliminar tests que referencian `onSkip` / "Decidir después"
- Actualizar firma del componente: ya no recibe `onSkip`
- Cards son los botones — los tests deben hacer click en la card completa o en el texto del título

---

## Parte 2 — NoteConfigurator

### Chrome antes / después

| Elemento | Antes | Después |
|----------|-------|---------|
| Topbar height | `h-16` (64px) | `h-10` (40px) |
| Bottombar height | `h-20` (80px) | `h-[52px]` |
| Mobile tabs | 48px (eliminados) | — |
| **Total chrome** | **192px** | **92px** |
| **Área útil en 300px** | **108px** | **208px** |

- Topbar: logo icono, título `text-[13px]`
  - `isFirstTime=true` (onboarding): sin botón "Saltar" en topbar — el onboarding es obligatorio
  - `isFirstTime=false` (edición): botón "✕ Cerrar" `text-[12px]` en topbar
- Bottombar: `← Volver` + `Guardar y entrar →` / `Guardar cambios`, botones `py-2 text-[13px]`
  - `isFirstTime=true`: "← Volver" regresa a `OnboardingScreen` (no completa onboarding)
  - `isFirstTime=false`: "← Volver" / "Cancelar" cierra el overlay
- **Sin tabs Diseñar/Vista previa** — eliminados completamente

### Layout mobile (< md): scroll único

```
[topbar 40px — fixed]
scroll-area (overflow-y-auto) {
  A: Lista de secciones (acordeón)
  B: Agregar sección (chips + input)
  C: Vista previa inline (expandible)
}
[bottombar 52px — fixed]
```

### Layout desktop (md+): split-panel

Panel izquierdo `w-[450px]`: lista + agregar sección.  
Panel derecho `flex-1 bg-[#f4f4f2]`: vista previa.  
Topbar `h-16`, bottombar `h-20` (alturas originales recuperadas).

### Sección A — Lista de secciones

**Fila normal:**
```
┌──────────────────────────────────────────────┐
│ ⠿  📝  Motivo de consulta         ↑  ↓   ✕ │  44px
└──────────────────────────────────────────────┘
```

- `py-2.5 px-3`, `gap-1.5` entre filas
- Handle `⠿`: drag en desktop (atributo `draggable`), decorativo en mobile
- **Botones ↑↓** (mobile reorder): siempre visibles, `p-1.5`, hacen swap de posición en `fields`
- Botón ✕: elimina la sección con `stopPropagation`
- Tap en fila → toggle acordeón (abre si cerrada, cierra si activa)

**Fila activa (acordeón abierto):**
```
┌──────────────────────────────────────────────┐
│ ⠿  📝  Motivo de consulta         ↑  ↓   ✕ │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  [📝 Texto libre]  [📊 Escala 1-10]          │
│  [☑️  Opciones]    [📅 Fecha]                │
└──────────────────────────────────────────────┘
```

- Borde `border-[#5a9e8a]` + fondo `bg-[#f0f8f5]`
- Grid 2×2 de `TemplateFieldEditor`: `py-2 px-3 text-[11px]`
- Solo una sección abierta a la vez — abrir otra cierra la anterior
- `activeFieldIndex` controla cuál está abierta (`-1` = ninguna)

**Empty state:**
```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  Agrega secciones abajo para comenzar
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```
`border-dashed p-4 text-[12px] text-center`

### Sección B — Agregar sección

```
AGREGAR SECCIÓN   (label 10px uppercase)

[+ Motivo de consulta][+ Estado de ánimo][+ Intervenciones]
[+ Acuerdos y tareas][+ Escala de malestar][+ Objetivos]
[+ Riesgos][+ Observaciones][+ Recursos]

┌─────────────────────────┐  ┌──────────┐
│  Nombre personalizado…  │  │+ Agregar │
└─────────────────────────┘  └──────────┘
```

- Chips: `text-[11px] px-2.5 py-1 rounded-full` (reducidos)
- Chip usada → `opacity-40 cursor-not-allowed`
- Input + botón en misma fila: `py-2 text-[13px]`
- Enter en input dispara agregar

### Sección C — Vista previa inline

```
──────────────────────────────────────────
VISTA PREVIA                            ∨

┌──────────────────────────────────────┐
│ MOTIVO DE CONSULTA                   │  sage uppercase
│ ▬▬▬▬▬▬▬▬▬▬ ▬▬▬▬▬▬▬                 │
│                                      │
│ ESTADO DE ÁNIMO                      │  campo activo → ámbar
│ ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩             │
└──────────────────────────────────────┘
```

- Header `text-[10px] uppercase tracking-wide` + chevron `∨/∧`
- **Por defecto: expandida**
- Colapsada: solo el header (40px)
- `NotePreview` existente reutilizado sin cambios — recibe `fields` y `activeFieldIndex`

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `NoteConfigurator.jsx` | Reescribir layout: eliminar tabs, chrome compacto, acordeón, ↑↓, preview inline colapsable |
| `TemplateFieldEditor.jsx` | `p-4` → `py-2 px-3` en botones de tipo; emoji `text-xl` → `text-base` |

`NotePreview.jsx` — sin cambios.

### Tests a actualizar

`NoteConfigurator.test.jsx`:
- Eliminar tests que referencian tabs "Diseñar" / "Vista previa" (eliminados)
- Agregar: botones ↑↓ reordenan campos correctamente
- Agregar: tap en sección abre acordeón; tap en otra sección cierra la anterior y abre la nueva
- Agregar: preview se colapsa/expande con chevron
