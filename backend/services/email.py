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
    reset_url = f"{frontend_url}/?reset-token={token}"
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
