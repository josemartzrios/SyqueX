# Spec: Rediseño de tabs mobile — SyqueX v2

**Fecha:** 2026-03-27
**Alcance:** `docs/mockups/syquex-v2-mobile.html` — phones 1 y 2 (vista sesión activa)

---

## Contexto

El mockup mobile actual tiene tres tabs en la vista de sesión: `Dictar / Nota / Historial`. El feedback del psicólogo indica que el historial y el dictado deben estar en la misma página, y que el análisis de evolución del paciente merece su propia tab dedicada con acceso directo al agente clínico.

---

## Cambios de estructura

### Tabs (antes → después)

| Antes | Después |
|-------|---------|
| Dictar | Dictar (ahora incluye historial) |
| Nota | Nota (sin cambios) |
| Historial | Evolución (chat con agente clínico) |

La etiqueta del tab es simplemente "Dictar" y "Evolución" — sin caracteres decorativos.

---

## Tab: Dictar

**Orden del contenido (top → bottom):**

1. **Franja de chips de sesiones anteriores** — siempre visible, scroll horizontal
   - Un chip por sesión anterior: fecha abreviada + preview truncado de la nota
   - Contenedor (`.history-scroll`) con fondo `var(--surface-base)` (blanco, sin cambio respecto a la implementación actual); chips individuales con fondo `var(--surface-sheet)`, separados del textarea por `border-bottom: 1px solid var(--border-soft)`
   - No colapsable — disponible como referencia inmediata

2. **Área de dictado** — textarea con label "Dictado · {fecha}"
   - Sin cambios visuales respecto al diseño actual

3. **Botones de acción** (sticky bottom):
   - "⏺ Próximamente" (mic, deshabilitado)
   - "Generar nota →" (sage, primario)

**Nota:** El botón "↗ Evolución" del patient-strip se elimina en **ambos** phone 1 y phone 2 — ya existe como tab dedicada. También actualizar el label del tab inactivo "Historial" → "Evolución" en el row de tabs de phone 1 (aunque su contenido no sea visible).

---

## Tab: Evolución

Reemplaza `Historial`. Tres zonas verticales:

### 1. Resumen automático (bloque superior)
- Fondo `var(--sage-light)` (#eaf4f0), borde inferior `rgba(90,158,138,0.15)`
- Label small-caps "Resumen del paciente" en `var(--sage-dark)`
- Contenido en serif (Georgia): 2–3 líneas con estado de los ejes clínicos principales
  - Ejemplo: *"Regulación emocional: progreso sostenido. Miedo al rechazo en autoridad: activo. Alianza terapéutica: sólida."*
- Se genera con el historial clínico existente del paciente

### 2. Preguntas rápidas
- Label small-caps "Preguntas frecuentes" en `var(--text-muted)`
- 2–3 chips clicables con preguntas predefinidas:
  - "¿Evolución de riesgo?"
  - "¿Temas recurrentes?"
  - "¿Progreso en objetivos?"
- Al hacer clic, la pregunta se envía como mensaje al agente

### 3. Chat libre
- Mensajes del agente: burbuja blanca con borde suave, alineada a la izquierda, label "Agente clínico" encima
- Mensajes del psicólogo: burbuja con fondo `var(--sage)`, texto blanco, alineada a la derecha
- Input sticky en el fondo: fondo `var(--surface-sheet)`, border-radius pill, placeholder "Pregunta sobre {nombre}…"
- Botón enviar: círculo sage con flecha ↑

---

## Paleta y tipografía (sin cambios)

- Base: `#ffffff`, sheet: `#f4f4f2`, sage: `#5a9e8a`, amber: `#c4935a`, ink: `#18181b`
- Notas y resumen: Georgia serif
- Chat, dictado, UI: system sans-serif

---

## Frames del mockup

| Frame | Estado del tab activo | Cambios |
|-------|-----------------------|---------|
| Phone 1 | Dictar (activo) | Chips historial arriba del textarea; tab row actualizado (Historial→Evolución); btn-evolucion eliminado |
| Phone 2 | Nota (activo) | Tab row actualizado (Historial→Evolución); btn-evolucion eliminado |
| **Phone 3 (nuevo)** | **Evolución (activo)** | **Frame nuevo mostrando las 3 zonas: resumen, preguntas rápidas, chat con un intercambio de ejemplo** |
| Phone 4 | Lista de pacientes | Sin cambios (antes era Phone 3) |

## Archivos a modificar

- `docs/mockups/syquex-v2-mobile.html` — phones 1, 2 y 4 (modificados) + phone 3 nuevo (Evolución)

---

## Fuera de alcance

- Lógica de backend para el resumen automático (mockup estático)
- Implementación real del chat (mockup estático)
- App.jsx y api.js — solo mockup HTML
