# FAQ Accordion — Landing Page

## Contexto

La landing page de SyqueX (`/landing/`) necesita una sección de Preguntas Frecuentes en formato acordeón. El objetivo es resolver las tres objeciones principales del psicólogo prospecto antes de que llegue a ver el precio, aumentando la tasa de conversión.

## Posición en la página

```
Nav → Hero → Benefits → FAQ → Pricing → Footer
```

FAQ va antes de Pricing para que las objeciones (privacidad, comparación con ChatGPT, responsabilidad profesional) queden resueltas antes de mostrar el costo.

## Componente

**Archivo nuevo:** `landing/components/FAQ.tsx`

- Directiva `'use client'` — es el único componente interactivo de la landing
- Estado: `useState<number | null>(null)` — índice del ítem abierto; `null` si todos cerrados
- Comportamiento exclusivo: abrir un ítem cierra el anterior automáticamente

## Preguntas (orden fijo)

1. **¿Es seguro subir datos de pacientes?**
   > Sí. SyqueX fue diseñado desde cero para cumplir con la LFPDPPP. Todos los datos clínicos se guardan cifrados con estándares bancarios — solo tú tienes acceso a tu expediente. Para la generación de notas utilizamos la API de Anthropic bajo un contrato de procesamiento de datos (DPA) que prohíbe explícitamente usar tu información para entrenar modelos de IA. Los datos se procesan únicamente para generar la nota y se olvidan inmediatamente. SyqueX es la única herramienta de documentación clínica en México diseñada específicamente para cumplir con la ley mexicana de privacidad.

2. **¿No puede hacer lo mismo ChatGPT?**
   > ChatGPT puede generar texto clínico, pero no recuerda nada. Cada vez que abres una conversación nueva, empieza desde cero — no sabe quién es tu paciente, qué trabajaron la sesión pasada ni qué patrones ha mostrado en los últimos meses. SyqueX construye memoria clínica acumulativa: cada sesión que documentas enriquece el historial del paciente. Con el tiempo el agente detecta patrones entre sesiones, identifica señales de alerta y sugiere focos para la próxima sesión basándose en todo el historial — no solo en lo que escribiste hoy. Además, usar ChatGPT con datos reales de pacientes tiene implicaciones legales bajo la LFPDPPP que SyqueX resuelve desde el primer día.

3. **¿El psicólogo sigue siendo responsable del contenido clínico?**
   > Siempre. SyqueX es una herramienta de apoyo, no un sustituto del criterio profesional. El agente genera una propuesta de nota basada en tu dictado — tú la revisas, la editas y la confirmas antes de que quede guardada en el expediente. Ninguna nota se guarda sin tu aprobación explícita. La inteligencia clínica, el diagnóstico y las decisiones terapéuticas son y seguirán siendo tuyas. SyqueX existe para que dediques menos tiempo al papeleo y más tiempo a lo que solo tú puedes hacer.

## Diseño visual

- **Fondo:** blanco (`bg-white`) — contrasta con el `bg-surface` de Benefits
- **Encabezado:** `"Preguntas frecuentes"` en `font-serif`, alineado a la izquierda
- **Layout:** `max-w-5xl mx-auto px-4 sm:px-6 py-16` — mismo patrón que el resto de secciones
- **Separadores:** `border-b border-ink-muted` entre ítems; sin cards ni bordes laterales
- **Pregunta:** `font-semibold text-ink` + chevron SVG alineado a la derecha
- **Respuesta:** `text-sm text-ink-secondary leading-relaxed`

## Animación

Técnica CSS grid sin medir alturas con JS:

```
// cerrado
<div className="grid grid-rows-[0fr] transition-all duration-300 ease-in-out overflow-hidden">

// abierto  
<div className="grid grid-rows-[1fr] transition-all duration-300 ease-in-out overflow-hidden">
```

El contenido interno necesita un wrapper `<div className="min-h-0">` para que el grid collapse funcione correctamente.

El chevron rota 180° con `transition-transform duration-300` cuando el ítem está abierto.

## Integración en page.tsx

```tsx
import FAQ from '../components/FAQ'

// en <main>:
<Hero />
<Benefits />
<FAQ />       // ← añadir aquí
<Pricing />
```

## Archivos afectados

| Acción | Archivo |
|--------|---------|
| Crear  | `landing/components/FAQ.tsx` |
| Editar | `landing/app/page.tsx` |
