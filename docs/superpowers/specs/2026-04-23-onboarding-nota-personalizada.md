# Spec: Onboarding post-login + rediseño configurador de nota personalizada

**Fecha:** 2026-04-23
**Branch base:** `dev`
**Feature branch:** `feature/onboarding-nota-personalizada`

---

## Contexto

La app actualmente presenta el configurador de nota personalizada de forma reactiva: aparece como modal solo después de que el usuario envía su primer dictado y no tiene plantilla. Además incluye subida de PDF como opción primaria de configuración.

Este spec describe el rediseño en tres partes:
1. Pantalla de onboarding post-login (primera vez)
2. Nuevo configurador visual con preview en vivo (sin PDF)
3. Toggle SOAP / Personalizada en el panel de dictado con acceso a editar plantilla

---

## 1. Pantalla de onboarding post-login

### Cuándo aparece
- Una sola vez: al primer login exitoso del usuario (cuando `template` es `null` o `template.fields` es `[]` y `onboarding_completed` no está marcado en backend o localStorage).
- Pantalla completa, antes de acceder a la app. No es un modal sobre la app — reemplaza la vista principal.
- Una vez completado (eligiendo SOAP, guardando plantilla personalizada, o haciendo skip), no vuelve a aparecer.

### Layout
Tarjeta centrada (`max-w-[560px]`) sobre fondo `#f4f4f2`. Contenido:

- **Logo SyqueX** (top left)
- **Step label:** `Paso 1 de 1 · Solo te preguntamos esto una vez`
- **Título:** `¿Cómo quieres documentar tus sesiones?`
- **Subtítulo:** `Elige el formato de tus notas clínicas. Siempre podrás cambiarlo desde ajustes.`

### Tarjeta SOAP
- Ícono documento (sage)
- Badge: `Estándar clínico`
- Descripción: _"Estructura clásica de documentación usada en psicología y medicina. El agente organiza tu dictado en cuatro secciones automáticamente."_
- Píldoras explicativas en la misma tarjeta:
  - `S Subjetivo` · `O Objetivo` · `A Análisis` · `P Plan`
  - Con la letra inicial en color sage

### Tarjeta Nota personalizada
- Ícono lápiz (amber)
- Badge: `Recomendado` (fondo sage, texto blanco)
- Descripción: _"Diseña los campos que tú ya usas en tu práctica. El agente aprende tu formato y lo llena desde el dictado."_
- Chips de ejemplo: `Motivo de consulta` · `Estado de ánimo` · `Intervenciones` · `+ tus campos…`

### CTAs
- Botón secundario (borde, fondo blanco): **"Usar SOAP"** → guarda `format: 'soap'`, marca onboarding completado, entra a la app
- Botón primario (sage): **"Personalizar mi nota →"** → navega al configurador (sección 2)
- Link de escape: **"Decidir después — entrar a la app"** → entra a la app sin configurar (comportamiento igual que SOAP hasta que configure)

### Estado en frontend
- `onboardingCompleted` en `localStorage` (clave: `syquex_onboarding_done`). No requiere campo extra en backend.
- Si `onboardingCompleted === true`, App renderiza directamente la vista principal.

---

## 2. Configurador visual con preview en vivo

Aplica para: flujo de onboarding (si eligió "Personalizar") y para edición posterior desde la app.

### Layout: split panel
```
┌─────────────────────────────────────────────────────┐
│  SyqueX           Configura tu nota       Saltar    │  ← topbar
├───────────────────────┬─────────────────────────────┤
│   Panel izquierdo     │   Panel derecho             │
│   (constructor)       │   (preview en vivo)         │
├───────────────────────┴─────────────────────────────┤
│  [← Volver]           [Guardar y entrar a SyqueX →] │  ← bottombar
└─────────────────────────────────────────────────────┘
```

En mobile: tabs "Diseñar" / "Vista previa" en lugar de split.

### Panel izquierdo — constructor

**Lista de secciones:**
- Cada sección muestra: drag-handle `⠿`, nombre, icono del tipo de campo, botón `✕` eliminar
- La sección activa (seleccionada) se resalta con borde sage
- Drag-to-reorder (librería existente o HTML5 drag API)

**Editor de tipo de campo** (aparece bajo la lista cuando una sección está activa):
- Label: `Tipo de campo — [nombre sección]`
- Grid 2×2 de tarjetas con icono grande + label:
  - 📝 Texto libre
  - 📊 Escala 1–10
  - ☑️ Opciones
  - 📅 Fecha
- La tarjeta activa tiene borde sage y fondo `#f0f8f5`
- **Sin campo "pregunta guía"** — el agente infiere del nombre del campo

**Área de agregar secciones:**
- Label: `Agregar sección`
- Chips de secciones sugeridas (comunes en psicología):
  - Motivo de consulta · Estado de ánimo · Intervenciones · Acuerdos y tareas · Escala de malestar · Objetivos · Riesgos · Observaciones · Recursos
  - Al hacer clic, agrega la sección a la lista y la activa
- Input + botón `+ Agregar` para nombre personalizado
- Los chips ya usados se deshabilitan (o se ocultan)

### Panel derecho — preview en vivo
- Fondo `#fafafa`, paper blanco con borde, tipografía Georgia (expediente)
- Muestra cada sección como bloque con:
  - Nombre en small caps sage
  - Placeholder visual según tipo: líneas grises (texto), dots de escala 1-10, checkboxes (opciones), campo de fecha
- La sección activa en el constructor se resalta con nombre en amber y placeholder amber
- Se actualiza en tiempo real al agregar/eliminar/reordenar

### Eliminaciones respecto al configurador actual
- ❌ Subida de PDF (`TemplatePdfUpload`) — eliminado completamente
- ❌ Campo `guiding_question` en `TemplateFieldEditor` — eliminado
- ❌ Modal `TemplateSetupModal` con elección PDF/wizard — reemplazado por esta pantalla
- ❌ Trigger reactivo post-dictado — reemplazado por onboarding proactivo

### Guardado
- Llama `saveTemplate(fields)` (endpoint existente)
- En onboarding: al guardar → marca `syquex_onboarding_done`, entra a la app
- En edición desde app: al guardar → cierra modal/panel, vuelve al dictado

---

## 3. Toggle SOAP / Personalizada en el panel de dictado

### Ubicación
En `DictationPanel`, entre el label de fecha y el textarea. Siempre visible.

### Layout
```
Dictado · 23 abr 2026

[ SOAP | Personalizada ]          Editar plantilla ✏
┌─────────────────────────────────┐
│  Dicta los puntos clave…        │
└─────────────────────────────────┘
[  Generar nota personalizada    ]
```

### Pill toggle
- Dos opciones: `SOAP` / `Personalizada`
- Fondo del track: `#f4f4f2`
- Opción activa: fondo blanco, sombra sutil, texto `#18181b`
- Opción inactiva: texto `#6b7280`

### "Editar plantilla" link
- Solo visible cuando el toggle está en "Personalizada"
- Icono lápiz + texto `Editar plantilla` en `#9ca3af`, underline
- Al hacer clic: abre el configurador en modo edición como overlay full-screen (mismo componente `NoteConfigurator`, con botón "Guardar cambios" en lugar de "Guardar y entrar")
- Si no hay plantilla configurada y el usuario cambia a "Personalizada": abre el configurador directamente (no puede generar sin campos)

### Texto del botón "Generar"
- Toggle en SOAP: `"Generar nota SOAP"`
- Toggle en Personalizada: `"Generar nota personalizada"`

### Estado
- `noteFormat: 'soap' | 'custom'` en `App.jsx` (state local, persiste en `localStorage` con clave `syquex_note_format` para que el psicólogo no tenga que cambiar el toggle en cada recarga)
- Valor inicial: si `template.fields?.length > 0` → `'custom'`; si no → `'soap'`
- El "Saltar" del topbar del configurador se comporta distinto según contexto: en onboarding → va a la app sin configurar; en edición desde app → cierra el overlay sin guardar cambios

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `App.jsx` | Añadir lógica de onboarding, reemplazar trigger reactivo, pasar `noteFormat` y `onEditTemplate` a `DictationPanel` |
| `DictationPanel.jsx` | Añadir pill toggle + link "Editar plantilla" |
| `TemplateSetupModal.jsx` | Eliminar (reemplazado por `NoteConfigurator`) |
| `TemplatePdfUpload.jsx` | Eliminar |
| `TemplateWizard.jsx` | Refactorizar → `NoteConfigurator.jsx` (nuevo componente) |
| `TemplateFieldEditor.jsx` | Actualizar: eliminar `guiding_question`, rediseñar selector de tipo con iconos |
| `OnboardingScreen.jsx` | Nuevo componente |
| `NoteConfigurator.jsx` | Nuevo componente (split panel: constructor + preview) |
| `NotePreview.jsx` | Nuevo componente (preview en vivo, reutilizable) |

---

## Comportamiento de edge cases

| Caso | Comportamiento |
|------|---------------|
| Usuario eligió SOAP en onboarding y luego quiere personalizar | Toggle → "Personalizada" → si no hay plantilla, abre configurador |
| Usuario hizo skip y no configuró nada | Toggle arranca en "SOAP"; "Personalizada" deshabilitada hasta configurar |
| Usuario edita plantilla con notas ya confirmadas | Las notas anteriores no se re-generan; solo afecta sesiones futuras |
| Plantilla sin campos (borró todos) | No se puede guardar; botón deshabilitado |
| Mobile | Configurador en pantalla completa con tabs "Diseñar" / "Vista previa" |
