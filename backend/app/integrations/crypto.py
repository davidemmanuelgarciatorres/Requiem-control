"""Cifrado de secretos de integraciones (tokens OAuth, verificador PKCE) con Fernet (AES-128-CBC + HMAC)."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class CryptoUnavailable(Exception):
    pass


def _fernet() -> Fernet:
    key = get_settings().integrations_encryption_key
    if key is None or not key.get_secret_value():
        raise CryptoUnavailable("INTEGRATIONS_ENCRYPTION_KEY no está configurada")
    try:
        return Fernet(key.get_secret_value().encode())
    except ValueError as e:
        raise CryptoUnavailable("INTEGRATIONS_ENCRYPTION_KEY no es una clave Fernet válida") from e


def available() -> bool:
    try:
        _fernet()
        return True
    except CryptoUnavailable:
        return False


def encrypt(value: str) -> bytes:
    return _fernet().encrypt(value.encode())


def decrypt(value: bytes) -> str:
    try:
        return _fernet().decrypt(bytes(value)).decode()
    except InvalidToken as e:
        raise CryptoUnavailable("No se pudo descifrar (¿cambió la clave?)") from e
