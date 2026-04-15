# CLAUDE.md — Restructura de Roadmap (Opción B)

**Fecha:** 2026-04-13  
**Scope:** Documentación — sin cambios de código

---

## Contexto

El roadmap en CLAUDE.md estaba organizado por fases de producto (Fase 1 UI, Fase 2 Voz, Post-MVP), pero no reflejaba el estado actual ni distinguía entre ítems bloqueantes para producción y mejoras opcionales. Se necesita una guía de trabajo accionable que permita saber de un vistazo dónde estamos y qué sigue.

---

## Decisión

Estructura **Opción B — Sprint activo + backlog priorizado**:

```
Estado actual         → rama en curso, qué está done
Sprint siguiente      → 5 bloqueantes para producción, en orden de dependencia
Pre-deploy backlog    → mejoras clínicas/UX antes de lanzar (no bloqueantes)
Post-MVP              → features de crecimiento
```

---

## Orden de los bloqueantes (Sprint siguiente)

| # | Feature | Razón del orden |
|---|---------|-----------------|
| 1 | Fix flujo activar pago (404) | Ya existe parcialmente — el endpoint falla; es el core del revenue |
| 2 | Página Aviso de Privacidad `/privacidad` | Requerida en el registro (checkbox con link); LFPDPPP Art. 8 |
| 3 | Página Términos y Condiciones `/terminos` | Igual — el link en registro no puede apuntar a 404 |
| 4 | Auditoría de vulnerabilidades | Revisa el código de auth/billing que se acaba de construir |
| 5 | Auditoría LFPDPPP — audit_logs | Verifica que todos los eventos sensibles quedan registrados |

---

## Pre-deploy backlog (orden sugerido)

| # | Feature |
|---|---------|
| 1 | Más preguntas clínicas en intake de paciente nuevo |
| 2 | Agente de conversación conoce nombre del paciente |
| 3 | Borrador automático / guardado de nota clínica |
| 4 | Cambiar tipografía nota clínica |
| 5 | Mejorar Evolución: estado vacío + chips clínicos |

---

## Post-MVP

| # | Feature |
|---|---------|
| 1 | Dictado de voz con streaming (Whisper API) |
| 2 | Descargar nota clínica como PDF |
| 3 | Vincular Google Drive |
| 4 | Vincular Google Calendar |
| 5 | Cargar texto desde archivo |
| 6 | Pegar texto largo (referencia parcial) |
| 7 | Visualizar contraseña en login/registro |
