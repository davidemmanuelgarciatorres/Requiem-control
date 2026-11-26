"""Hash de contraseñas con Argon2id (parámetros por defecto de argon2-cffi, recomendados por OWASP)."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()

# Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe
# (evita enumerar cuentas midiendo la latencia del inicio de sesión).
_DUMMY_HASH = _hasher.hash("requiem-control-timing-equalizer")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
