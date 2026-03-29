# Evolución Tab — 4-Tab Mobile Redesign

**Date:** 2026-03-29
**Branch:** `feature/documentation-first-ui`
**Scope:** Frontend only — backend sin cambios

---

## Objetivo

Reestructurar la navegación mobile de 3 tabs a 4 tabs, separando Historial de Evolución para que cada feature tenga su propia pantalla. Añadir el tab **Evolución** con chat persistido contra el agente y preguntas contextuales sugeridas.

---

## Contexto

- La UI mobile actual tiene 3 tabs: Dictar / Nota / Historial
- El feedback de diseño pidió: pantalla de dictado 100% limpia y un espacio dedicado para análisis de evolución del paciente
- El backend ya soporta sesiones de chat (`format=chat`, `status=confirmed` inmediato) y persiste `raw_dictation` + `ai_response` por sesión
- No se requieren cambios de backend

---

## Estructura de tabs

| Tab | Responsabilidad única |
|-----|-----------------------|
| **Dictar** | Textarea + botón Generar. Sin historial, sin contexto adicional. |
| **Nota** | SOAP generada + botón Confirmar. Sin cambios. |
| **Historial** | Lista de sesiones SOAP confirmadas del paciente. |
| **Evolución** | Chat con el agente + chips de preguntas contextuales. |

---

## Tab Evolución — diseño detallado

### Layout (opción A aprobada)

```
┌─────────────────────────────┐
│  [chat history — scrollable] │
│                              │
│  [agent bubble]              │
│              [user bubble]   │
│  [agent bubble]              │
│                              │
├─────────────────────────────┤
│  Preguntas sugeridas         │
│  [chip amber] [chip amber]   │
├─────────────────────────────┤
│  [input libre…]  [enviar →]  │
└─────────────────────────────┘
```

### Persistencia del chat

**Fuente de verdad: base de datos.** No se usa localStorage.

Al seleccionar un paciente, el frontend llama `GET /patients/{patient_id}/sessions?page_size=200` y filtra las sesiones con `format=chat`. Cada sesión chat representa un intercambio y se convierte en dos mensajes:

```js
{ role: 'user',  content: session.raw_dictation }
{ role: 'agent', content: session.ai_response   }
```

Los pares se ordenan por `session_number` (ascendente) para reconstruir el hilo cronológico. El resultado se almacena en estado React (`evolutionMessages: Map<patientId, Message[]>`) mientras la app está abierta.

Al cambiar de paciente, el hilo del paciente anterior se descarta de memoria y se carga el del nuevo paciente desde DB.

### Chips contextuales

Los chips se generan en el **frontend** a partir del perfil del paciente, sin API call extra.

Flujo:
1. Al abrir Evolución → `GET /patients/{patient_id}/profile` (ya se puede hacer en paralelo con la carga de sesiones)
2. Tomar `profile.recurring_themes` (máx 2) y `profile.risk_factors` (máx 1)
3. Aplicar plantillas:
   - recurring_theme → `"¿Cómo ha evolucionado {theme}?"`
   - risk_factor → `"¿Persiste el factor de riesgo: {factor}?"`
4. Si el perfil no tiene datos → chips estáticos de fallback:
   - "¿Qué patrones destacan en las últimas sesiones?"
   - "¿Hay señales de alerta activas?"
   - "¿Qué sugiere trabajar en la próxima sesión?"

**Comportamiento de chips:**
- Se muestran encima del input, debajo del historial de mensajes
- Al tocar un chip → se envía como mensaje del usuario → chip desaparece
- Los chips se regeneran con el perfil del paciente activo (no persisten entre recargas)

### Enviar mensaje

```
POST /sessions/{patient_id}/process
Body: { raw_dictation: string, format: "chat" }
```

El agente tiene acceso al historial clínico completo del paciente vía sus tools. La respuesta (`text_fallback`) se agrega al hilo en memoria. La sesión queda confirmada automáticamente en DB.

### Estado de carga y error

| Estado | UI |
|--------|----|
| Cargando historial | Spinner centrado en el área de chat |
| Sin historial previo | Mensaje vacío: "Inicia una conversación sobre {patient_name}" |
| Enviando mensaje | Burbuja de usuario aparece inmediatamente (optimistic); input deshabilitado; burbuja de carga del agente (puntos animados) |
| Error de red | Mensaje inline debajo del input: "No se pudo enviar. Intenta de nuevo." |

---

## Cambios en el código

### `App.jsx`

| Cambio | Detalle |
|--------|---------|
| `mobileTab` state | `['dictar', 'nota', 'historial', 'evolucion']` |
| Nuevo estado `evolutionMessages` | `useState(new Map())` — `Map<patientId, Message[]>` |
| Nuevo estado `evolutionLoading` | `useState(false)` |
| Nuevo estado `patientProfile` | `useState(null)` — perfil del paciente activo |
| `loadEvolutionChat(patientId)` | Fetch sessions filtradas por `format=chat` → reconstruye hilo → setea `evolutionMessages` |
| `loadPatientProfile(patientId)` | Fetch `GET /patients/{patientId}/profile` → setea `patientProfile` |
| Al seleccionar paciente | Disparar `loadEvolutionChat` + `loadPatientProfile` en paralelo |
| Tab Evolución en render | `{mobileTab === 'evolucion' && <EvolucionPanel ... />}` |

### `components/EvolucionPanel.jsx` (nuevo)

Props:
```js
{
  patient,          // { id, name }
  messages,         // Message[] — hilo reconstruido
  profile,          // perfil del paciente (para chips)
  loading,          // bool — cargando historial inicial
  onSend,           // (text: string) => void
  sending,          // bool — enviando mensaje activo
}
```

Responsabilidades:
- Renderiza burbuja de agent / user por cada mensaje
- Genera chips desde `profile.recurring_themes` + `profile.risk_factors`
- Input libre + botón enviar
- Scroll automático al último mensaje al montar y al recibir nuevo mensaje

### `api.js`

Sin cambios. Se usan endpoints existentes:
- `GET /patients/{id}/sessions` (ya existe)
- `GET /patients/{id}/profile` (ya existe)
- `POST /sessions/{id}/process` (ya existe)

### Tab bar mobile

Cambiar de 3 a 4 tabs en `App.jsx`:
```js
// Antes
['dictar', 'nota', 'historial']

// Después
['dictar', 'nota', 'historial', 'evolucion']
```

Labels: Dictar / Nota / Historial / Evolución

---

## Fuera del scope

- Panel Evolución en desktop (segunda iteración)
- Preguntas sugeridas generadas por IA (post-MVP — requiere llamada extra al agente)
- Borrar o archivar conversaciones de Evolución
- Streaming de respuesta del agente en Evolución

---

## Criterios de éxito

- [ ] Mobile muestra 4 tabs: Dictar, Nota, Historial, Evolución
- [ ] Tab Dictar: pantalla 100% limpia, sin historial
- [ ] Tab Historial: muestra solo sesiones SOAP (format != 'chat')
- [ ] Tab Evolución: carga el historial de chat del paciente desde DB al seleccionarlo
- [ ] Enviar un mensaje crea una sesión chat en DB y aparece en el hilo
- [ ] Al cambiar de paciente y volver, el historial de chat se recarga correctamente
- [ ] Chips se generan a partir del perfil real del paciente
- [ ] No hay regresiones en el flujo SOAP (Dictar → Nota → Confirmar)
