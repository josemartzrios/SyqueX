import os
import resend

resend.api_key = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "SyqueX <hola@syquex.mx>")

async def send_welcome_email(to_email: str, name: str, trial_ends_at):
    if not resend.api_key:
        print(f"Mock email: Welcome {name} ({to_email})")
        return None
    try:
        r = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": "Bienvenido a SyqueX",
            "html": f"""
            <p>Hola {name},</p>
            <p>¡Bienvenido a SyqueX! Tu prueba gratuita de 14 días ha comenzado y termina el {trial_ends_at.strftime('%Y-%m-%d')}.</p>
            <p><a href="{os.environ.get('FRONTEND_URL', 'http://localhost:5173')}">Comienza a dictar</a></p>
            <br>
            <p>El equipo de SyqueX</p>
            """
        })
        return r
    except Exception as e:
        print(f"Error enviando email welcome: {e}")
        return None

async def send_reset_email(to_email: str, name: str, token: str):
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    reset_url = f"{frontend_url}/?token={token}"
    if not resend.api_key:
        print(f"Mock email: Reset for {to_email} -> {reset_url}")
        return None
    try:
        r = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": "Restablece tu contraseña — SyqueX",
            "html": f"""
            <p>Hola {name},</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de SyqueX.</p>
            <p>Haz clic en el siguiente enlace para crear una nueva contraseña. Este enlace expira en 60 minutos.</p>
            <p><a href="{reset_url}">Restablecer contraseña</a></p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual seguirá funcionando.</p>
            <br>
            <p>El equipo de SyqueX</p>
            """
        })
        return r
    except Exception as e:
        print(f"Error enviando email reset: {e}")
        return None

async def send_patient_invite(to_email: str, patient_name: str, psychologist_name: str, token: str):
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    invite_url = f"{frontend_url}/patient/invite?token={token}"
    if not resend.api_key:
        print(f"Mock email: Invite patient {patient_name} -> {invite_url}")
        return None
    try:
        r = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": f"{psychologist_name} te ha invitado al Portal del Paciente",
            "html": f"""
            <p>Hola {patient_name},</p>
            <p>Tu psicólogo/a {psychologist_name} te ha invitado a acceder al Portal del Paciente.</p>
            <p>En este portal podrás ver los resúmenes de tus sesiones y las tareas asignadas.</p>
            <p>Haz clic en el siguiente enlace para crear tu contraseña y acceder:</p>
            <p><a href="{invite_url}">Aceptar invitación</a></p>
            <br>
            <p>El equipo de SyqueX</p>
            """
        })
        return r
    except Exception as e:
        print(f"Error enviando email invite: {e}")
        return None

async def send_patient_reset_email(to_email: str, patient_name: str, token: str):
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    reset_url = f"{frontend_url}/portal/reset?token={token}"
    if not resend.api_key:
        print(f"Mock email: Password reset for patient {patient_name} ({to_email}) -> {reset_url}")
        return None
    try:
        r = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": "Restablece tu contraseña — Portal del Paciente SyqueX",
            "html": f"""
<html>
<body style="font-family:-apple-system,sans-serif;background:#f4f4f2;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.07);">
    <div style="background:#5a9e8a;padding:28px 32px;">
      <p style="color:white;font-size:15px;font-weight:700;margin:0 0 8px 0;letter-spacing:-.02em;">SyqueX</p>
      <h1 style="color:white;font-family:Georgia,serif;font-size:22px;margin:0 0 6px 0;line-height:1.3;">Recupera tu contraseña</h1>
      <p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;line-height:1.5;">Portal del Paciente</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#18181b;font-size:14px;margin:0 0 16px 0;">Hola {patient_name},</p>
      <p style="color:#374151;font-size:13px;margin:0 0 24px 0;line-height:1.6;">
        Recibimos una solicitud para restablecer la contraseña de tu portal. Si no la pediste, puedes ignorar este mensaje.
      </p>
      <a href="{reset_url}" style="display:block;background:#5a9e8a;color:white;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;margin-bottom:20px;">
        Crear nueva contraseña →
      </a>
      <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">
        Este link es válido por 60 minutos.
      </p>
    </div>
  </div>
</body>
</html>
            """
        })
        return r
    except Exception as e:
        print(f"Error enviando email reset paciente: {e}")
        return None
