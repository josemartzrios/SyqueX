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
    reset_url = f"{os.environ.get('FRONTEND_URL', 'http://localhost:5173')}/?reset-token={token}"
    if not resend.api_key:
        print(f"Mock email: Reset for {to_email} -> {reset_url}")
        return None
    try:
        r = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": "Tu prueba gratuita de SyqueX termina pronto",
            "html": """
            <p>Hola,</p>
            <p>Esperamos que estés disfrutando SyqueX. Tu período de prueba de 14 días termina en menos de 48 horas.</p>
            <p>Para seguir teniendo acceso completo a todas las funciones y dictados ilimitados, por favor actualiza 
            tu suscripción al plan Pro iniciando sesión en tu cuenta.</p>
            <p><a href="https://syquex.vercel.app">Ir a SyqueX</a></p>
            <p>Si tienes alguna pregunta, no dudes en responder este correo.</p>
            <br>
            <p>El equipo de SyqueX</p>
            """
        })
        return r
    except Exception as e:
        print(f"Error enviando email trial ending: {e}")
        return None
