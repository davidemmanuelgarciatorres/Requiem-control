"""Tokens de sesión y CSRF.

El token de sesión es aleatorio (256 bits) y solo se guarda su SHA-256 en la
base de datos: una filtración de la tabla no permite secuestrar sesiones.
"""

import hashlib
import hmac
import secrets


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_match(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
