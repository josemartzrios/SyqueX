# Spec: Cloudflare Email Routing para hola@syquex.mx

**Fecha:** 2026-05-11  
**Estado:** Aprobado

## Objetivo

Habilitar la recepción de correos en `hola@syquex.mx` con reenvío automático a `syquex@gmail.com`. Sin código, sin webhook, sin cambios en el backend.

## Decisión

Usar **Cloudflare Email Routing** (nativo, gratuito) en lugar de Resend Email Receiving. Razón: el dominio ya está en Cloudflare, la función está disponible en el dashboard, y el caso de uso es forwarding puro sin necesidad de logging ni procesamiento.

## Registros DNS que Cloudflare configura automáticamente

| Tipo | Nombre | Valor | Prioridad |
|------|--------|-------|-----------|
| MX | `syquex.mx` | `route1.mx.cloudflare.net` | 30 |
| MX | `syquex.mx` | `route2.mx.cloudflare.net` | 20 |
| MX | `syquex.mx` | `route3.mx.cloudflare.net` | 10 |
| TXT | `syquex.mx` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | — |

### Compatibilidad con Resend (envío)

El SPF de Cloudflare puede convivir con el SPF de Resend. Si ya existe un registro SPF para Resend, deben fusionarse en una sola línea TXT. Cloudflare detecta conflictos y ofrece el SPF combinado automáticamente en su UI.

Ejemplo de SPF combinado:
```
v=spf1 include:amazonses.com include:_spf.mx.cloudflare.net ~all
```

Los registros DKIM de Resend (tipo TXT/CNAME) no se ven afectados.

## Pasos de configuración

1. Cloudflare Dashboard → dominio `syquex.mx` → **Email** → **Email Routing**
2. Activar Email Routing — Cloudflare configura los MX automáticamente
3. Ir a **Custom Addresses** → **Create address**
   - Local part: `hola`
   - Action: Send to → `syquex@gmail.com`
4. Cloudflare envía un email de verificación a `syquex@gmail.com` — confirmar el link
5. Verificar que los MX y SPF fueron creados correctamente en la sección DNS

## Verificación

- Enviar un correo de prueba a `hola@syquex.mx` desde cualquier cuenta
- Confirmar que llega a `syquex@gmail.com` con el remitente original intacto
- Confirmar que el envío desde `hola@syquex.mx` via Resend sigue funcionando (prueba de password reset)

## Alcance

- No se modifica el backend
- No se agrega ningún endpoint ni webhook
- No se cambia la configuración de Resend para envío
