"""Límite de intentos compartido entre réplicas de la API (guardado en PostgreSQL).

Las claves se guardan como hash SHA-256 (no se almacenan correos ni IPs en claro).
"""

import hashlib

from sqlalchemy import text

from app.db import _session_factory


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds

    @staticmethod
    def _bucket(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    def hit(self, key: str) -> bool:
        """Registra un intento. Devuelve False si se superó el límite."""
        db = _session_factory()()
        try:
            ok = bool(
                db.execute(
                    text("SELECT rate_limit_hit(:b, :w, :m)"),
                    {"b": self._bucket(key), "w": self.window, "m": self.limit},
                ).scalar()
            )
            db.commit()
            return ok
        finally:
            db.close()

    def reset(self, key: str | None = None) -> None:
        db = _session_factory()()
        try:
            db.execute(text("SELECT rate_limit_reset(:b)"), {"b": self._bucket(key) if key else None})
            db.commit()
        finally:
            db.close()
