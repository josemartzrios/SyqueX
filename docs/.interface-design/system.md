# SyqueX Interface System

## Direction

**"Clinical Notebook"** — A calm, focused clinical documentation workspace. Visual language comes from physical consultation materials: warm paper, good ink, sage green. Not a SaaS chat app. Every surface traces to paper; every color comes from the consultation room.

**User:** A psychologist between sessions — focused, time-pressed, dealing with sensitive clinical content. Needs precision without friction.

**Task:** Dictate session notes → receive structured SOAP documentation → review and download.

**Feel:** Warm like a clinical notepad. Precise like a medical record. Calm like a therapy room.

---

## Palette

```css
/* Backgrounds */
--parchment:      #F7F4EF   /* base surface — quality paper */
--parchment-dark: #EDE8E0   /* slightly elevated — hover states, input bg */
--surface:        #FFFFFF   /* card surfaces, panels */

/* Text hierarchy */
--ink:            #1C1917   /* primary text */
--ink-secondary:  #57534E   /* supporting text */
--ink-tertiary:   #A8A29E   /* metadata, labels */
--ink-muted:      #D6D3D1   /* disabled, borders, placeholders */

/* Brand accent */
--sage:           #5B7A6A   /* primary action — therapeutic calm */
--sage-dark:      #3D5248   /* hover state for sage */
--sage-light:     #EBF2EE   /* sage tint — active item bg */
--sage-50:        #F4F8F5   /* very light sage tint */

/* Semantic */
--error:          red-700 / red-50 bg / red-200 border
--success:        emerald-600 / emerald-500 dot
--warning:        amber-600 / amber-500 dot
```

**Tailwind config** (loaded via CDN in index.html):
```js
colors: {
  ink: { DEFAULT: '#1C1917', secondary: '#57534E', tertiary: '#A8A29E', muted: '#D6D3D1' },
  sage: { DEFAULT: '#5B7A6A', dark: '#3D5248', light: '#EBF2EE', 50: '#F4F8F5' },
  parchment: { DEFAULT: '#F7F4EF', dark: '#EDE8E0' }
}
```

---

## Depth Strategy

**Surface color shifts + quiet borders.** No dramatic drop shadows.

- Base: `bg-parchment` (#F7F4EF)
- Left panel: `bg-white/40` — slightly lighter than base
- Cards / note documents: `bg-white border border-ink/[0.07]` — white surface, whisper border
- Inputs: `bg-white border border-ink/[0.10]` — slightly more defined
- Active item: `bg-sage-light` — sage tint, no border needed
- Hover: `hover:bg-parchment-dark/70` — subtle warm shift
- Overlays/modals: `bg-ink/40 backdrop-blur-sm`

Border scale:
- `border-ink/[0.05]` — row separators
- `border-ink/[0.07]` — panel/section dividers
- `border-ink/[0.10]` — input default
- `border-ink/[0.15]` — input focus (paired with `focus:border-sage/60`)
- `border-sage/20` — SOAP section divider lines

---

## Spacing

Base unit: **4px**. Scale: 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24.

- Micro (icon gaps): gap-1.5 / gap-2
- Component (button padding): px-3 py-1.5 / px-4 py-3
- Card internal: p-5 sm:p-6
- Section gaps: space-y-7 (message feed)
- Major separation: py-4 / py-6

---

## Typography

Font: **Inter** (sans), **Fira Code** (mono — used for dates, version numbers)

Hierarchy:
- Page title / brand: `font-semibold text-[15px] tracking-tight text-ink`
- Section label: `text-[10px] uppercase tracking-[0.12em] font-bold text-ink-tertiary`
- Card header accent: `text-[10px] uppercase tracking-[0.14em] font-bold text-sage`
- Body text: `text-[14px] leading-relaxed text-ink-secondary`
- Metadata / dates: `text-[11px] text-ink-tertiary font-mono`
- Small labels: `text-[11px] font-bold uppercase tracking-wider` (patient names in sidebar)

---

## Layout

**Desktop (md+):** Two-column split
- Left panel: `w-60` persistent session list (case file drawer)
- Right workspace: `flex-1` — header bar + message feed + dictation input
- Max content width: `max-w-2xl mx-auto` in workspace

**Mobile:** Full-screen workspace + slide-over sidebar (85vw, max-w-sm)

Left panel structure:
```
aside.hidden.md:flex.w-60.border-r.border-ink/[0.07].bg-white/40
  ├── header: brand + version
  ├── label: "SESIONES"
  └── scroll list: DesktopConvItem
```

---

## Components

### Clinical Note Document (bot response)
AI responses render as a structured clinical document, NOT a chat bubble.

```jsx
<div className="bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6">
  <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink/[0.06]">
    <span className="text-[10px] uppercase tracking-[0.14em] text-sage font-bold">Nota Clínica · SOAP</span>
    <span className="text-[11px] text-ink-tertiary font-mono">{date}</span>
  </div>
  <ClinicalNote text={msg.text} />
</div>
```

SOAP section header detection: lines matching `/^\*\*(S|O|A|P)\s*[—–\-]/i`
Rendered as: `text-[10px] font-bold text-sage tracking-[0.14em] uppercase` + `h-px bg-sage/20 mt-1.5` divider.

### Dictation Block (user message)
```jsx
<div className="flex items-center gap-2 mb-2.5">
  <span className="text-[10px] uppercase tracking-[0.13em] text-ink-tertiary font-bold">Dictado</span>
  <div className="flex-1 h-px bg-ink/[0.06]" />
</div>
<p className="text-ink-secondary text-[14px] leading-relaxed pl-3 border-l-2 border-parchment-dark whitespace-pre-wrap">{text}</p>
```

### ChatInput (dictation notepad)
```
bg-white border border-ink/[0.10] rounded-2xl px-4 py-3
focus-within: border-sage/50 shadow-sm shadow-sage/10
Send button: bg-sage hover:bg-sage-dark rounded-xl p-2
Word count footer: text-[10px] text-ink-muted (shown when text present)
```

### Desktop Session Item
```
Active:  bg-sage-light, text-ink
Default: hover:bg-parchment-dark/70, text-ink-secondary
Delete:  opacity-0 group-hover:opacity-100, hover:bg-red-50 hover:text-red-400
```

### New Patient Button
```
border border-sage/30 hover:border-sage/60 bg-sage-light/50 hover:bg-sage-light
text-sage hover:text-sage-dark rounded-full px-3 py-1.5 text-[13px] font-medium
```

### Primary CTA (modal confirm)
```
bg-sage hover:bg-sage-dark text-white font-medium rounded-xl py-3
```

### Loading dots
```jsx
<span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
<span className="w-1.5 h-1.5 bg-sage/70 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
<span className="w-1.5 h-1.5 bg-sage/40 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
```

### Welcome message pulse dot
```jsx
<span className="inline-block w-1.5 h-1.5 bg-sage rounded-full animate-pulse ml-2 mb-0.5 align-middle" />
```

### Sidebar accent bar
```jsx
<div className="w-1 h-5 bg-sage rounded-full" />
```

---

## Empty States

```jsx
<div className="w-14 h-14 rounded-2xl bg-parchment-dark border border-ink/[0.07] flex items-center justify-center">
  {/* document icon, text-ink-muted */}
</div>
<p className="text-ink-secondary text-sm font-medium">Sin expediente activo</p>
<p className="text-ink-tertiary text-xs mt-1">Subtitle guidance</p>
```

---

## Vocabulary (Spanish)

Use clinical vocabulary throughout:
- "Sin expediente activo" (not "No hay conversación activa")
- "Sesiones clínicas" (not "Bandeja de conversaciones")
- "Dictado" (as message label)
- "Nota Clínica · SOAP" (document header)
- "Archivar sesión" (not "Eliminar conversación")
- "Sesión #N" (not generic numbering)

---

## Border Radius

- Inputs / buttons: `rounded-xl` (12px) or `rounded-full` for pill shapes
- Cards / note document: `rounded-2xl` (16px)
- Modals: `rounded-2xl`
- Small interactive items (desktop conv item): `rounded-xl`
- List item hover targets: `rounded-xl`
- Sidebar accent: `rounded-full`

---

## Scrollbar

```css
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D6D3D1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #A8A29E; }
```
