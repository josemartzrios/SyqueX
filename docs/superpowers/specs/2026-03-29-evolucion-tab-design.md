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
- **Desktop no se modifica en este sprint** — Evolución es mobile-only. El layout split-view de desktop permanece sin cambios.

---

## Estructura de tabs

| Tab | Responsabilidad única |
|-----|-----------------------|
| **Dictar** | Textarea + botón Generar. Sin historial, sin contexto adicional. |
| **Nota** | SOAP generada + botón Confirmar. Sin cambios. |
| **Historial** | Lista de sesiones SOAP confirmadas (`format != 'chat'`). |
| **Evolución** | Chat con el agente + chips de preguntas contextuales. |

---

## Tipos

```js
// Message — tipo compartido entre App.jsx y EvolucionPanel
// { role, content } es suficiente; React key = índice del array
type Message = {
  role: 'user' | 'agent',
  content: string,
}
```

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

### Carga del historial — lazy (on tab open)

La carga del historial y del perfil se dispara **cuando el usuario abre el tab Evolución por primera vez para ese paciente**, no al seleccionar el paciente. Esto evita llamadas innecesarias si el psicólogo solo usa el flujo de dictado.

Condición de disparo en `App.jsx`:
```js
if (mobileTab === 'evolucion' && !evolutionMessages.has(selectedPatient.id)) {
  loadEvolutionChat(selectedPatient.id)   // fetch sessions format=chat
  loadPatientProfile(selectedPatient.id)  // fetch profile para chips
}
```

Si el paciente ya tiene mensajes en el Map (cargados anteriormente en la misma sesión de app), no se refetchea.

### Persistencia del chat

**Fuente de verdad: base de datos.** No se usa localStorage.

`loadEvolutionChat(patientId)`:
1. Llama `GET /patients/{patientId}/sessions?page_size=200`
2. Filtra `items` donde `session.format === 'chat'`
3. Ordena por `session_number` ascendente
4. Convierte cada sesión en dos `Message`:
   ```js
   { role: 'user',  content: session.raw_dictation }
   { role: 'agent', content: session.ai_response   }
   ```
5. Actualiza `evolutionMessages` Map: `prev => new Map(prev).set(patientId, messages)`

Al cambiar de paciente, `selectedPatient` cambia. Si el nuevo paciente no está en el Map, la condición de disparo carga su historial la próxima vez que se abra Evolución.

### Chips contextuales

Los chips se generan en el **frontend** a partir del perfil del paciente, sin API call extra.

`loadPatientProfile(patientId)`:
1. Llama `GET /patients/{patientId}/profile`
2. Setea `patientProfile` con la respuesta completa

Generación de chips en `EvolucionPanel`:
1. Tomar `profile.profile.recurring_themes` (máx 2) y `profile.profile.risk_factors` (máx 1)
2. Aplicar plantillas:
   - recurring_theme → `"¿Cómo ha evolucionado {theme}?"`
   - risk_factor → `"¿Persiste el factor de riesgo: {factor}?"`
3. **Condición de fallback:** si `profile` es `null` OR (`profile.profile.recurring_themes.length === 0` AND `profile.profile.risk_factors.length === 0`), usar chips estáticos:
   - "¿Qué patrones destacan en las últimas sesiones?"
   - "¿Hay señales de alerta activas?"
   - "¿Qué sugiere trabajar en la próxima sesión?"

**Comportamiento de chips:**
- Se muestran encima del input, debajo del historial de mensajes
- Al tocar un chip → se envía como mensaje del usuario → chip desaparece de la lista de chips
- Los chips no persisten entre recargas de app (se regeneran desde el perfil)

### Enviar mensaje — flujo completo

Endpoint:
```
POST /api/v1/sessions/{patient_id}/process
Body: { raw_dictation: string, format: "chat" }
Response: { text_fallback: string, session_id: string }
```

Nota: el path usa `patient_id` (no session_id) — el backend crea la sesión internamente.

Flujo en `handleEvolutionSend(text)` en `App.jsx`:
1. Append optimístico: agregar `{ role: 'user', content: text }` al Map inmediatamente
2. Setear `evolutionSending = true`, deshabilitar input
3. Llamar `POST /sessions/{patient.id}/process` con `{ raw_dictation: text, format: 'chat' }`
4. En éxito: append `{ role: 'agent', content: response.text_fallback }` al Map
5. En error: mostrar mensaje inline "No se pudo enviar. Intenta de nuevo." — NO deshacer el mensaje optimístico del usuario (se deja visible para contexto)
6. Setear `evolutionSending = false`

La sesión queda confirmada automáticamente en DB (status=confirmed, format=chat).

### Estado de carga y error

| Estado | UI |
|--------|----|
| Cargando historial (`evolutionLoading=true`) | Spinner centrado en el área de chat |
| Sin historial previo (array vacío) | Texto: "Inicia una conversación sobre {patient.name}" |
| Enviando mensaje (`evolutionSending=true`) | Input deshabilitado; burbuja de carga del agente (3 puntos animados) |
| Error de red al enviar | Mensaje inline debajo del input: "No se pudo enviar. Intenta de nuevo." |

---

## Cambios en el código

### `App.jsx`

| Cambio | Detalle |
|--------|---------|
| `mobileTab` values | Agregar `'evolucion'` → `['dictar', 'nota', 'historial', 'evolucion']` |
| Nuevo estado `evolutionMessages` | `useState(new Map())` — `Map<patientId, Message[]>` |
| Nuevo estado `evolutionLoading` | `useState(false)` — cargando historial inicial |
| Nuevo estado `evolutionSending` | `useState(false)` — enviando mensaje activo |
| Nuevo estado `patientProfile` | `useState(null)` — perfil del paciente activo para chips |
| `loadEvolutionChat(patientId)` | Sets `evolutionLoading=true`, fetch + filter + reconstruct, sets Map, sets `evolutionLoading=false` |
| `loadPatientProfile(patientId)` | Fetch `GET /patients/{patientId}/profile`, sets `patientProfile` |
| `handleEvolutionSend(text)` | Flujo optimístico descrito arriba; usa `evolutionSending` |
| Disparo lazy en render | Cuando `mobileTab === 'evolucion'` y paciente no está en Map → llamar ambos fetches |
| Tab Historial — filtrado | Derivar `soapSessions = sessionHistory.filter(s => s.format !== 'chat')` y pasar al tab Historial en lugar de `sessionHistory` |
| Tab Evolución en render | `{mobileTab === 'evolucion' && <EvolucionPanel ... />}` |

### `components/EvolucionPanel.jsx` (nuevo)

Props:
```js
{
  patient,          // { id: string, name: string }
  messages,         // Message[] — hilo reconstruido (puede ser [])
  profile,          // ProfileOut | null — para generar chips
  loading,          // bool — cargando historial inicial
  onSend,           // (text: string) => void
  sending,          // bool — enviando mensaje activo
}
```

Responsabilidades:
- Renderiza burbujas `role='user'` (alineadas a la derecha, fondo sage) y `role='agent'` (izquierda, fondo #f4f4f2)
- Genera chips desde perfil con lógica y fallbacks descritos arriba
- Input libre + botón enviar (deshabilitado cuando `sending=true` o input vacío)
- Scroll automático al último mensaje al montar y cuando `messages.length` cambia

### `api.js`

Sin cambios. Endpoints usados:
- `GET /api/v1/patients/{id}/sessions?page_size=200`
- `GET /api/v1/patients/{id}/profile`
- `POST /api/v1/sessions/{id}/process`

### Tab bar mobile

```js
// Antes
['dictar', 'nota', 'historial']

// Después — labels: Dictar / Nota / Historial / Evolución
['dictar', 'nota', 'historial', 'evolucion']
```

---

## Fuera del scope

- Evolución en desktop (segunda iteración) — desktop layout sin cambios en este sprint
- Preguntas sugeridas generadas por IA (requiere llamada extra al agente)
- Borrar o archivar conversaciones de Evolución
- Streaming de respuesta del agente en Evolución

---

## Criterios de éxito

- [ ] Mobile muestra 4 tabs: Dictar, Nota, Historial, Evolución
- [ ] Tab Dictar: pantalla 100% limpia, sin historial
- [ ] Tab Historial: muestra solo sesiones con `format !== 'chat'`
- [ ] Tab Evolución: carga el historial de chat del paciente desde DB al abrir el tab por primera vez
- [ ] Enviar un mensaje crea una sesión chat en DB y aparece en el hilo
- [ ] Al cambiar de paciente y volver al tab Evolución, el historial se recarga correctamente
- [ ] Chips se generan desde el perfil real; fallback a chips estáticos cuando el perfil está vacío
- [ ] Desktop layout sin cambios
- [ ] No hay regresiones en el flujo SOAP (Dictar → Nota → Confirmar)
