# Cloudflare Email Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar recepción de correos en `hola@syquex.mx` con reenvío automático a `syquex@gmail.com`.

**Architecture:** Cloudflare Email Routing actúa como receptor de correo para el dominio y reenvía nativamente al destino configurado. Cloudflare configura automáticamente los registros MX. No se modifica el backend ni la configuración de Resend para envío.

**Tech Stack:** Cloudflare Dashboard (Email Routing), DNS (MX + SPF records)

---

### Task 1: Activar Cloudflare Email Routing y crear la regla de reenvío

**Files:**
- No se modifica ningún archivo del repositorio
- Cambios: registros DNS de `syquex.mx` en Cloudflare

- [ ] **Step 1: Ir a Email Routing en Cloudflare**

  Abrir [dash.cloudflare.com](https://dash.cloudflare.com) → seleccionar dominio `syquex.mx` → menú lateral **Email** → **Email Routing**.

- [ ] **Step 2: Activar Email Routing**

  Hacer clic en **Enable Email Routing**.

  Cloudflare mostrará los registros MX que va a agregar:
  ```
  MX  route1.mx.cloudflare.net  prioridad 30
  MX  route2.mx.cloudflare.net  prioridad 20
  MX  route3.mx.cloudflare.net  prioridad 10
  ```
  Confirmar haciendo clic en **Add records and enable**.

- [ ] **Step 3: Revisar si hay conflicto de SPF**

  Cloudflare puede mostrar una advertencia si ya existe un registro `TXT v=spf1` (el de Resend).

  **Si muestra advertencia de SPF:**
  - Cloudflare ofrece automáticamente un SPF combinado. Aceptar la sugerencia.
  - El resultado debe verse así en DNS:
    ```
    TXT  v=spf1 include:amazonses.com include:_spf.mx.cloudflare.net ~all
    ```
  - Asegurarse de que tenga un solo registro TXT con `v=spf1` (nunca dos registros SPF separados).

  **Si no muestra advertencia:**
  - Cloudflare agrega su propio SPF. No se necesita acción adicional.

- [ ] **Step 4: Crear la dirección de reenvío**

  En la sección **Custom Addresses** → **Create address**:
  - Local part: `hola`
  - Action: `Send to`
  - Destination: `syquex@gmail.com`

  Hacer clic en **Save**.

- [ ] **Step 5: Confirmar el email de verificación en Gmail**

  Cloudflare envía un correo de verificación a `syquex@gmail.com`.

  Abrir Gmail → buscar asunto "Verify your email address" de Cloudflare → hacer clic en el enlace de verificación.

  La dirección `syquex@gmail.com` debe aparecer como **Verified** en el dashboard de Cloudflare.

---

### Task 2: Verificar que el reenvío y el envío via Resend funcionan

**Files:**
- No se modifica ningún archivo

- [ ] **Step 1: Verificar los registros DNS**

  En Cloudflare → `syquex.mx` → **DNS** → confirmar que existen:

  | Tipo | Contenido |
  |------|-----------|
  | MX | `route1.mx.cloudflare.net` |
  | MX | `route2.mx.cloudflare.net` |
  | MX | `route3.mx.cloudflare.net` |
  | TXT | comienza con `v=spf1` e incluye `_spf.mx.cloudflare.net` |

  También confirmar que los registros DKIM de Resend (tipo `TXT` o `CNAME` con nombres como `resend._domainkey`) siguen presentes y sin cambios.

- [ ] **Step 2: Enviar email de prueba de reenvío**

  Desde cualquier cuenta de correo personal (no `syquex@gmail.com`), enviar un correo a:
  ```
  hola@syquex.mx
  ```
  Asunto sugerido: `Test forwarding`

  **Resultado esperado:** El correo llega a `syquex@gmail.com` en menos de 2 minutos, con el remitente original visible.

- [ ] **Step 3: Verificar que el envío via Resend sigue funcionando**

  Con el backend corriendo localmente, usar el endpoint de password reset para disparar un email de prueba:

  ```bash
  curl -X POST http://localhost:8000/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email": "josemartzrios14@gmail.com"}'
  ```

  **Resultado esperado:** Llega un correo de restablecimiento de contraseña a `josemartzrios14@gmail.com` enviado desde `hola@syquex.mx`.

  Si el correo llega, el SPF combinado es correcto y Resend sigue funcionando.

- [ ] **Step 4: Verificar en producción (Railway)**

  Repetir el Step 3 contra el backend de producción para confirmar que el dominio verificado en Resend no fue afectado por los cambios de MX/SPF:

  ```
  POST https://<railway-backend-url>/auth/forgot-password
  {"email": "josemartzrios14@gmail.com"}
  ```

  **Resultado esperado:** Email de reset llega desde `hola@syquex.mx`.
