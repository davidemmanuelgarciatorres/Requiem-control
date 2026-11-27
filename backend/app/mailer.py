"""Envío de correos transaccionales (restablecer contraseña, verificar correo, invitaciones).

- smtp: cualquier proveedor SMTP con STARTTLS.
- console: SOLO desarrollo/pruebas: el mensaje se registra en el log y en `outbox` (las pruebas lo leen).
  En producción nunca se escriben enlaces en los registros.
- none: no se envía nada (se registra que falta configurar el correo).
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger("requiem.mail")


@dataclass
class Sent:
    to: str
    subject: str
    text: str


outbox: list[Sent] = []


def configured() -> bool:
    s = get_settings()
    if s.email_provider == "smtp":
        return bool(s.smtp_host and s.smtp_username and s.smtp_password and s.smtp_password.get_secret_value())
    return s.email_provider == "console" and s.environment != "production"


def send(to: str, subject: str, text: str) -> bool:
    s = get_settings()
    if s.email_provider == "console" and s.environment != "production":
        outbox.append(Sent(to, subject, text))
        log.info("Correo (desarrollo) para %s — %s\n%s", to, subject, text)
        return True
    if s.email_provider != "smtp" or not configured():
        log.warning("No se envió un correo: el envío de correos no está configurado (EMAIL_PROVIDER=smtp).")
        return False
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    assert s.smtp_host and s.smtp_password
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            if s.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            smtp.login(s.smtp_username or "", s.smtp_password.get_secret_value())
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException):
        log.exception("Falló el envío de un correo")
        return False


TEMPLATES = {
    "es": {
        "reset": (
            "Restablece tu contraseña de REQUIEM CONTROL",
            "Hola {name}:\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace (válido por 1 hora):\n\n{link}\n\nSi no fuiste tú, ignora este correo: tu contraseña no cambiará.\n\nREQUIEM CONTROL",
        ),
        "verify": (
            "Confirma tu correo en REQUIEM CONTROL",
            "Hola {name}:\n\nConfirma tu correo con este enlace (válido por 48 horas):\n\n{link}\n\nREQUIEM CONTROL",
        ),
        "invite": (
            "{inviter} te invitó a {org} en REQUIEM CONTROL",
            "Hola:\n\n{inviter} te invitó a unirte a «{org}» en REQUIEM CONTROL. Acepta con este enlace (válido por 7 días):\n\n{link}\n\nSi no esperabas esta invitación, ignora este correo.\n\nREQUIEM CONTROL",
        ),
        "changed": (
            "Tu contraseña de REQUIEM CONTROL cambió",
            "Hola {name}:\n\nLa contraseña de tu cuenta se cambió. Si no fuiste tú, restablécela de inmediato desde la pantalla de acceso.\n\nREQUIEM CONTROL",
        ),
    },
    "en": {
        "reset": (
            "Reset your REQUIEM CONTROL password",
            "Hi {name},\n\nWe received a request to reset your password. Open this link (valid for 1 hour):\n\n{link}\n\nIf this wasn't you, ignore this email: your password will not change.\n\nREQUIEM CONTROL",
        ),
        "verify": (
            "Confirm your email for REQUIEM CONTROL",
            "Hi {name},\n\nConfirm your email with this link (valid for 48 hours):\n\n{link}\n\nREQUIEM CONTROL",
        ),
        "invite": (
            "{inviter} invited you to {org} on REQUIEM CONTROL",
            "Hi,\n\n{inviter} invited you to join “{org}” on REQUIEM CONTROL. Accept with this link (valid for 7 days):\n\n{link}\n\nIf you weren't expecting this invitation, ignore this email.\n\nREQUIEM CONTROL",
        ),
        "changed": (
            "Your REQUIEM CONTROL password changed",
            "Hi {name},\n\nYour account password was changed. If this wasn't you, reset it right away from the sign-in screen.\n\nREQUIEM CONTROL",
        ),
    },
}


def send_template(to: str, kind: str, language: str, **params: str) -> bool:
    subject, body = TEMPLATES["en" if language == "en" else "es"][kind]
    return send(to, subject.format(**params), body.format(**params))
